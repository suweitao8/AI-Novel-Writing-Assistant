/**
 * 资产外观状态的图片生成（角色/场景/道具共用）。
 *
 * 状态图是「设计参考图」：为资产某一个外观状态（初始/换装/受伤/昼夜/损坏…）生成
 * 一张可用作后续生图参考的图。生图时按状态自己的 referenceStateId 配置取参考图
 * （同一资产另一个状态的图，典型：新状态参考上一状态保持长相一致只换装/加伤），
 * 不参考则直接生成全新形象——2026-08-20 用户要求的灵活配置在图片侧的消费点。
 *
 * 画风与首帧图/角色设计稿同源：复用 drama 的资产类别画风解析（角色/场景/道具 + 本书
 * 具体风格），保证状态图、首帧图、角色设计稿三者画风一致。文件落盘与状态机走
 * image/runtime 的统一 Adapter（与 DramaShotKeyframeService 同一套样板）。
 */
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  StoryAssetState,
  StoryAssetStateImage,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import {
  normalizeStoryCharacterStates,
  normalizeStoryAssetStates,
  parseStoryAssetStatesJson,
  resolveStoryAssetStateAncestors,
  hasStoryAssetStateImageUrl,
  type StoryCharacterLegacyFields,
} from "@ai-novel/shared/types/novelReferenceExtraction";

import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import {
  runImageGeneration,
  IMAGE_GENERATION_CANCELLED_MESSAGE,
  type ImageTargetAdapter,
  type GeneratedReferenceImageMeta,
} from "../../../../services/image/runtime";
import { IMAGE_SPECS } from "../../../../services/image/imageSpecs";
import {
  resolveDramaArtStyleContext,
} from "../../../../services/drama/visual/dramaArtStyleResolver";
import {
  buildAssetStylePromptLines,
  combineAssetStyleAvoidInstructions,
  DEFAULT_DRAMA_VISUAL_STYLE_ID,
} from "../../../../services/drama/visual/dramaVisualStyles";
import {
  buildCharacterStateSheetPrompt,
  CHARACTER_STATE_SHEET_NEGATIVE_PROMPT,
} from "../../../../services/drama/visual/characterStateSheet";
import { storySettingsService } from "./StorySettingsService";
import {
  normalizeSceneStates,
  updateStoryAssetStateJsonWithCas,
} from "./StorySettingsStatePolicy";
import {
  resolveAssetImageProvider,
  TRANSPARENT_IMAGE_OPTIONS,
} from "../../../../services/image/assetProviderRouting";
import {
  legacyStateImageDir,
  stateImageDir,
  stateImageUrl,
  type StoryAssetKind,
} from "./StoryAssetStateImageStorage";
import {
  StoryAssetImageArtifactStore,
  isStoryAssetImageArtifactStorageKeyForTarget,
  type StoryAssetImageArtifactLocation,
  type StoryAssetImageArtifactMetadata,
  type StoryAssetImageExtension,
  type StoryAssetImageMimeType,
} from "./StoryAssetImageArtifactStore";
import {
  StoryAssetImageGenerationLock,
  buildStoryAssetImageTargetKey,
  type StoryAssetImageArtifactRecord,
} from "./StoryAssetImageGenerationLock";
import {
  dismissStoryAssetImageError,
  preserveReadableStoryAssetImagePointer,
  prioritizeStoryAssetImageArtifacts,
} from "./StoryAssetImageRecoveryPolicy";

const STATE_IMAGE_EXTS: Array<[string, string]> = [
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["webp", "image/webp"],
];

export type { StoryAssetKind } from "./StoryAssetStateImageStorage";
export { stateImageUrl } from "./StoryAssetStateImageStorage";
export { dismissStoryAssetImageError };

interface StateAssetRow {
  id: string;
  novelId: string;
  name: string;
  /** 场景/道具的基础画面描述；角色的外貌全部从当前状态读取。 */
  baseAppearance: string | null;
  statesJson: string | null;
  states?: StoryAssetState[];
  statesCanSafelyRewrite?: boolean;
  gender?: string | null;
  ageGroup?: string | null;
  appearance?: string | null;
  physique?: string | null;
  attireStyle?: string | null;
  facePrompt?: string | null;
}

interface StoryAssetImageCommitContext {
  artifact: StoryAssetImageArtifactRecord;
  targetKey: string;
  metadata: StoryAssetImageArtifactMetadata;
}

interface StoryAssetImageLeaseGuard {
  artifactId: string;
  targetKey: string;
}

const storyAssetImageArtifactStore = new StoryAssetImageArtifactStore();
const storyAssetImageGenerationLock = new StoryAssetImageGenerationLock();

function normalizeStateImageExtension(value: string): StoryAssetImageExtension {
  if (value === "jpeg") {
    return "jpg";
  }
  if (value === "png" || value === "jpg" || value === "webp") {
    return value;
  }
  throw new AppError(`不支持的状态图格式：${value}`, 500);
}

function mimeTypeForStateImageExtension(extension: StoryAssetImageExtension): StoryAssetImageMimeType {
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

async function updateStateJsonAndCommitArtifact(
  tx: Prisma.TransactionClient,
  kind: StoryAssetKind,
  assetId: string,
  expectedRaw: string | null,
  nextRaw: string,
  commit: StoryAssetImageCommitContext,
): Promise<boolean> {
  const result = kind === "character"
    ? await tx.character.updateMany({
      where: { id: assetId, statesJson: expectedRaw },
      data: { statesJson: nextRaw },
    })
    : kind === "scene"
      ? await tx.novelScene.updateMany({
        where: { id: assetId, statesJson: expectedRaw },
        data: { statesJson: nextRaw },
      })
      : await tx.novelProp.updateMany({
        where: { id: assetId, statesJson: expectedRaw },
        data: { statesJson: nextRaw },
      });
  if (result.count !== 1) {
    return false;
  }

  const artifactResult = await tx.storyAssetImageArtifact.updateMany({
    where: {
      id: commit.artifact.id,
      status: "staging",
      activeLockKey: commit.targetKey,
      leaseExpiresAt: { gt: new Date() },
    },
    data: {
      status: "committed",
      activeLockKey: null,
      leaseExpiresAt: null,
      storageKey: commit.metadata.storageKey,
      mimeType: commit.metadata.mimeType,
      extension: commit.metadata.extension,
      sha256: commit.metadata.sha256,
      byteSize: commit.metadata.byteSize,
    },
  });
  if (artifactResult.count !== 1) {
    throw new AppError("图片制品提交锁已失效，请重新生成。", 409);
  }
  return true;
}

/**
 * 生成中的中间状态也必须被当前 lease fencing。先在同一事务里条件触碰
 * staging artifact，再更新 statesJson；lease 被回收后旧任务无法再写 generating/error。
 */
async function updateStateJsonWithArtifactLease(
  tx: Prisma.TransactionClient,
  kind: StoryAssetKind,
  assetId: string,
  expectedRaw: string | null,
  nextRaw: string,
  guard: StoryAssetImageLeaseGuard,
): Promise<boolean> {
  const leaseResult = await tx.storyAssetImageArtifact.updateMany({
    where: {
      id: guard.artifactId,
      status: "staging",
      activeLockKey: guard.targetKey,
      leaseExpiresAt: { gt: new Date() },
    },
    data: { updatedAt: new Date() },
  });
  if (leaseResult.count !== 1) {
    throw new AppError("图片制品提交锁已失效，请重新生成。", 409);
  }

  const result = kind === "character"
    ? await tx.character.updateMany({
      where: { id: assetId, statesJson: expectedRaw },
      data: { statesJson: nextRaw },
    })
    : kind === "scene"
      ? await tx.novelScene.updateMany({
        where: { id: assetId, statesJson: expectedRaw },
        data: { statesJson: nextRaw },
      })
      : await tx.novelProp.updateMany({
        where: { id: assetId, statesJson: expectedRaw },
        data: { statesJson: nextRaw },
      });
  return result.count === 1;
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
    const parsedStates = parseStoryAssetStatesJson(row.statesJson);
    return {
      id: row.id,
      novelId: row.novelId,
      name: row.name,
      baseAppearance: null,
      statesJson: row.statesJson,
      states: normalizeStoryCharacterStates(parsedStates.states, legacy),
      statesCanSafelyRewrite: parsedStates.canSafelyRewrite,
      gender: row.gender,
      ageGroup: row.ageGroup,
      appearance: row.appearance,
      physique: row.physique,
      attireStyle: row.attireStyle,
      facePrompt: row.facePrompt,
    };
  }
  if (kind === "scene") {
    const row = await prisma.novelScene.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        novelId: true,
        name: true,
        environmentPrompt: true,
        summary: true,
        sceneType: true,
        timeOfDay: true,
        weather: true,
        statesJson: true,
      },
    });
    if (!row || row.novelId !== novelId) {
      throw new AppError("未找到场景。", 404);
    }
    const parsedStates = parseStoryAssetStatesJson(row.statesJson);
    const baseAppearance = row.environmentPrompt?.trim() || row.summary?.trim() || `${row.name}默认状态`;
    return {
      id: row.id,
      novelId: row.novelId,
      name: row.name,
      baseAppearance: row.environmentPrompt?.trim() || row.summary?.trim() || null,
      statesJson: row.statesJson,
      states: normalizeStoryAssetStates(parsedStates.states, {
        description: row.summary?.trim() || baseAppearance,
        imagePrompt: row.environmentPrompt?.trim() || baseAppearance,
        sceneType: row.sceneType === "interior" || row.sceneType === "exterior" || row.sceneType === "nature"
          ? row.sceneType
          : null,
        timeOfDay: row.timeOfDay === "morning" || row.timeOfDay === "noon" || row.timeOfDay === "night"
          ? row.timeOfDay
          : null,
        weather: row.weather === "sunny" || row.weather === "cloudy" || row.weather === "rainy"
          ? row.weather
          : null,
      }),
      statesCanSafelyRewrite: parsedStates.canSafelyRewrite,
    };
  }
  const row = await prisma.novelProp.findUnique({
    where: { id: assetId },
    select: { id: true, novelId: true, name: true, visualPrompt: true, description: true, statesJson: true },
  });
  if (!row || row.novelId !== novelId) {
    throw new AppError("未找到道具。", 404);
  }
  const parsedStates = parseStoryAssetStatesJson(row.statesJson);
  const baseAppearance = row.visualPrompt?.trim() || row.description?.trim() || `${row.name}默认状态`;
  return {
    id: row.id,
    novelId: row.novelId,
    name: row.name,
    baseAppearance: row.visualPrompt?.trim() || row.description?.trim() || null,
    statesJson: row.statesJson,
    states: normalizeStoryAssetStates(parsedStates.states, {
      description: row.description?.trim() || baseAppearance,
      imagePrompt: row.visualPrompt?.trim() || baseAppearance,
    }),
    statesCanSafelyRewrite: parsedStates.canSafelyRewrite,
  };
}

function parseAssetStates(raw: string | null | undefined): StoryAssetState[] {
  return parseStoryAssetStatesJson(raw).states;
}

// 写入上限与路由 zod（assetStateImageSchema）对齐：服务端写入的字段必须能被
// 客户端原样带回保存，超限会让整个资产无法再保存（用户实测 image.prompt 超 2400 被拦）。
const STATE_IMAGE_PROMPT_MAX = 6000;
const STATE_IMAGE_ERROR_MAX = 600;

function clampText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** 只保留状态图契约字段，丢弃 runtime 可能附加的 history 等，保持 statesJson 干净。 */
function pruneStateImage(image: StoryAssetStateImage): StoryAssetStateImage {
  return {
    status: image.status,
    ...(image.artifactId ? { artifactId: image.artifactId } : {}),
    ...(image.url ? { url: image.url } : {}),
    ...(image.prompt ? { prompt: clampText(image.prompt, STATE_IMAGE_PROMPT_MAX) } : {}),
    ...(image.provider ? { provider: image.provider } : {}),
    ...(image.generatedAt ? { generatedAt: image.generatedAt } : {}),
    ...(image.attemptId ? { attemptId: image.attemptId } : {}),
    ...(image.error ? { error: clampText(image.error, STATE_IMAGE_ERROR_MAX) } : {}),
  };
}

/**
 * 场景状态图提交后，旧图片对应的空间标记不能继续伪装成当前图的标记。
 * 生成中/失败/取消只更新图片状态，仍保留最后一张可读图片与其标记；只有不可变制品
 * 完成提交时才清除标记，等待用户针对新图重新识别。
 */
export function applySceneStateImageWrite(input: {
  state: StoryAssetState;
  image?: StoryAssetStateImage;
  invalidateMarkers: boolean;
}): StoryAssetState {
  const nextState = input.image
    ? { ...input.state, image: pruneStateImage(input.image) }
    : input.state;
  if (!input.invalidateMarkers) {
    return nextState;
  }
  const { scene3dMarkers: _scene3dMarkers, ...withoutMarkers } = nextState;
  return withoutMarkers;
}

function sanitizeSceneStateDescription(value: string): string {
  return value
    .replace(/(?:巨型|大型|带血角|血角|凶猛)*(?:猛兽|怪物|异兽|野兽|动物|生物)/giu, "地面爪痕与破坏痕迹")
    .replace(/人物|角色|人类|行人|人群/gu, "活动痕迹")
    .replace(/\b(?:people|person|character|characters|animal|animals|monster|monsters|creature|creatures|beast|beasts|crowd|crowds)\b/giu, "environmental traces");
}

/** 组装状态图提示词（纯函数，契约锁定在 tests/storyAssetStateImage.test.js）。 */
export function buildStateImagePrompt(
  input: {
    kind: StoryAssetKind;
    assetName: string;
    baseAppearance: string | null;
    state: Pick<StoryAssetState, "label" | "description" | "imagePrompt" | "ageGroup" | "sceneType" | "timeOfDay" | "weather">;
    gender?: string | null;
    hasReference: boolean;
  },
  styleLines: string[],
): string {
  const stateDescription = input.kind === "scene"
    ? sanitizeSceneStateDescription(input.state.description)
    : input.state.description;
  const stateImagePrompt = input.kind === "scene"
    ? sanitizeSceneStateDescription(input.state.imagePrompt)
    : input.state.imagePrompt;
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
    ...(input.kind === "scene"
      ? [
        input.state.sceneType ? `scene type: ${input.state.sceneType}` : "",
        input.state.timeOfDay ? `time of day: ${input.state.timeOfDay}` : "",
        input.state.weather ? `weather: ${input.state.weather}` : "",
      ]
      : []),
    input.baseAppearance ? `base appearance: ${input.baseAppearance}` : "",
    `state: ${input.state.label}`,
    `state change: ${stateDescription}`,
    `state image prompt: ${stateImagePrompt}`,
    input.hasReference
      // 参考图只锁主体身份：时代观感跟当前风格方向走——换时代风格（如 现代都市→末世废土）
      // 重新生成时环境要有明显转变，不能照抄参考图的旧时代样式（2026-08-23 用户要求）；
      // 干净日常风格里旧图的脏污磨损仍不得带入。
      ? "keep the same subject identity as the reference image; the era look follows the current style direction — when it differs from the reference's look, transform the environment boldly to fully express the new style, and do not carry over wear, dirt or damage from the reference image unless the style direction or the state describes it"
      : "",
    ...(input.kind === "scene"
      ? [
        // 场景状态图必须是 360° 等距柱状全景（2026-08-22 用户要求，可在前端全景预览里旋转查看）；
        // 措辞沿用旧版全景接口验证过的口径（StoryAssetImageService.generateSceneImage）。
        "360-degree equirectangular panorama of the empty scene environment, standard 2:1 aspect ratio, seamless horizontal wrap-around",
        "seamless horizontal wrap-around view of the whole space",
        "consistent palette, materials, architecture and lighting across the entire panorama",
        "equirectangular panorama layout: the horizon line is exactly centered at vertical v=0.5; keep the image as one continuous panorama, not a drawn divider or collage",
        "upper half (v=0.0-0.5) contains the sky, ceiling, walls, distant background and environment objects; cluster major objects around the horizon and keep them primarily above the center line",
        "lower half (v=0.5-1.0) is primarily one continuous clean ground, floor or terrain surface with sparse low-lying detail",
        "do not place large furniture, trees, buildings, rocks or other tall objects deep in the lower half; do not let objects cross toward the nadir where equirectangular projection stretches them",
        "keep the lower half free of repeated or stretched objects; preserve natural ground material detail without filling it with props",
        "pure empty environment reference",
        "no people, no characters, no animals, no monsters, no creatures, no crowds, no living subjects",
        "narrative living subjects remain off-screen and may appear only as environmental traces",
      ]
      : [
        // 角色/道具参考图统一透明底（2026-08-22）：底图要能直接叠进分镜首帧。
        "fully transparent background, genuine PNG alpha channel",
        "no backdrop color, no solid fill, no checkerboard pattern, no studio floor, no ground shadow",
        "clean composition, strong subject focus",
        // 道具只渲染道具本身（2026-08-22 用户要求）：描述/提示词里提到的周围环境与
        // 其它物品（抹布、木板等）只是上下文，不是画面内容。
        ...(input.kind === "prop"
          ? [
            "render exactly one prop: the subject itself, alone, nothing else in frame",
            "other objects, surfaces or scenery mentioned in the state description or image prompt are context metadata only and must not appear",
          ]
          : []),
      ]),
    // 旧数据的状态提示词可能带画风/背景/视图词：这里声明它们只是内容描述的一部分，
    // 渲染方向、背景与画幅一律以上方规则为准，不因提示词里的旧词改变。
    "any style, background or framing words inside the state image prompt are metadata only; rendering direction, background and framing follow the rules above",
    "no text, no watermark, no subtitles, no logo",
  ];
  return lines.filter(Boolean).join(", ");
}

export function resolveStateReferenceImageUrl(states: StoryAssetState[], state: StoryAssetState): string | null {
  return resolveStateReferenceImage(states, state)?.url ?? null;
}

export function resolveStateReferenceImage(
  states: StoryAssetState[],
  state: StoryAssetState,
): { stateId: string; url: string } | null {
  const effectiveStates = states.some((item) => item.id === state.id)
    ? states.map((item) => item.id === state.id ? state : item)
    : [...states, state];
  for (const ancestor of resolveStoryAssetStateAncestors(effectiveStates, state.id)) {
    if (hasStoryAssetStateImageUrl(ancestor.image)) {
      return { stateId: ancestor.id, url: ancestor.image.url.trim() };
    }
  }
  return null;
}

export class StoryAssetStateImageService {
  /** 读-改-写回 statesJson：只在目标状态上写 image 字段，不碰其他状态的并发编辑。 */
  private async writeStateImage(
    kind: StoryAssetKind,
    assetId: string,
    stateId: string,
    image: StoryAssetStateImage,
    fallbackStates: StoryAssetState[] = [],
    artifactCommit?: StoryAssetImageCommitContext,
    artifactLeaseGuard?: StoryAssetImageLeaseGuard,
    patchCurrentImage?: (current: StoryAssetStateImage | undefined) => StoryAssetStateImage | undefined,
    maxAttempts = 3,
  ): Promise<void> {
    if (kind === "character") {
      await updateStoryAssetStateJsonWithCas({
        stateId,
        fallbackStates,
        read: async () => {
          const row = await prisma.character.findUnique({
            where: { id: assetId },
            select: {
              statesJson: true,
              name: true,
              gender: true,
              ageGroup: true,
              physique: true,
              attireStyle: true,
              facePrompt: true,
              appearance: true,
              voiceTexture: true,
            },
          });
          if (!row) {
            throw new AppError("未找到角色。", 404);
          }
          const legacy: StoryCharacterLegacyFields = row;
          const parsedStates = parseStoryAssetStatesJson(row.statesJson);
          return {
            raw: row.statesJson,
            fallbackStates: normalizeStoryCharacterStates(parsedStates.states, legacy),
            normalize: (states: StoryAssetState[]) => normalizeStoryCharacterStates(states, legacy),
          };
        },
        write: async (expectedRaw, nextRaw) => {
          if (artifactCommit) {
            return prisma.$transaction((tx) => updateStateJsonAndCommitArtifact(
              tx,
              kind,
              assetId,
              expectedRaw,
              nextRaw,
              artifactCommit,
            ));
          }
          if (artifactLeaseGuard) {
            return prisma.$transaction((tx) => updateStateJsonWithArtifactLease(
              tx,
              kind,
              assetId,
              expectedRaw,
              nextRaw,
              artifactLeaseGuard,
            ));
          }
          const result = await prisma.character.updateMany({
            where: { id: assetId, statesJson: expectedRaw },
            data: { statesJson: nextRaw },
          });
          return result.count === 1;
        },
        patch: (state) => {
          const nextImage = patchCurrentImage
            ? patchCurrentImage(state.image)
            : preserveReadableStoryAssetImagePointer(state.image, image);
          return {
            ...state,
            ...(nextImage ? { image: pruneStateImage(nextImage) } : {}),
          };
        },
        maxAttempts,
      });
    } else if (kind === "scene") {
      await updateStoryAssetStateJsonWithCas({
        stateId,
        fallbackStates,
        read: async () => {
          const row = await prisma.novelScene.findUnique({
            where: { id: assetId },
            select: {
              statesJson: true,
              name: true,
              summary: true,
              environmentPrompt: true,
              sceneType: true,
              timeOfDay: true,
              weather: true,
            },
          });
          if (!row) {
            throw new AppError("未找到场景。", 404);
          }
          return {
            raw: row.statesJson,
            fallbackStates: normalizeSceneStates(parseStoryAssetStatesJson(row.statesJson).states, row),
            normalize: (states: StoryAssetState[]) => normalizeSceneStates(states, row),
          };
        },
        write: async (expectedRaw, nextRaw) => {
          if (artifactCommit) {
            return prisma.$transaction((tx) => updateStateJsonAndCommitArtifact(
              tx,
              kind,
              assetId,
              expectedRaw,
              nextRaw,
              artifactCommit,
            ));
          }
          if (artifactLeaseGuard) {
            return prisma.$transaction((tx) => updateStateJsonWithArtifactLease(
              tx,
              kind,
              assetId,
              expectedRaw,
              nextRaw,
              artifactLeaseGuard,
            ));
          }
          const result = await prisma.novelScene.updateMany({
            where: { id: assetId, statesJson: expectedRaw },
            data: { statesJson: nextRaw },
          });
          return result.count === 1;
        },
        patch: (state) => {
          const nextImage = patchCurrentImage
            ? patchCurrentImage(state.image)
            : preserveReadableStoryAssetImagePointer(state.image, image);
          return applySceneStateImageWrite({
            state,
            image: nextImage,
            invalidateMarkers: Boolean(artifactCommit),
          });
        },
        maxAttempts,
      });
    } else {
      await updateStoryAssetStateJsonWithCas({
        stateId,
        fallbackStates,
        read: async () => {
          const row = await prisma.novelProp.findUnique({ where: { id: assetId }, select: { statesJson: true } });
          if (!row) {
            throw new AppError("未找到道具。", 404);
          }
          return { raw: row.statesJson, fallbackStates };
        },
        write: async (expectedRaw, nextRaw) => {
          if (artifactCommit) {
            return prisma.$transaction((tx) => updateStateJsonAndCommitArtifact(
              tx,
              kind,
              assetId,
              expectedRaw,
              nextRaw,
              artifactCommit,
            ));
          }
          if (artifactLeaseGuard) {
            return prisma.$transaction((tx) => updateStateJsonWithArtifactLease(
              tx,
              kind,
              assetId,
              expectedRaw,
              nextRaw,
              artifactLeaseGuard,
            ));
          }
          const result = await prisma.novelProp.updateMany({
            where: { id: assetId, statesJson: expectedRaw },
            data: { statesJson: nextRaw },
          });
          return result.count === 1;
        },
        patch: (state) => {
          const nextImage = patchCurrentImage
            ? patchCurrentImage(state.image)
            : preserveReadableStoryAssetImagePointer(state.image, image);
          return {
            ...state,
            ...(nextImage ? { image: pruneStateImage(nextImage) } : {}),
          };
        },
        maxAttempts,
      });
    }
  }

  private async findState(novelId: string, kind: StoryAssetKind, assetId: string, stateId: string): Promise<{
    row: StateAssetRow;
    states: StoryAssetState[];
    state: StoryAssetState;
  }> {
    const row = await loadStateAsset(novelId, kind, assetId);
    if (row.statesJson?.trim() && row.statesCanSafelyRewrite === false) {
      throw new AppError("状态数据格式异常，已停止覆盖原始状态；请先在设定中心保存一次角色状态。", 409);
    }
    const states = row.states ?? parseAssetStates(row.statesJson);
    const state = states.find((item) => item.id === stateId);
    if (!state) {
      throw new AppError("未找到外观状态。", 404);
    }
    return { row, states, state };
  }

  /** 进行中的状态图生成：key=`${novelId}:${kind}:${assetId}:${stateId}`。终止接口按它中止在跑的请求；
   * 进程内无记录但状态是 generating 的视为僵尸（服务重启残留），直接改写为 error。 */
  private readonly inFlightGenerations = new Map<string, { controller: AbortController; done: Promise<unknown> }>();

  async generateStateImage(
    novelId: string,
    kind: StoryAssetKind,
    assetId: string,
    stateId: string,
  ): Promise<unknown> {
    // 生成中可手动终止（2026-08-23 用户要求：代理切错等场景生成卡住时停掉重来，不等超时）。
    const controller = new AbortController();
    const done = this.runStateImageGeneration(novelId, kind, assetId, stateId, controller);
    const flightKey = `${novelId}:${kind}:${assetId}:${stateId}`;
    this.inFlightGenerations.set(flightKey, { controller, done });
    try {
      return await done;
    } finally {
      this.inFlightGenerations.delete(flightKey);
    }
  }

  /** 终止状态图生成：中止在跑的请求并等 error 态写回；无在跑请求但状态是 generating
   * （重启残留/别的实例）时直接改写为 error。返回更新后的资产 DTO（与生成接口同形）。 */
  async cancelStateImage(
    novelId: string,
    kind: StoryAssetKind,
    assetId: string,
    stateId: string,
  ): Promise<unknown> {
    const flight = this.inFlightGenerations.get(`${novelId}:${kind}:${assetId}:${stateId}`);
    if (flight) {
      flight.controller.abort();
      await flight.done.catch(() => {});
    } else {
      const { states, state } = await this.findState(novelId, kind, assetId, stateId);
      if (state.image?.status === "generating") {
        const targetKey = buildStoryAssetImageTargetKey({ novelId, kind, assetId, stateId });
        const stagingArtifact = await prisma.storyAssetImageArtifact.findFirst({
          where: {
            novelId,
            kind,
            assetId,
            stateId,
            status: "staging",
            activeLockKey: targetKey,
            leaseExpiresAt: { gt: new Date() },
          },
          orderBy: { updatedAt: "desc" },
        });
        // 跨进程取消只允许 fencing 当前 staging 制品；找不到有效 lease 时，
        // 不凭一份过期的 generating 快照去覆盖后来提交的制品指针。
        if (stagingArtifact) {
          await this.writeStateImage(
            kind,
            assetId,
            stateId,
            { ...state.image, status: "error", error: IMAGE_GENERATION_CANCELLED_MESSAGE },
            states,
            undefined,
            { artifactId: stagingArtifact.id, targetKey },
          );
          await prisma.storyAssetImageArtifact.updateMany({
            where: {
              id: stagingArtifact.id,
              status: "staging",
              activeLockKey: targetKey,
            },
            data: { activeLockKey: null, leaseExpiresAt: null, status: "orphaned" },
          });
        }
      }
    }
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

  /** 关闭状态图失败提示：只删除当前状态图片的 error 字段，保留制品指针与可重试状态。 */
  async dismissStateImageError(
    novelId: string,
    kind: StoryAssetKind,
    assetId: string,
    stateId: string,
    expectedError: string,
    expectedAttemptId?: string,
  ): Promise<unknown> {
    const { states, state } = await this.findState(novelId, kind, assetId, stateId);
    if (state.image && state.image.error === expectedError
      && (expectedAttemptId === undefined || state.image.attemptId === expectedAttemptId)) {
      await this.writeStateImage(
        kind,
        assetId,
        stateId,
        state.image,
        states,
        undefined,
        undefined,
        (current) => {
          if (!current || current.error !== expectedError
            || (expectedAttemptId !== undefined && current.attemptId !== expectedAttemptId)) {
            return current;
          }
          return dismissStoryAssetImageError(current, expectedError, expectedAttemptId);
        },
        expectedAttemptId === undefined ? 1 : 3,
      );
    }
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

  private async runStateImageGeneration(
    novelId: string,
    kind: StoryAssetKind,
    assetId: string,
    stateId: string,
    controller: AbortController,
  ): Promise<unknown> {
    const { row, states, state } = await this.findState(novelId, kind, assetId, stateId);
    const attemptId = randomUUID();
    const resolvedReference = resolveStateReferenceImage(states, state);
    // 参考图优先传本地文件（provider 走 multipart /images/edits）：codex 桥的 JSON 生成路径
    // 不解析 input_image_url，传 URL 会静默丢参考；本地文件是唯一可靠形态。
    const referenceFile = resolvedReference
      ? await this.resolveStateImagePath(novelId, kind, assetId, resolvedReference.stateId)
      : null;
    const referenceUrl = referenceFile && resolvedReference
      ? stateImageUrl(novelId, kind, assetId, resolvedReference.stateId)
      : null;
    const effectiveReferenceStateId = resolvedReference?.stateId ?? null;
    const referencedLabel = referenceUrl
      ? states.find((item) => item.id === effectiveReferenceStateId)?.label ?? "参考状态"
      : null;

    // 状态图与首帧图/角色设计稿同源的资产类别画风（无分镜项目，visualStyle 恒空，走小说默认具体风格）。
    // 时代风格：状态自带 eraStyle（双穿/时代推进的书不同状态各处一个时代）；
    // 未选时默认内置「现代都市」预设（2026-08-22 用户要求：下拉不提供「自动」，不按剧情判定——
    // 需要其他时代直接在状态上选）。悬空引用（自定义风格已删）也固定回落「现代都市」：
    // 设定处的时代风格（脚本标记/小说默认）完全不影响状态图（同日用户要求彻底去掉这条影响）。
    // 剧情判定链只保留给分镜首帧（DramaShotKeyframeService）。
    const styleContext = await resolveDramaArtStyleContext({
      visualStyle: null,
      sourceRef: novelId,
      pinnedStyle: state.eraStyle?.trim() || DEFAULT_DRAMA_VISUAL_STYLE_ID,
      pinnedMissFallbackStyle: DEFAULT_DRAMA_VISUAL_STYLE_ID,
    });
    const styleLines = buildAssetStylePromptLines(
      kind,
      styleContext.assets[kind],
      styleContext.specific,
      styleContext.renderFamily,
    );
    const negativePrompt = [
      "low quality, blurry, distorted face, extra fingers, duplicate body, text, watermark, subtitles",
      kind === "scene"
        ? "people, characters, persons, animals, monsters, creatures, crowds, living subjects, humanoid silhouettes"
        : kind === "prop"
          ? "other objects, multiple objects, extra props, hands, holding, table, cloth, fabric, rag, wooden board, background scenery"
          : "",
      combineAssetStyleAvoidInstructions(
        styleContext.assets[kind],
        styleContext.specific,
        styleContext.renderFamily,
      ),
    ].filter(Boolean).join(", ");

    let artifactLease: Awaited<ReturnType<StoryAssetImageGenerationLock["acquire"]>> | null = null;
    let artifactLocation: StoryAssetImageArtifactLocation | null = null;
    let artifactCommitted = false;

    const adapter: ImageTargetAdapter<StoryAssetStateImage> = {
      kind: `story.asset.state:${stateId}`,
      loadState: async () => state.image ?? { status: "idle" },
      saveState: async (next) => {
        await this.writeStateImage(
          kind,
          assetId,
          stateId,
          next,
          states,
          undefined,
          artifactLease && !artifactCommitted
            ? { artifactId: artifactLease.artifact.id, targetKey: artifactLease.targetKey }
            : undefined,
        );
      },
      diskPath: () => {
        throw new Error("故事资产状态图必须通过不可变制品会话写入");
      },
      publicUrl: () => stateImageUrl(novelId, kind, assetId, stateId),
      beginArtifact: async () => {
        artifactLease = await storyAssetImageGenerationLock.acquire({
          novelId,
          kind,
          assetId,
          stateId,
        });
        return {
          diskPath: (ext: string) => {
            if (!artifactLease) {
              throw new AppError("图片制品锁未建立。", 409);
            }
            const extension = normalizeStateImageExtension(ext);
            artifactLocation = storyAssetImageArtifactStore.buildLocation({
              novelId,
              kind,
              assetId,
              stateId,
              generationId: artifactLease.artifact.generationId,
              extension,
            });
            return artifactLocation.tempPath;
          },
          commit: async ({ doneState }) => {
            if (!artifactLease || !artifactLocation) {
              throw new AppError("图片制品路径未建立。", 409);
            }
            const metadata = await storyAssetImageArtifactStore.finalizePartFile(
              artifactLocation,
              mimeTypeForStateImageExtension(artifactLocation.extension),
            );
            await this.writeStateImage(
              kind,
              assetId,
              stateId,
              {
                ...doneState,
                artifactId: artifactLease.artifact.id,
                url: stateImageUrl(novelId, kind, assetId, stateId),
              },
              states,
              {
                artifact: artifactLease.artifact,
                targetKey: artifactLease.targetKey,
                metadata,
              },
            );
            artifactCommitted = true;
          },
          renew: async () => {
            await artifactLease?.renew();
          },
          renewalIntervalMs: artifactLease.renewalIntervalMs,
          abort: async () => {
            if (artifactCommitted) {
              return;
            }
            if (artifactLocation) {
              try {
                await fs.unlink(artifactLocation.tempPath);
              } catch {
                // 临时文件不存在时无需清理。
              }
            }
            await artifactLease?.release();
          },
        };
      },
    };

    if (kind === "character") {
      const stableAppearance = [row.appearance, row.physique, row.attireStyle, row.facePrompt]
        .filter((value): value is string => Boolean(value?.trim()))
        .join("；");
      const sheetPrompt = buildCharacterStateSheetPrompt({
        assetName: row.name,
        gender: row.gender,
        ageGroup: row.ageGroup ?? state.ageGroup,
        appearance: stableAppearance || row.baseAppearance,
        stateLabel: state.label,
        stateDescription: state.description,
        stateImagePrompt: state.imagePrompt,
        styleLines,
        hasReference: Boolean(referenceUrl),
        wearTags: state.wearTags,
      });
      const referenceImages = referenceUrl && referencedLabel
        ? [{ kind: "asset", label: `${referencedLabel} · 状态参考图`, url: referenceUrl } as GeneratedReferenceImageMeta]
        : undefined;

      await runImageGeneration(adapter, {
        provider: resolveAssetImageProvider({ kind, hasReference: Boolean(referenceUrl) }),
        prompt: sheetPrompt,
        size: IMAGE_SPECS.characterSheet,
        sceneType: "character",
        negativePrompt: [CHARACTER_STATE_SHEET_NEGATIVE_PROMPT, negativePrompt].filter(Boolean).join(", "),
        signal: controller.signal,
        attemptId,
        ...TRANSPARENT_IMAGE_OPTIONS,
        ...(referenceFile ? { refImagePaths: [referenceFile.filePath] } : referenceUrl ? { refImages: [referenceUrl] } : {}),
        ...(referenceImages ? { referenceImages } : {}),
      });
    } else {
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
      await runImageGeneration(adapter, {
        provider: resolveAssetImageProvider({ kind, hasReference: Boolean(referenceUrl) }),
        prompt,
        // 场景按全景规格出图（等距柱状 360°），道具沿用通用资产图规格。
        size: kind === "scene" ? IMAGE_SPECS.scenePanorama : IMAGE_SPECS.characterAsset,
        negativePrompt,
        signal: controller.signal,
        attemptId,
        ...(kind === "prop" ? TRANSPARENT_IMAGE_OPTIONS : {}),
        ...(referenceFile ? { refImagePaths: [referenceFile.filePath] } : referenceUrl ? { refImages: [referenceUrl] } : {}),
        ...(referenceUrl && referencedLabel
          ? { referenceImages: [{ kind: "asset", label: `${referencedLabel} · 状态参考图`, url: referenceUrl } as GeneratedReferenceImageMeta] }
          : {}),
      });
    }

    // 手动终止：runner 已把状态写为 error 并正常返回——这里改抛终止提示，
    // 让仍在等待的生成请求得到明确的「已终止」反馈而不是成功。
    if (controller.signal.aborted) {
      throw new AppError(IMAGE_GENERATION_CANCELLED_MESSAGE, 400);
    }

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

  private async resolveImageFile(directory: string): Promise<{
    filePath: string;
    mimeType: string;
    mtimeMs: number;
  } | null> {
    for (const [ext, mimeType] of STATE_IMAGE_EXTS) {
      const filePath = path.join(directory, `image.${ext}`);
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          return { filePath, mimeType, mtimeMs: stat.mtimeMs };
        }
      } catch {
        // 换下一个扩展名
      }
    }
    return null;
  }

  private async resolveCommittedArtifactFile(artifact: {
    generationId: string;
    storageKey: string;
    sha256: string | null;
    byteSize: number | null;
    mimeType: string | null;
    extension: string | null;
  }, target: {
    novelId: string;
    kind: StoryAssetKind;
    assetId: string;
    stateId: string;
  }): Promise<{ filePath: string; mimeType: string } | null> {
    try {
      const extension = artifact.extension === "png" || artifact.extension === "jpg" || artifact.extension === "webp"
        ? artifact.extension
        : null;
      const mimeType = artifact.mimeType === "image/png"
        || artifact.mimeType === "image/jpeg"
        || artifact.mimeType === "image/webp"
        ? artifact.mimeType
        : null;
      if (!extension || !mimeType || !artifact.generationId.trim()) {
        return null;
      }
      if (!isStoryAssetImageArtifactStorageKeyForTarget(artifact.storageKey, {
        ...target,
        generationId: artifact.generationId,
        extension,
      })) {
        return null;
      }

      const finalPath = storyAssetImageArtifactStore.resolveStorageKeyPath(artifact.storageKey);
      const verification = await storyAssetImageArtifactStore.verifyCurrentArtifact({
        storageKey: artifact.storageKey,
        finalPath,
        sha256: artifact.sha256,
        byteSize: artifact.byteSize,
        mimeType,
        extension,
      });
      return verification.valid
        ? { filePath: verification.finalPath, mimeType: verification.mimeType }
        : null;
    } catch {
      // 一个损坏或历史格式异常的候选不能阻断继续尝试更旧的 committed 制品。
      return null;
    }
  }

  /**
   * 优先按当前状态的 artifactId 解析图片，并再次校验资产所有权和文件 hash。
   * 兼容不可变制品上线前已经写入“资产归属目录但没有 artifactId”的图片；
   * 当前制品损坏时还会从同一资产状态的历史 committed 制品恢复；
   * 该目录同时包含 novel/kind/asset/state，不会按裸 stateId 猜图。
   */
  async resolveStateImagePath(
    novelId: string,
    kind: StoryAssetKind,
    assetId: string,
    stateId: string,
  ): Promise<{ filePath: string; mimeType: string } | null> {
    const row = await loadStateAsset(novelId, kind, assetId);
    const stateImage = row.states?.find((state) => state.id === stateId)?.image;
    const artifactId = stateImage?.artifactId?.trim();
    const artifacts = await prisma.storyAssetImageArtifact.findMany({
      where: {
        novelId,
        kind,
        assetId,
        stateId,
        status: "committed",
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        generationId: true,
        storageKey: true,
        sha256: true,
        byteSize: true,
        mimeType: true,
        extension: true,
      },
    });
    for (const artifact of prioritizeStoryAssetImageArtifacts(artifactId, artifacts)) {
      const resolved = await this.resolveCommittedArtifactFile(artifact, { novelId, kind, assetId, stateId });
      if (resolved) {
        return resolved;
      }
    }

    const scopedLegacy = await this.resolveImageFile(stateImageDir(novelId, kind, assetId, stateId));
    return scopedLegacy ? { filePath: scopedLegacy.filePath, mimeType: scopedLegacy.mimeType } : null;
  }

  /** 兼容仍保存旧 URL 的调用方；新的资产 DTO 不再返回这个 URL。 */
  async resolveLegacyStateImagePath(stateId: string): Promise<{ filePath: string; mimeType: string } | null> {
    const legacy = await this.resolveImageFile(legacyStateImageDir(stateId));
    return legacy ? { filePath: legacy.filePath, mimeType: legacy.mimeType } : null;
  }
}

export const storyAssetStateImageService = new StoryAssetStateImageService();
