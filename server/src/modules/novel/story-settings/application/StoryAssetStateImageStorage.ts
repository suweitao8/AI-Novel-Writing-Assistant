import path from "path";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";
import { resolveGeneratedImagesRoot } from "../../../../runtime/appPaths";

export type StoryAssetKind = "character" | "scene" | "prop";

const STATE_IMAGES_DIR = "story-state-images";
const STATE_IMAGE_ROUTE = "state-images";

/**
 * State ids are scoped to an asset, not globally unique. Keep every owner in
 * the storage key so a common id such as `initial` cannot overwrite another
 * asset's image.
 */
function storageSegment(value: string): string {
  return `id-${encodeURIComponent(value.trim() || "_")}`;
}

export function stateImageDir(
  novelId: string,
  kind: StoryAssetKind,
  assetId: string,
  stateId: string,
): string {
  return path.join(
    resolveGeneratedImagesRoot(),
    STATE_IMAGES_DIR,
    storageSegment(novelId),
    kind,
    storageSegment(assetId),
    storageSegment(stateId),
  );
}

export function legacyStateImageDir(stateId: string): string {
  return path.join(resolveGeneratedImagesRoot(), STATE_IMAGES_DIR, stateId);
}

export function stateImageUrl(
  novelId: string,
  kind: StoryAssetKind,
  assetId: string,
  stateId: string,
): string {
  return `/api/novels/${encodeURIComponent(novelId)}/settings/${STATE_IMAGE_ROUTE}/${kind}/${encodeURIComponent(assetId)}/${encodeURIComponent(stateId)}`;
}

/**
 * API projections always expose the owner-scoped URL, including for legacy
 * state records. The resolver can still read an old file when it is safe to
 * do so, while new writes go directly to the scoped directory.
 */
export function scopeStateImageUrls(
  states: StoryAssetState[],
  novelId: string,
  kind: StoryAssetKind,
  assetId: string,
): StoryAssetState[] {
  return states.map((state) => state.image?.url
    ? {
      ...state,
      image: {
        ...state.image,
        url: stateImageUrl(novelId, kind, assetId, state.id),
      },
    }
    : state);
}
