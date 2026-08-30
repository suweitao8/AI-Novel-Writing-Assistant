/**
 * 通用环境资产的「生效环境源」解析。
 *
 * 通用资产页为每套 HDRI 环境维护可生成的状态（提示词 → 2:1 全景图），
 * 生效状态（默认状态优先）的全景生成后即成为该应用方向使用的 HDR 环境；
 * 未生成或解析失败时回落静态 .hdr 预设（studioEnvironmentPresets）。
 *
 * 解析结果短缓存：缩略图工厂会批量触发加载，不能每次都打设置接口。
 */
import { resolveEffectiveStudioEnvironmentState, type StudioEnvironmentAssetDocument, type StudioEnvironmentId } from "@ai-novel/shared/types/studioEnvironmentAssets";

import { buildStateImageSrc } from "@/components/storyAssets/storyAssetPresentation";
import { getStudioEnvironmentAssets } from "@/api/settings";

const SOURCE_CACHE_TTL_MS = 30_000;

let cache: { document: StudioEnvironmentAssetDocument | null; fetchedAt: number } | null = null;
let inFlight: Promise<StudioEnvironmentAssetDocument | null> | null = null;

async function requestDocument(): Promise<StudioEnvironmentAssetDocument | null> {
  try {
    const response = await getStudioEnvironmentAssets();
    return response.data ?? null;
  } catch {
    // 设置接口不可用时不阻断任何预览：全部回落静态 HDR 预设。
    return null;
  }
}

export async function fetchStudioEnvironmentAssetDocument(force = false): Promise<StudioEnvironmentAssetDocument | null> {
  if (!force && cache && Date.now() - cache.fetchedAt < SOURCE_CACHE_TTL_MS) {
    return cache.document;
  }
  if (!inFlight) {
    inFlight = requestDocument()
      .then((document) => {
        cache = { document, fetchedAt: Date.now() };
        return document;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** 环境资产文档就绪时返回该环境生效状态（默认状态优先）的全景 URL（带破缓存参数），否则 null。 */
export function resolveStudioEnvironmentSourceUrl(
  presetId: StudioEnvironmentId,
  document: StudioEnvironmentAssetDocument | null,
): string | null {
  const asset = document?.environments?.[presetId];
  if (!asset) return null;
  const state = resolveEffectiveStudioEnvironmentState(asset);
  if (!state || state.image?.status !== "done" || !state.image.url) return null;
  return buildStateImageSrc(state.image.url, state.image.generatedAt);
}

export async function getStudioEnvironmentSourceUrl(presetId: StudioEnvironmentId): Promise<string | null> {
  const document = await fetchStudioEnvironmentAssetDocument();
  return resolveStudioEnvironmentSourceUrl(presetId, document);
}
