/**
 * 多视图图片生成 runtime：先逐视图生成临时文件，再一次性合成业务图片。
 *
 * 这个 runner 复用单图 runner 的状态机，但把 provider 调用和合成器作为依赖注入，
 * 这样角色四视图可以测试完整的 generating → done/error 链路，又不会把业务字段
 * 或 Sharp 细节塞进通用单图 runner。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { LLMProvider } from "@ai-novel/shared/types/llm";

import { AppError } from "../../../middleware/errorHandler";
import {
  isImageProviderSupported,
  resolveImageModel,
} from "../provider";
import { resolveImageProviderForReferences } from "../assetProviderRouting";
import type {
  GeneratedImageHistoryItem,
  GeneratedImageState,
  GeneratedReferenceImageMeta,
  ImageTargetAdapter,
} from "./types";
import { DEFAULT_RUNTIME_PROVIDER } from "./types";
import { describeError } from "./utils";

const DEFAULT_HISTORY_MAX = 5;

export interface CompositeViewGenerationRequest<TViewId extends string = string> {
  id: TViewId;
  prompt: string;
  negativePrompt?: string;
}

export interface CompositeViewGenerationInput<TViewId extends string = string>
  extends CompositeViewGenerationRequest<TViewId> {
  provider: LLMProvider;
  model: string;
  viewPath: string;
  refImages?: string[];
  refImagePaths?: string[];
}

export interface RunCompositeImageGenerationOptions<TViewId extends string = string> {
  provider?: LLMProvider | string;
  /** 持久化到最终状态的完整生成契约摘要。 */
  prompt: string;
  viewRequests: readonly CompositeViewGenerationRequest<TViewId>[];
  refImages?: string[];
  refImagePaths?: string[];
  referenceImages?: GeneratedReferenceImageMeta[];
  generateView(input: CompositeViewGenerationInput<TViewId>): Promise<void>;
  compose(viewPaths: Record<TViewId, string>, outputPath: string): Promise<void>;
}

function defaultArchive<TState extends GeneratedImageState>(current: TState): GeneratedImageHistoryItem | null {
  if (current.status !== "done") return null;
  return {
    version: current.version ?? 1,
    url: current.url,
    prompt: current.prompt,
    provider: current.provider,
    generatedAt: current.generatedAt,
  };
}

function readVersion(state: GeneratedImageState): number {
  const version = Number(state.version);
  if (Number.isFinite(version) && version > 0) return Math.round(version);
  return state.status === "done" ? 1 : 0;
}

export async function runCompositeImageGeneration<
  TState extends GeneratedImageState,
  TViewId extends string,
>(
  adapter: ImageTargetAdapter<TState>,
  opts: RunCompositeImageGenerationOptions<TViewId>,
): Promise<TState> {
  const requestedProvider = (opts.provider as LLMProvider | undefined) ?? DEFAULT_RUNTIME_PROVIDER;
  const hasReferences = Boolean(opts.refImagePaths?.length || opts.refImages?.length);
  const provider = resolveImageProviderForReferences(hasReferences, requestedProvider);
  if (!isImageProviderSupported(provider)) {
    throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);
  }
  if (opts.viewRequests.length === 0) {
    throw new AppError("多视图图片至少需要一个视图。", 400);
  }

  const model = await resolveImageModel(provider);
  const existing = await adapter.loadState();
  const versioning = adapter.versioning ?? { enabled: false };
  const archiver = versioning.archiveCurrent ?? defaultArchive;
  const archived = versioning.enabled ? await archiver(existing) : null;
  const prevHistory: GeneratedImageHistoryItem[] = Array.isArray(existing.history) ? existing.history : [];
  const nextHistory = (archived ? [...prevHistory, archived] : prevHistory)
    .slice(-(versioning.maxHistory ?? DEFAULT_HISTORY_MAX));
  const nextVersion = existing.status === "done"
    ? readVersion(existing) + 1
    : Math.max(1, readVersion(existing) || 1);

  const generatingState = {
    ...existing,
    status: "generating",
    provider,
    version: nextVersion,
    history: nextHistory,
    error: undefined,
  } as TState;
  await adapter.saveState(generatingState);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-novel-composite-"));
  const viewPaths = {} as Record<TViewId, string>;
  try {
    for (const view of opts.viewRequests) {
      const viewPath = path.join(tempDir, `${view.id}.png`);
      await opts.generateView({
        ...view,
        provider,
        model,
        viewPath,
        ...(opts.refImages?.length ? { refImages: opts.refImages } : {}),
        ...(opts.refImagePaths?.length ? { refImagePaths: opts.refImagePaths } : {}),
      });
      await fs.access(viewPath);
      viewPaths[view.id] = viewPath;
    }

    const outputPath = adapter.diskPath("png");
    await opts.compose(viewPaths, outputPath);
    if (adapter.cleanupOtherExts) await adapter.cleanupOtherExts("png");

    const doneBase: GeneratedImageState = {
      status: "done",
      version: nextVersion,
      url: adapter.publicUrl(),
      prompt: opts.prompt,
      provider,
      generatedAt: new Date().toISOString(),
      history: nextHistory,
      error: undefined,
      referenceImages: opts.referenceImages?.length ? opts.referenceImages : undefined,
    };
    const extraDone = adapter.buildExtraDoneState
      ? adapter.buildExtraDoneState(doneBase)
      : ({} as Partial<TState>);
    const doneState = { ...existing, ...doneBase, ...extraDone } as TState;
    await adapter.saveState(doneState);
    console.log(`[image.runtime] composite done kind=${adapter.kind} provider=${provider} model=${model}`);
    return doneState;
  } catch (err) {
    const errMsg = describeError(err);
    console.error(`[image.runtime] composite error kind=${adapter.kind} provider=${provider}:`, errMsg);
    const errorState = {
      ...existing,
      status: "error",
      provider,
      version: nextVersion,
      error: errMsg,
      history: nextHistory,
    } as TState;
    await adapter.saveState(errorState);
    throw err;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
