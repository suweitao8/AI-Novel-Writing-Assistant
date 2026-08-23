/**
 * Compatibility facade for existing novel settings callers. The storage
 * contract is platform infrastructure so bounded contexts such as drama do
 * not need to import the novel domain.
 */
export {
  legacyStateImageDir,
  scopeStateImageUrls,
  stateImageDir,
  stateImageUrl,
} from "../../../../platform/assets/StoryAssetStateImageStorage";
export type { StoryAssetKind } from "../../../../platform/assets/StoryAssetStateImageStorage";
