/**
 * 资产外观状态的图片生成（角色/场景/道具共用）。
 *
 * 状态图是「设计参考图」：为资产某一个外观状态（初始/换装/受伤/昼夜/损坏…）生成
 * 一张可用作后续生图参考的图。生图时按状态自己的 referenceStateId 配置取参考图
 * （同一资产另一个状态的图，典型：新状态参考上一状态保持长相一致只换装/加伤），
 * 不参考则直接生成全新形象——2026-08-20 用户要求的灵活配置在图片侧的消费点。
 *
 * 画风与首帧图/角色设计稿同源：复用 drama 的两层画风解析（通用美术风格 + 本书
 * 具体风格），保证状态图、首帧图、角色设计稿三者画风一致。文件落盘与状态机走
 * image/runtime 的统一 Adapter（与 DramaShotKeyframeService 同一套样板）。
 */
import fs from "fs/promises";
import path from "path";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  StoryAssetState,
  StoryAssetStateImage,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import {
  normalizeStoryCharacterStates,
  normalizeStoryAssetStates,
  resolveStoryAssetStateReferenceId,
  type StoryCharacterLegacyFields,
} from "@ai-novel/shared/types/novelReferenceExtraction";

import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../../../runtime/appPaths";
import { getImageModelProvider } from "../../../../llm/modelCategories";
import {
  runImageGeneration,
  safeJsonParse,
  type ImageTargetAdapter,
  type GeneratedReferenceImageMeta,
} from "../../../../services/image/runtime";
import { IMAGE_SPECS } from "../../../../services/image/imageSpecs";
import { resolveDramaArtStyleContext } from "../../../../services/drama/visual/dramaArtStyleResolver";
import {
  buildKeyframeStylePromptLines,
  combineStyleAvoidInstructions,
} from "../../../../services/drama/visual/dramaVisualStyles";
import { storySettingsService } from "./StorySettingsService";

export type StoryAssetKind = "character" | "scene" | "prop";

const STATE_IMAGES_DIR = "story-state-images";
const DEFAULT_PROVIDER: LLMProvider = getImageModelProvider();
const STATE_IMAGE_EXTS: Array<[string, string]> = [
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["webp", "image/webp"],
];

function stateImageDir(stateId: string): string {
  return path.join(resolveGeneratedImagesRoot(), STATE_IMAGES_DIR, stateId);
}

export function stateImageUrl(novelId: string, stateId: string): string {
  return `/api/novels/${novelId}/settings/state-images/${stateId}`;
}

interface StateAssetRow {
  id: string;
  novelId: string;
  name: string;
  /** 场景/道具的基础画面描述；角色的外貌全部从当前状态读取。 */
  baseAppearance: string | null;
  statesJson: string | null;
  states?: StoryAssetState[];
  gender?: string | null;
}

async function loadStateAsset(novelId: string, kind: StoryAssetKind, assetId: string): Promise<StateAssetRow> {
  if (kind === "character") {
    const row = await prisma.character.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        novelId: true,
        name: true,
        gender: true,
        ageGroup: true,
        physique: true,
        attireStyle: true,
        facePrompt: true,
        appearance: true,
        voiceTexture: true,
        statesJson: true,
      },
    });
    if (!row || row.novelId !== novelId) {
      throw new AppError("未找到角色。", 404);
    }
    const legacy: StoryCharacterLegacyFields = row;
    return {
      id: row.id,
      novelId: row.novelId,
      name: row.name,
      baseAppearance: null,
      statesJson: row.statesJson,
      states: normalizeStoryCharacterStates(parseAssetStates(row.statesJson), legacy),
      gender: row.gender,
    };
  }
  if (kind === "scene") {
    const row = await prisma.novelScene.findUnique({
      where: { id: assetId },
      select: { id: true, novelId: true, name: true, environmentPrompt: true, summary: true, statesJson: true },
    });
    if (!row || row.novelId !== novelId) {
      throw new AppError("未找到场景。", 404);
    }
    return {
      id: row.id,
      novelId: row.novelId,
      name: row.name,
      baseAppearance: row.environmentPrompt?.trim() || row.summary?.trim() || null,
      statesJson: row.statesJson,
    };
  }
  const row = await prisma.novelProp.findUnique({
    where: { id: assetId },
    select: { id: true, novelId: true, name: true, visualPrompt: true, description: true, statesJson: true },
  });
  if (!row || row.novelId !== novelId) {
    throw new AppError("未找到道具。", 404);
  }
  return {
    id: row.id,
    novelId: row.novelId,
    name: row.name,
    baseAppearance: row.visualPrompt?.trim() || row.description?.trim() || null,
    statesJson: row.statesJson,
  };
}

function parseAssetStates(raw: string | null | undefined): StoryAssetState[] {
  const parsed = safeJsonParse<unknown>(raw, []);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return normalizeStoryAssetStates((parsed as StoryAssetState[]).filter((state) => typeof state?.id === "string" && typeof state?.label === "string"));
}

/** 只保留状态图契约字段，丢弃 runtime 可能附加的 history 等，保持 statesJson 干净。 */
function pruneStateImage(image: StoryAssetStateImage): StoryAssetStateImage {
  return {
    status: image.status,
    ...(image.url ? { url: image.url } : {}),
    ...(image.prompt ? { prompt: image.prompt } : {}),
    ...(image.provider ? { provider: image.provider } : {}),
    ...(image.generatedAt ? { generatedAt: image.generatedAt } : {}),
    ...(image.error ? { error: image.error } : {}),
  };
}

/** 组装状态图提示词（纯函数，契约锁定在 tests/storyAssetStateImage.test.js）。 */
export function buildStateImagePrompt(
  input: {
    kind: StoryAssetKind;
    assetName: string;
    baseAppearance: string | null;
    state: Pick<StoryAssetState, "label" | "description" | "imagePrompt" | "ageGroup">;
    gender?: string | null;
    hasReference: boolean;
  },
  styleLines: string[],
): string {
  const subjectLine =
    input.kind === "character" ? "character state reference image"
      : input.kind === "scene" ? "scene state reference image"
        : "prop state reference image";
  const lines = [
    ...styleLines,
    subjectLine,
    `subject: ${input.assetName}`,
    input.gender ? `gender: ${input.gender}` : "",
    input.state.ageGroup ? `age group: ${input.state.ageGroup}` : "",
    input.baseAppearance ? `base appearance: ${input.baseAppearance}` : "",
    `state: ${input.state.label}`,
    `state change: ${input.state.description}`,
    `state image prompt: ${input.state.imagePrompt}`,
    input.hasReference
      ? "keep the same subject identity as the reference image, change only what the state describes"
      : "",
    "clean composition, strong subject focus",
    "no text, no watermark, no subtitles, no logo",
  ];
  return lines.filter(Boolean).join(", ");
}

export function resolveStateReferenceImageUrl(states: StoryAssetState[], state: StoryAssetState): string | null {
  const referenceStateId = resolveStoryAssetStateReferenceId(states, state);
  if (!referenceStateId) {
    return null;
  }
  const referenced = states.find((item) => item.id === referenceStateId);
  if (!referenced?.image || referenced.image.status !== "done" || !referenced.image.url) {
    return null;
  }
  return referenced.image.url;
}

export class StoryAssetStateImageService {
  /** 读-改-写回 statesJson：只在目标状态上写 image 字段，不碰其他状态的并发编辑。 */
  private async writeStateImage(
    kind: StoryAssetKind,
    assetId: string,
    stateId: string,
    image: StoryAssetStateImage,
    fallbackStates: StoryAssetState[] = [],
  ): Promise<void> {
    const merged = (
      raw: string | null | undefined,
      fallback: StoryAssetState[] = [],
      normalize?: (states: StoryAssetState[]) => StoryAssetState[],
    ): string | null => {
      const parsed = parseAssetStates(raw);
      const source = parsed.length > 0 ? parsed : fallback;
      const next = (normalize ? normalize(source) : source).map((state) =>
        state.id === stateId ? { ...state, image: pruneStateImage(image) } : state);
      return next.length > 0 ? JSON.stringify(next) : null;
    };
    if (kind === "character") {
      const row = await prisma.character.findUnique({
        where: { id: assetId },
        select: {
          statesJson: true,
          gender: true,
          ageGroup: true,
          physique: true,
          attireStyle: true,
          facePrompt: true,
          appearance: true,
          voiceTexture: true,
        },
      });
      const legacy: StoryCharacterLegacyFields = row ?? {};
      const currentStates = normalizeStoryCharacterStates(parseAssetStates(row?.statesJson), legacy);
      await prisma.character.update({
        where: { id: assetId },
        data: { statesJson: merged(row?.statesJson, fallbackStates.length ? fallbackStates : currentStates, (states) => normalizeStoryCharacterStates(states, legacy)) },
      });
    } else if (kind === "scene") {
      const row = await prisma.novelScene.findUnique({ where: { id: assetId }, select: { statesJson: true } });
      await prisma.novelScene.update({ where: { id: assetId }, data: { statesJson: merged(row?.statesJson) } });
    } else {
      const row = await prisma.novelProp.findUnique({ where: { id: assetId }, select: { statesJson: true } });
      await prisma.novelProp.update({ where: { id: assetId }, data: { statesJson: merged(row?.statesJson) } });
    }
  }

  private async findState(novelId: string, kind: StoryAssetKind, assetId: string, stateId: string): Promise<{
    row: StateAssetRow;
    states: StoryAssetState[];
    state: StoryAssetState;
  }> {
    const row = await loadStateAsset(novelId, kind, assetId);
    const states = row.states ?? parseAssetStates(row.statesJson);
    const state = states.find((item) => item.id === stateId);
    if (!state) {
      throw new AppError("未找到外观状态。", 404);
    }
    return { row, states, state };
  }

  async generateStateImage(
    novelId: string,
    kind: StoryAssetKind,
    assetId: string,
    stateId: string,
  ): Promise<unknown> {
    const { row, states, state } = await this.findState(novelId, kind, assetId, stateId);
    const referenceUrl = resolveStateReferenceImageUrl(states, state);
    const effectiveReferenceStateId = resolveStoryAssetStateReferenceId(states, state);
    const referencedLabel = referenceUrl
      ? states.find((item) => item.id === effectiveReferenceStateId)?.label ?? "参考状态"
      : null;

    // 状态图与首帧图/角色设计稿同源的两层画风（无分镜项目，visualStyle 恒空，走小说默认具体风格）
    const styleContext = await resolveDramaArtStyleContext({ visualStyle: null, sourceRef: novelId });
    const styleLines = buildKeyframeStylePromptLines(styleContext.universal, styleContext.specific);
    const prompt = buildStateImagePrompt(
      {
        kind,
        assetName: row.name,
        baseAppearance: row.baseAppearance,
        gender: row.gender,
        state,
        hasReference: Boolean(referenceUrl),
      },
      styleLines,
    );
    const negativePrompt = [
      "low quality, blurry, distorted face, extra fingers, duplicate body, text, watermark, subtitles",
      combineStyleAvoidInstructions(styleContext.universal, styleContext.specific),
    ].filter(Boolean).join(", ");

    const adapter: ImageTargetAdapter<StoryAssetStateImage> = {
      kind: `story.asset.state:${stateId}`,
      loadState: async () => state.image ?? { status: "idle" },
      saveState: async (next) => {
        await this.writeStateImage(kind, assetId, stateId, next, states);
      },
      diskPath: (ext) => path.join(stateImageDir(stateId), `image.${ext}`),
      publicUrl: () => stateImageUrl(novelId, stateId),
      cleanupOtherExts: async (keepExt) => {
        await Promise.all(STATE_IMAGE_EXTS
          .filter(([ext]) => ext !== keepExt)
          .map(async ([ext]) => {
            try {
              await fs.unlink(path.join(stateImageDir(stateId), `image.${ext}`));
            } catch {
              // 不存在即无需清理
            }
          }));
      },
    };

    await runImageGeneration(adapter, {
      provider: DEFAULT_PROVIDER,
      prompt,
      size: IMAGE_SPECS.characterAsset,
      negativePrompt,
      ...(referenceUrl ? { refImages: [referenceUrl] } : {}),
      ...(referenceUrl && referencedLabel
        ? { referenceImages: [{ kind: "asset", label: `${referencedLabel} · 状态参考图`, url: referenceUrl } as GeneratedReferenceImageMeta] }
        : {}),
    });

    // 返回更新后的资产 DTO（与列表接口同形），前端直接刷新缓存与本地编辑态
    if (kind === "character") {
      const list = await storySettingsService.listCharacters(novelId);
      return list.find((item) => item.id === assetId) ?? null;
    }
    if (kind === "scene") {
      const list = await storySettingsService.listScenes(novelId);
      return list.find((item) => item.id === assetId) ?? null;
    }
    const list = await storySettingsService.listProps(novelId);
    return list.find((item) => item.id === assetId) ?? null;
  }

  /** 服务图片文件（路由直接流式返回；与 drama 首帧图的 serve 形状一致）。 */
  async resolveStateImagePath(stateId: string): Promise<{ filePath: string; mimeType: string } | null> {
    for (const [ext, mimeType] of STATE_IMAGE_EXTS) {
      const filePath = path.join(stateImageDir(stateId), `image.${ext}`);
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          return { filePath, mimeType };
        }
      } catch {
        // 换下一个扩展名
      }
    }
    return null;
  }
}

export const storyAssetStateImageService = new StoryAssetStateImageService();
