/**
 * DramaCharacterImageService
 * 为短剧角色生成「角色设计稿」：一张横版图同时包含面部特写 + 正/侧/背三视图，四个视图合称四视图（沿用旧项目约定）。
 * 对齐行业标准角色参考图规范，一次生成、全视角一致、作为视频生成的视觉锚点。
 *
 * 设计原则：
 * - 仅依赖平台级图片能力（provider.ts），不导入 novel 业务服务。
 * - 图片存储于 drama-characters/{charId}/ 独立目录，通过专用端点服务。
 * - characterSheetData 存角色设计稿（主）；portraitData/threeViewData 保留后备兼容。
 */
import fs from "fs/promises";
import path from "path";

import { IMAGE_SPECS } from "../image/imageSpecs";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../runtime/appPaths";
import { runImageGeneration, safeJsonParse, type ImageTargetAdapter } from "../image/runtime";
import { buildCharacterStylePromptLines } from "./visual/dramaVisualStyles";
import { resolveDramaArtStyleContext } from "./visual/dramaArtStyleResolver";
import { GROK_BUILD_IMAGE_PROVIDER } from "../image/assetProviderRouting";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CharacterImageStatus = "idle" | "generating" | "done" | "error";

export interface CharacterImageHistoryItem {
  version: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
}

export interface CharacterSheetData {
  status: CharacterImageStatus;
  version?: number;
  /** 角色设计稿公开 URL（面部特写 + 四视图合图） */
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  history?: CharacterImageHistoryItem[];
}

export interface PortraitData {
  status: CharacterImageStatus;
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  history?: CharacterImageHistoryItem[];
}

export type ThreeViewName = "front" | "side" | "back";

export interface ThreeViewItem {
  view: ThreeViewName;
  status: CharacterImageStatus;
  url?: string;
  prompt?: string;
  generatedAt?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DRAMA_IMAGES_DIR = "drama-characters";
const DEFAULT_PROVIDER = GROK_BUILD_IMAGE_PROVIDER;
const IMAGE_EXTS: Array<[string, string]> = [
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["webp", "image/webp"],
];

function dramaCharacterDir(charId: string): string {
  return path.join(resolveGeneratedImagesRoot(), DRAMA_IMAGES_DIR, charId);
}

function currentCharacterSheetUrl(characterId: string): string {
  return `/api/drama/character-images/${characterId}/character-sheet`;
}

function archivedCharacterSheetUrl(characterId: string, version: number): string {
  return `/api/drama/character-images/${characterId}/character-sheet/v${version}`;
}

function normalizePositiveVersion(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function readImageVersion(data: CharacterSheetData): number {
  const explicit = normalizePositiveVersion(data.version);
  if (explicit) return explicit;
  return data.status === "done" ? 1 : 0;
}

function normalizeHistoryItem(input: unknown): CharacterImageHistoryItem | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const version = normalizePositiveVersion(record.version);
  if (!version) return null;
  return {
    version,
    url: typeof record.url === "string" && record.url.trim() ? record.url.trim() : undefined,
    prompt: typeof record.prompt === "string" ? record.prompt : undefined,
    provider: typeof record.provider === "string" ? record.provider : undefined,
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : undefined,
  };
}

function readImageHistory(data: CharacterSheetData): CharacterImageHistoryItem[] {
  return Array.isArray(data.history)
    ? data.history.map(normalizeHistoryItem).filter((item): item is CharacterImageHistoryItem => Boolean(item))
    : [];
}

async function removeCurrentCharacterSheetVariants(characterId: string, keepExt: string): Promise<void> {
  await Promise.all(IMAGE_EXTS
    .filter(([ext]) => ext !== keepExt)
    .map(async ([ext]) => {
      try {
        await fs.unlink(path.join(dramaCharacterDir(characterId), `character-sheet.${ext}`));
      } catch {
        // Missing alternate formats are expected.
      }
    }));
}

function extractVisualDesc(visualAnchor: string | null | undefined): string {
  if (!visualAnchor?.trim()) return "";
  try {
    const parsed = JSON.parse(visualAnchor) as Record<string, unknown>;
    return typeof parsed.description === "string" ? parsed.description : JSON.stringify(parsed);
  } catch {
    return visualAnchor;
  }
}

/**
 * 构建「角色设计稿」提示词：
 * 单张图四个视角（沿用旧项目口径，2026-08-21 用户明确）：头部正面、头部侧面、正面全身、背面全身。
 */
function buildCharacterSheetPrompt(character: {
  name: string;
  archetype?: string | null;
  persona?: string | null;
  visualAnchor?: string | null;
}, styleLines: string[]): string {
  const visualDesc = extractVisualDesc(character.visualAnchor);

  const lines: string[] = [
    // 四视图布局沿用旧项目口径（2026-08-21 用户明确）：头部正面、头部侧面、正面全身、背面全身。
    "专业角色设计参考图，单张图片，含四个视角",
    "头部特写 正面视角（五官细节清晰，表情自然）",
    "头部特写 侧面视角（90度侧脸）",
    "全身 正面视角（站立，全身可见）",
    "全身 背面视角（同款服装与发型，从背后看）",
    "四个视角必须是同一个角色：服装、发型与配色完全一致",
    "白色背景，干净的摄影棚布光，不要文字或水印",
    ...styleLines,
  ];

  if (character.archetype) lines.push(`角色定位：${character.archetype}`);
  if (character.persona) lines.push(`性格特质：${character.persona}`);
  if (visualDesc) lines.push(`外貌：${visualDesc}`);

  lines.push("专业戏服设计");

  return lines.join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class DramaCharacterImageService {
  private async buildCharacterSheetGenerationContext(
    characterId: string,
  ) {
    const character = await prisma.dramaCharacter.findUnique({
      where: { id: characterId },
      include: { project: { select: { visualStyle: true, sourceRef: true } } },
    });
    if (!character) {
      throw new AppError(`未找到短剧角色：${characterId}`, 404);
    }

    const styleContext = await resolveDramaArtStyleContext({
      visualStyle: character.project?.visualStyle ?? null,
      sourceRef: character.project?.sourceRef ?? null,
    });
    const prompt = buildCharacterSheetPrompt(
      character,
      buildCharacterStylePromptLines(styleContext.universal, styleContext.specific),
    );

    const adapter: ImageTargetAdapter<CharacterSheetData> = {
      kind: `drama.character.sheet:${characterId}`,
      loadState: async () => safeJsonParse<CharacterSheetData>(character.portraitData, { status: "idle" }),
      saveState: async (next) => {
        await prisma.dramaCharacter.update({ where: { id: characterId }, data: { portraitData: JSON.stringify(next) } });
      },
      diskPath: (ext) => path.join(dramaCharacterDir(characterId), `character-sheet.${ext}`),
      publicUrl: () => currentCharacterSheetUrl(characterId),
      cleanupOtherExts: (keepExt) => removeCurrentCharacterSheetVariants(characterId, keepExt),
      versioning: {
        enabled: true,
        maxHistory: 5,
        archiveCurrent: (current) => this.archiveCurrentCharacterSheet(characterId, current),
      },
    };

    return {
      adapter,
      prompt,
      referenceImages: [] as import("../image/runtime").GeneratedReferenceImageMeta[],
      size: IMAGE_SPECS.characterSheet,
      title: `生成短剧角色设计稿：${character.name}`,
    };
  }

  async prepareCharacterSheet(
    characterId: string,
    provider = DEFAULT_PROVIDER,
  ): Promise<import("../image/runtime").ImageGenerationPreview> {
    const ctx = await this.buildCharacterSheetGenerationContext(characterId);
    return {
      kind: ctx.adapter.kind,
      title: ctx.title,
      prompt: ctx.prompt,
      referenceImages: ctx.referenceImages,
      provider,
      size: ctx.size,
    };
  }

  /**
   * 生成角色设计稿（主方法）：
   * 一张横版图 = 左侧面部特写 + 右侧全身正/侧/背四视图。
   * 回填到 portraitData（兼容旧字段，视频生成读这个字段取参考图 URL）。
   */
  async generateCharacterSheet(
    characterId: string,
    provider = DEFAULT_PROVIDER,
    overrides?: import("../image/runtime").ImageGenerationOverrides,
  ): Promise<CharacterSheetData> {
    const ctx = await this.buildCharacterSheetGenerationContext(characterId);
    return runImageGeneration(ctx.adapter, {
      provider: overrides?.providerOverride ?? provider,
      prompt: overrides?.promptOverride ?? ctx.prompt,
      size: overrides?.sizeOverride ?? ctx.size,
      sceneType: "character",
      referenceImages: ctx.referenceImages.length > 0 ? ctx.referenceImages : undefined,
    });
  }

  private async archiveCurrentCharacterSheet(characterId: string, data: CharacterSheetData): Promise<CharacterImageHistoryItem | null> {
    if (data.status !== "done") {
      return null;
    }
    const version = readImageVersion(data);
    if (!version) {
      return null;
    }
    const resolved = await this.resolveExistingImagePath(characterId, "character-sheet");
    const historyItem: CharacterImageHistoryItem = {
      version,
      prompt: data.prompt,
      provider: data.provider,
      generatedAt: data.generatedAt,
    };
    if (!resolved) {
      return historyItem;
    }
    const ext = path.extname(resolved.filePath).replace(".", "").toLowerCase() || "png";
    const archivePath = path.join(dramaCharacterDir(characterId), `character-sheet.v${version}.${ext}`);
    await fs.copyFile(resolved.filePath, archivePath);
    return {
      ...historyItem,
      url: archivedCharacterSheetUrl(characterId, version),
    };
  }

  /**
   * @deprecated 使用 generateCharacterSheet() 替代。
   * 保留以避免旧调用报错，内部转发到 generateCharacterSheet。
   */
  async generatePortrait(
    characterId: string,
    provider = DEFAULT_PROVIDER,
  ): Promise<PortraitData> {
    return this.generateCharacterSheet(characterId, provider);
  }

  /**
   * @deprecated 使用 generateCharacterSheet() 替代。
   * 四视图已合并进角色设计稿，此方法返回空数组作为兼容占位。
   */
  async generateThreeView(
    characterId: string,
    provider = DEFAULT_PROVIDER,
  ): Promise<ThreeViewItem[]> {
    // 四视图现在在设计稿里，直接生成设计稿并返回占位
    await this.generateCharacterSheet(characterId, provider);
    return [];
  }

  async getImageStatus(characterId: string): Promise<{
    portrait: PortraitData;
    threeView: ThreeViewItem[];
  }> {
    const character = await prisma.dramaCharacter.findUnique({
      where: { id: characterId },
      select: { portraitData: true, threeViewData: true },
    });
    if (!character) {
      throw new AppError(`未找到短剧角色：${characterId}`, 404);
    }

    const portrait: PortraitData = character.portraitData
      ? (JSON.parse(character.portraitData) as PortraitData)
      : { status: "idle" };

    const threeView: ThreeViewItem[] = character.threeViewData
      ? (JSON.parse(character.threeViewData) as ThreeViewItem[])
      : [];

    return { portrait, threeView };
  }

  /**
   * 解析角色设计稿本地文件路径（供 HTTP 端点读文件使用）。
   */
  async resolveExistingImagePath(
    characterId: string,
    type: "portrait" | "character-sheet" | `three-view-${"front" | "side" | "back"}`,
  ): Promise<{ filePath: string; mimeType: string } | null> {
    const dir = dramaCharacterDir(characterId);

    // character-sheet 和 portrait 都指向同一文件
    const fileBase = (type === "portrait" || type === "character-sheet")
      ? "character-sheet"
      : type;

    for (const [ext, mime] of IMAGE_EXTS) {
      const fp = path.join(dir, `${fileBase}.${ext}`);
      try {
        await fs.access(fp);
        return { filePath: fp, mimeType: mime };
      } catch {
        // not found, try next
      }
    }
    return null;
  }

  async resolveArchivedImagePath(
    characterId: string,
    type: "character-sheet",
    version: number,
  ): Promise<{ filePath: string; mimeType: string } | null> {
    const dir = dramaCharacterDir(characterId);
    for (const [ext, mimeType] of IMAGE_EXTS) {
      const filePath = path.join(dir, `${type}.v${version}.${ext}`);
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

export const dramaCharacterImageService = new DramaCharacterImageService();
