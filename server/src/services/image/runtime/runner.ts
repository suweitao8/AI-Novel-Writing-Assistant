/**
 * 图像生成 runner：执行"业务表 JSON 状态机 + 落盘"的唯一流程入口。
 *
 * 由 Adapter 适配各业务表的字段读写；本文件不感知具体业务模型。
 *
 * 流程：
 *   provider 解析/校验 → model 解析 → loadState → 归档历史/递增 version
 *   → begin artifact/lease → save generating → generateImagesByProvider → 落盘 → cleanupOtherExts
 *   → save done（写 url/prompt/provider/generatedAt/history/referenceImages 等）
 *   catch → save error
 *
 * Adapter 的 buildExtraDoneState 用于业务定制（如 Drama 兼容字段、表情稿嵌套位置）。
 */
import path from "path";

import { AppError } from "../../../middleware/errorHandler";
import {
  generateImagesByProvider,
  isImageProviderSupported,
  resolveImageModel,
} from "../provider";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { appendCharacterImageEthnicityConstraint } from "@ai-novel/shared/imagePrompt";
import { resolveImageProviderForReferences } from "../assetProviderRouting";
import { ensureTransparentBackground } from "../backgroundKeying";

import {
  DEFAULT_RUNTIME_PROVIDER,
  DEFAULT_RUNTIME_SIZE,
  type GeneratedImageHistoryItem,
  type GeneratedImageState,
  type ImageArtifactSession,
  type ImageTargetAdapter,
  type RunImageGenerationOptions,
} from "./types";
import { describeError, inferExtension, resolveImageBytes, writeImageBytes } from "./utils";

const DEFAULT_HISTORY_MAX = 5;

/** 手动终止生成时写入状态机的错误信息（前端据此恢复「重新生成」入口）。 */
export const IMAGE_GENERATION_CANCELLED_MESSAGE = "已终止生成，可重新生成。";

/** 默认归档当前 done 状态为历史条目 */
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

/** 计算下一版本号 */
function readVersion(state: GeneratedImageState): number {
  const v = Number(state.version);
  if (Number.isFinite(v) && v > 0) return Math.round(v);
  return state.status === "done" ? 1 : 0;
}

export async function runImageGeneration<TState extends GeneratedImageState>(
  adapter: ImageTargetAdapter<TState>,
  opts: RunImageGenerationOptions,
): Promise<TState> {
  // 1. provider 解析 + 校验
  const requestedProvider = (opts.provider as LLMProvider | undefined) ?? DEFAULT_RUNTIME_PROVIDER;
  const provider = resolveImageProviderForReferences(
    Boolean(opts.refImagePaths?.length || opts.refImages?.length),
    requestedProvider,
  );
  if (!isImageProviderSupported(provider)) {
    throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);
  }

  // 2. model 解析
  const model = await resolveImageModel(provider);

  // 3. loadState + 归档/版本号
  const existing = await adapter.loadState();
  const versioning = adapter.versioning ?? { enabled: false };
  const archiver = versioning.archiveCurrent ?? defaultArchive;
  const archived = versioning.enabled ? await archiver(existing) : null;
  const prevHistory: GeneratedImageHistoryItem[] = Array.isArray(existing.history) ? existing.history : [];
  const nextHistory = (archived ? [...prevHistory, archived] : prevHistory).slice(-(versioning.maxHistory ?? DEFAULT_HISTORY_MAX));
  const nextVersion = existing.status === "done"
    ? readVersion(existing) + 1
    : Math.max(1, readVersion(existing) || 1);
  const sceneType = opts.sceneType ?? "chapter_illustration";
  const effectivePrompt = sceneType === "character"
    ? appendCharacterImageEthnicityConstraint(opts.prompt)
    : opts.prompt;

  // 4. 创建本次制品会话并标 generating。必须先拿到制品 lease，抢锁失败不能
  // 把其他任务正在使用的旧状态改成 error。
  const generatingState = {
    ...existing,
    status: "generating",
    provider,
    version: nextVersion,
    prompt: effectivePrompt,
    history: nextHistory,
    // 清掉上一轮 error 信息，避免误展示
    error: undefined,
  } as TState;
  let artifactSession: ImageArtifactSession<TState> | null = null;
  let generatingStateSaved = false;
  let renewalTimer: ReturnType<typeof setInterval> | null = null;
  try {
    artifactSession = adapter.beginArtifact ? await adapter.beginArtifact() : null;
    await adapter.saveState(generatingState);
    generatingStateSaved = true;
    if (artifactSession?.renew) {
      renewalTimer = setInterval(() => {
        void artifactSession?.renew?.().catch((error) => {
          console.error(`[image.runtime] artifact lease renewal failed kind=${adapter.kind}:`, describeError(error));
        });
      }, Math.max(1_000, artifactSession.renewalIntervalMs ?? 60_000));
    }

    // 5. 调 provider + generation-specific 落盘
    const result = await generateImagesByProvider({
      sceneType,
      provider,
      model,
      prompt: effectivePrompt,
      ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
      size: opts.size ?? DEFAULT_RUNTIME_SIZE,
      count: opts.count ?? 1,
      ...(opts.background ? { background: opts.background } : {}),
      ...(opts.outputFormat ? { outputFormat: opts.outputFormat } : {}),
      ...(opts.refImagePaths && opts.refImagePaths.length > 0 ? { refImagePaths: opts.refImagePaths } : {}),
      ...(opts.refImages && opts.refImages.length > 0 ? { refImages: opts.refImages } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });

    const imageUrl = result.images?.[0]?.url;
    if (!imageUrl) throw new Error("图片生成结果为空");

    const ext = inferExtension(imageUrl);
    const destPath = artifactSession ? artifactSession.diskPath(ext) : adapter.diskPath(ext);
    // 请求了透明底（PNG）但结果没有 alpha 通道时做确定性抠底：codex edits（带参考图）
    // 路径实测会把透明底压平成不透明纯色底，提示词救不回来（2026-08-23）。
    const rawBytes = await resolveImageBytes(imageUrl);
    const finalBytes = opts.background === "transparent" && opts.outputFormat === "png"
      ? await ensureTransparentBackground(rawBytes)
      : rawBytes;
    await writeImageBytes(destPath, finalBytes, artifactSession ? { exclusive: true } : {});
    if (!artifactSession && adapter.cleanupOtherExts) await adapter.cleanupOtherExts(ext);

    console.log(`[image.runtime] done kind=${adapter.kind} provider=${provider} model=${model} -> ${path.basename(destPath)}`);

    // 6. 写 done
    const doneBase: GeneratedImageState = {
      status: "done",
      version: nextVersion,
      url: adapter.publicUrl(),
      prompt: effectivePrompt,
      provider,
      generatedAt: new Date().toISOString(),
      history: nextHistory,
      // 成功重试必须清除上一轮失败留下的错误，避免前端在 done 状态下继续显示旧报错。
      error: undefined,
      ...(opts.referenceImages && opts.referenceImages.length > 0 ? { referenceImages: opts.referenceImages } : {}),
    };
    const extraDone = adapter.buildExtraDoneState ? adapter.buildExtraDoneState(doneBase) : ({} as Partial<TState>);
    const doneState = { ...existing, ...doneBase, ...extraDone } as TState;
    if (artifactSession) {
      await artifactSession.commit({ ext, bytes: finalBytes, doneState });
    } else {
      await adapter.saveState(doneState);
    }
    return doneState;
  } catch (err) {
    if (!generatingStateSaved) {
      await artifactSession?.abort().catch(() => {});
      throw err;
    }
    // 手动终止：写入 error 态（恢复重试入口）后正常返回，不让调用方走失败分支。
    let errorStateWritten = false;
    if (opts.signal?.aborted) {
      console.log(`[image.runtime] cancelled kind=${adapter.kind} provider=${provider}`);
      const cancelledState = {
        ...existing,
        status: "error",
        provider,
        version: nextVersion,
        error: IMAGE_GENERATION_CANCELLED_MESSAGE,
        history: nextHistory,
      } as TState;
      try {
        await adapter.saveState(cancelledState);
        errorStateWritten = true;
      } catch (stateError) {
        console.error(`[image.runtime] cancelled state was not written kind=${adapter.kind}:`, describeError(stateError));
      }
      await artifactSession?.abort().catch(() => {});
      if (artifactSession && !errorStateWritten) {
        throw err;
      }
      return cancelledState;
    }
    const errMsg = describeError(err);
    console.error(`[image.runtime] error kind=${adapter.kind} provider=${provider}:`, errMsg);
    const errorState = {
      ...existing,
      status: "error",
      provider,
      version: nextVersion,
      error: errMsg,
      history: nextHistory,
    } as TState;
    try {
      await adapter.saveState(errorState);
      errorStateWritten = true;
    } catch (stateError) {
      // lease 失效时禁止旧任务回写错误，避免覆盖新任务的当前 artifactId。
      console.error(`[image.runtime] error state was not written kind=${adapter.kind}:`, describeError(stateError));
    }
    await artifactSession?.abort().catch(() => {});
    if (artifactSession && !errorStateWritten) {
      throw err;
    }
    throw err;
  } finally {
    if (renewalTimer) {
      clearInterval(renewalTimer);
    }
  }
}
