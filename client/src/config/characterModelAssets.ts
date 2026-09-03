import type { CharacterModelProfileId } from "@ai-novel/shared/types/characterModelProfile";

/** Paired native UE5 mannequin catalogs. Both files contain the same native animation tracks. */
export const CHARACTER_MODEL_ASSET_URLS: Readonly<Record<CharacterModelProfileId, string>> = {
  manny: "/anims/ue5/UE5_Manny_Animations.glb",
  quinn: "/anims/ue5/UE5_Quinn_Animations.glb",
};

export const CHARACTER_MODEL_PROFILE_LABELS: Readonly<Record<CharacterModelProfileId, string>> = {
  manny: "UE5 Manny（男性 / 标准体型）",
  quinn: "UE5 Quinn（女性 / 纤细体型）",
};
