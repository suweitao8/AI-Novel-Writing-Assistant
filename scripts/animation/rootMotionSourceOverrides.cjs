const { getRootMotionNameCandidates } = require("./rootMotionPolicy.cjs");

/**
 * Curated semantic counterparts for packs whose root-motion asset uses a
 * different name. The scan remains the authority: an override is only a name
 * candidate and still has to pass the source root-motion policy.
 */
const ROOT_MOTION_NAME_OVERRIDES = Object.freeze({
  "unreal-daily-parkour:walk-in-place": "A_Walk_RM",
  "unreal-daily-parkour:run-in-place": "A_Run_RM",
  "unreal-daily-dialogue:dialogue-idle": "RM_Dialogue_moving_serious",
  "unreal-daily-dialogue:serious-idle": "RM_Dialogue_moving_serious",
  "unreal-daily-dialogue:serious-talk": "RM_Dialogue_Serious_talk_low_02",
  "unreal-daily-dialogue:laugh-gesture": "RM_Dialogue_laugh_gesture_02",
  "unreal-daily-dialogue:sad-idle": "RM_Dialogue_moving_sad",
  "unreal-daily-dialogue:sad-talk": "RM_Dialogue_Sad_gesture_02",
  "unreal-daily-dialogue:listening": "RM_Dialogue_moving_serious",
  "unreal-daily-dialogue:walk-in-place": "RM_Dialogue_moving_serious",
  "unreal-interaction-activations:door-pull": "RM_activation_open_door_pull",
  "unreal-interaction-activations:door-push": "RM_activation_open_door_push",
  "unreal-interaction-activations:double-door": "RM_activation_open_double_door_pull",
  "unreal-interaction-activations:valve-horizontal": "RM_Loop_Activiation_Pull_Side",
  "unreal-interaction-activations:rope-pull": "RM_activation_rope_pull_full",
  "unreal-misc-clazy:jog-forward": "Mvm_Jog_Fwd_Root",
  "unreal-misc-clazy:jog-backward": "Mvm_Jog_Bwd_Root",
  "unreal-misc-clazy:jog-start": "Mvm_JogStart_Fwd_Root",
  "unreal-misc-clazy:jog-stop": "Mvm_JogStop_Fwd_Root",
  "unreal-misc-clazy:walk-forward": "Mvm_Walk_Fwd_Root",
  "unreal-misc-clazy:walk-backward": "Mvm_Walk_Bwd_Root",
  "unreal-misc-irap:injured-front-idle": "Front_Injured_Idle_RM",
  "unreal-misc-irap:injured-back-idle": "Back_Injured_Idle_RM",
  "unreal-misc-irap:revive": "Back_Revive_RM",
  "unreal-misc-preacher:pray-ground": "ANIM_RM_pray_ground_end",
  "unreal-misc-preacher:pray-standing": "ANIM_RM_preach_mid",
  "unreal-misc-preacher:complain": "ANIM_RM_preach_high",
  "unreal-hand-combat-special-moves:move-000": "SpecialMove_000_00_All_RM",
  "unreal-hand-combat-special-moves:move-001": "SpecialMove_001_00_All_RM",
  "unreal-hand-combat-special-moves:move-002": "SpecialMove_002_00_All_RM",
  "unreal-hand-combat-special-moves:move-005": "SpecialMove_005_00_All_RM",
  "unreal-hand-combat-special-moves:move-006": "SpecialMove_006_00_All_RM",
  "unreal-hand-combat-monsters:run": "Anim_Monster_Run_Root",
  "unreal-hand-combat-creature-sit:sit-run": "Anim_Creature_Sit_Run_02_Root",
  "unreal-hand-combat-creatures:idle-block": "Anim_RM_block_heavy_hit",
  "unreal-hand-combat-creatures:hit": "Anim_RM_hit_back",
  "unreal-weapon-combat-sword-pro:weak-attack": "Weak_01_In_Anim",
  "unreal-weapon-combat-sword-pro:jump": "Jump_F_In_Anim",
  "unreal-weapon-combat-sword-pro:hit": "Hit_01_F_Anim",
  "unreal-weapon-combat-heavy-hammer:air-attack": "Anim_air_Attack01_end",
  "unreal-weapon-combat-stealth-knife:stealth-walk": "H2H_Stealth_WalkForward_rm",
});

// These source-marked assets were converted during the 2026-08-31 export
// audit and produced no root translation channel. Keep them out of future
// rebuilds until their UE export settings or source assets are corrected.
const ROOT_MOTION_TRACK_EXCLUSIONS = new Set([
  "unreal-daily-male-locomotion:crouch-idle",
  "unreal-hand-combat-lucy:air-attack",
  "unreal-hand-combat-lucy:air-kick",
  "unreal-hand-combat-lucy:fight-to-idle",
  "unreal-misc-climbing:climbing-idle",
  "unreal-misc-irap:injured-back-idle",
  "unreal-misc-pedestrian-convo:listening",
  "unreal-misc-pedestrian-convo:low-key",
  "unreal-misc-pedestrian-convo:up-beat",
  "unreal-misc-preacher:pray-start",
  "unreal-weapon-combat-ghost-samurai:attack",
  "unreal-weapon-combat-ghost-samurai:cancel",
  "unreal-weapon-combat-ghost-samurai:idle",
  "unreal-weapon-combat-ghost-samurai:jump",
  "unreal-weapon-combat-pistol:idle",
  "unreal-weapon-combat-spear:attack-place",
  "unreal-weapon-combat-spear:idle",
]);

function getRootMotionAssetNameCandidates(pack, item) {
  const override = ROOT_MOTION_NAME_OVERRIDES[`${pack.id}:${item.key}`];
  return override ? [override] : getRootMotionNameCandidates(item.sourceAssetName);
}

module.exports = {
  ROOT_MOTION_NAME_OVERRIDES,
  ROOT_MOTION_TRACK_EXCLUSIONS,
  getRootMotionAssetNameCandidates,
};
