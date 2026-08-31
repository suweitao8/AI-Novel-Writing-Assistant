const fs = require("node:fs");
const path = require("node:path");

const selectionPath = path.resolve(
  process.argv[2] ?? path.join(__dirname, "animationCatalogSelection.json"),
);
const outputPath = path.resolve(
  process.argv[3] ?? path.join(__dirname, "../../client/src/config/animationCatalogEntries.ts"),
);

const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));
const packs = selection.packs.map(({ id, groupId, sourcePack, label }) => ({
  id,
  groupId,
  sourcePack,
  label,
}));
const entries = selection.clips.map(
  ({
    id,
    clipName,
    name,
    actionType,
    classificationId,
    classificationLabel,
    actorKind,
    actorKindLabel,
    posture,
    postureLabel,
    weaponType,
    weaponTypeLabel,
    dedupeKey,
    isIdleVariant,
    groupId,
    groupLabel,
    packId,
    packLabel,
    sourcePack,
    sourceAssetPath,
    sourceAssetName,
    sourceSkeleton,
    rootMotion,
    rootMotionEvidence,
    durationSeconds: clipDurationSeconds,
    sourceDurationSeconds,
    catalogDurationSeconds,
  }) => ({
    id,
    clipName,
    name,
    actionType,
    classificationId,
    classificationLabel,
    actorKind,
    actorKindLabel,
    posture,
    postureLabel,
    weaponType,
    weaponTypeLabel,
    dedupeKey,
    isIdleVariant,
    groupId,
    groupLabel,
    packId,
    packLabel,
    sourcePack,
    sourceAssetPath,
    sourceAssetName,
    sourceSkeleton,
    rootMotion,
    rootMotionEvidence,
    durationSeconds: catalogDurationSeconds ?? clipDurationSeconds,
    sourceDurationSeconds,
    catalogDurationSeconds: catalogDurationSeconds ?? clipDurationSeconds,
  }),
);

const output = `/**
 * 由 scripts/animation/generate_animation_catalog_entries.cjs 从 UE 资产策选清单生成。
 * 请先更新 animationCatalogSelection.json，再重新生成此文件。
 */

export interface AnimationCatalogPackEntry {
  readonly id: string;
  readonly groupId: string;
  readonly sourcePack: string;
  readonly label: string;
}

export interface AnimationCatalogEntry {
  readonly id: string;
  readonly clipName: string;
  readonly name: string;
  readonly actionType: string;
  readonly classificationId: string;
  readonly classificationLabel: string;
  readonly actorKind: string;
  readonly actorKindLabel: string;
  readonly posture: string;
  readonly postureLabel: string;
  readonly weaponType: string;
  readonly weaponTypeLabel: string;
  readonly dedupeKey: string;
  readonly isIdleVariant: boolean;
  readonly groupId: string;
  readonly groupLabel: string;
  readonly packId: string;
  readonly packLabel: string;
  readonly sourcePack: string;
  readonly sourceAssetPath: string;
  readonly sourceAssetName: string;
  readonly sourceSkeleton: string;
  readonly rootMotion: boolean;
  readonly rootMotionEvidence: "source-path" | "asset-name";
  readonly durationSeconds: number;
  readonly sourceDurationSeconds: number;
  readonly catalogDurationSeconds: number;
}

export const ANIMATION_CATALOG_PACKS = ${JSON.stringify(packs, null, 2)} as const;

export const ANIMATION_CATALOG_ENTRIES = ${JSON.stringify(entries, null, 2)} as const;
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output, "utf8");
console.log(`generated ${entries.length} entries across ${packs.length} packs -> ${outputPath}`);
