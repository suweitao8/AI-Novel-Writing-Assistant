/**
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
  readonly motionMode: "in-place" | "root-motion";
  readonly inPlace: boolean;
  readonly inPlaceEvidence?: "source-path" | "asset-name" | "unmarked-non-root";
  readonly rootTranslationMaxRangeMeters?: number;
  readonly rootTranslationMaxNetMeters?: number;
  readonly frameRate?: number;
  readonly durationSeconds: number;
  readonly sourceDurationSeconds: number;
  readonly catalogDurationSeconds: number;
}

export const ANIMATION_CATALOG_PACKS = [
  {
    "id": "anim57-unarmed-attack",
    "groupId": "unreal-hand-combat",
    "sourcePack": "Characters/Mannequins/Anims/Unarmed/Attack",
    "label": "徒手攻击测试"
  }
] as const;

export const ANIMATION_CATALOG_ENTRIES = [
  {
    "id": "anim57-unarmed-attack-mm-attack-01",
    "clipName": "C57_anim57_unarmed_attack_mm_attack_01",
    "name": "徒手攻击 01",
    "actionType": "combat",
    "classificationId": "barehand",
    "classificationLabel": "基础徒手",
    "actorKind": "human",
    "actorKindLabel": "人形角色",
    "posture": "standing",
    "postureLabel": "站立",
    "weaponType": "barehand",
    "weaponTypeLabel": "徒手",
    "dedupeKey": "attack-01",
    "isIdleVariant": false,
    "groupId": "unreal-hand-combat",
    "groupLabel": "徒手战斗",
    "packId": "anim57-unarmed-attack",
    "packLabel": "徒手攻击测试",
    "sourcePack": "Characters/Mannequins/Anims/Unarmed/Attack",
    "sourceAssetPath": "/Game/Characters/Mannequins/Anims/Unarmed/Attack/MM_Attack_01",
    "sourceAssetName": "MM_Attack_01",
    "sourceSkeleton": "/Game/Characters/Mannequins/Meshes/SK_Mannequin.SK_Mannequin",
    "motionMode": "root-motion",
    "inPlace": false,
    "rootTranslationMaxRangeMeters": 1.506118,
    "rootTranslationMaxNetMeters": 1.506118,
    "frameRate": 30,
    "durationSeconds": 1,
    "sourceDurationSeconds": 1,
    "catalogDurationSeconds": 1
  },
  {
    "id": "anim57-unarmed-attack-mm-attack-02",
    "clipName": "C57_anim57_unarmed_attack_mm_attack_02",
    "name": "徒手攻击 02",
    "actionType": "combat",
    "classificationId": "barehand",
    "classificationLabel": "基础徒手",
    "actorKind": "human",
    "actorKindLabel": "人形角色",
    "posture": "standing",
    "postureLabel": "站立",
    "weaponType": "barehand",
    "weaponTypeLabel": "徒手",
    "dedupeKey": "attack-02",
    "isIdleVariant": false,
    "groupId": "unreal-hand-combat",
    "groupLabel": "徒手战斗",
    "packId": "anim57-unarmed-attack",
    "packLabel": "徒手攻击测试",
    "sourcePack": "Characters/Mannequins/Anims/Unarmed/Attack",
    "sourceAssetPath": "/Game/Characters/Mannequins/Anims/Unarmed/Attack/MM_Attack_02",
    "sourceAssetName": "MM_Attack_02",
    "sourceSkeleton": "/Game/Characters/Mannequins/Meshes/SK_Mannequin.SK_Mannequin",
    "motionMode": "root-motion",
    "inPlace": false,
    "rootTranslationMaxRangeMeters": 0.9,
    "rootTranslationMaxNetMeters": 0.9,
    "frameRate": 30,
    "durationSeconds": 1,
    "sourceDurationSeconds": 1,
    "catalogDurationSeconds": 1
  },
  {
    "id": "anim57-unarmed-attack-mm-attack-03",
    "clipName": "C57_anim57_unarmed_attack_mm_attack_03",
    "name": "徒手攻击 03",
    "actionType": "combat",
    "classificationId": "barehand",
    "classificationLabel": "基础徒手",
    "actorKind": "human",
    "actorKindLabel": "人形角色",
    "posture": "standing",
    "postureLabel": "站立",
    "weaponType": "barehand",
    "weaponTypeLabel": "徒手",
    "dedupeKey": "attack-03",
    "isIdleVariant": false,
    "groupId": "unreal-hand-combat",
    "groupLabel": "徒手战斗",
    "packId": "anim57-unarmed-attack",
    "packLabel": "徒手攻击测试",
    "sourcePack": "Characters/Mannequins/Anims/Unarmed/Attack",
    "sourceAssetPath": "/Game/Characters/Mannequins/Anims/Unarmed/Attack/MM_Attack_03",
    "sourceAssetName": "MM_Attack_03",
    "sourceSkeleton": "/Game/Characters/Mannequins/Meshes/SK_Mannequin.SK_Mannequin",
    "motionMode": "root-motion",
    "inPlace": false,
    "rootTranslationMaxRangeMeters": 2.16,
    "rootTranslationMaxNetMeters": 2.16,
    "frameRate": 30,
    "durationSeconds": 1.666667,
    "sourceDurationSeconds": 1.666667,
    "catalogDurationSeconds": 1.666667
  },
  {
    "id": "anim57-unarmed-attack-mm-charged-attack",
    "clipName": "C57_anim57_unarmed_attack_mm_charged_attack",
    "name": "蓄力攻击",
    "actionType": "combat",
    "classificationId": "barehand",
    "classificationLabel": "基础徒手",
    "actorKind": "human",
    "actorKindLabel": "人形角色",
    "posture": "standing",
    "postureLabel": "站立",
    "weaponType": "barehand",
    "weaponTypeLabel": "徒手",
    "dedupeKey": "charged-attack",
    "isIdleVariant": false,
    "groupId": "unreal-hand-combat",
    "groupLabel": "徒手战斗",
    "packId": "anim57-unarmed-attack",
    "packLabel": "徒手攻击测试",
    "sourcePack": "Characters/Mannequins/Anims/Unarmed/Attack",
    "sourceAssetPath": "/Game/Characters/Mannequins/Anims/Unarmed/Attack/MM_ChargedAttack",
    "sourceAssetName": "MM_ChargedAttack",
    "sourceSkeleton": "/Game/Characters/Mannequins/Meshes/SK_Mannequin.SK_Mannequin",
    "motionMode": "root-motion",
    "inPlace": false,
    "rootTranslationMaxRangeMeters": 1.5,
    "rootTranslationMaxNetMeters": 1.5,
    "frameRate": 30,
    "durationSeconds": 1.833333,
    "sourceDurationSeconds": 1.833333,
    "catalogDurationSeconds": 1.833333
  }
] as const;
