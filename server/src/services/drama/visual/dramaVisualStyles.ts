// 漫剧美术风格：两层组合体系（2026-08-21 起）。
// 1. 通用画风（universal）：所有画面共用的渲染质感基线——UE5 级 3D 写实、电影化光影，
//    不含任何时代/题材属性（现代、末世、玄幻都由本书画风叠加）。系统级设置，存 AppSetting
//    （drama.universalArtStyle），留空用内置默认；设置页「通用画风」可改。
// 2. 本书画风（specific）：题材与氛围叠加层——内置预设（现代都市/末世废土/东方玄幻…）或
//    小说自定义（NovelSettingsWorld.artStylesJson，如 现代↔末世 切换）。只写题材氛围，
//    不写渲染媒介（媒介由通用画风决定），且不得覆盖角色/场景的明确描述。
// 风格指令自 2026-08-21 起统一用中文书写（用户要求，自定义画风路径本就是中文，
// 分镜/场景描述也是中文，管道已按中文提示词运转）。
// 两层组合后注入：镜头首帧图（DramaShotKeyframeService）与角色设计稿/立绘（DramaCharacterImageService），
// 解析入口见 dramaArtStyleResolver.ts。
// 历史注：v1 预设把「渲染媒介」和「时代题材」混在一条里（动漫/写实末日/写实古装…），同一本小说
// 想在 现代↔末世 切换时只能整条换、画质跟着跳；用户 2026-08-21 拆成两层后媒介恒定、题材可切。

/** 通用画风：渲染质感基线，不含时代/题材属性。 */
export interface DramaUniversalArtStyle {
  label: string;
  /** 面向用户的一句话中文摘要（UI 展示用，不进提示词）。 */
  summary: string;
  /** 渲染媒介与质感的正向指令（中文，直接拼入图片提示词）。 */
  styleInstructions: string;
  /** 风格禁区（中文，拼入 negative prompt）。 */
  avoidInstructions: string;
  /** 短风格标签（中文短语，强化模型对质感基线的识别）。 */
  styleTag: string;
}

export const DEFAULT_UNIVERSAL_ART_STYLE: DramaUniversalArtStyle = {
  label: "通用画风（默认）",
  summary: "3D 写实电影质感：虚幻引擎级材质、电影化光影，全部画面共用",
  styleInstructions:
    "以虚幻引擎5级的写实3D电影渲染呈现：基于物理的材质，真实的皮肤、发丝与织物细节，电影级体积光，胶片感调色，浅景深，8K大片成片质感。此风格只作用于渲染媒介、材质、光照与成片质感；不得据此推断或改变五官、年龄、性别、身材比例、服装、道具、环境或背景。始终遵循明确写出的角色描述、参考图与场景描述，不得覆盖。",
  avoidInstructions:
    "禁止：平面2D动画、卡通、插画、赛璐璐上色、手绘油画风。不要低多边形游戏素材感、塑料玩具质感、蜡像质感。不要过度磨皮、HDR过度处理、堆砌装饰。不要人体结构错误、多肢、畸形手。不要水印、签名或文字。",
  styleTag: "虚幻引擎5级写实3D电影渲染",
};

/** 本书画风（题材/氛围叠加层）：内置预设与小说自定义风格的公共形状。 */
export interface DramaSpecificStyle {
  label: string;
  /** 题材氛围指令（中文，直接拼入图片提示词、排在通用画风之后）。 */
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

// 本书画风预设：只写题材与氛围，渲染媒介一律交给通用画风；
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
    styleInstructions:
      "末世废土氛围：低饱和色调、尘土灰褐、硬朗自然光、风化、污渍、开裂的混凝土、锈蚀金属、剥落的油漆、疯长的植被，以及文明崩溃后场景中的实用生存细节。破败只施加在场景语境支持的地方；不覆盖明确写出的崩溃前、当代或古代细节。",
    avoidInstructions:
      "崩溃场景中不要崭新奢华或光鲜时尚的基调。污渍与破败只在场景与角色语境支持时施加。不要文字、水印或标签。",
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

// —— 脚本画风标记（2026-08-21 用户决定：时代风格可在章节脚本里切换） ——
// 章节脚本的 expectation 文本里以标记行记录画风切换：【画风：末世废土】。
// 语义：标记对后续内容生效（"切换之后后面都用新的"）；本章没有标记则沿用更早章节的
// 最近一次标记（"新章节沿用上一次使用的风格"）；全都没有才回落 小说默认/项目选择。
// 标记里写时代风格名：内置预设用 label（脚本文本要人读），兼容历史存的预设 id。

/** 脚本画风标记行的格式。 */
export const DRAMA_ERA_STYLE_MARKER_PATTERN = /^[ \t]*【画风[：:]\s*([^】]+?)】[ \t]*$/;

/** 从一段脚本文本里取最后一个画风标记（从末往前扫；没有返回 null）。 */
export function extractLastEraStyleMarker(text: string | null | undefined): string | null {
  if (!text) {
    return null;
  }
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = DRAMA_ERA_STYLE_MARKER_PATTERN.exec(lines[i].trim());
    const key = match?.[1].trim();
    if (key) {
      return key;
    }
  }
  return null;
}

/**
 * 时代风格匹配：key 可能是预设 id（defaultArtStyle 历史存法）、预设 label（脚本标记写法）
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

// 首帧图提示词的风格片段：通用质感基线在前、题材氛围在后。
export function buildKeyframeStylePromptLines(
  universal: DramaUniversalArtStyle,
  specific: DramaSpecificStyle | null,
): string[] {
  const tags = [universal.styleTag, specific?.styleTag].filter(Boolean).join("，");
  return [
    `竖屏 9:16 短剧首帧图，作为图生视频的决定性第一帧，${tags}`,
    universal.styleInstructions,
    ...(specific ? [specific.styleInstructions] : []),
  ];
}

// 角色设计稿/立绘提示词的风格片段。
export function buildCharacterStylePromptLines(
  universal: DramaUniversalArtStyle,
  specific: DramaSpecificStyle | null,
): string[] {
  const tags = [universal.styleTag, specific?.styleTag].filter(Boolean).join("，");
  return [
    `${tags}，电影级画质，8K 细节`,
    universal.styleInstructions,
    ...(specific ? [specific.styleInstructions] : []),
  ];
}

// negative prompt 的风格禁区：通用 + 本书画风两层合并。
export function combineStyleAvoidInstructions(
  universal: DramaUniversalArtStyle,
  specific: DramaSpecificStyle | null,
): string {
  return [universal.avoidInstructions, specific?.avoidInstructions].filter(Boolean).join(" ");
}
