export const STORY_ASSET_KIND_ORDER = {
  character: 0,
  scene: 1,
  prop: 2,
} as const;

type StoryAssetKind = keyof typeof STORY_ASSET_KIND_ORDER;

export function compareStoryAssetKinds(left: string, right: string): number {
  const leftOrder = STORY_ASSET_KIND_ORDER[left as StoryAssetKind] ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = STORY_ASSET_KIND_ORDER[right as StoryAssetKind] ?? Number.MAX_SAFE_INTEGER;
  return leftOrder - rightOrder;
}
