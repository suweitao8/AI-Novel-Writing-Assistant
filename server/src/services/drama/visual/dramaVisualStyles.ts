// 漫剧美术风格：资产类别层 + 本书题材层（2026-08-22 起）。
// 1. 资产类别层（character/scene/prop）：分别负责角色、场景、道具的固定参考图规格、
//    渲染质感和类别专属禁区。固定规格只进入对应资产图，不进入分镜首帧图。
// 2. 本书画风（specific）：题材与氛围叠加层——内置预设（现代都市/末世废土/东方玄幻…）或
//    小说自定义（NovelSettingsWorld.artStylesJson，如 现代↔末世 切换）。只写题材氛围，
//    排在资产类别层之后，且不得覆盖角色/场景/道具的明确描述。
// 风格指令自 2026-08-21 起统一用中文书写（用户要求，自定义画风路径本就是中文，
// 分镜/场景描述也是中文，管道已按中文提示词运转）。
// 资产图、状态图和镜头首帧图都通过 dramaArtStyleResolver.ts 解析后注入。
// 历史注：v1 预设把「渲染媒介」和「时代题材」混在一条里（动漫/写实末日/写实古装…），同一本小说
// 想在 现代↔末世 切换时只能整条换、画质跟着跳；现在三类资产各自保持媒介与规格稳定、题材可切。

/** 资产画风类别的稳定顺序，同时也是设置页三张卡片的展示顺序。 */
export const DRAMA_ASSET_STYLE_KINDS = ["character", "scene", "prop"] as const;

export type DramaAssetStyleKind = (typeof DRAMA_ASSET_STYLE_KINDS)[number];

/** 角色、场景、道具各自的固定规格与渲染质感。 */
export interface DramaAssetVisualStyle {
  kind: DramaAssetStyleKind;
  label: string;
  /** 面向用户的一句话中文摘要（UI 展示用，不进提示词）。 */
  summary: string;
  /** 资产参考图必须遵守的固定规格（只进入资产图和状态图）。 */
  formatInstructions: string;
  /** 当前类别可编辑的正向渲染质感指令（中文，直接拼入图片提示词）。 */
  styleInstructions: string;
  /** 当前类别固定的风格禁区（中文，拼入 negative prompt，不在 UI 中编辑）。 */
  avoidInstructions: string;
  /** 短风格标签（中文短语，强化模型对质感基线的识别）。 */
  styleTag: string;
}

export const DEFAULT_DRAMA_ASSET_STYLES: Record<DramaAssetStyleKind, DramaAssetVisualStyle> = {
  character: {
    kind: "character",
    label: "角色画风",
    summary: "角色资产采用统一的横向四视图设计稿，保持人物造型连续",
    formatInstructions:
      "固定输出横向角色四视图设计稿：同一角色依次展示头部正面、头部侧面、全身正面、全身背面，四个视图保持比例、服装、发型和配饰一致，使用中性浅灰展示背景与统一光线。",
    styleInstructions:
      "影视化三维游戏美术质感：高精度数字雕刻、真实材质、细腻皮肤发丝织物和金属细节、电影级轮廓光与体积光、自然阴影、克制景深、统一色彩与高画质成片。",
    avoidInstructions:
      "禁止：平面2D动画、卡通、插画、赛璐璐上色、手绘油画风；不要真人摄影、证件照、商品目录；不要人体结构错误、多肢、畸形手、视图之间造型不一致；不要水印、签名或文字。",
    styleTag: "角色资产影视化三维游戏渲染，电影级材质质感",
  },
  scene: {
    kind: "scene",
    label: "场景画风",
    summary: "场景资产采用覆盖完整空间的横向 360° 全景图",
    formatInstructions:
      "固定输出横向 360° 场景全景图：完整覆盖空间前方、左右两侧、后方与地平线，保持地面、墙面、天花和光照连续，不出现人物主体，不裁切关键环境信息。",
    styleInstructions:
      "影视化三维场景美术质感：高精度环境建模、真实材质与空间层次、清晰的建筑和自然细节、电影级光照与阴影、自然的大气透视、统一色彩和高画质全景成片。",
    avoidInstructions:
      "禁止：平面2D动画、卡通、插画、赛璐璐上色、手绘油画风；不要摄影照片拼接感、低多边形素材感、塑料或蜡质表面、空间断裂、重复接缝、裁切环境；不要水印、签名或文字。",
    styleTag: "场景资产影视化三维环境渲染，连续全景空间质感",
  },
  prop: {
    kind: "prop",
    label: "道具画风",
    summary: "道具资产采用单件居中的横向 45° 三点透视图",
    formatInstructions:
      "固定输出横向单件道具 45° 三点透视图：道具居中且完整可见，展示正面、侧面和顶部关系，保持比例、材质和结构清晰，使用中性背景与统一光线，不叠加人物或场景陈列。",
    styleInstructions:
      "影视化三维道具美术质感：高精度硬表面或软材质建模、真实材质细节、清晰结构与磨损层次、电影级轮廓光和柔和阴影、克制反射、统一色彩与高画质资产展示成片。",
    avoidInstructions:
      "禁止：平面2D动画、卡通、插画、赛璐璐上色、手绘油画风；不要商品目录或普通产品摄影感、低多边形素材感、塑料或蜡质表面、结构模糊、重复道具、杂乱陈列；不要水印、签名或文字。",
    styleTag: "道具资产影视化三维渲染，电影级材质与结构质感",
  },
};

/** 本书画风（题材/氛围叠加层）：内置预设与小说自定义风格的公共形状。 */
export interface DramaSpecificStyle {
  label: string;
  /** 题材氛围指令（中文，直接拼入图片提示词、排在资产画风之后）。 */
  styleInstructions: string;
  /** 风格禁区（中文，拼入 negative prompt），自定义风格可缺省。 */
  avoidInstructions?: string;
  /** 短风格标签（中文短语），自定义风格可缺省。 */
  styleTag?: string;
}

export interface DramaVisualStylePreset extends DramaSpecificStyle {
  id: string;
  /** 面向用户的一句话说明（中文），风格选择界面展示。 */
  summary: string;
  styleFamily: "animation" | "live_action";
}

// 本书画风预设：只写题材与氛围，渲染媒介一律交给资产类别层；
// 全部预设都必须遵循画面里明确写出的时代/地点/服饰描述，不擅自加料。
export const DRAMA_VISUAL_STYLE_PRESETS: DramaVisualStylePreset[] = [
  {
    id: "realistic",
    label: "现代都市",
    summary: "当代都市与日常生活的氛围，现代服饰、器械与城市场景。",
    styleInstructions:
      "当代现代都市氛围：现当代的城市与居家场景，按场景需要出现当代服饰、科技、建筑与器物。保持干净自然的色彩与日常真实感。地点、着装与技术细节一律遵循明确写出的场景、角色与道具描述；除非明确描述，不添加未来、历史或奇幻元素。",
    avoidInstructions:
      "现代场景中不要出现穿越感的中世纪或未来元素。除非明确描述，不出现奇幻生物、法术特效或末日破败。不要文字、水印或标签。",
    styleTag: "当代现代都市背景",
    styleFamily: "live_action",
  },
  {
    id: "post_apocalyptic",
    label: "末世废土",
    summary: "文明崩溃后的灰调氛围：尘土、锈蚀、废墟与生存细节。",
    // 破败脏旧只施加在场景与道具等环境上（2026-08-23 拆分）：污渍/血渍这类词是通用的
    // 角色状态属性（「身上状态」标签/状态描写），跟着外观状态走。预设文本会原样进
    // 角色/场景/道具/分镜提示词——提示词里连「污渍/血渍/尘土」这些词都不出现
    // （同日用户复核要求），避免负面枚举反被模型当成画面指令。
    styleInstructions:
      "末世废土氛围：低饱和灰褐色调、硬朗自然光；风化、开裂的混凝土、锈蚀金属、剥落的油漆、疯长的植被与文明崩溃后的实用生存细节只施加在场景与道具等环境上；角色的服装与身体状态一律以角色资料与当前状态描写为准，本风格不改变角色的干净程度与身体状况。不覆盖明确写出的崩溃前、当代或古代细节。",
    avoidInstructions:
      "崩溃场景中不要崭新奢华或光鲜时尚的基调。角色的服装与身体状态以角色资料与状态描写为准，不因本风格自行改变。不要文字、水印或标签。",
    styleTag: "末世荒凉氛围，低饱和色调",
    styleFamily: "live_action",
  },
  {
    id: "guoman_fantasy",
    label: "东方玄幻",
    summary: "仙侠玄幻题材氛围：古典服饰、宗门建筑与灵气法术意象。",
    styleInstructions:
      "东方玄幻（仙侠/玄幻）氛围：按剧情需要出现古典风袍服、宗门建筑、浮空山、灵气光效、符箓与玄妙异象。奇幻元素与所描述的世界观保持一致；除非明确描述，不添加科幻机械或西方中世纪板甲。",
    avoidInstructions:
      "奇幻场景中除非明确描述，不出现西方中世纪骑士、科幻机甲或当代都市设施。不要俗艳的堆砌装饰。不要文字、水印或标签。",
    styleTag: "东方仙侠玄幻世界氛围",
    styleFamily: "animation",
  },
  {
    id: "modern_eerie",
    label: "现代诡异",
    summary: "现代日常里渗出的诡异不安：病态光线、错位细节与克制的超自然暗示。",
    styleInstructions:
      "现代诡异惊悚氛围：寻常的现当代场景渗出微妙的不对劲——病态苍白或昏暗的光线、令人不安的色偏、诡异的静止、安静的恐惧感，以及按剧情需要的克制超自然暗示。诡异保持氛围性与暗示性而非血腥；实际出现什么以明确写出的场景描述为准。",
    avoidInstructions:
      "不要过量的血腥或冲击性画面。除非明确描述，不出现直白的怪物或肢体恐怖。不要文字、水印或标签。",
    styleTag: "现代诡异不安氛围，静默恐惧",
    styleFamily: "live_action",
  },
  {
    id: "chinese_period_drama",
    label: "古代年代",
    summary: "古代题材氛围：年代相应的建筑、装造、器物与材质。",
    styleInstructions:
      "中国古代年代氛围：历史时代场景中年代相应的建筑、室内、服饰、发型、工具与材质。朝代、着装与技术细节一律遵循明确写出的场景、角色与道具描述；除非明确描述，不给年代场景添加当代物件、鞋履或发型。",
    avoidInstructions:
      "年代场景中除非明确描述，不出现当代物件、服装或发型。不要文字、水印或标签。",
    styleTag: "中国古代年代背景氛围",
    styleFamily: "live_action",
  },
  {
    id: "republican_era_drama",
    label: "民国年代",
    summary: "民国氛围：复古装束、石库门与旧上海街景、年代材质。",
    styleInstructions:
      "民国（1920至1940年代）氛围：按场景需要出现复古着装、石库门民居、老上海街景、年代室内，以及木、石、黄铜、纸张等年代材质。确切年代与地点遵循明确写出的场景与角色描述；除非明确描述，不添加1949年后或当代元素。",
    avoidInstructions:
      "年代场景中除非明确描述，不出现当代汽车、电子产品或流行服装。不要文字、水印或标签。",
    styleTag: "民国复古1920-1940年代氛围",
    styleFamily: "live_action",
  },
];

export const DEFAULT_DRAMA_VISUAL_STYLE_ID = "realistic";

export function resolveDramaVisualStyle(styleId: string | null | undefined): DramaVisualStylePreset | null {
  const normalized = styleId?.trim();
  if (!normalized) {
    return null;
  }
  return DRAMA_VISUAL_STYLE_PRESETS.find((preset) => preset.id === normalized) ?? null;
}

// 脚本画风标记层已移除（2026-08-23 用户决定：时代风格由资产状态自带，脚本不定义章节画风）。
// 历史【画风：…】行不再参与任何解析，脚本文档按未知标记原样保留为文本。

/**
 * 时代风格匹配：key 可能是预设 id（defaultArtStyle 历史存法）、预设 label
 * 或自定义风格名。找不到（悬空引用）返回 null，由调用方回落。
 */
export function matchDramaEraStyle(
  key: string | null | undefined,
  customs: DramaSpecificStyle[],
): DramaSpecificStyle | null {
  const normalized = key?.trim();
  if (!normalized) {
    return null;
  }
  const preset = resolveDramaVisualStyle(normalized)
    ?? DRAMA_VISUAL_STYLE_PRESETS.find((candidate) => candidate.label === normalized)
    ?? null;
  if (preset) {
    return preset;
  }
  const custom = customs.find((style) => style.label === normalized);
  return custom && custom.styleInstructions ? custom : null;
}

/** 资产图/状态图的风格片段：固定规格、资产标签、资产正向画风、题材氛围。 */
export function buildAssetStylePromptLines(
  kind: DramaAssetStyleKind,
  asset: DramaAssetVisualStyle,
  specific: DramaSpecificStyle | null,
): string[] {
  const tags = [asset.styleTag, specific?.styleTag].filter(Boolean).join("，");
  const label = asset.kind === kind ? asset.label : `${asset.label}（${kind}）`;
  return [
    `资产类型：${label}。${asset.formatInstructions} ${tags}`.trim(),
    asset.styleInstructions,
    ...(specific?.styleInstructions ? [specific.styleInstructions] : []),
  ];
}

/** 分镜首帧的风格片段：只取镜头实际使用的资产类别，不带资产参考图固定规格。 */
export function buildShotStylePromptLines(
  styles: Record<DramaAssetStyleKind, DramaAssetVisualStyle>,
  usedKinds: readonly DramaAssetStyleKind[],
  specific: DramaSpecificStyle | null,
): string[] {
  const kinds = DRAMA_ASSET_STYLE_KINDS.filter((kind) => usedKinds.includes(kind));
  const assets = kinds.map((kind) => styles[kind]);
  const tags = [...assets.map((asset) => asset.styleTag), specific?.styleTag].filter(Boolean).join("，");
  return [
    tags
      ? `横屏影视化分镜首帧图（横屏 16:9 电影构图），作为图生视频的决定性第一帧，${tags}`
      : "横屏影视化分镜首帧图（横屏 16:9 电影构图），作为图生视频的决定性第一帧",
    ...assets.map((asset) => asset.styleInstructions),
    ...(specific?.styleInstructions ? [specific.styleInstructions] : []),
  ];
}

/** 单个资产图/状态图的风格禁区：资产类别固定约束 + 本书画风约束。 */
export function combineAssetStyleAvoidInstructions(
  asset: DramaAssetVisualStyle,
  specific: DramaSpecificStyle | null,
): string {
  return [asset.avoidInstructions, specific?.avoidInstructions].filter(Boolean).join(" ");
}

/** 多类资产同时进入分镜时合并对应禁区，避免不相关类别的约束污染首帧。 */
export function combineShotStyleAvoidInstructions(
  styles: Record<DramaAssetStyleKind, DramaAssetVisualStyle>,
  usedKinds: readonly DramaAssetStyleKind[],
  specific: DramaSpecificStyle | null,
): string {
  const kinds = DRAMA_ASSET_STYLE_KINDS.filter((kind) => usedKinds.includes(kind));
  return [
    ...kinds.map((kind) => styles[kind].avoidInstructions),
    specific?.avoidInstructions,
  ]
    .filter(Boolean)
    .join(" ");
}
