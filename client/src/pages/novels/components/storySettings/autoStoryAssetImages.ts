export type AutoStoryAssetKind = "character" | "scene" | "prop";

export type AutoStoryAssetImageStatus = "idle" | "generating" | "done" | "error";

export interface AutoStoryAssetState {
  id: string;
  label: string;
  image?: {
    status?: AutoStoryAssetImageStatus | string;
    url?: string | null;
  } | null;
}

export interface AutoStoryAsset {
  id: string;
  states: AutoStoryAssetState[];
}

export interface StoryAssetImageTask {
  key: string;
  kind: AutoStoryAssetKind;
  assetId: string;
  stateId: string;
}

export const AUTO_STORY_ASSET_IMAGE_CONCURRENCY = 3;

export function storyAssetImageTaskKey(
  kind: AutoStoryAssetKind,
  assetId: string,
  stateId: string,
): string {
  return `${kind}:${assetId}:${stateId}`;
}

export function getDefaultStoryAssetState(asset: AutoStoryAsset): AutoStoryAssetState | undefined {
  return asset.states.find((state) => state.label.trim() === "默认") ?? asset.states[0];
}

function hasImage(state: AutoStoryAssetState): boolean {
  return Boolean(state.image?.url?.trim());
}

export function getMissingStoryAssetImageTasks(
  kind: AutoStoryAssetKind,
  assets: AutoStoryAsset[],
  attemptedKeys: ReadonlySet<string> = new Set(),
): StoryAssetImageTask[] {
  return assets.flatMap((asset) => {
    const state = getDefaultStoryAssetState(asset);
    if (!state || hasImage(state) || state.image?.status === "generating") {
      return [];
    }

    const key = storyAssetImageTaskKey(kind, asset.id, state.id);
    if (attemptedKeys.has(key)) {
      return [];
    }

    return [{ key, kind, assetId: asset.id, stateId: state.id }];
  });
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (concurrency < 1) {
    throw new RangeError("concurrency must be at least 1");
  }

  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await worker(item);
      }
    }),
  );
}
