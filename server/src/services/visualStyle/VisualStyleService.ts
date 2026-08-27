import {
  buildVisualStylePromptText,
  findVisualStyleTagForbiddenWords,
  getBuiltinVisualStyle,
  VISUAL_STYLE_PRESETS,
} from "@ai-novel/shared/types/visualStyle";
import type {
  VisualStyleAnalysisDraft,
  VisualStyleAnimationSubtype,
  VisualStyleDetail,
  VisualStyleFamily,
  VisualStyleOrigin,
  VisualStylePreset,
  VisualStyleSummary,
} from "@ai-novel/shared/types/visualStyle";
import { prisma } from "../../db/prisma";
import { getVisionModelProvider } from "../../llm/modelCategories";
import { AppError } from "../../middleware/errorHandler";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { visualStyleAnalyzePrompt } from "../../prompting/prompts/visualStyle/visualStyle.prompts";

const VISUAL_STYLE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const STYLE_FAMILIES: VisualStyleFamily[] = ["live_action", "animation"];
const ANIMATION_SUBTYPES: VisualStyleAnimationSubtype[] = ["2d", "3d", "hybrid"];
const CUSTOM_ORIGINS: VisualStyleOrigin[] = ["manual", "analyzed"];
/** 参考图 base64 上限（约 6MB 图片），防止超大上传拖垮请求体 */
const MAX_ANALYZE_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_ANALYZE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export interface VisualStyleUpsertInput {
  key: string;
  label: string;
  name?: string | null;
  styleInstructions: string;
  avoidInstructions: string;
  styleTag: string;
  styleFamily: VisualStyleFamily;
  animationSubtype?: VisualStyleAnimationSubtype | null;
}

function toSummary(style: VisualStylePreset, id: string | null = null): VisualStyleSummary {
  return {
    id,
    key: style.key,
    label: style.label,
    name: style.name ?? null,
    styleFamily: style.styleFamily,
    animationSubtype: style.animationSubtype ?? null,
    origin: style.origin,
    isPreset: style.origin === "builtin",
  };
}

function rowToPreset(row: {
  key: string;
  label: string;
  name: string | null;
  styleInstructions: string;
  avoidInstructions: string;
  styleTag: string;
  styleFamily: string;
  animationSubtype: string | null;
  origin: string;
}): VisualStylePreset {
  const family: VisualStyleFamily = row.styleFamily === "animation" ? "animation" : "live_action";
  const subtype = row.animationSubtype as VisualStyleAnimationSubtype | null;
  return {
    key: row.key,
    name: row.name ?? row.key,
    label: row.label,
    styleInstructions: row.styleInstructions,
    avoidInstructions: row.avoidInstructions,
    styleTag: row.styleTag,
    styleFamily: family,
    animationSubtype:
      family === "animation" && subtype && ANIMATION_SUBTYPES.includes(subtype) ? subtype : undefined,
    origin: row.origin === "analyzed" ? "analyzed" : "manual",
  };
}

/**
 * 画面风格注册表（单一来源）。
 *
 * 查找顺序与 mydrama StyleService 一致：先查自定义（DB），再回退内置预设（shared 代码内置，只读）。
 * 自定义风格与内置预设同名时，在该实例内覆盖预设。
 */
export class VisualStyleService {
  /** 全量列表：自定义优先，再拼上未被覆盖的内置预设 */
  async listStyles(): Promise<VisualStyleSummary[]> {
    const rows = await prisma.visualStyle.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const overriddenKeys = new Set(rows.map((row) => row.key));
    const summaries = rows.map((row) => toSummary(rowToPreset(row), row.id));
    for (const preset of VISUAL_STYLE_PRESETS) {
      if (!overriddenKeys.has(preset.key)) {
        summaries.push(toSummary(preset));
      }
    }
    return summaries;
  }

  /** 风格详情（含完整提示词字段）；找不到返回 null */
  async getStyleDetail(key: string): Promise<VisualStyleDetail | null> {
    const normalized = key.trim();
    if (!normalized) return null;
    const row = await prisma.visualStyle.findUnique({ where: { key: normalized } });
    if (row) return { ...rowToPreset(row), id: row.id };
    const builtin = getBuiltinVisualStyle(normalized);
    return builtin ? { ...builtin, id: null } : null;
  }

  /** 解析风格：自定义覆盖内置；找不到返回 null（调用方决定是否报错） */
  async resolveStyle(key: string | null | undefined): Promise<VisualStylePreset | null> {
    const normalized = key?.trim();
    if (!normalized) return null;
    const row = await prisma.visualStyle.findUnique({ where: { key: normalized } });
    if (row) return rowToPreset(row);
    return getBuiltinVisualStyle(normalized);
  }

  /** 解析风格并渲染为统一 prompt 片段；找不到返回 null */
  async resolveStylePromptText(key: string | null | undefined): Promise<string | null> {
    const style = await this.resolveStyle(key);
    return style ? buildVisualStylePromptText(style) : null;
  }

  async getCustomStyleById(id: string): Promise<VisualStylePreset | null> {
    const row = await prisma.visualStyle.findUnique({ where: { id } });
    return row ? rowToPreset(row) : null;
  }

  async createCustomStyle(input: VisualStyleUpsertInput, origin: VisualStyleOrigin = "manual"): Promise<VisualStyleSummary> {
    const normalized = this.normalizeUpsertInput(input);
    const existing = await prisma.visualStyle.findUnique({ where: { key: normalized.key } });
    if (existing) {
      throw new AppError(`风格标识 ${normalized.key} 已存在。`, 409);
    }
    const row = await prisma.visualStyle.create({
      data: {
        ...normalized,
        origin: CUSTOM_ORIGINS.includes(origin) ? origin : "manual",
      },
    });
    return toSummary(rowToPreset(row), row.id);
  }

  async updateCustomStyle(id: string, input: Partial<VisualStyleUpsertInput>): Promise<VisualStyleSummary> {
    const existing = await prisma.visualStyle.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Visual style not found.", 404);
    }
    const normalized = this.normalizeUpsertInput({ ...rowToPreset(existing), ...input }, { partial: true });
    if (normalized.key && normalized.key !== existing.key) {
      const keyTaken = await prisma.visualStyle.findUnique({ where: { key: normalized.key } });
      if (keyTaken) {
        throw new AppError(`风格标识 ${normalized.key} 已存在。`, 409);
      }
    }
    const row = await prisma.visualStyle.update({
      where: { id },
      data: normalized,
    });
    return toSummary(rowToPreset(row), row.id);
  }

  async deleteCustomStyle(id: string): Promise<void> {
    const existing = await prisma.visualStyle.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Visual style not found.", 404);
    }
    await prisma.visualStyle.delete({ where: { id } });
  }

  /** 参考图风格分析：返回草稿（不落库），由用户确认后走 createCustomStyle(origin="analyzed") */
  async analyzeReferenceImage(input: {
    imageBase64: string;
    mimeType: string;
    userHint?: string;
  }): Promise<VisualStyleAnalysisDraft> {
    const mimeType = input.mimeType?.trim().toLowerCase() ?? "";
    if (!ALLOWED_ANALYZE_MIME_TYPES.has(mimeType)) {
      throw new AppError("参考图仅支持 PNG / JPEG / WebP / GIF。", 400);
    }
    const approxBytes = Math.floor((input.imageBase64.length * 3) / 4);
    if (approxBytes > MAX_ANALYZE_IMAGE_BYTES) {
      throw new AppError("参考图过大，请压缩到 8MB 以内。", 400);
    }
    const result = await runStructuredPrompt({
      asset: visualStyleAnalyzePrompt,
      promptInput: {
        imageBase64: input.imageBase64,
        mimeType,
        userHint: input.userHint,
      },
      // 送图理解固定走视觉槽（Codex 订阅）。
      options: { provider: getVisionModelProvider() },
    });
    return result.output;
  }

  private normalizeUpsertInput(
    input: Partial<VisualStyleUpsertInput>,
    options: { partial?: boolean } = {},
  ): VisualStyleUpsertInput {
    const normalized: VisualStyleUpsertInput = {
      key: input.key?.trim() ?? "",
      label: input.label?.trim() ?? "",
      name: input.name?.trim() || null,
      styleInstructions: input.styleInstructions?.trim() ?? "",
      avoidInstructions: input.avoidInstructions?.trim() ?? "",
      styleTag: input.styleTag?.trim() ?? "",
      styleFamily: input.styleFamily ?? "live_action",
      animationSubtype: input.animationSubtype ?? null,
    };

    if (!options.partial) {
      if (!VISUAL_STYLE_KEY_PATTERN.test(normalized.key)) {
        throw new AppError("风格标识只能包含小写字母、数字、中划线或下划线（2-40 位）。", 400);
      }
      if (!normalized.label || normalized.label.length > 40) {
        throw new AppError("风格名称不能为空且不超过 40 个字。", 400);
      }
      if (normalized.styleInstructions.length < 20 || normalized.styleInstructions.length > 4000) {
        throw new AppError("正向渲染说明需要 20-4000 个字符。", 400);
      }
      if (normalized.avoidInstructions.length < 10 || normalized.avoidInstructions.length > 2000) {
        throw new AppError("负向守护说明需要 10-2000 个字符。", 400);
      }
      if (!normalized.styleTag || normalized.styleTag.length > 80) {
        throw new AppError("风格锚点不能为空且不超过 80 个字符。", 400);
      }
      const forbidden = findVisualStyleTagForbiddenWords(normalized.styleTag);
      if (forbidden.length > 0) {
        throw new AppError(
          `风格锚点不允许年代/内容词（命中：${forbidden.join("、")}）；锚点只描述画面媒介与质感。`,
          400,
        );
      }
    }

    if (normalized.styleFamily && !STYLE_FAMILIES.includes(normalized.styleFamily)) {
      throw new AppError("风格媒介只能是 live_action 或 animation。", 400);
    }
    if (
      normalized.animationSubtype
      && !(normalized.styleFamily === "animation" && ANIMATION_SUBTYPES.includes(normalized.animationSubtype))
    ) {
      throw new AppError("动画子类型只能是 2d / 3d / hybrid，且仅动画媒介可设置。", 400);
    }
    if (normalized.styleFamily === "live_action") {
      normalized.animationSubtype = null;
    }
    return normalized;
  }
}

export const visualStyleService = new VisualStyleService();
