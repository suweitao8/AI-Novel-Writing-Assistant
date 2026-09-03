import type { CharacterGender } from "./novelCharacter";

export type { CharacterGender } from "./novelCharacter";

/** UE5 mannequin-compatible character profiles used by blocking and animation preview. */
export type CharacterModelProfileId = "manny" | "quinn";

/** Structured silhouette classification. Free-form physique text is intentionally excluded. */
export type CharacterBodyBuild = "slender" | "standard" | "broad" | "unknown";

/** Structured actor kind used when gender does not describe a creature. */
export type CharacterActorKind = "human" | "monster" | "other" | "unknown";

export type CharacterModelProfileOverride = "auto" | CharacterModelProfileId;

export interface CharacterModelProfileInput {
  gender?: CharacterGender | null;
  actorKind?: CharacterActorKind | null;
  bodyBuild?: CharacterBodyBuild | null;
  modelProfileOverride?: CharacterModelProfileOverride | null;
  /** Kept for callers that carry the full character record; never inspected by the resolver. */
  physique?: string | null;
}

/**
 * Resolve the default UE5 mannequin without parsing prose.
 * Explicit overrides win; human gender wins for human actors, while creature
 * silhouettes decide monster/other actors. Unknown values safely use Manny.
 */
export function resolveCharacterModelProfile(
  input: CharacterModelProfileInput = {},
): CharacterModelProfileId {
  if (
    input.modelProfileOverride === "manny" ||
    input.modelProfileOverride === "quinn"
  ) {
    return input.modelProfileOverride;
  }

  const isCreature =
    input.actorKind === "monster" ||
    input.actorKind === "other" ||
    input.gender === "other";
  if (!isCreature) {
    if (input.gender === "female") return "quinn";
    if (input.gender === "male") return "manny";
  }

  if (input.bodyBuild === "slender") return "quinn";
  return "manny";
}
