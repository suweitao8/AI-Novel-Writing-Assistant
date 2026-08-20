import { getImageModelProvider } from "../../../llm/modelCategories";
import fs from "fs/promises";
import path from "path";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";
import { filterImageGenerationReferences, runImageGeneration, type ImageTargetAdapter } from "../../image/runtime";
import { IMAGE_SPECS } from "../../image/imageSpecs";
import { safeJsonParse } from "../utils/json";
import {
  buildKeyframeStylePromptLines,
  combineStyleAvoidInstructions,
} from "./dramaVisualStyles";
import { resolveDramaArtStyleContext } from "./dramaArtStyleResolver";

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
  cameraMove?: string | null;
  location?: string | null;
  action: string;
  dialogue?: string | null;
  characterRefs?: string | null;
  visualPrompt?: string | null;
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
  environmentPrompt: string | null;
  summary: string | null;
}

interface PropSettingLite {
  name: string;
  visualPrompt: string | null;
  description: string | null;
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

function resolveCharacterRefImageUrl(character: CharacterLite): string | null {
  if (!character.portraitData) return null;
  try {
    const pd = JSON.parse(character.portraitData) as { status?: string; url?: string };
    return pd.status === "done" && pd.url ? pd.url : null;
  } catch {
    return null;
  }
}

function buildCharacterPromptLine(character: CharacterLite): string {
  return [
    character.name,
    character.archetype ? `定位：${character.archetype}` : "",
    character.persona ? `性格：${character.persona}` : "",
    extractVisualDesc(character.visualAnchor) ? `外貌：${extractVisualDesc(character.visualAnchor)}` : "",
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
      select: { name: true, environmentPrompt: true, summary: true },
    }),
    prisma.novelProp.findMany({
      where: { novelId },
      select: { name: true, visualPrompt: true, description: true },
    }),
  ]);
  return { scenes, props };
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

function buildSettingPromptLines(shot: ShotKeyframeSource, settings: { scenes: SceneSettingLite[]; props: PropSettingLite[] }): string[] {
  const lines: string[] = [];
  const scene = matchSceneByName(settings.scenes, shot.location);
  if (scene) {
    const environment = scene.environmentPrompt?.trim() || scene.summary?.trim();
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

function buildShotKeyframePrompt(
  shot: ShotKeyframeSource,
  styleLines: string[],
  settings: { scenes: SceneSettingLite[]; props: PropSettingLite[] },
): string {
  const characters = selectReferencedCharacters(shot).map(buildCharacterPromptLine);
  const lines = [
    ...styleLines,
    "图生视频的决定性单帧首图",
    "构图干净，主体突出",
    shot.location ? `地点：${shot.location}` : "",
    ...buildSettingPromptLines(shot, settings),
    shot.shotSize ? `景别：${shot.shotSize}` : "",
    shot.cameraMove ? `运镜意图：${shot.cameraMove}` : "",
    `画面内容：${shot.action}`,
    shot.dialogue ? `台词语境（不要渲染字幕）：${shot.dialogue}` : "",
    shot.visualPrompt ? `画面提示词：${shot.visualPrompt}` : "",
    characters.length ? `角色：${characters.join("｜")}` : "",
    "所有出场角色保持服装、发型、五官、年龄与情绪一致",
    "不要文字、水印、字幕或标志",
  ];
  return lines.filter(Boolean).join("，");
}

export class DramaShotKeyframeService {
  private async buildKeyframeGenerationContext(
    shotId: string,
    useCharacterRefImages = false,
  ) {
    const shot = await prisma.dramaShot.findUnique({
      where: { id: shotId },
      include: {
        storyboard: {
          include: {
            project: { include: { characters: true } },
          },
        },
      },
    });
    if (!shot) {
      throw new AppError(`未找到短剧镜头：${shotId}`, 404);
    }

    const styleContext = await resolveDramaArtStyleContext({
      visualStyle: shot.storyboard.project.visualStyle,
      sourceRef: shot.storyboard.project.sourceRef,
    });
    const settings = await resolveNovelSettingSources(shot.storyboard.project);
    const prompt = buildShotKeyframePrompt(
      shot,
      buildKeyframeStylePromptLines(styleContext.universal, styleContext.specific),
      settings,
    );
    const negativePrompt = [
      "低质量，模糊，五官变形，多指，身体重复，文字，水印，字幕",
      combineStyleAvoidInstructions(styleContext.universal, styleContext.specific),
    ].filter(Boolean).join("，");
    const refImages: string[] = [];
    const referenceImages: import("../../image/runtime").GeneratedReferenceImageMeta[] = [];
    if (useCharacterRefImages) {
      const referencedChars = selectReferencedCharacters(shot);
      for (const char of referencedChars) {
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
      size: IMAGE_SPECS.dramaKeyframe,
      negativePrompt,
      title: `生成镜头 ${shot.order} 首帧图`,
    };
  }

  async prepareKeyframe(
    shotId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    useCharacterRefImages = false,
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
    useCharacterRefImages = false,
    overrides?: import("../../image/runtime").ImageGenerationOverrides,
  ): Promise<ShotKeyframeData> {
    const ctx = await this.buildKeyframeGenerationContext(shotId, useCharacterRefImages);
    const refs = filterImageGenerationReferences({
      refImages: ctx.refImages,
      referenceImages: ctx.referenceImages,
      excludedReferenceImageUrls: overrides?.excludedReferenceImageUrls,
    });
    return runImageGeneration(ctx.adapter, {
      provider: overrides?.providerOverride ?? provider,
      prompt: overrides?.promptOverride ?? ctx.prompt,
      size: overrides?.sizeOverride ?? ctx.size,
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
