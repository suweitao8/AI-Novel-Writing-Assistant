const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");
const { getRootMotionEvidence, isRootMotionSource } = require("./rootMotionPolicy.cjs");
const {
  getRootMotionAssetNameCandidates,
  ROOT_MOTION_TRACK_EXCLUSIONS,
} = require("./rootMotionSourceOverrides.cjs");

const scanPath = process.argv[2] ?? "D:/UnrealWorkspace/Cine57-exported/animation_catalog_scan.json";
const outputPath = process.argv[3] ?? path.resolve("scripts/animation/animationCatalogSelection.json");

const groups = {
  "unreal-daily": { sourceGroupId: "daily", label: "日常动作" },
  "unreal-interaction": { sourceGroupId: "daily-interact", label: "日常互动" },
  "unreal-misc": { sourceGroupId: "daily-misc", label: "生活与表演" },
  "unreal-hand-combat": { sourceGroupId: "battle-hand", label: "徒手战斗" },
  "unreal-weapon-combat": { sourceGroupId: "battle-weapon", label: "武器战斗" },
};

const clip = (key, sourceAssetName, name, actionType, dedupeKey = key) => ({
  key,
  sourceAssetName,
  name,
  actionType,
  dedupeKey,
});

/**
 * 这是策展清单，不是把 UE 的两万条资源倾倒进网页。每个动作都明确写出
 * 套装、语义和去重键；Idle 保留变体，其余语义动作每套只保留代表片段。
 */
const packs = [
  {
    id: "unreal-daily-male-locomotion",
    groupId: "unreal-daily",
    sourcePack: "MaleLocomotionSet",
    label: "男性移动套装",
    clips: [
      clip("idle-break-01", "A_INP_Idle_Break_01", "站立待机 · 变体 1", "idle", "idle:break-01"),
      clip("idle-break-02", "A_INP_Idle_Break_02", "站立待机 · 变体 2", "idle", "idle:break-02"),
      clip("crouch-idle", "A_INP_Crouch_Idle", "蹲伏待机", "idle", "idle:crouch"),
      clip("walk-backward", "A_INP_WalkBwd_Loop", "后退行走", "move"),
      clip("jog-forward", "A_INP_JogFwd_Loop", "向前慢跑", "move"),
      clip("run-forward", "A_INP_RunFwd_Loop", "向前奔跑", "move"),
      clip("crouch-forward", "A_INP_CrouchFwd_Loop", "蹲伏前进", "move"),
      clip("jump-forward", "A_INP_JumpFwd_Land", "向前跳跃落地", "move"),
      clip("falling", "A_INP_Falling_Loop", "空中下落", "move"),
    ],
  },
  {
    id: "unreal-daily-sitting",
    groupId: "unreal-daily",
    sourcePack: "SittingAnimations",
    label: "坐姿生活套装",
    clips: [
      clip("chair-loop-02", "A_chair_loop02", "椅上待机 · 变体 2", "idle", "idle:chair-02"),
      clip("chair-clap", "A_chair_clap_01", "坐姿鼓掌", "sit"),
      clip("chair-thumbs-up", "A_chair_thumbsUp_01", "坐姿点赞", "sit"),
      clip("chair-thumbs-down", "A_chair_thumbsDown_01", "坐姿否定", "sit"),
      clip("chair-bonus", "A_bonus_loop_01", "坐姿生活动作", "sit"),
    ],
  },
  {
    id: "unreal-daily-parkour",
    groupId: "unreal-daily",
    sourcePack: "ParkourAnimations",
    label: "跑酷翻越套装",
    clips: [
      clip("parkour-idle", "A_Idle", "跑酷待机", "idle", "idle:parkour"),
      clip("walk-in-place", "A_Walk_IP", "向前行走", "move"),
      clip("run-in-place", "A_Run_IP", "向前奔跑", "move"),
      clip("jump-up-start", "A_JumpUp_Start", "向上跳跃起步", "parkour"),
      clip("jump-up-finish", "A_JumpUp_Finish", "向上跳跃落地", "parkour"),
      clip("ledge-climb", "A_Ledge_ClimbUp_Monkey", "猴式翻越高台", "parkour"),
      clip("dive-roll", "A_DiveRoll_L_Vault", "俯冲翻滚", "parkour"),
      clip("balance-idle", "A_Balance_Idle", "平衡待机", "idle", "idle:balance"),
    ],
  },
  {
    id: "unreal-daily-mc-idles",
    groupId: "unreal-daily",
    sourcePack: "MC_Idles_Pack",
    label: "多样待机套装",
    clips: [
      clip("arms-crossed", "am_ArmsCrossed_Idle_01", "抱臂待机", "idle", "idle:arms-crossed"),
      clip("arms-crossed-look", "am_ArmsCrossed_Idle_05_LookAround", "抱臂环顾", "idle", "idle:arms-crossed-look"),
      clip("heavy-breathe", "am_Stand_Idle_Breathe_01_Heavy", "站立喘息", "idle", "idle:breathe"),
      clip("cold", "am_Stand_Idle_Cold_Loop_01", "寒冷发抖", "idle", "idle:cold"),
      clip("scratch-head", "am_Stand_Idle_Fidget_01_ScratchHead", "挠头待机", "idle", "idle:scratch-head"),
      clip("greet-wave", "am_Stand_Idle_Greet_01_Wave", "挥手问候", "daily"),
      clip("tired", "am_Stand_Idle_Tired_01", "疲惫待机", "idle", "idle:tired"),
      clip("check-watch", "am_Stand_Idle_Waiting_01_CheckWatch", "看表等待", "idle", "idle:waiting"),
      clip("wall-lean", "am_WallLean_Idle_Loop_01", "靠墙待机", "idle", "idle:wall-lean"),
    ],
  },
  {
    id: "unreal-daily-roll-dodge",
    groupId: "unreal-daily",
    sourcePack: "RollDodgeDashSet",
    label: "翻滚闪避套装",
    clips: [
      clip("dash-forward", "A_INP_Dash_IdleFwd", "向前冲刺", "move"),
      clip("dodge-left", "A_INP_Dodge_01_IdleFwd_toLeft", "向左闪避", "reaction"),
      clip("jump-dodge", "A_INP_JumpDodge_IdleFwd", "跳跃闪避", "reaction"),
      clip("roll-forward", "A_INP_Roll_IdleFwd", "向前翻滚", "reaction"),
      clip("dodge-back", "A_INP_Dodge_01_IdleBwd_toRight", "后撤闪避", "reaction"),
    ],
  },
  {
    id: "unreal-daily-dialogue",
    groupId: "unreal-daily",
    sourcePack: "Dialogue_mocap",
    label: "对话表演套装",
    clips: [
      clip("dialogue-idle", "MM_Idle", "对话待机", "idle", "idle:dialogue"),
      clip("serious-idle", "IP_Dialogue_Serious_idle_01", "严肃待机", "idle", "idle:serious"),
      clip("serious-talk", "IP_Dialogue_Serious_talk_low_01", "严肃低声说话", "daily"),
      clip("laugh-gesture", "IP_Dialogue_laugh_gesture_01", "笑声手势", "daily"),
      clip("sad-idle", "IP_Dialogue_Sad_idle_01", "悲伤待机", "idle", "idle:sad"),
      clip("sad-talk", "IP_Dialogue_Sad_talk_01", "悲伤说话", "daily"),
      clip("listening", "IP_Dialogue_listening_idle_01", "倾听待机", "idle", "idle:listening"),
      clip("walk-in-place", "MM_Walk_InPlace", "对话移动", "move"),
    ],
  },
  {
    id: "unreal-daily-sleep",
    groupId: "unreal-daily",
    sourcePack: "SleepAnimPack",
    label: "睡眠套装",
    clips: [
      clip("bed-sleep", "Sleep_Bed_LeftSide_SleepLoop", "侧卧睡眠", "sleep"),
      clip("bed-restless", "Sleep_Bed_LeftSide_RestlessLoop", "侧卧翻身", "sleep"),
      clip("bed-enter", "Sleep_Bed_LeftSide_Enter", "上床躺下", "sleep"),
      clip("bed-exit", "Sleep_Bed_LeftSide_Exit", "起床离开", "sleep"),
      clip("sofa-sleep", "Sleep_Sofa_SleepLoop", "沙发睡眠", "sleep"),
      clip("sit-bed-loop", "Sit_Bed_LeftSide_Sit_Loop", "床边坐姿", "sit"),
      clip("sit-to-sleep", "Sit_Bed_LeftSide_Sit_to_Sleep", "坐姿进入睡眠", "sleep"),
    ],
  },
  {
    id: "unreal-daily-female-interact",
    groupId: "unreal-daily",
    sourcePack: "FemInteractAnimSet",
    label: "女性互动套装",
    clips: [
      clip("idle-a", "Anim_Fem_IdleA", "女性待机 A", "idle", "idle:a"),
      clip("idle-b", "Anim_Fem_IdleB", "女性待机 B", "idle", "idle:b"),
      clip("dialogue", "Anim_Fem_DialogueA", "女性对话", "daily"),
      clip("gesture", "Anim_Fem_GestureA", "女性手势", "daily"),
      clip("door", "Anim_Fem_DoorA", "女性开门", "interaction"),
      clip("react", "Anim_Fem_ReactA", "女性反应", "reaction"),
    ],
  },
  {
    id: "unreal-interaction-vendors",
    groupId: "unreal-interaction",
    sourcePack: "Vendors_And_Customers",
    label: "商贩与顾客套装",
    clips: [
      clip("cashier-idle", "AnimationSequence_Cashier_Idle_Standing", "柜台站立待机", "idle", "idle:cashier"),
      clip("cashier-wave", "AnimationSequence_Cashier_Greeting_WaveHello", "柜台挥手问候", "interaction"),
      clip("cashier-handout", "AnimationSequence_Cashier_Handout_Loop", "柜台递交物品", "interaction"),
      clip("cashier-yes", "AnimationSequence_Cashier_Talk_HeadNod_Yes", "点头回应", "daily"),
      clip("bartender-idle", "AnimationSequence_Bartender_Idle_Standing_HandsOnTable_ElbowLean_Loop", "酒保靠台待机", "idle", "idle:bartender"),
      clip("wipe-counter", "AnimationSequence_Bartender_Idle_Standing_HandsOnTable_WipeCounter_Loop", "擦拭柜台", "interaction"),
      clip("serve-drink", "AnimationSequence_Bartender_Idle_Standing_Serve_PintGlass", "递上饮品", "interaction"),
    ],
  },
  {
    id: "unreal-interaction-item-pickup",
    groupId: "unreal-interaction",
    sourcePack: "ItemPickupSet",
    label: "拾取物品套装",
    clips: [
      clip("pickup-standing-left", "A_ItemPickup_fromIdle_LH_0cm", "站立左手拾取", "interaction"),
      clip("pickup-standing-right", "A_ItemPickup_fromIdle_RH_0cm", "站立右手拾取", "interaction"),
      clip("pickup-crouch-left", "A_ItemPickup_fromIdleCrouch_LH_0cm", "蹲伏左手拾取", "interaction"),
      clip("pickup-throw", "A_ItemPickup_fromIdle_Throw_01", "拾取后投掷", "interaction"),
    ],
  },
  {
    id: "unreal-interaction-npcs",
    groupId: "unreal-interaction",
    sourcePack: "NPCsBundle",
    label: "NPC 生活动作套装",
    clips: [
      clip("npc-idle", "A_Idle", "NPC 站立待机", "idle", "idle:npc"),
      clip("npc-idle-one-hand", "A_Idle1H", "单手持物待机", "idle", "idle:one-hand"),
      clip("npc-eat", "A_Sitting_EatingSandwich", "坐姿进食", "sit"),
      clip("npc-sit-idle", "A_Sitting_Idle01", "坐姿待机", "sit"),
      clip("npc-equip", "A_Equip1H", "单手装备", "interaction"),
      clip("npc-unequip", "A_Unequip1H", "单手收起", "interaction"),
      clip("npc-mining", "A_PickaxeMining", "镐头采集", "daily"),
      clip("npc-cast", "A_Cast1Var1", "NPC 施法", "magic"),
    ],
  },
  {
    id: "unreal-interaction-activations",
    groupId: "unreal-interaction",
    sourcePack: "Activations_mocap",
    label: "门阀与机关互动套装",
    clips: [
      clip("door-pull", "IP_activation_open_door_pull", "拉门", "interaction"),
      clip("door-push", "IP_activation_open_door_push", "推门", "interaction"),
      clip("double-door", "IP_activation_open_double_door_pull", "拉开双扇门", "interaction"),
      clip("valve-horizontal", "IP_activation_valve_horizontal_loop", "转动水平阀门", "interaction"),
      clip("rope-pull", "IP_activation_rope_pull_loop", "拉绳机关", "interaction"),
    ],
  },
  {
    id: "unreal-interaction-survival",
    groupId: "unreal-interaction",
    sourcePack: "Survival_Anims",
    label: "生存制作套装",
    clips: [
      clip("craft-idle", "AnimationSequence_Survival_Build_Crafting_GenericMovements_Idle", "制作待机", "idle", "idle:craft"),
      clip("craft-loop", "AnimationSequence_Survival_Build_Crafting_GenericMovements_Loop", "制作动作", "daily"),
      clip("hammering", "AnimationSequence_Survival_Build_Crafting_Hammering_Loop", "制作台锤击", "daily"),
      clip("mortar", "AnimationSequence_Survival_Build_Crafting_MortarAndPestle_Loop", "研磨制作", "daily"),
      clip("campfire", "AnimationSequence_Survival_CampFire_SitCrossLegs_Loop", "篝火边坐姿", "sit"),
      clip("warm-hands", "AnimationSequence_Survival_CampFire_SitCrossLegs_WarmHands_Loop", "篝火边取暖", "daily"),
      clip("eat-campfire", "AnimationSequence_Survival_CampFire_SitCrossLegs_EatMeat", "篝火边进食", "daily"),
      clip("drink-campfire", "AnimationSequence_Survival_CampFire_SitCrossLegs_DrinkBottle", "篝火边饮水", "daily"),
    ],
  },
  {
    id: "unreal-interaction-drinking",
    groupId: "unreal-interaction",
    sourcePack: "DrinkingAnimations",
    label: "饮酒互动套装",
    clips: [
      clip("drink-idle-01", "DrinkingIdle01", "饮酒待机 1", "idle", "idle:drink-01"),
      clip("drink-idle-02", "DrinkingIdle02", "饮酒待机 2", "idle", "idle:drink-02"),
      clip("drink-intro", "DrinkingIntroQuick", "拿杯开始饮酒", "interaction"),
      clip("drink-pour", "DrinkingPourR", "倒入饮品", "interaction"),
      clip("drink-expression", "DrinkingExpres1", "饮酒反应", "reaction"),
      clip("drink-sit", "DrinkingSitIdle01", "坐姿饮酒待机", "sit"),
    ],
  },
  {
    id: "unreal-interaction-car",
    groupId: "unreal-interaction",
    sourcePack: "CarInteractAnimations_VOL1",
    label: "车辆互动套装",
    clips: [
      clip("driver-idle", "CIA_Car_Idle_Driver", "驾驶位待机", "idle", "idle:driver"),
      clip("passenger-idle", "CIA_Car_Idle_Passenger", "乘客位待机", "idle", "idle:passenger"),
      clip("look-back", "CIA_Car_Look_Back_Idle", "车内回头观察", "interaction"),
      clip("try-open-left", "CIA_Car_Try_Open_Left", "尝试打开左侧车门", "interaction"),
      clip("change-gear", "CIA_Car_Change_Gear", "换挡", "interaction"),
    ],
  },
  {
    id: "unreal-interaction-phoenyx",
    groupId: "unreal-interaction",
    sourcePack: "PhoenyxAnimPack3",
    label: "桌面与游泳互动套装",
    clips: [
      clip("swim-idle", "animSwimIdle", "游泳待机", "idle", "idle:swim"),
      clip("keyboard-sit", "animUseKeyboardSit1", "坐姿使用键盘", "sit"),
      clip("monitor-sit", "animUseMonitorSit1", "坐姿使用显示器", "sit"),
      clip("tablet-sit", "animUseTabletSit1", "坐姿使用平板", "sit"),
      clip("tablet-stand", "animUseTabletStand1", "站立使用平板", "interaction"),
    ],
  },
  {
    id: "unreal-misc-clazy",
    groupId: "unreal-misc",
    sourcePack: "CLazyAnimpack",
    label: "通用移动套装",
    clips: [
      clip("jog-forward", "Mvm_Jog_Fwd", "慢跑前进", "move"),
      clip("jog-backward", "Mvm_Jog_Bwd", "慢跑后退", "move"),
      clip("jog-start", "Mvm_JogStart_Fwd", "慢跑起步", "move"),
      clip("jog-stop", "Mvm_JogStop_Fwd", "慢跑停止", "move"),
      clip("walk-forward", "Mvm_Walk_Fwd", "行走前进", "move"),
      clip("walk-backward", "Mvm_Walk_Bwd", "行走后退", "move"),
      clip("idle-a", "Mvm_IdleA", "通用待机 A", "idle", "idle:a"),
      clip("jump", "Jump_Up_A_Loop", "向上跳跃", "move"),
    ],
  },
  {
    id: "unreal-misc-kawaii",
    groupId: "unreal-misc",
    sourcePack: "KawaiiAnimations",
    label: "可爱战斗套装",
    clips: [
      clip("idle", "Anim_KA_Idle01_breathing", "可爱呼吸待机", "idle", "idle:default"),
      clip("barehands-idle", "Anim_KA_Combat_BareHands_Idle01", "徒手战斗待机", "idle", "idle:barehands"),
      clip("barehands-combo", "Anim_KA_Combat_BareHands_ComboAll", "徒手连击", "combat"),
      clip("barehands-damage", "Anim_KA_Combat_BareHands_DamageAll", "徒手受击", "reaction"),
      clip("heavy-sword-idle", "Anim_KA_Combat_HeavySword_Idle01", "重剑战斗待机", "idle", "idle:heavy-sword"),
      clip("heavy-sword-combo", "Anim_KA_Combat_HeavySword_ComboAll", "重剑连击", "sword"),
      clip("oh-sword-combo", "Anim_KA_Combat_OHSword01_ComboAll", "单手剑连击", "sword"),
      clip("witch-idle", "Anim_KA_Combat_Witch_Idle01", "女巫战斗待机", "idle", "idle:witch"),
      clip("witch-fly", "Anim_KA_Fly_Loop_Witch", "女巫飞行", "magic"),
    ],
  },
  {
    id: "unreal-misc-scared",
    groupId: "unreal-misc",
    sourcePack: "Scared_01",
    label: "惊恐反应套装",
    clips: [
      clip("standing-loop", "SCR_Beg_For_Life_Standing_Loop_IP", "站立求饶", "reaction"),
      clip("crouching-loop", "SCR_Beg_For_Life_Crouching_Loop_IP", "蹲伏求饶", "reaction"),
      clip("creeping", "SCR_Creeping_Fwd_Loop_IP", "惊恐爬行", "move"),
      clip("hands-up", "SCR_Gunpoint_Hands_Up_Loop_IP", "被威胁举手", "reaction"),
      clip("knees-hands-head", "SCR_Gunpoint_On_Knees_Hands_On_Head_Loop_IP", "跪地抱头", "reaction"),
      clip("runaway", "SCR_Runaway_Run_Loop_IP", "惊慌逃跑", "move"),
    ],
  },
  {
    id: "unreal-misc-morbid",
    groupId: "unreal-misc",
    sourcePack: "MorbidMotions_Pack",
    label: "惊悚变异套装",
    clips: [
      clip("idle-a", "ANIM_idle_A", "惊悚待机 A", "idle", "idle:a"),
      clip("idle-b", "ANIM_idle_B", "惊悚待机 B", "idle", "idle:b"),
      clip("tied-idle", "ANIM_Tied_idle", "束缚待机", "idle", "idle:tied"),
      clip("tied-escape", "ANIM_TiedSit_try_escape", "束缚挣扎", "reaction"),
      clip("transform", "ANIM_Transform_idle_A", "变异待机", "combat"),
      clip("emerge", "ANIM_emerge_A_to_idle_A", "从地面出现", "daily"),
    ],
  },
  {
    id: "unreal-misc-taunts",
    groupId: "unreal-misc",
    sourcePack: "TauntsPack",
    label: "挑衅手势套装",
    clips: [
      clip("arm-cross", "Ani_armCrossLoop_01", "抱臂挑衅", "idle", "idle:arms-cross"),
      clip("wave", "Ani_wave_01", "挥手", "performance"),
      clip("hand-punch", "Ani_handPunch_01", "手部出拳", "boxing"),
      clip("come-get-me", "Ani_comeGetMeLoop_01", "招手挑衅", "performance"),
      clip("finger-gun", "Ani_fingerGunLoop_01", "手指枪", "performance"),
      clip("fist-pump", "Ani_fistPumpLoop_01", "挥拳庆祝", "boxing"),
      clip("flex", "Ani_flexLoop_01", "展示肌肉", "performance"),
    ],
  },
  {
    id: "unreal-misc-couples",
    groupId: "unreal-misc",
    sourcePack: "Couples_Anim_Pack",
    label: "配对互动套装",
    clips: [
      clip("arms-around-loop-att", "AnimSeq_Paired_Couple_ArmsAroundShoulder_Loop_Att", "搭肩互动 · 主动方", "paired"),
      clip("arms-around-loop-vic", "AnimSeq_Paired_Couple_ArmsAroundShoulder_Loop_Vic", "搭肩互动 · 被动方", "paired"),
      clip("back-hug-loop-att", "AnimSeq_Paired_Couple_BackHug_Loop_Att", "背后拥抱 · 主动方", "paired"),
      clip("hug-kiss-loop-vic", "AnimSeq_Paired_Couple_HugNKiss_Loop_Vic", "拥抱亲吻 · 被动方", "paired"),
    ],
  },
  {
    id: "unreal-misc-stairs",
    groupId: "unreal-misc",
    sourcePack: "StairsSet",
    label: "楼梯移动套装",
    clips: [
      clip("stairs-idle", "A_Idle", "楼梯待机", "idle", "idle:stairs"),
      clip("walk-up", "A_Stairs_WalkFwd_Up_Loop", "走上楼梯", "move"),
      clip("walk-down", "A_Stairs_WalkFwd_Down_Loop", "走下楼梯", "move"),
      clip("jog-up", "A_Stairs_JogFwd_Up_Loop", "跑上楼梯", "move"),
      clip("jog-down", "A_Stairs_JogFwd_Down_Loop", "跑下楼梯", "move"),
      clip("turn-up", "A_Stairs_WalkFwd_Up_180_Turn_L", "楼梯上转身", "move"),
    ],
  },
  {
    id: "unreal-misc-crowd",
    groupId: "unreal-misc",
    sourcePack: "CrowdAnimations",
    label: "群演手势套装",
    clips: [
      clip("cheer", "A_Chear_Loop_01", "欢呼", "performance"),
      clip("lean-forward", "A_leanforward_Loop_01", "前倾观察", "performance"),
      clip("metal", "A_Metal_Loop_01", "摇摆应援", "performance"),
      clip("point", "A_Point_Loop_01", "指向", "performance"),
      clip("thumbs-up", "A_thumbsUp_loop_01", "群演点赞", "performance"),
    ],
  },
  {
    id: "unreal-misc-pedestrian-walks",
    groupId: "unreal-misc",
    sourcePack: "Pedestrian_Walks_01",
    label: "行人步态套装",
    clips: [
      clip("relaxed", "Walk_01_Relaxed_Loop_IP", "放松行走", "move"),
      clip("cheerful", "Walk_02_Cheerful_Loop_IP", "愉快行走", "move"),
      clip("mad", "Walk_03_Mad_Loop_IP", "生气行走", "move"),
      clip("texting", "Walk_04_Texting_Loop_IP", "边走边发消息", "daily"),
      clip("phone-call", "Walk_05_Phone_Call_Loop_IP", "边走边打电话", "daily"),
      clip("running-late", "Walk_10_Running_Late_Loop_IP", "迟到奔跑", "move"),
    ],
  },
  {
    id: "unreal-misc-morro",
    groupId: "unreal-misc",
    sourcePack: "MorroMotion",
    label: "舞蹈表演套装",
    clips: [
      clip("slow-dance", "Anim_Slow_Rhythm_Dance_01", "慢节奏舞蹈", "performance"),
      clip("mid-dance", "Anim_Mid_Rhythm_Dance_01", "中节奏舞蹈", "performance"),
      clip("high-dance", "Anim_High_Rhythm_Dance_01", "快节奏舞蹈", "performance"),
      clip("moonwalk", "Anim_Moonwalk_Dance_01", "太空步", "performance"),
    ],
  },
  {
    id: "unreal-misc-climbing",
    groupId: "unreal-misc",
    sourcePack: "ClimbingAnimationSet",
    label: "攀爬墙面套装",
    clips: [
      clip("climbing-idle", "Climbing_Idle_IP", "攀爬待机", "idle", "idle:climbing"),
      clip("climb-up", "Climbing_Climb_U_IP", "向上攀爬", "parkour"),
      clip("climb-left", "Climbing_Climb_L_IP", "向左攀爬", "parkour"),
      clip("climb-right", "Climbing_Climb_R_IP", "向右攀爬", "parkour"),
      clip("drop", "Climbing_Drop_IP", "攀爬下落", "parkour"),
      clip("jump-out", "Climbing_Jump_Out_IP", "攀爬跳离", "parkour"),
    ],
  },
  {
    id: "unreal-misc-irap",
    groupId: "unreal-misc",
    sourcePack: "IRAP",
    label: "受伤与恢复套装",
    clips: [
      clip("injured-front-idle", "Front_Injured_Idle", "正面受伤待机", "idle", "idle:injured-front"),
      clip("injured-back-idle", "Back_Injured_Idle", "背面受伤待机", "idle", "idle:injured-back"),
      clip("injured-walk", "ThirdPersonWalk", "受伤行走", "move"),
      clip("injured-run", "ThirdPersonRun", "受伤奔跑", "move"),
      clip("jump", "ThirdPersonJump_Start", "受伤跳跃起步", "move"),
      clip("revive", "Back_Revive", "倒地恢复", "reaction"),
    ],
  },
  {
    id: "unreal-misc-preacher",
    groupId: "unreal-misc",
    sourcePack: "PreacherAnimations",
    label: "祈祷演讲套装",
    clips: [
      clip("idle", "ANIM_IP_idle_01", "演讲待机", "idle", "idle:preacher"),
      clip("pray-ground", "ANIM_IP_pray_ground_loop_01", "跪地祈祷", "performance"),
      clip("pray-standing", "ANIM_IP_standing_pray_loop_01", "站立祈祷", "performance"),
      clip("complain", "ANIM_IP_standing_complain", "站立演讲", "performance"),
      clip("walk-book", "ANIM_RM_preacher_walk_book_F", "持书行走", "move"),
      clip("pray-start", "ANIM_RM_pray_ground_start", "祈祷起始", "performance"),
    ],
  },
  {
    id: "unreal-misc-supporter",
    groupId: "unreal-misc",
    sourcePack: "suppoter_motion",
    label: "助威动作套装",
    clips: [
      clip("supporter-01", "spo_01", "助威动作 1", "performance"),
      clip("supporter-02", "spo_02", "助威动作 2", "performance"),
      clip("supporter-ad-01", "spo_ad01", "广告助威动作", "performance"),
    ],
  },
  {
    id: "unreal-misc-pedestrian-convo",
    groupId: "unreal-misc",
    sourcePack: "Pedestrian_Convo_01",
    label: "行人对话套装",
    clips: [
      clip("low-key", "Convo_01_Low_Key_Loop", "低调交谈", "daily"),
      clip("up-beat", "Convo_02_Up_Beat_Loop", "积极交谈", "daily"),
      clip("animated", "Convo_03_Animated_Loop", "夸张交谈", "daily"),
      clip("argument", "Convo_05_Argument_1_Loop", "争论", "daily"),
      clip("listening", "Convo_11_Listening_Loop", "交谈倾听", "idle", "idle:conversation"),
    ],
  },
  {
    id: "unreal-misc-female-mocap",
    groupId: "unreal-misc",
    sourcePack: "Female_Mocap_AnimPackVol1",
    label: "女性生活表演套装",
    clips: [
      clip("stand-idle", "Anim_FemaleVol1_StandIdle02Loop", "女性站立待机", "idle", "idle:stand"),
      clip("stand-variant", "Anim_FemaleVol1_Stand01Loop", "女性站立待机 · 变体", "idle", "idle:stand-variant"),
      clip("sit-idle", "Anim_FemaleVol1_SitIdleLoop", "女性坐姿待机", "sit"),
      clip("play-water", "Anim_FemaleVol1_PlayWater01Loop", "玩水", "daily"),
      clip("walk", "Anim_FemaleVol1_WalkLoop", "女性行走", "move"),
    ],
  },
  {
    id: "unreal-hand-combat-fight",
    groupId: "unreal-hand-combat",
    sourcePack: "FightAnimations",
    label: "基础格斗套装",
    clips: [
      clip("idle-base", "A_Idle_Base", "格斗基础待机", "idle", "idle:base"),
      clip("idle-active", "A_Idle_Active", "格斗警戒待机", "idle", "idle:active"),
      clip("punch", "A_Punch_180", "直拳", "boxing"),
      clip("backfist", "A_BackFist_180", "摆拳", "boxing"),
      clip("side-kick", "A_SideKick_180_Mid", "侧踢", "combat"),
      clip("round-kick", "A_90L_RoundKick", "回旋踢", "combat"),
      clip("dodge-forward", "A_Dodge_F", "前闪", "reaction"),
      clip("run-forward", "A_Run_F", "格斗前进", "move"),
    ],
  },
  {
    id: "unreal-hand-combat-fighter",
    groupId: "unreal-hand-combat",
    sourcePack: "Fighter_Animations",
    label: "战士格斗套装",
    clips: [
      clip("idle", "Idle_Seq", "战士待机", "idle", "idle:default"),
      clip("idle-combat", "Idle_Combat_Seq", "战斗待机", "idle", "idle:combat"),
      clip("walk-forward", "Walk_F_0_Loop_RM_Seq", "战斗行走", "move"),
      clip("run-forward", "Run_F_0_Loop_RM_Seq", "战斗奔跑", "move"),
      clip("attack-01", "Attack_01_Seq", "战士攻击", "combat"),
      clip("hit", "Hit_F_Seq", "战士受击", "reaction"),
      clip("dodge", "Dodge_Front_Seq", "战士闪避", "reaction"),
    ],
  },
  {
    id: "unreal-hand-combat-boxer",
    groupId: "unreal-hand-combat",
    sourcePack: "Unleashed_Boxer",
    label: "拳击套装",
    clips: [
      clip("idle", "idle01", "拳击待机", "idle", "idle:default"),
      clip("attack-01", "attack_01", "拳击出拳 1", "boxing"),
      clip("attack-02", "attack_02", "拳击出拳 2", "boxing"),
      clip("combo", "combo_01", "拳击连击", "boxing"),
      clip("avoid-front", "avoid_front", "拳击前闪", "reaction"),
      clip("avoid-left", "avoid_left", "拳击左闪", "reaction"),
      clip("jump-attack", "attack_jump01", "跳跃出拳", "boxing"),
      clip("landing", "attack_jump_landing", "跳跃落地", "move"),
    ],
  },
  {
    id: "unreal-hand-combat-muaythai",
    groupId: "unreal-hand-combat",
    sourcePack: "MuayThai_AnimSet",
    label: "泰拳套装",
    clips: [
      clip("idle", "idle01_normal", "泰拳待机", "idle", "idle:default"),
      clip("attack-01", "attack01", "泰拳攻击 1", "boxing"),
      clip("attack-02", "attack02", "泰拳攻击 2", "boxing"),
      clip("combo", "combo01", "泰拳连击", "boxing"),
      clip("avoid-front", "avoid_front", "泰拳前闪", "reaction"),
      clip("down-loop", "down01_loop", "倒地状态", "reaction"),
      clip("dead", "dead01", "倒地结束", "reaction"),
    ],
  },
  {
    id: "unreal-hand-combat-wingchun",
    groupId: "unreal-hand-combat",
    sourcePack: "wingchun_Animset",
    label: "咏春套装",
    clips: [
      clip("idle", "idle", "咏春待机", "idle", "idle:default"),
      clip("attack-01", "attack_01", "咏春攻击 1", "boxing"),
      clip("attack-02", "attack_02", "咏春攻击 2", "boxing"),
      clip("combo", "combo_01", "咏春连击", "boxing"),
      clip("setmotion-attack", "setmotion_atk_01", "咏春套路攻击", "combat"),
      clip("hit", "hit_front", "咏春受击", "reaction"),
    ],
  },
  {
    id: "unreal-hand-combat-ninja",
    groupId: "unreal-hand-combat",
    sourcePack: "Ninja_AnimSet",
    label: "忍者徒手套装",
    clips: [
      clip("idle", "A_idle", "忍者待机", "idle", "idle:default"),
      clip("attack", "A_atk_01", "忍者攻击", "combat"),
      clip("combo", "A_combo_01", "忍者连击", "combat"),
      clip("avoid-left", "A_avoid_L", "忍者左闪", "reaction"),
      clip("dash", "A_back_dash", "忍者后撤", "move"),
      clip("dagger-throw", "A_daggerthrow_01", "投掷飞刀", "weapon"),
      clip("cast", "A_Casting01_loop", "忍者施法", "magic"),
    ],
  },
  {
    id: "unreal-hand-combat-special-moves",
    groupId: "unreal-hand-combat",
    sourcePack: "SpecialMoves_Energy",
    label: "能量特技套装",
    clips: [
      clip("idle", "SpecialMoveIdle_M", "能量特技待机", "idle", "idle:default"),
      clip("move-000", "SpecialMove_000_00_All_IP", "能量特技 0", "magic"),
      clip("move-001", "SpecialMove_001_00_All_IP", "能量特技 1", "magic"),
      clip("move-002", "SpecialMove_002_00_All_IP", "能量特技 2", "magic"),
      clip("move-005", "SpecialMove_005_00_All_IP", "能量特技 5", "magic"),
      clip("move-006", "SpecialMove_006_00_All_IP", "能量特技 6", "magic"),
    ],
  },
  {
    id: "unreal-hand-combat-finisher",
    groupId: "unreal-hand-combat",
    sourcePack: "Finisher_Animations",
    label: "终结技套装",
    clips: [
      clip("finisher-01", "A_Finisher_1", "终结技 1", "combat"),
      clip("finisher-02", "A_Finisher_2", "终结技 2", "combat"),
      clip("counter-01", "A_Counter_1", "反击 1", "combat"),
      clip("hit-counter-01", "A_Hit_Counter_1", "受击反制 1", "reaction"),
    ],
  },
  {
    id: "unreal-hand-combat-lucy",
    groupId: "unreal-hand-combat",
    sourcePack: "Lucy",
    label: "女性格斗套装",
    clips: [
      clip("idle", "Lucy_Idle", "女性格斗待机", "idle", "idle:default"),
      clip("fight-idle", "Lucy_Fight_Idle_Pose", "女性战斗待机", "idle", "idle:fight"),
      clip("attack", "Lucy_FightFist01_ALL_Inplace", "女性近战攻击", "combat"),
      clip("kick", "Lucy_Kick01_Inplace", "女性踢击", "combat"),
      clip("air-attack", "Lucy_Air_Attack_01_Inplace", "女性空中攻击", "combat"),
      clip("air-kick", "Lucy_Air_Kick_01_Inplace", "女性空中踢击", "combat"),
      clip("fight-to-idle", "Lucy_Fight2Idle_Inplace", "战斗回到待机", "combat"),
    ],
  },
  {
    id: "unreal-hand-combat-demon",
    groupId: "unreal-hand-combat",
    sourcePack: "Demon_Anims",
    label: "恶魔动作套装",
    clips: [
      clip("idle", "AnimSeq_Demon_Idle", "恶魔待机", "idle", "idle:default"),
      clip("lunge", "AnimSeq_Demon_Attack_LungeFly_Forward", "恶魔飞扑", "combat"),
      clip("crawl-idle", "AnimSeq_Demon_FloorCrawl_Idle", "恶魔爬行待机", "idle", "idle:crawl"),
      clip("crawl-attack", "AnimSeq_Demon_FloorCrawl_Attack_ForwardSwings", "恶魔爬行攻击", "combat"),
      clip("point", "AnimSeq_Demon_Idle_Point_Forward", "恶魔指向", "performance"),
      clip("death", "AnimSeq_Demon_Idle_Death", "恶魔死亡", "reaction"),
    ],
  },
  {
    id: "unreal-hand-combat-zombie",
    groupId: "unreal-hand-combat",
    sourcePack: "Zombie_Anims",
    label: "僵尸动作套装",
    clips: [
      clip("crawl-idle", "Zombie_Crawl_Idle", "僵尸爬行待机", "idle", "idle:crawl"),
      clip("attack", "Zombie_Attack_01", "僵尸攻击", "combat"),
      clip("crawl-attack", "Zombie_Crawl_Attack01", "僵尸爬行攻击", "combat"),
      clip("hit-head", "Zombie_HitReact_Head", "僵尸头部受击", "reaction"),
      clip("stand-up", "Zombie_Crawl_CrawlIdle_To_Stand", "僵尸起身", "move"),
      clip("bite", "Paired_Zombie_BiteAttempt_Loop_Att", "僵尸撕咬 · 主动方", "paired"),
    ],
  },
  {
    id: "unreal-hand-combat-ghost",
    groupId: "unreal-hand-combat",
    sourcePack: "Ghost_Creature_Anims",
    label: "幽灵动作套装",
    clips: [
      clip("standing-idle", "Ghost_Idle_Standing", "幽灵站立待机", "idle", "idle:standing"),
      clip("bound-idle", "Ghost_Idle_Bound", "幽灵束缚待机", "idle", "idle:bound"),
      clip("attack", "Ghost_Attack_01", "幽灵攻击", "combat"),
      clip("crawl-idle", "Ghost_Crawl_Idle", "幽灵爬行待机", "idle", "idle:crawl"),
      clip("reach", "Ghost_Idle_CreepyHands_Wall_Reach", "幽灵墙边伸手", "performance"),
      clip("float", "Ghost_Idle_Floating_HandsReachOut", "幽灵漂浮伸手", "performance"),
    ],
  },
  {
    id: "unreal-hand-combat-flying-mage",
    groupId: "unreal-hand-combat",
    sourcePack: "FlyingMageAnimSet",
    label: "飞行法师套装",
    clips: [
      clip("flying-attack", "attack_FlyingAtk01", "飞行攻击", "magic"),
      clip("ground-attack", "attack_GroundAtk01", "地面法术攻击", "magic"),
      clip("flying-hit", "attacked_Flying_Front", "飞行受击", "reaction"),
      clip("ground-hit", "attacked_Ground_Front", "地面受击", "reaction"),
      clip("flying-dead", "dead_Flying", "飞行死亡", "reaction"),
      clip("ground-dead", "dead_Ground", "地面死亡", "reaction"),
    ],
  },
  {
    id: "unreal-hand-combat-magical",
    groupId: "unreal-hand-combat",
    sourcePack: "MagicalAnimSet",
    label: "魔法施法套装",
    clips: [
      clip("idle", "01_idle", "魔法待机", "idle", "idle:default"),
      clip("beam", "04_beam_loop", "持续光束", "magic"),
      clip("chant", "05_chanting_loop", "吟唱施法", "magic"),
      clip("spell-combo", "13_combo_1", "法术连招", "magic"),
      clip("damage", "damage_b", "魔法受击", "reaction"),
      clip("dodge", "dodge_l", "魔法闪避", "reaction"),
      clip("jump", "jump_start", "施法跳跃", "move"),
    ],
  },
  {
    id: "unreal-hand-combat-classic-female-ghost",
    groupId: "unreal-hand-combat",
    sourcePack: "ClassicFemaleGhost",
    label: "经典女鬼套装",
    clips: [
      clip("idle", "ClassicFemaleGhost_Idle", "女鬼待机", "idle", "idle:default"),
      clip("crawl-idle", "ClassicFemaleGhost_Crawl_Idle", "女鬼爬行待机", "idle", "idle:crawl"),
      clip("jumpscare", "ClassicFemaleGhost_Jumpscare_LungeForward01", "女鬼突袭", "combat"),
      clip("float-walk", "ClassicFemaleGhost_Move_Float_Forward", "女鬼漂浮移动", "move"),
      clip("sit-idle", "ClassicFemaleGhost_Sit_Idle", "女鬼坐姿待机", "sit"),
    ],
  },
  {
    id: "unreal-hand-combat-monsters",
    groupId: "unreal-hand-combat",
    sourcePack: "41_Animations_Monsters",
    label: "怪物动作套装",
    clips: [
      clip("idle-1", "Anim_Monster_Idle_1", "怪物待机 1", "idle", "idle:01"),
      clip("idle-2", "Anim_Monster_Idle_2", "怪物待机 2", "idle", "idle:02"),
      clip("attack", "Anim_Monster_Attack_1", "怪物攻击", "combat"),
      clip("hit", "Anim_Monster_Get_Hit", "怪物受击", "reaction"),
      clip("run", "Anim_Monster_Run", "怪物奔跑", "move"),
    ],
  },
  {
    id: "unreal-hand-combat-creature-sit",
    groupId: "unreal-hand-combat",
    sourcePack: "Animations_Creature",
    label: "生物地面动作套装",
    clips: [
      clip("sit-idle", "Anim_Creatures_Sit_Agoni", "生物坐姿待机", "sit"),
      clip("sit-attack", "Anim_Creatures_Sit_Attack_From_Ground", "生物地面攻击", "combat"),
      clip("sit-run", "Anim_Creatures_Sit_Sit_Run_02", "生物坐姿起跑", "move"),
      clip("sit-dead", "Anim_Creature_Sit_Dead_1", "生物死亡", "reaction"),
    ],
  },
  {
    id: "unreal-hand-combat-creatures",
    groupId: "unreal-hand-combat",
    sourcePack: "Creatures_animations",
    label: "生物攻击套装",
    clips: [
      clip("idle-block", "Anim_IP_idle_block", "生物防御待机", "idle", "idle:block"),
      clip("attack", "Anim_RM_attack_01", "生物攻击", "combat"),
      clip("jump-attack", "Anim_RM_jump_attack_all_in_one_01", "生物跳跃攻击", "combat"),
      clip("hit", "Anim_IP_hit_front", "生物正面受击", "reaction"),
      clip("death", "Anim_RM_death_01", "生物死亡", "reaction"),
    ],
  },
  {
    id: "unreal-weapon-combat-sword",
    groupId: "unreal-weapon-combat",
    sourcePack: "Sword_Animations",
    label: "标准剑术套装",
    clips: [
      clip("idle", "Idle_Seq", "持剑待机", "idle", "idle:default"),
      clip("idle-combat", "Idle_Combat_Seq", "持剑战斗待机", "idle", "idle:combat"),
      clip("combo-01", "Combo_Attack_01_All_Seq", "剑术连击 1", "sword"),
      clip("combo-02", "Combo_Attack_02_All_Seq", "剑术连击 2", "sword"),
      clip("combo-03", "Combo_Attack_03_All_Seq", "剑术连击 3", "sword"),
      clip("walk", "Walk_Loop_F_0_Seq", "持剑行走", "move"),
      clip("hit", "Hit_F_Seq", "持剑受击", "reaction"),
      clip("block", "Block_Loop_Seq", "持剑格挡", "sword"),
    ],
  },
  {
    id: "unreal-weapon-combat-katana",
    groupId: "unreal-weapon-combat",
    sourcePack: "Katana_Animations",
    label: "武士刀套装",
    clips: [
      clip("idle", "AS_Idle_Seq", "武士刀待机", "idle", "idle:default"),
      clip("idle-combat", "AS_Idle_Combat_Seq", "武士刀战斗待机", "idle", "idle:combat"),
      clip("combo-01", "AS_Combo_Attack_01_Seq", "武士刀连击 1", "sword"),
      clip("combo-02", "AS_Combo_Attack_02_Seq", "武士刀连击 2", "sword"),
      clip("combo-all", "AS_Combo_Attack_All_Seq", "武士刀完整连击", "sword"),
      clip("walk", "AS_Walk_Loop_F_0_Seq", "武士刀行走", "move"),
      clip("hit", "AS_Hit_F_Seq", "武士刀受击", "reaction"),
      clip("dodge", "AS_Dodge_F_0_Seq", "武士刀闪避", "reaction"),
    ],
  },
  {
    id: "unreal-weapon-combat-sword-pro",
    groupId: "unreal-weapon-combat",
    sourcePack: "SwordAnimsetPro",
    label: "剑术进阶套装",
    clips: [
      clip("idle", "Idle_Anim", "进阶剑术待机", "idle", "idle:default"),
      clip("block", "Block_Hold_Anim", "持剑格挡", "sword"),
      clip("block-counter", "Block_CounterAttacks_Anim", "格挡反击", "sword"),
      clip("air-attack", "Air_Attack_01_Anim", "空中剑击", "sword"),
      clip("weak-attack", "Weak_01_loop_01_Anim", "轻剑攻击", "sword"),
      clip("jump", "Jump_F_Loop_Anim", "持剑跳跃", "move"),
      clip("hit", "Down_01_Hit_Anim", "倒地受击", "reaction"),
      clip("crouch", "Crouch_Idle_Anim", "持剑蹲伏", "idle", "idle:crouch"),
    ],
  },
  {
    id: "unreal-weapon-combat-wudang",
    groupId: "unreal-weapon-combat",
    sourcePack: "WudangSword_Animset",
    label: "武当剑套装",
    clips: [
      clip("idle", "idle", "武当剑待机", "idle", "idle:default"),
      clip("slice", "attack_Slice01", "武当剑劈砍", "sword"),
      clip("stab", "attack_Stabbing01", "武当剑刺击", "sword"),
      clip("spin", "attack_Spinning", "武当剑旋身", "sword"),
      clip("combo", "Combo01", "武当剑连招", "sword"),
      clip("avoid", "avoid_left", "武当剑闪避", "reaction"),
      clip("run", "move_run_front", "武当剑奔跑", "move"),
    ],
  },
  {
    id: "unreal-weapon-combat-rapier",
    groupId: "unreal-weapon-combat",
    sourcePack: "Rapier_AnimSet",
    label: "刺剑套装",
    clips: [
      clip("idle", "idle", "刺剑待机", "idle", "idle:default"),
      clip("attack-01", "attack_01", "刺剑攻击 1", "sword"),
      clip("attack-02", "attack_02", "刺剑攻击 2", "sword"),
      clip("combo", "combo_01", "刺剑连击", "sword"),
      clip("avoid", "avoid_left", "刺剑闪避", "reaction"),
      clip("buff", "buff_01", "刺剑蓄势", "sword"),
      clip("hit", "hit_light_F_body", "刺剑受击", "reaction"),
    ],
  },
  {
    id: "unreal-weapon-combat-spear",
    groupId: "unreal-weapon-combat",
    sourcePack: "SpearAndHalberdAnimset",
    label: "长枪与戟套装",
    clips: [
      clip("idle", "Spear_Idle", "长枪待机", "idle", "idle:default"),
      clip("attack-forward", "Spear_AttackFromRun", "长枪冲刺攻击", "weapon"),
      clip("attack-swing", "Spear_AttackFwd_Swing_l", "长枪横扫", "weapon"),
      clip("attack-place", "Spear_AttackPlace_1", "长枪定点攻击", "weapon"),
      clip("combo", "Spear_AttackFwdCombo1_A", "长枪连击", "weapon"),
      clip("aim", "Spear_Look_AimOffset_Center", "长枪瞄准", "weapon"),
      clip("hit", "Spear_Hit_1", "长枪受击", "reaction"),
    ],
  },
  {
    id: "unreal-weapon-combat-dual-blade",
    groupId: "unreal-weapon-combat",
    sourcePack: "Orientalism_Dual_Blade_Anim_Set",
    label: "双刃套装",
    clips: [
      clip("idle", "ANIM_idle", "双刃待机", "idle", "idle:default"),
      clip("attack", "ANIM_Attack_01", "双刃攻击", "weapon"),
      clip("sliding", "ANIM_Attack_Sliding", "双刃滑步攻击", "weapon"),
      clip("combo", "ANIM_Combo_01", "双刃连击", "weapon"),
      clip("avoid", "ANIM_avoid_left", "双刃闪避", "reaction"),
      clip("hit", "ANIM_hit_body_front", "双刃受击", "reaction"),
    ],
  },
  {
    id: "unreal-weapon-combat-pistol",
    groupId: "unreal-weapon-combat",
    sourcePack: "PistolAnimsetPro",
    label: "手枪套装",
    clips: [
      clip("idle", "Pistol_Idle", "手枪待机", "idle", "idle:default"),
      clip("equip", "Pistol_Equip", "拔枪", "weapon"),
      clip("crouch", "Pistol_CrouchLoop", "持枪蹲伏", "idle", "idle:crouch"),
      clip("walk", "Pistol_WalkFwdLoop", "持枪行走", "move"),
      clip("death", "Pistol_Death_L", "持枪倒地", "reaction"),
    ],
  },
  {
    id: "unreal-weapon-combat-mage",
    groupId: "unreal-weapon-combat",
    sourcePack: "Mage",
    label: "法师武器套装",
    clips: [
      clip("idle", "AS_Idle_Seq", "法师待机", "idle", "idle:default"),
      clip("combat-idle", "AS_Idle_Combat_Seq", "法师战斗待机", "idle", "idle:combat"),
      clip("cast", "AS_Combo_Attack_01_All_Seq", "法师施法", "magic"),
      clip("attack", "AS_Attack_01_01_Seq", "法师攻击", "magic"),
      clip("walk", "AS_Walk_F_0_Loop_Seq", "法师行走", "move"),
      clip("hit", "AS_Hit_F_Seq", "法师受击", "reaction"),
      clip("dodge", "AS_Dodge_F_0_Seq", "法师闪避", "reaction"),
      clip("death", "AS_Hit_Death_Seq", "法师死亡", "reaction"),
    ],
  },
  {
    id: "unreal-weapon-combat-heavy-hammer",
    groupId: "unreal-weapon-combat",
    sourcePack: "HeavyHammer",
    label: "重锤套装",
    clips: [
      clip("idle", "Anim_Idle", "重锤待机", "idle", "idle:default"),
      clip("attack", "Anim_Attack02", "重锤攻击", "weapon"),
      clip("combo", "Anim_Combo01_01", "重锤连击", "weapon"),
      clip("air-attack", "Anim_Air_Combo01_01", "重锤空中攻击", "weapon"),
      clip("dodge", "Anim_Dodge_F", "重锤闪避", "reaction"),
      clip("hit", "Anim_Hit01_B", "重锤受击", "reaction"),
    ],
  },
  {
    id: "unreal-weapon-combat-grim-reaper",
    groupId: "unreal-weapon-combat",
    sourcePack: "GrimReaperSet",
    label: "死神镰刀套装",
    clips: [
      clip("idle", "Flying_idle", "死神飞行待机", "idle", "idle:flying"),
      clip("ground-attack", "Ground_attack01", "死神地面攻击", "weapon"),
      clip("flying-attack", "Flying_attack01", "死神飞行攻击", "weapon"),
      clip("spin", "Flying_air_spin_01", "死神空中旋转", "weapon"),
      clip("equip", "equip", "死神装备武器", "interaction"),
      clip("dead", "dead1", "死神倒地", "reaction"),
    ],
  },
  {
    id: "unreal-weapon-combat-sword-sheath",
    groupId: "unreal-weapon-combat",
    sourcePack: "Sword_sheath_AnimSet",
    label: "拔刀收刀套装",
    clips: [
      clip("idle", "anim_idle", "拔刀待机", "idle", "idle:default"),
      clip("attack", "anim_attack_01", "拔刀攻击", "sword"),
      clip("combo", "anim_combo_01", "拔刀连击", "sword"),
      clip("unequip", "anim_unequip_01", "收刀", "interaction"),
      clip("avoid", "anim_avoid_left", "拔刀闪避", "reaction"),
      clip("hit", "anim_body_front_hit", "拔刀受击", "reaction"),
    ],
  },
  {
    id: "unreal-weapon-combat-stealth-knife",
    groupId: "unreal-weapon-combat",
    sourcePack: "StealthFinishers_KnifeAndHand",
    label: "潜行匕首套装",
    clips: [
      clip("stealth-idle", "H2H_Stealth_Idle", "潜行待机", "idle", "idle:stealth"),
      clip("stealth-walk", "H2H_Stealth_WalkForward", "潜行前进", "stealth"),
      clip("knife-equip", "Knife_Stealth_Equip", "潜行拔刀", "interaction"),
      clip("knife-unequip", "Knife_Stealth_Unequip", "潜行收刀", "interaction"),
      clip("roll", "H2H_Stealth_RollForward", "潜行翻滚", "stealth"),
      clip("finisher", "Paired_Knife_Stealth_Interrogate_Loop_Att", "匕首审问 · 主动方", "paired"),
      clip("drag-body", "Paired_H2H_Stealth_DraggingBody_Loop_Att", "拖拽身体 · 主动方", "paired"),
    ],
  },
  {
    id: "unreal-weapon-combat-ghost-samurai",
    groupId: "unreal-weapon-combat",
    sourcePack: "GhostSamurai_Bundle",
    label: "幽灵武士套装",
    clips: [
      clip("idle", "GhostSamurai_Bow_Common_Idle_Inplace", "幽灵武士待机", "idle", "idle:default"),
      clip("attack", "GhostSamurai_Bow_Shoot_Loop_Inplace", "幽灵武士弓箭攻击", "weapon"),
      clip("walk", "GhostSamurai_Bow_Common_Walk_Loop_Inplace", "幽灵武士持弓行走", "move"),
      clip("jump", "GhostSamurai_Bow_Common_Jump_Loop_Inplace", "幽灵武士持弓跳跃", "move"),
      clip("equip", "GhostSamurai_Bow_Common_Equip_Inplace", "幽灵武士装备弓箭", "interaction"),
      clip("cancel", "GhostSamurai_Bow_Shoot_Cancel_Inplace", "幽灵武士取消射击", "reaction"),
    ],
  },
];

const taxonomy = (classificationId, classificationLabel, actorKind, posture, weaponType) => ({
  classificationId,
  classificationLabel,
  actorKind,
  posture,
  weaponType,
});

/**
 * 套装默认分类是人工核对过的策选事实，不从文件名推断。混合套装在下面
 * 用 packId:clipKey 显式覆盖，生成器会把最终字段写入清单供前端直接消费。
 */
const PACK_TAXONOMY = {
  "unreal-daily-male-locomotion": taxonomy("locomotion", "站立移动", "human", "standing", "none"),
  "unreal-daily-sitting": taxonomy("sitting", "坐姿", "human", "sitting", "none"),
  "unreal-daily-parkour": taxonomy("parkour", "跳跃 / 翻越", "human", "mixed", "none"),
  "unreal-daily-mc-idles": taxonomy("standing-idle", "站立待机", "human", "standing", "none"),
  "unreal-daily-roll-dodge": taxonomy("dodge", "翻滚 / 闪避", "human", "mixed", "none"),
  "unreal-daily-dialogue": taxonomy("dialogue", "对话 / 手势", "human", "standing", "none"),
  "unreal-daily-sleep": taxonomy("sleeping", "躺卧 / 睡眠", "human", "lying", "none"),
  "unreal-daily-female-interact": taxonomy("interaction", "站立互动", "human", "mixed", "none"),
  "unreal-interaction-vendors": taxonomy("interaction", "站立互动", "human", "standing", "none"),
  "unreal-interaction-item-pickup": taxonomy("interaction", "站立互动", "human", "mixed", "none"),
  "unreal-interaction-npcs": taxonomy("daily", "生活动作", "human", "mixed", "none"),
  "unreal-interaction-activations": taxonomy("interaction", "站立互动", "human", "standing", "none"),
  "unreal-interaction-survival": taxonomy("crafting", "制作 / 采集", "human", "mixed", "none"),
  "unreal-interaction-drinking": taxonomy("interaction", "站立互动", "human", "mixed", "none"),
  "unreal-interaction-car": taxonomy("vehicle", "车辆互动", "human", "sitting", "none"),
  "unreal-interaction-phoenyx": taxonomy("swimming-desktop", "游泳 / 桌面", "human", "mixed", "none"),
  "unreal-misc-clazy": taxonomy("locomotion", "站立移动", "human", "standing", "none"),
  "unreal-misc-kawaii": taxonomy("barehand", "基础徒手", "human", "mixed", "barehand"),
  "unreal-misc-scared": taxonomy("reaction", "反应 / 求饶", "human", "mixed", "none"),
  "unreal-misc-morbid": taxonomy("monster", "怪物动作", "monster", "mixed", "none"),
  "unreal-misc-taunts": taxonomy("performance", "表演 / 手势", "human", "standing", "none"),
  "unreal-misc-couples": taxonomy("paired", "配对互动", "paired", "standing", "none"),
  "unreal-misc-stairs": taxonomy("locomotion", "站立移动", "human", "standing", "none"),
  "unreal-misc-crowd": taxonomy("performance", "表演 / 手势", "human", "standing", "none"),
  "unreal-misc-pedestrian-walks": taxonomy("locomotion", "站立移动", "human", "standing", "none"),
  "unreal-misc-morro": taxonomy("dance", "舞蹈", "human", "standing", "none"),
  "unreal-misc-climbing": taxonomy("climbing", "攀爬", "human", "mixed", "none"),
  "unreal-misc-irap": taxonomy("injury-recovery", "受伤 / 恢复", "human", "mixed", "none"),
  "unreal-misc-preacher": taxonomy("prayer-speech", "祈祷 / 演讲", "human", "mixed", "none"),
  "unreal-misc-supporter": taxonomy("performance", "表演 / 手势", "human", "standing", "none"),
  "unreal-misc-pedestrian-convo": taxonomy("dialogue", "对话 / 手势", "human", "standing", "none"),
  "unreal-misc-female-mocap": taxonomy("performance", "生活 / 表演", "human", "mixed", "none"),
  "unreal-hand-combat-fight": taxonomy("barehand", "基础徒手", "human", "standing", "barehand"),
  "unreal-hand-combat-fighter": taxonomy("barehand", "基础徒手", "human", "mixed", "barehand"),
  "unreal-hand-combat-boxer": taxonomy("boxing", "拳击", "human", "mixed", "barehand"),
  "unreal-hand-combat-muaythai": taxonomy("muay-thai", "泰拳", "human", "mixed", "barehand"),
  "unreal-hand-combat-wingchun": taxonomy("wing-chun", "咏春", "human", "standing", "barehand"),
  "unreal-hand-combat-ninja": taxonomy("ninja", "忍者徒手", "human", "mixed", "barehand"),
  "unreal-hand-combat-special-moves": taxonomy("energy", "能量特技", "human", "mixed", "barehand"),
  "unreal-hand-combat-finisher": taxonomy("finisher", "终结技", "human", "mixed", "barehand"),
  "unreal-hand-combat-lucy": taxonomy("barehand", "基础徒手", "human", "mixed", "barehand"),
  "unreal-hand-combat-demon": taxonomy("demon", "恶魔", "monster", "mixed", "none"),
  "unreal-hand-combat-zombie": taxonomy("zombie", "僵尸", "monster", "mixed", "none"),
  "unreal-hand-combat-ghost": taxonomy("ghost", "幽灵", "monster", "mixed", "none"),
  "unreal-hand-combat-flying-mage": taxonomy("flying-mage", "飞行法师", "humanoid-creature", "mixed", "magic"),
  "unreal-hand-combat-magical": taxonomy("magic", "法术动作", "human", "mixed", "magic"),
  "unreal-hand-combat-classic-female-ghost": taxonomy("classic-ghost", "经典女鬼", "monster", "mixed", "none"),
  "unreal-hand-combat-monsters": taxonomy("monster", "怪物动作", "monster", "mixed", "none"),
  "unreal-hand-combat-creature-sit": taxonomy("ground-creature", "生物地面动作", "humanoid-creature", "mixed", "none"),
  "unreal-hand-combat-creatures": taxonomy("creature-combat", "生物攻击", "humanoid-creature", "mixed", "none"),
  "unreal-weapon-combat-sword": taxonomy("sword", "剑", "human", "mixed", "sword"),
  "unreal-weapon-combat-katana": taxonomy("katana", "武士刀", "human", "mixed", "katana"),
  "unreal-weapon-combat-sword-pro": taxonomy("sword", "剑", "human", "mixed", "sword"),
  "unreal-weapon-combat-wudang": taxonomy("sword", "剑", "human", "mixed", "sword"),
  "unreal-weapon-combat-rapier": taxonomy("rapier", "刺剑", "human", "mixed", "rapier"),
  "unreal-weapon-combat-spear": taxonomy("spear", "长枪与戟", "human", "mixed", "spear"),
  "unreal-weapon-combat-dual-blade": taxonomy("dual-blade", "双刃", "human", "mixed", "dual-blade"),
  "unreal-weapon-combat-pistol": taxonomy("pistol", "手枪", "human", "mixed", "pistol"),
  "unreal-weapon-combat-mage": taxonomy("weapon-magic", "法师武器", "human", "mixed", "magic"),
  "unreal-weapon-combat-heavy-hammer": taxonomy("hammer", "重锤", "human", "mixed", "hammer"),
  "unreal-weapon-combat-grim-reaper": taxonomy("scythe", "镰刀", "monster", "mixed", "scythe"),
  "unreal-weapon-combat-sword-sheath": taxonomy("sword", "剑", "human", "mixed", "sword"),
  "unreal-weapon-combat-stealth-knife": taxonomy("dagger", "匕首", "human", "mixed", "dagger"),
  "unreal-weapon-combat-ghost-samurai": taxonomy("bow", "弓箭", "human", "mixed", "bow"),
};

const CLIP_TAXONOMY_OVERRIDES = {
  "unreal-daily-male-locomotion:crouch-idle": taxonomy("crouching", "蹲伏", "human", "crouching", "none"),
  "unreal-daily-male-locomotion:crouch-forward": taxonomy("crouching", "蹲伏", "human", "crouching", "none"),
  "unreal-daily-sleep:sit-bed-loop": taxonomy("sitting", "坐姿", "human", "sitting", "none"),
  "unreal-interaction-item-pickup:pickup-crouch-left": taxonomy("crouching-interaction", "蹲伏互动", "human", "crouching", "none"),
  "unreal-misc-kawaii:barehands-idle": taxonomy("barehand", "基础徒手", "human", "standing", "barehand"),
  "unreal-misc-kawaii:barehands-combo": taxonomy("barehand", "基础徒手", "human", "mixed", "barehand"),
  "unreal-misc-kawaii:barehands-damage": taxonomy("barehand", "基础徒手", "human", "mixed", "barehand"),
  "unreal-misc-kawaii:heavy-sword-idle": taxonomy("sword", "剑", "human", "standing", "sword"),
  "unreal-misc-kawaii:heavy-sword-combo": taxonomy("sword", "剑", "human", "mixed", "sword"),
  "unreal-misc-kawaii:oh-sword-combo": taxonomy("sword", "剑", "human", "mixed", "sword"),
  "unreal-misc-kawaii:witch-idle": taxonomy("magic", "法术动作", "human", "standing", "magic"),
  "unreal-misc-kawaii:witch-fly": taxonomy("magic", "法术动作", "human", "airborne", "magic"),
  "unreal-misc-scared:crouching-loop": taxonomy("crouching", "蹲伏", "human", "crouching", "none"),
  "unreal-misc-scared:creeping": taxonomy("ground-action", "地面动作", "human", "crawling", "none"),
  "unreal-misc-scared:knees-hands-head": taxonomy("kneeling", "跪姿", "human", "kneeling", "none"),
  "unreal-misc-morbid:emerge": taxonomy("ground-action", "地面动作", "monster", "lying", "none"),
  "unreal-misc-taunts:hand-punch": taxonomy("barehand", "基础徒手", "human", "standing", "barehand"),
  "unreal-misc-taunts:fist-pump": taxonomy("barehand", "基础徒手", "human", "standing", "barehand"),
  "unreal-misc-preacher:pray-ground": taxonomy("prayer-speech", "祈祷 / 演讲", "human", "kneeling", "none"),
  "unreal-misc-preacher:pray-start": taxonomy("prayer-speech", "祈祷 / 演讲", "human", "kneeling", "none"),
  "unreal-misc-female-mocap:sit-idle": taxonomy("sitting", "坐姿", "human", "sitting", "none"),
  "unreal-hand-combat-ninja:dagger-throw": taxonomy("dagger", "匕首", "human", "standing", "dagger"),
  "unreal-hand-combat-demon:crawl-idle": taxonomy("ground-creature", "生物地面动作", "monster", "crawling", "none"),
  "unreal-hand-combat-demon:crawl-attack": taxonomy("ground-creature", "生物地面动作", "monster", "crawling", "none"),
  "unreal-hand-combat-demon:lunge": taxonomy("demon", "恶魔", "monster", "airborne", "none"),
  "unreal-hand-combat-zombie:crawl-idle": taxonomy("ground-creature", "生物地面动作", "monster", "crawling", "none"),
  "unreal-hand-combat-zombie:crawl-attack": taxonomy("ground-creature", "生物地面动作", "monster", "crawling", "none"),
  "unreal-hand-combat-zombie:bite": taxonomy("paired", "配对互动", "paired", "crawling", "none"),
  "unreal-hand-combat-ghost:crawl-idle": taxonomy("ground-creature", "生物地面动作", "monster", "crawling", "none"),
  "unreal-hand-combat-ghost:float": taxonomy("ghost", "幽灵", "monster", "airborne", "none"),
  "unreal-hand-combat-flying-mage:flying-attack": taxonomy("flying-mage", "飞行法师", "humanoid-creature", "airborne", "magic"),
  "unreal-hand-combat-flying-mage:flying-hit": taxonomy("flying-mage", "飞行法师", "humanoid-creature", "airborne", "magic"),
  "unreal-hand-combat-flying-mage:flying-dead": taxonomy("flying-mage", "飞行法师", "humanoid-creature", "airborne", "magic"),
  "unreal-hand-combat-flying-mage:ground-attack": taxonomy("magic", "法术动作", "humanoid-creature", "standing", "magic"),
  "unreal-hand-combat-flying-mage:ground-hit": taxonomy("magic", "法术动作", "humanoid-creature", "standing", "magic"),
  "unreal-hand-combat-flying-mage:ground-dead": taxonomy("magic", "法术动作", "humanoid-creature", "lying", "magic"),
  "unreal-hand-combat-classic-female-ghost:crawl-idle": taxonomy("ground-creature", "生物地面动作", "monster", "crawling", "none"),
  "unreal-hand-combat-classic-female-ghost:float-walk": taxonomy("classic-ghost", "经典女鬼", "monster", "airborne", "none"),
  "unreal-hand-combat-classic-female-ghost:sit-idle": taxonomy("sitting", "坐姿", "monster", "sitting", "none"),
  "unreal-hand-combat-creature-sit:sit-idle": taxonomy("ground-creature", "生物地面动作", "humanoid-creature", "sitting", "none"),
  "unreal-hand-combat-creature-sit:sit-attack": taxonomy("ground-creature", "生物地面动作", "humanoid-creature", "crawling", "none"),
  "unreal-hand-combat-creature-sit:sit-run": taxonomy("ground-creature", "生物地面动作", "humanoid-creature", "crawling", "none"),
  "unreal-hand-combat-creature-sit:sit-dead": taxonomy("ground-creature", "生物地面动作", "humanoid-creature", "lying", "none"),
  "unreal-weapon-combat-sword-pro:crouch": taxonomy("sword", "剑", "human", "crouching", "sword"),
  "unreal-weapon-combat-pistol:crouch": taxonomy("pistol", "手枪", "human", "crouching", "pistol"),
  "unreal-weapon-combat-pistol:death": taxonomy("pistol", "手枪", "human", "lying", "pistol"),
  "unreal-weapon-combat-grim-reaper:idle": taxonomy("scythe", "镰刀", "monster", "airborne", "scythe"),
  "unreal-weapon-combat-grim-reaper:dead": taxonomy("scythe", "镰刀", "monster", "lying", "scythe"),
  "unreal-weapon-combat-stealth-knife:finisher": taxonomy("dagger", "匕首", "paired", "mixed", "dagger"),
  "unreal-weapon-combat-stealth-knife:drag-body": taxonomy("dagger", "匕首", "paired", "mixed", "dagger"),
  "unreal-weapon-combat-ghost-samurai:jump": taxonomy("bow", "弓箭", "human", "airborne", "bow"),
};

const ACTOR_KIND_LABELS = {
  human: "人形角色",
  "humanoid-creature": "人形生物",
  monster: "怪物",
  paired: "配对角色",
};
const POSTURE_LABELS = {
  standing: "站立",
  crouching: "蹲伏",
  sitting: "坐姿",
  kneeling: "跪姿",
  lying: "躺卧",
  crawling: "爬行",
  airborne: "空中",
  mixed: "综合姿态",
};
const WEAPON_TYPE_LABELS = {
  none: "无武器",
  barehand: "徒手",
  sword: "剑",
  katana: "武士刀",
  rapier: "刺剑",
  spear: "长枪与戟",
  "dual-blade": "双刃",
  bow: "弓箭",
  pistol: "手枪",
  hammer: "重锤",
  scythe: "镰刀",
  dagger: "匕首",
  magic: "法术",
  mixed: "混合武器",
};

function resolveTaxonomy(pack, item) {
  const base = PACK_TAXONOMY[pack.id];
  if (!base) throw new Error(`Missing static taxonomy for pack ${pack.id}`);
  const override = CLIP_TAXONOMY_OVERRIDES[`${pack.id}:${item.key}`];
  const resolved = { ...base, ...override };
  if (!/^[a-z0-9-]+$/.test(resolved.classificationId) || !resolved.classificationLabel) {
    throw new Error(`Invalid classification for ${pack.id}:${item.key}`);
  }
  if (!ACTOR_KIND_LABELS[resolved.actorKind]) throw new Error(`Unknown actor kind ${resolved.actorKind}`);
  if (!POSTURE_LABELS[resolved.posture]) throw new Error(`Unknown posture ${resolved.posture}`);
  if (!WEAPON_TYPE_LABELS[resolved.weaponType]) throw new Error(`Unknown weapon type ${resolved.weaponType}`);
  return {
    ...resolved,
    actorKindLabel: ACTOR_KIND_LABELS[resolved.actorKind],
    postureLabel: POSTURE_LABELS[resolved.posture],
    weaponTypeLabel: WEAPON_TYPE_LABELS[resolved.weaponType],
  };
}

function isCompatibleMannequin(row) {
  const skeleton = String(row.skeleton ?? "").toLowerCase();
  const assetPath = String(row.assetPath ?? "").toLowerCase();
  return skeleton.includes("mannequin") && !skeleton.includes("ghostsamurai_katana") && !assetPath.includes("retargeted");
}

function candidateRank(row) {
  const assetPath = String(row.assetPath ?? "");
  const skeleton = String(row.skeleton ?? "");
  let rank = 10;
  if (assetPath.includes("/Mannequin_UE4/")) rank -= 4;
  if (assetPath.includes("/UE4_Mannequin/")) rank -= 3;
  if (assetPath.includes("/Mannequin/")) rank -= 2;
  if (skeleton.includes("UE4_Mannequin_Skeleton")) rank -= 1;
  return rank;
}

const scan = JSON.parse(fs.readFileSync(scanPath, "utf8"));
const selected = [];
const droppedClips = [];

for (const pack of packs) {
  const group = groups[pack.groupId];
  if (!group) throw new Error(`Unknown group ${pack.groupId}`);
  const usedKeys = new Set();
  for (const item of pack.clips) {
    if (item.actionType !== "idle") {
      if (usedKeys.has(item.dedupeKey)) throw new Error(`Duplicate non-idle key ${pack.id}:${item.dedupeKey}`);
      usedKeys.add(item.dedupeKey);
    }
    const selectionKey = `${pack.id}:${item.key}`;
    if (ROOT_MOTION_TRACK_EXCLUSIONS.has(selectionKey)) {
      droppedClips.push({
        packId: pack.id,
        key: item.key,
        name: item.name,
        actionType: item.actionType,
        sourcePack: pack.sourcePack,
        sourceAssetName: item.sourceAssetName,
        reason: "no-root-translation-in-export-audit",
      });
      continue;
    }
    const sourceAssetNameCandidates = getRootMotionAssetNameCandidates(pack, item);
    const candidates = scan.animations
      .filter((row) => row.groupId === group.sourceGroupId)
      .filter((row) => row.pack === pack.sourcePack)
      .filter((row) => sourceAssetNameCandidates.includes(row.assetName))
      .filter(isCompatibleMannequin)
      .filter(isRootMotionSource)
      .sort((left, right) =>
        sourceAssetNameCandidates.indexOf(left.assetName) - sourceAssetNameCandidates.indexOf(right.assetName) ||
        candidateRank(left) - candidateRank(right) ||
        left.assetPath.localeCompare(right.assetPath),
      );
    if (candidates.length === 0) {
      droppedClips.push({
        packId: pack.id,
        key: item.key,
        name: item.name,
        actionType: item.actionType,
        sourcePack: pack.sourcePack,
        sourceAssetName: item.sourceAssetName,
        reason: "no-root-motion-source",
      });
      continue;
    }
    const row = candidates[0];
    const clipId = `${pack.id}-${item.key}`;
    selected.push({
      id: clipId,
      clipName: `C57_${clipId.replace(/[^a-zA-Z0-9]+/g, "_")}`,
      name: item.name,
      actionType: item.actionType,
      dedupeKey: item.dedupeKey,
      isIdleVariant: item.actionType === "idle",
      groupId: pack.groupId,
      groupLabel: group.label,
      packId: pack.id,
      packLabel: pack.label,
      sourcePack: pack.sourcePack,
      sourceAssetPath: row.assetPath.replace(/\.[^.]+$/, ""),
      sourceAssetName: row.assetName,
      sourceSkeleton: row.skeleton,
      rootMotion: true,
      rootMotionEvidence: getRootMotionEvidence(row),
      sourceDurationSeconds: row.durationSeconds,
      durationSeconds: row.durationSeconds,
      ...resolveTaxonomy(pack, item),
      fbxFileName: `${clipId}.fbx`,
      glbFileName: `${clipId}.glb`,
    });
  }
}

const packIds = new Set(selected.map((item) => item.packId));
if (selected.length === 0) {
  throw new Error("No root-motion assets matched the curated animation catalog");
}
for (const groupId of Object.keys(groups)) {
  if (!selected.some((item) => item.groupId === groupId)) {
    throw new Error(`Root-motion catalog has no selected asset for group ${groupId}`);
  }
}

const payload = {
  schemaVersion: 2,
  project: "Cine57",
  target: "UAL2",
  rootMotionPolicy: "strict-source-marked",
  rule: "Only source-marked root-motion assets may enter Cine57; no InPlace fallback; keep one representative for each available semantic action and require explicit taxonomy metadata for every selected clip.",
  groups,
  packs: packs.filter((pack) => packIds.has(pack.id)).map(({ clips: _clips, ...pack }) => pack),
  clips: selected,
  droppedClips,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`selected ${selected.length} root-motion clips across ${payload.packs.length} packs; dropped ${droppedClips.length} candidates -> ${outputPath}`);
