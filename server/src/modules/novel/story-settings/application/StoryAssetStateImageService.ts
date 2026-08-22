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
import type {
  StoryAssetState,
  StoryAssetStateImage,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import {
  normalizeStoryCharacterStates,
  normalizeStoryAssetStates,
  parseStoryAssetStatesJson,
  resolveStoryAssetStateAncestors,
  type StoryCharacterLegacyFields,
} from "@ai-novel/shared/types/novelReferenceExtraction";

import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../../../runtime/appPaths";
import {
  runImageGeneration,
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

export type StoryAssetKind = "character" | "scene" | "prop";

const STATE_IMAGES_DIR = "story-state-images";
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
  statesCanSafelyRewrite?: boolean;
  gender?: string | null;
  ageGroup?: string | null;
  appearance?: string | null;
  physique?: string | null;
  attireStyle?: string | null;
  facePrompt?: string | null;
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
    const baseAppearance = row.environmentPrompt?.trim() || row.summary?.trim() || `${row.name}初始状态`;
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
  const baseAppearance = row.visualPrompt?.trim() || row.description?.trim() || `${row.name}初始状态`;
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
    ...(image.url ? { url: image.url } : {}),
    ...(image.prompt ? { prompt: clampText(image.prompt, STATE_IMAGE_PROMPT_MAX) } : {}),
    ...(image.provider ? { provider: image.provider } : {}),
    ...(image.generatedAt ? { generatedAt: image.generatedAt } : {}),
    ...(image.error ? { error: clampText(image.error, STATE_IMAGE_ERROR_MAX) } : {}),
  };
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
      // 参考图只锁身份：磨损脏污与时代氛围不得从旧图带进新图（除非状态本身描写），
      // 换时代风格后重新生成要跟当前风格走（2026-08-22 用户实测旧末世参考把画面带偏）。
      ? "keep the same subject identity as the reference image, change only what the state describes; do not carry over wear, dirt or damage from the reference image unless the state describes it"
      : "",
    ...(input.kind === "scene"
      ? [
        // 场景状态图必须是 360° 等距柱状全景（2026-08-22 用户要求，可在前端全景预览里旋转查看）；
        // 措辞沿用旧版全景接口验证过的口径（StoryAssetImageService.generateSceneImage）。
        "360-degree equirectangular panorama of the empty scene environment, standard 2:1 aspect ratio, seamless horizontal wrap-around",
        "seamless horizontal wrap-around view of the whole space",
        "consistent palette, materials, architecture and lighting across the entire panorama",
        "horizon roughly centered vertically, one continuous full-view image, no borders, no split panels, no collage",
        "pure empty environment reference",
        "no people, no characters, no animals, no monsters, no creatures, no crowds, no living subjects",
        "narrative living subjects remain off-screen and may appear only as environmental traces",
        "uniform detail and sharpness across the whole 360-degree view",
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
    const url = ancestor.image?.status === "done" ? ancestor.image.url?.trim() : undefined;
    if (url) {
      return { stateId: ancestor.id, url };
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
          const result = await prisma.character.updateMany({
            where: { id: assetId, statesJson: expectedRaw },
            data: { statesJson: nextRaw },
          });
          return result.count === 1;
        },
        patch: (state) => ({ ...state, image: pruneStateImage(image) }),
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
          const result = await prisma.novelScene.updateMany({
            where: { id: assetId, statesJson: expectedRaw },
            data: { statesJson: nextRaw },
          });
          return result.count === 1;
        },
        patch: (state) => ({ ...state, image: pruneStateImage(image) }),
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
          const result = await prisma.novelProp.updateMany({
            where: { id: assetId, statesJson: expectedRaw },
            data: { statesJson: nextRaw },
          });
          return result.count === 1;
        },
        patch: (state) => ({ ...state, image: pruneStateImage(image) }),
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

  async generateStateImage(
    novelId: string,
    kind: StoryAssetKind,
    assetId: string,
    stateId: string,
  ): Promise<unknown> {
    const { row, states, state } = await this.findState(novelId, kind, assetId, stateId);
    const resolvedReference = resolveStateReferenceImage(states, state);
    const referenceUrl = resolvedReference?.url ?? null;
    // 参考图优先传本地文件（provider 走 multipart /images/edits）：codex 桥的 JSON 生成路径
    // 不解析 input_image_url，传 URL 会静默丢参考；本地文件是唯一可靠形态。
    const referenceFile = resolvedReference ? await this.resolveStateImagePath(resolvedReference.stateId) : null;
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
    const styleLines = buildAssetStylePromptLines(kind, styleContext.assets[kind], styleContext.specific);
    const negativePrompt = [
      "low quality, blurry, distorted face, extra fingers, duplicate body, text, watermark, subtitles",
      kind === "scene"
        ? "people, characters, persons, animals, monsters, creatures, crowds, living subjects, humanoid silhouettes"
        : kind === "prop"
          ? "other objects, multiple objects, extra props, hands, holding, table, cloth, fabric, rag, wooden board, background scenery"
          : "",
      combineAssetStyleAvoidInstructions(styleContext.assets[kind], styleContext.specific),
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
        ...(kind === "prop" ? TRANSPARENT_IMAGE_OPTIONS : {}),
        ...(referenceFile ? { refImagePaths: [referenceFile.filePath] } : referenceUrl ? { refImages: [referenceUrl] } : {}),
        ...(referenceUrl && referencedLabel
          ? { referenceImages: [{ kind: "asset", label: `${referencedLabel} · 状态参考图`, url: referenceUrl } as GeneratedReferenceImageMeta] }
          : {}),
      });
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
