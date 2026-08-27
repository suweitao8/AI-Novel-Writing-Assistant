import { getImageModelProvider } from "../../../llm/modelCategories";
import fs from "fs/promises";
import path from "path";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  normalizeStoryAssetStates,
  parseStoryAssetStatesJson,
  hasStoryAssetStateImageUrl,
  type StoryAssetState,
} from "@ai-novel/shared/types/novelReferenceExtraction";

import { prisma } from "../../../db/prisma";
import { stateImageUrl } from "../../../platform/assets/StoryAssetStateImageStorage";
import { AppError } from "../../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";
import { prepareReferenceImageFiles } from "../../image/referenceImageFiles";
import { filterImageGenerationReferences, parseImageStateSummary, runImageGeneration, type ImageTargetAdapter } from "../../image/runtime";
import { fingerprintImageFile } from "../../image/runtime/referenceIntegrity";
import type { GeneratedReferenceImageMeta } from "../../image/runtime/types";
import { IMAGE_SPECS } from "../../image/imageSpecs";
import { safeJsonParse } from "../utils/json";
import { loadNovelCharacterStatesByName } from "../DramaContextAssembler";
import { buildDramaShotKeyframePrompt } from "../../../prompting/prompts/drama/shotKeyframe.prompts";
import {
  buildShotStylePromptLines,
  combineShotStyleAvoidInstructions,
  type DramaAssetStyleKind,
} from "./dramaVisualStyles";
import { resolveDramaArtStyleContext } from "./dramaArtStyleResolver";
import { buildSceneLightingAvoidInstructions, buildSceneLightingContract } from "./sceneLightingContract";
import { isConfirmedBlockingSketch, parseBlockingSketchData } from "./DramaShotBlockingSketchContracts";
import { dramaShotBlockingSketchService } from "./DramaShotBlockingSketchService";

export type ShotKeyframeStatus = "idle" | "generating" | "done" | "error";

export interface ShotKeyframeHistoryItem {
  version: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
}

export interface ShotKeyframeData {
  status: ShotKeyframeStatus;
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  history?: ShotKeyframeHistoryItem[];
  referenceImages?: GeneratedReferenceImageMeta[];
}

interface CharacterLite {
  id: string;
  name: string;
  archetype?: string | null;
  persona?: string | null;
  visualAnchor?: string | null;
  portraitData?: string | null;
}

interface ShotKeyframeSource {
  id: string;
  order: number;
  shotSize?: string | null;
  location?: string | null;
  action: string;
  dialogue?: string | null;
  characterRefs?: string | null;
  /** 分镜 LLM 标注的每镜角色状态 JSON（[{name,state}]，drama.storyboard@v5 起） */
  characterStates?: string | null;
  visualPrompt?: string | null;
  blockingSketchData?: string | null;
  storyboard: {
    project: {
      id: string;
      source: string;
      sourceRef?: string | null;
      characters: CharacterLite[];
      visualStyle?: string | null;
    };
  };
}

interface SceneSettingLite {
  name: string;
  stateLabel: string | null;
  environmentPrompt: string | null;
  summary: string | null;
  sceneType: string | null;
  timeOfDay: string | null;
  weather: string | null;
  /** 场景初始状态图（生成过且成功才有）。 */
  imageUrl: string | null;
}

interface PropSettingLite {
  name: string;
  visualPrompt: string | null;
  description: string | null;
  /** 45° 透视参考图（生成过且成功才有）。 */
  imageUrl: string | null;
}

function resolveInitialSettingState(
  statesJson: string | null,
  fallback: {
    name: string;
    description?: string | null;
    imagePrompt?: string | null;
    sceneType?: string | null;
    timeOfDay?: string | null;
    weather?: string | null;
  },
  imageUrlForState?: (stateId: string) => string,
): {
  stateLabel: string;
  imagePrompt: string;
  imageUrl: string | null;
  sceneType?: string | null;
  timeOfDay?: string | null;
  weather?: string | null;
} {
  const fallbackDescription = fallback.description?.trim() || fallback.imagePrompt?.trim() || `${fallback.name}默认状态`;
  const fallbackImagePrompt = fallback.imagePrompt?.trim() || fallbackDescription;
  const initial = normalizeStoryAssetStates(parseStoryAssetStatesJson(statesJson).states, {
    description: fallbackDescription,
    imagePrompt: fallbackImagePrompt,
    sceneType: fallback.sceneType === "interior" || fallback.sceneType === "exterior" || fallback.sceneType === "nature"
      ? fallback.sceneType
      : null,
    timeOfDay: fallback.timeOfDay === "morning" || fallback.timeOfDay === "noon" || fallback.timeOfDay === "night"
      ? fallback.timeOfDay
      : null,
    weather: fallback.weather === "sunny" || fallback.weather === "cloudy" || fallback.weather === "rainy"
      ? fallback.weather
      : null,
  })[0];
  const initialImage = initial?.image;
  return {
    stateLabel: initial?.label?.trim() || "默认",
    imagePrompt: initial?.imagePrompt?.trim() || fallbackImagePrompt,
    imageUrl: hasStoryAssetStateImageUrl(initialImage)
      ? imageUrlForState?.(initial?.id ?? "") ?? initialImage.url.trim()
      : null,
    sceneType: initial?.sceneType ?? null,
    timeOfDay: initial?.timeOfDay ?? null,
    weather: initial?.weather ?? null,
  };
}

const DRAMA_SHOT_IMAGES_DIR = "drama-shots";
const DEFAULT_PROVIDER: LLMProvider = getImageModelProvider();
const KEYFRAME_EXTS: Array<[string, string]> = [
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["webp", "image/webp"],
];

function dramaShotDir(shotId: string): string {
  return path.join(resolveGeneratedImagesRoot(), DRAMA_SHOT_IMAGES_DIR, shotId);
}

function currentKeyframeUrl(shotId: string): string {
  return `/api/drama/shot-images/${shotId}/keyframe`;
}

function archivedKeyframeUrl(shotId: string, version: number): string {
  return `/api/drama/shot-images/${shotId}/keyframe/v${version}`;
}


function normalizePositiveVersion(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function readKeyframeVersion(data: ShotKeyframeData): number {
  const explicit = normalizePositiveVersion(data.version);
  if (explicit) {
    return explicit;
  }
  return data.status === "done" ? 1 : 0;
}

function normalizeHistoryItem(input: unknown): ShotKeyframeHistoryItem | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  const version = normalizePositiveVersion(record.version);
  if (!version) {
    return null;
  }
  return {
    version,
    url: typeof record.url === "string" && record.url.trim() ? record.url.trim() : undefined,
    prompt: typeof record.prompt === "string" ? record.prompt : undefined,
    provider: typeof record.provider === "string" ? record.provider : undefined,
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : undefined,
  };
}

function readKeyframeHistory(data: ShotKeyframeData): ShotKeyframeHistoryItem[] {
  return Array.isArray(data.history)
    ? data.history.map(normalizeHistoryItem).filter((item): item is ShotKeyframeHistoryItem => Boolean(item))
    : [];
}

async function removeCurrentKeyframeVariants(shotId: string, keepExt: string): Promise<void> {
  await Promise.all(KEYFRAME_EXTS
    .filter(([ext]) => ext !== keepExt)
    .map(async ([ext]) => {
      try {
        await fs.unlink(path.join(dramaShotDir(shotId), `keyframe.${ext}`));
      } catch {
        // Missing alternate formats are expected.
      }
    }));
}

function normalizeReferenceKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function parseCharacterRefs(raw: string | null | undefined): string[] {
  const parsed = safeJsonParse<unknown>(raw, raw ?? []);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
  }
  if (typeof parsed === "string" && parsed.trim()) {
    return [parsed.trim()];
  }
  return [];
}

function extractVisualDesc(visualAnchor: string | null | undefined): string {
  if (!visualAnchor?.trim()) {
    return "";
  }
  try {
    const parsed = JSON.parse(visualAnchor) as Record<string, unknown>;
    if (typeof parsed.description === "string") return parsed.description;
    if (typeof parsed.hint === "string") return parsed.hint;
    if (typeof parsed.visualAnchor === "string") return parsed.visualAnchor;
    return JSON.stringify(parsed);
  } catch {
    return visualAnchor;
  }
}

function selectReferencedCharacters(shot: ShotKeyframeSource): CharacterLite[] {
  const refs = parseCharacterRefs(shot.characterRefs);
  if (!refs.length) {
    return [];
  }
  const refKeys = new Set(refs.map(normalizeReferenceKey).filter((key): key is string => Boolean(key)));
  return shot.storyboard.project.characters.filter((character) => {
    const idKey = normalizeReferenceKey(character.id);
    const nameKey = normalizeReferenceKey(character.name);
    return Boolean((idKey && refKeys.has(idKey)) || (nameKey && refKeys.has(nameKey)));
  });
}

/** 解析分镜 LLM 标注的每镜角色状态（[{name,state}] JSON）→ 角色名 → 状态名。 */
function parseShotCharacterStates(raw: string | null | undefined): Map<string, string> {
  const parsed = safeJsonParse<Array<{ name?: unknown; state?: unknown }>>(raw, []);
  const map = new Map<string, string>();
  if (!Array.isArray(parsed)) {
    return map;
  }
  for (const entry of parsed) {
    if (typeof entry?.name === "string" && typeof entry?.state === "string" && entry.state.trim()) {
      map.set(entry.name.trim(), entry.state.trim());
    }
  }
  return map;
}

/**
 * 镜头状态标注 × 设定中心状态名单 → 该镜各角色的生效状态对象。
 * 状态名按 label 精确匹配；匹配不到（名单删过/名字不一致）就当没有状态，
 * 生图回落到角色默认形象——不静默改用别的状态。
 */
function resolveActiveStatesByName(
  shot: ShotKeyframeSource,
  novelStatesByName: Map<string, StoryAssetState[]>,
): Map<string, StoryAssetState> {
  const active = new Map<string, StoryAssetState>();
  for (const [name, label] of parseShotCharacterStates(shot.characterStates)) {
    const matched = novelStatesByName.get(name)?.find((state) => state.label.trim() === label);
    if (matched) {
      active.set(name, matched);
    }
  }
  return active;
}

function resolveCharacterRefImageUrl(character: CharacterLite): string | null {
  if (!character.portraitData) return null;
  try {
    const pd = JSON.parse(character.portraitData) as { status?: string; url?: string };
    return pd.status === "done" && pd.url ? pd.url : null;
  } catch {
    return null;
  }
}

function buildCharacterPromptLine(character: CharacterLite, activeState?: StoryAssetState): string {
  return [
    character.name,
    character.archetype ? `定位：${character.archetype}` : "",
    character.persona ? `性格：${character.persona}` : "",
    extractVisualDesc(character.visualAnchor) ? `外貌：${extractVisualDesc(character.visualAnchor)}` : "",
    activeState
      ? `状态：${activeState.label}${activeState.ageGroup ? `，年龄段：${activeState.ageGroup}` : ""}（${activeState.imagePrompt?.trim() || activeState.description?.trim() || ""}）`
      : "",
  ].filter(Boolean).join("；");
}

// 设定中心 → 首帧生图接线：novel_import 项目按「名字对应」把设定中心的场景环境
// 提示词与道具画面提示词带进镜头提示词（场景按 location 匹配，道具按镜头文本出现
// 的道具名匹配）。没有对应设定时不添加任何行，生图行为与接线前一致。
async function resolveNovelSettingSources(project: { source: string; sourceRef?: string | null }): Promise<{
  scenes: SceneSettingLite[];
  props: PropSettingLite[];
}> {
  if (project.source !== "novel_import" || !project.sourceRef?.trim()) {
    return { scenes: [], props: [] };
  }
  const novelId = project.sourceRef.trim();
  const [scenes, props] = await Promise.all([
    prisma.novelScene.findMany({
      where: { novelId },
      select: {
        id: true,
        name: true,
        environmentPrompt: true,
        summary: true,
        sceneType: true,
        timeOfDay: true,
        weather: true,
        statesJson: true,
      },
    }),
    prisma.novelProp.findMany({
      where: { novelId },
      select: { id: true, name: true, visualPrompt: true, description: true, imageData: true, statesJson: true },
    }),
  ]);
  return {
    scenes: scenes.map(({ id, statesJson, ...rest }) => {
      const initial = resolveInitialSettingState(statesJson, {
        name: rest.name,
        description: rest.summary,
        imagePrompt: rest.environmentPrompt,
        sceneType: rest.sceneType,
        timeOfDay: rest.timeOfDay,
        weather: rest.weather,
      }, (stateId) => stateImageUrl(novelId, "scene", id, stateId));
      return {
        ...rest,
        stateLabel: initial.stateLabel,
        environmentPrompt: initial.imagePrompt,
        imageUrl: initial.imageUrl ?? null,
        sceneType: initial.sceneType ?? null,
        timeOfDay: initial.timeOfDay ?? null,
        weather: initial.weather ?? null,
      };
    }),
    props: props.map(({ id, imageData, statesJson, ...rest }) => {
      const initial = resolveInitialSettingState(statesJson, {
        name: rest.name,
        description: rest.description,
        imagePrompt: rest.visualPrompt,
      }, (stateId) => stateImageUrl(novelId, "prop", id, stateId));
      return {
        ...rest,
        visualPrompt: initial.imagePrompt,
        imageUrl: initial.imageUrl ?? parseImageStateSummary(imageData)?.url ?? null,
      };
    }),
  };
}

function matchSceneByName(scenes: SceneSettingLite[], location: string | null | undefined): SceneSettingLite | null {
  const target = location?.trim();
  if (!target || scenes.length === 0) {
    return null;
  }
  const exact = scenes.find((scene) => scene.name.trim() === target);
  if (exact) {
    return exact;
  }
  // location 可能带修饰（如「废弃地铁站·站台」）：取名字被包含的最长场景，避免短名误吞长名
  const contained = scenes
    .filter((scene) => target.includes(scene.name.trim()))
    .sort((left, right) => right.name.trim().length - left.name.trim().length)[0];
  return contained ?? null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchPropsInShotText(props: PropSettingLite[], shot: ShotKeyframeSource): PropSettingLite[] {
  if (props.length === 0) {
    return [];
  }
  const haystack = [shot.location, shot.action, shot.dialogue, shot.visualPrompt]
    .filter(Boolean)
    .join("\n");
  // 与脚本页「名字对应」同一约定：名字前后不能紧贴其他文字，避免「刀」匹配「刀光剑影」
  return props.filter((prop) => {
    const name = prop.name.trim();
    if (!name) {
      return false;
    }
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "u");
    return pattern.test(haystack);
  });
}

/**
 * 只返回当前镜头实际出现的资产类别：角色引用、地点、镜头文本命中的道具。
 * 分镜首帧需要这些类别的渲染质感，但不能带入资产参考图的四视图/全景/透视规格。
 */
export function resolveShotAssetStyleKinds(
  shot: ShotKeyframeSource,
  settings: { scenes: SceneSettingLite[]; props: PropSettingLite[] },
): DramaAssetStyleKind[] {
  const kinds: DramaAssetStyleKind[] = [];
  if (selectReferencedCharacters(shot).length > 0) {
    kinds.push("character");
  }
  if (shot.location?.trim()) {
    kinds.push("scene");
  }
  if (matchPropsInShotText(settings.props, shot).length > 0) {
    kinds.push("prop");
  }
  return kinds;
}

function buildSettingPromptLines(shot: ShotKeyframeSource, settings: { scenes: SceneSettingLite[]; props: PropSettingLite[] }): string[] {
  const lines: string[] = [];
  const scene = matchSceneByName(settings.scenes, shot.location);
  if (scene) {
    const environment = scene.environmentPrompt?.trim() || scene.summary?.trim();
    const context = [
      scene.sceneType ? `类型：${scene.sceneType}` : "",
      scene.timeOfDay ? `时间：${scene.timeOfDay}` : "",
      scene.weather ? `天气：${scene.weather}` : "",
    ].filter(Boolean).join("，");
    if (context) {
      lines.push(`场景状态：${context}`);
    }
    if (environment) {
      lines.push(`场景环境：${environment}`);
    }
  }
  const matchedProps = matchPropsInShotText(settings.props, shot);
  if (matchedProps.length > 0) {
    lines.push(`道具：${matchedProps
      .map((prop) => `${prop.name}（${prop.visualPrompt?.trim() || prop.description?.trim() || ""}）`)
      .filter((entry) => !entry.endsWith("（）"))
      .join("｜")}`);
  }
  return lines;
}

/** 镜头的剧情上下文：本镜地点/画面/台词最优先（判定「当下」），再补所在集正文的窗口。 */
function buildShotScriptJudge(shot: {
  order: number;
  location: string | null;
  action: string;
  dialogue: string | null;
  visualPrompt?: string | null;
  storyboard: { episode?: { order: number; content: string | null } | null };
}): { target: string; scriptExcerpt: string } | null {
  const localLines = [
    shot.location ? `地点：${shot.location}` : "",
    `画面内容：${shot.action}`,
    shot.dialogue ? `台词：${shot.dialogue}` : "",
    shot.visualPrompt?.trim() ? `画面提示词：${shot.visualPrompt.trim()}` : "",
  ].filter(Boolean);
  const episodeText = shot.storyboard.episode?.content?.trim() ?? "";
  const episodeWindow = episodeText.length > 2400
    ? `${episodeText.slice(0, 1600)}……${episodeText.slice(-600)}`
    : episodeText;
  const excerpt = [
    ...localLines,
    episodeWindow ? `本集正文：${episodeWindow}` : "",
  ].filter(Boolean).join("\n").slice(0, 3000);
  if (!excerpt.trim()) {
    return null;
  }
  const episodeNo = shot.storyboard.episode?.order;
  return {
    target: `第${episodeNo ? `${episodeNo}集 ` : ""}第${shot.order}镜 首帧${shot.location ? `（${shot.location}）` : ""}`,
    scriptExcerpt: excerpt,
  };
}

export class DramaShotKeyframeService {
  private readonly referencePassthroughCache = new Map<string, {
    fileKey: string;
    stateKey: string;
    matched: boolean;
  }>();

  private async buildKeyframeGenerationContext(
    shotId: string,
    useCharacterRefImages = true,
  ) {
    const shot = await prisma.dramaShot.findUnique({
      where: { id: shotId },
      include: {
        storyboard: {
          include: {
            project: { include: { characters: true } },
            episode: { select: { order: true, content: true } },
          },
        },
      },
    });
    if (!shot) {
      throw new AppError(`未找到短剧镜头：${shotId}`, 404);
    }
    const parsedBlockingSketch = parseBlockingSketchData(shot.blockingSketchData);
    if (parsedBlockingSketch?.status === "draft") {
      throw new AppError("存在尚未确认的摆位草图，请先确认草图再生成分镜画面。", 409);
    }
    const blockingSketch = isConfirmedBlockingSketch(parsedBlockingSketch) ? parsedBlockingSketch : null;
    if (blockingSketch && !(await dramaShotBlockingSketchService.resolveExistingBlockingSketchPath(shotId))) {
      throw new AppError("已确认摆位草图的图片不可读取，请重新保存并确认。", 409);
    }

    // 时代风格逐镜判定（2026-08-22 用户要求）：镜头画面/台词 + 所在集正文作为剧情上下文，
    // AI 判断这一镜处于什么时代（切换场景时可能需要切换风格），失败回落全局链。
    const styleContext = await resolveDramaArtStyleContext({
      visualStyle: shot.storyboard.project.visualStyle,
      sourceRef: shot.storyboard.project.sourceRef,
      scriptJudge: buildShotScriptJudge(shot),
    });
    const settings = await resolveNovelSettingSources(shot.storyboard.project);
    const novelStatesByName = shot.storyboard.project.source === "novel_import" && shot.storyboard.project.sourceRef?.trim()
      ? await loadNovelCharacterStatesByName(shot.storyboard.project.sourceRef.trim())
      : new Map<string, StoryAssetState[]>();
    // 该镜各角色的生效状态（分镜 LLM 标注 × 设定中心状态名单）
    const activeStatesByName = resolveActiveStatesByName(shot, novelStatesByName);
    const usedKinds = resolveShotAssetStyleKinds(shot, settings);
    const matchedScene = matchSceneByName(settings.scenes, shot.location);
    const lightingContract = matchedScene
      ? buildSceneLightingContract({
        sceneName: matchedScene.name,
        stateLabel: matchedScene.stateLabel,
        sceneType: matchedScene.sceneType,
        timeOfDay: matchedScene.timeOfDay,
        weather: matchedScene.weather,
        hasReferenceImage: Boolean(matchedScene.imageUrl),
      })
      : null;
    const prompt = buildDramaShotKeyframePrompt({
      styleLines: buildShotStylePromptLines(
        styleContext.assets,
        usedKinds,
        styleContext.specific,
        styleContext.renderFamily,
      ),
      location: shot.location,
      settingLines: buildSettingPromptLines(shot, settings),
      shotSize: shot.shotSize,
      action: shot.action,
      dialogue: shot.dialogue,
      visualPrompt: shot.visualPrompt,
      characters: selectReferencedCharacters(shot).map((character) =>
        buildCharacterPromptLine(character, activeStatesByName.get(character.name.trim()))),
      hasConfirmedBlockingSketch: Boolean(blockingSketch),
      lightingContract,
    });
    const negativePrompt = [
      "低质量，模糊，五官变形，多指，身体重复，文字，水印，字幕",
      combineShotStyleAvoidInstructions(
        styleContext.assets,
        usedKinds,
        styleContext.specific,
        styleContext.renderFamily,
      ),
      matchedScene ? buildSceneLightingAvoidInstructions() : "",
    ].filter(Boolean).join("，");
    const refImages: string[] = [];
    const referenceImages: import("../../image/runtime").GeneratedReferenceImageMeta[] = [];
    if (blockingSketch) {
      refImages.unshift(blockingSketch.url);
      referenceImages.unshift({
        kind: "layout_sketch",
        label: "已确认摆位草图",
        url: blockingSketch.url,
      });
    }
    if (useCharacterRefImages) {
      const referencedChars = selectReferencedCharacters(shot);
      for (const char of referencedChars) {
        // 角色在这一镜处于登记过的状态且状态图已生成：用状态图当参考图
        // （比设计稿更贴合当前外观）；否则回落角色设计稿
        const activeState = activeStatesByName.get(char.name.trim());
        const stateImageUrl = hasStoryAssetStateImageUrl(activeState?.image)
          ? activeState.image.url.trim()
          : null;
        if (stateImageUrl) {
          refImages.push(stateImageUrl);
          referenceImages.push({
            kind: "asset",
            label: `${char.name} · ${activeState?.label} 状态图`,
            url: stateImageUrl,
          });
          continue;
        }
        const url = resolveCharacterRefImageUrl(char);
        if (url) {
          refImages.push(url);
          referenceImages.push({
            kind: "character_sheet",
            label: `${char.name} · 角色设计稿`,
            url,
          });
        }
      }
      // 场景初始状态图（镜头地点与设定场景同名）与画面里点名的道具，也作为参考图挂给首帧图。
      if (matchedScene?.imageUrl) {
        refImages.push(matchedScene.imageUrl);
        referenceImages.push({
          kind: "scene",
          label: `${matchedScene.name} · ${matchedScene.stateLabel ?? "默认"}状态图`,
          url: matchedScene.imageUrl,
        });
      }
      for (const prop of matchPropsInShotText(settings.props, shot)) {
        if (prop.imageUrl) {
          refImages.push(prop.imageUrl);
          referenceImages.push({
            kind: "asset",
            label: `${prop.name} · 道具视图`,
            url: prop.imageUrl,
          });
        }
      }
    }

    const adapter: ImageTargetAdapter<ShotKeyframeData> = {
      kind: `drama.shot.keyframe:${shotId}`,
      loadState: async () => safeJsonParse<ShotKeyframeData>(shot.keyframeData, { status: "idle" }),
      saveState: async (next) => {
        await prisma.dramaShot.update({ where: { id: shotId }, data: { keyframeData: JSON.stringify(next) } });
      },
      diskPath: (ext) => path.join(dramaShotDir(shotId), `keyframe.${ext}`),
      publicUrl: () => currentKeyframeUrl(shotId),
      cleanupOtherExts: (keepExt) => removeCurrentKeyframeVariants(shotId, keepExt),
      versioning: {
        enabled: true,
        maxHistory: 5,
        archiveCurrent: (current) => this.archiveCurrentKeyframe(shotId, current),
      },
    };

    return {
      adapter,
      prompt,
      refImages,
      referenceImages,
      blockingSketchUrl: blockingSketch?.url,
      size: IMAGE_SPECS.dramaKeyframe,
      negativePrompt,
      title: `生成镜头 ${shot.order} 首帧图`,
    };
  }

  async prepareKeyframe(
    shotId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    useCharacterRefImages = true,
  ): Promise<import("../../image/runtime").ImageGenerationPreview> {
    const ctx = await this.buildKeyframeGenerationContext(shotId, useCharacterRefImages);
    return {
      kind: ctx.adapter.kind,
      title: ctx.title,
      prompt: ctx.prompt,
      negativePrompt: ctx.negativePrompt,
      referenceImages: ctx.referenceImages,
      provider,
      size: ctx.size,
    };
  }

  async generateKeyframe(
    shotId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    useCharacterRefImages = true,
    overrides?: import("../../image/runtime").ImageGenerationOverrides,
  ): Promise<ShotKeyframeData> {
    const ctx = await this.buildKeyframeGenerationContext(shotId, useCharacterRefImages);
    const refs = filterImageGenerationReferences({
      refImages: ctx.refImages,
      referenceImages: ctx.referenceImages,
      excludedReferenceImageUrls: overrides?.excludedReferenceImageUrls?.filter((url) => url !== ctx.blockingSketchUrl),
    });
    return runImageGeneration(ctx.adapter, {
      provider: overrides?.providerOverride ?? provider,
      prompt: overrides?.promptOverride ?? ctx.prompt,
      // 分镜首帧固定横屏，页面级尺寸覆盖不能把生产画幅改回竖版。
      size: IMAGE_SPECS.dramaKeyframe,
      negativePrompt: overrides?.negativePromptOverride ?? ctx.negativePrompt,
      ...(refs.refImages && refs.refImages.length > 0 ? { refImages: refs.refImages } : {}),
      referenceImages: refs.referenceImages && refs.referenceImages.length > 0 ? refs.referenceImages : undefined,
    });
  }

  private async archiveCurrentKeyframe(shotId: string, data: ShotKeyframeData): Promise<ShotKeyframeHistoryItem | null> {
    if (data.status !== "done") {
      return null;
    }
    const version = readKeyframeVersion(data);
    if (!version) {
      return null;
    }
    const resolved = await this.resolveExistingKeyframePath(shotId);
    const historyItem: ShotKeyframeHistoryItem = {
      version,
      prompt: data.prompt,
      provider: data.provider,
      generatedAt: data.generatedAt,
    };
    if (!resolved) {
      return historyItem;
    }
    const ext = path.extname(resolved.filePath).replace(".", "").toLowerCase() || "png";
    const archivePath = path.join(dramaShotDir(shotId), `keyframe.v${version}.${ext}`);
    await fs.copyFile(resolved.filePath, archivePath);
    return {
      ...historyItem,
      url: archivedKeyframeUrl(shotId, version),
    };
  }

  async resolveExistingKeyframePath(shotId: string): Promise<{ filePath: string; mimeType: string } | null> {
    const dir = dramaShotDir(shotId);
    for (const [ext, mimeType] of KEYFRAME_EXTS) {
      const filePath = path.join(dir, `keyframe.${ext}`);
      try {
        await fs.access(filePath);
        return { filePath, mimeType };
      } catch {
        // Try the next supported extension.
      }
    }
    return null;
  }

  /**
   * 历史数据可能已经把参考图原样写进 keyframe.png。展示层不能把这种文件
   * 当成成功首帧输出；生成 runtime 的新结果由指纹校验负责，这里负责旧结果。
   */
  async isExistingKeyframeReferencePassthrough(
    shotId: string,
    resolved: { filePath: string; mimeType: string },
  ): Promise<boolean> {
    const [stat, shot] = await Promise.all([
      fs.stat(resolved.filePath),
      prisma.dramaShot.findUnique({ where: { id: shotId }, select: { keyframeData: true } }),
    ]);
    const data = safeJsonParse<ShotKeyframeData>(shot?.keyframeData, { status: "idle" });
    const referenceUrls = (data.referenceImages ?? [])
      .map((reference) => reference.url?.trim())
      .filter((url): url is string => Boolean(url));
    if (referenceUrls.length === 0) {
      return false;
    }

    const fileKey = `${stat.size}:${stat.mtimeMs}`;
    const stateKey = `${data.version ?? 0}:${data.generatedAt ?? ""}:${referenceUrls.join("|")}`;
    const cached = this.referencePassthroughCache.get(shotId);
    if (cached?.fileKey === fileKey && cached.stateKey === stateKey) {
      return cached.matched;
    }

    try {
      const prepared = await prepareReferenceImageFiles({ refImages: referenceUrls });
      try {
        const outputFingerprint = await fingerprintImageFile(resolved.filePath);
        const matched = prepared.fingerprints.includes(outputFingerprint);
        this.referencePassthroughCache.set(shotId, { fileKey, stateKey, matched });
        return matched;
      } finally {
        await prepared.cleanup();
      }
    } catch {
      // 历史参考资产被删除时无法完成重复比对；不能因此把原本存在的
      // keyframe 变成 500，交给图片本身继续展示。
      return false;
    }
  }

  async resolveArchivedKeyframePath(shotId: string, version: number): Promise<{ filePath: string; mimeType: string } | null> {
    const dir = dramaShotDir(shotId);
    for (const [ext, mimeType] of KEYFRAME_EXTS) {
      const filePath = path.join(dir, `keyframe.v${version}.${ext}`);
      try {
        await fs.access(filePath);
        return { filePath, mimeType };
      } catch {
        // Try the next supported extension.
      }
    }
    return null;
  }
}

export const dramaShotKeyframeService = new DramaShotKeyframeService();
