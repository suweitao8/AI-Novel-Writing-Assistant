// 漫剧美术风格：两层组合体系（2026-08-21 起）。
// 1. 通用美术风格（universal）：所有画面共用的渲染质感基线——UE5 级 3D 写实、电影化光影，
//    不含任何时代/题材属性（现代、末世、玄幻都由具体风格叠加）。系统级设置，存 AppSetting
//    （drama.universalArtStyle），留空用内置默认；设置页「通用画风」可改。
// 2. 具体风格（specific）：题材与氛围叠加层——内置预设（现代都市/末世废土/东方玄幻…）或
//    小说自定义（NovelSettingsWorld.artStylesJson，如 现代↔末世 切换）。只写题材氛围，
//    不写渲染媒介（媒介由通用风格决定），且不得覆盖角色/场景的明确描述。
// 两层组合后注入：镜头首帧图（DramaShotKeyframeService）与角色设计稿/立绘（DramaCharacterImageService），
// 解析入口见 dramaArtStyleResolver.ts。
// 历史注：v1 预设把「渲染媒介」和「时代题材」混在一条里（动漫/写实末日/写实古装…），同一本小说
// 想在 现代↔末世 切换时只能整条换、画质跟着跳；用户 2026-08-21 拆成两层后媒介恒定、题材可切。

/** 通用美术风格：渲染质感基线，不含时代/题材属性。 */
export interface DramaUniversalArtStyle {
  label: string;
  /** 渲染媒介与质感的正向指令（英文，直接拼入图片提示词）。 */
  styleInstructions: string;
  /** 风格禁区（英文，拼入 negative prompt）。 */
  avoidInstructions: string;
  /** 短风格标签（英文大写短语，强化模型对质感基线的识别）。 */
  styleTag: string;
}

export const DEFAULT_UNIVERSAL_ART_STYLE: DramaUniversalArtStyle = {
  label: "通用美术风格（默认）",
  styleInstructions:
    "Create a photorealistic AAA game cinematic 3D render with an Unreal Engine 5 look: physically based materials, realistic skin, hair and fabric detail, cinematic volumetric lighting, filmic color grading, shallow depth of field, and an 8K blockbuster finish. Apply this style only to the rendering medium, materials, lighting, and finish; do not infer or change facial features, ages, genders, body proportions, clothing, props, environments, or backgrounds from the style. Always follow explicit character descriptions, reference images, and scene descriptions; do not override them.",
  avoidInstructions:
    "FORBIDDEN: flat 2D anime, cartoon, illustration, cel shading, painterly rendering. NOT low-poly game asset, NOT plastic toy texture, NOT wax figure. No over-smoothed skin, no HDR overprocessing, no messy ornament overload. No bad anatomy, extra limbs, or mutated hands. No watermarks, signatures, or text overlays.",
  styleTag: "UNREAL ENGINE 5 PHOTOREALISTIC 3D CINEMATIC RENDER",
};

/** 具体风格（题材/氛围叠加层）：内置预设与小说自定义风格的公共形状。 */
export interface DramaSpecificStyle {
  label: string;
  /** 题材氛围指令（英文或中文自定义提示词，直接拼入图片提示词、排在通用风格之后）。 */
  styleInstructions: string;
  /** 风格禁区（英文，拼入 negative prompt），自定义风格可缺省。 */
  avoidInstructions?: string;
  /** 短风格标签（英文大写短语），自定义风格可缺省。 */
  styleTag?: string;
}

export interface DramaVisualStylePreset extends DramaSpecificStyle {
  id: string;
  /** 面向用户的一句话说明（中文），风格选择界面展示。 */
  summary: string;
  styleFamily: "animation" | "live_action";
}

// 具体风格预设：只写题材与氛围，渲染媒介一律交给通用风格；
// 全部预设都必须遵循画面里明确写出的时代/地点/服饰描述，不擅自加料。
export const DRAMA_VISUAL_STYLE_PRESETS: DramaVisualStylePreset[] = [
  {
    id: "realistic",
    label: "现代都市",
    summary: "当代都市与日常生活的氛围，现代服饰、器械与城市场景。",
    styleInstructions:
      "Contemporary modern-day atmosphere: present-day urban and domestic settings, current-era clothing, technology, architecture, and props when the scene calls for them. Keep a clean natural palette and everyday realism. Follow the explicit scene, character, and prop descriptions for the exact location, wardrobe, and technology; do not add futuristic, historical, or fantasy elements unless explicitly described.",
    avoidInstructions:
      "No anachronistic medieval or futuristic elements when the scene is modern. No fantasy creatures, magic effects, or post-apocalyptic decay unless explicitly described. No text, watermarks, or labels.",
    styleTag: "CONTEMPORARY MODERN URBAN SETTING",
    styleFamily: "live_action",
  },
  {
    id: "post_apocalyptic",
    label: "末世废土",
    summary: "文明崩溃后的灰调氛围：尘土、锈蚀、废墟与生存细节。",
    styleInstructions:
      "Post-apocalyptic atmosphere: desaturated muted tones, dusty grays and browns, harsh natural light, weathering, dirt, cracked concrete, rusted metal, peeling paint, overgrown vegetation, and practical survival detail when the scene is set after a collapse. Apply the decay only where the scene context supports it; do not override explicit pre-collapse, modern, ancient, or fantasy details.",
    avoidInstructions:
      "No pristine luxury or glossy high-fashion mood in collapse scenes. Apply dirt and decay only when supported by the scene and character context. No text, watermarks, or labels.",
    styleTag: "POST-APOCALYPTIC DESOLATE MOOD, DESATURATED PALETTE",
    styleFamily: "live_action",
  },
  {
    id: "guoman_fantasy",
    label: "东方玄幻",
    summary: "仙侠玄幻题材氛围：古典服饰、宗门建筑与灵气法术意象。",
    styleInstructions:
      "Eastern fantasy (xianxia / xuanhuan) atmosphere: classical-inspired robes, sect architecture, floating mountains, spirit energy glow, talismans, and mystical phenomena when the story calls for them. Keep the fantasy elements consistent with the described world; do not add sci-fi machinery or Western medieval fantasy armor unless explicitly described.",
    avoidInstructions:
      "No Western medieval knights, sci-fi mechs, or modern urban fixtures in fantasy scenes unless explicitly described. No gaudy ornament overload. No text, watermarks, or labels.",
    styleTag: "EASTERN XIANXIA FANTASY WORLD MOOD",
    styleFamily: "animation",
  },
  {
    id: "modern_eerie",
    label: "现代诡异",
    summary: "现代日常里渗出的诡异不安：病态光线、错位细节与克制的超自然暗示。",
    styleInstructions:
      "Modern eerie horror atmosphere: ordinary present-day settings with subtle wrongness - sickly pale or dim lighting, unsettling color shifts, uncanny stillness, quiet dread, and restrained supernatural hints when the scene calls for them. Keep the eeriness atmospheric and suggestive rather than gory; follow the explicit scene description for what is actually present.",
    avoidInstructions:
      "No excessive gore or shock imagery. No overt monsters or body horror unless explicitly described. No text, watermarks, or labels.",
    styleTag: "MODERN EERIE UNSETTLING ATMOSPHERE, QUIET DREAD",
    styleFamily: "live_action",
  },
  {
    id: "chinese_period_drama",
    label: "古代年代",
    summary: "古代题材氛围：年代相应的建筑、装造、器物与材质。",
    styleInstructions:
      "Ancient Chinese period atmosphere: period-appropriate architecture, interiors, clothing, hairstyles, tools, and materials when the scene is set in a historical era. Follow the explicit scene, character, and prop descriptions for the exact dynasty, wardrobe, and technology; do not add modern objects, footwear, or hairstyles to period scenes unless explicitly described.",
    avoidInstructions:
      "No modern objects, clothing, or hairstyles in period scenes unless explicitly described. No text, watermarks, or labels.",
    styleTag: "ANCIENT CHINESE PERIOD SETTING MOOD",
    styleFamily: "live_action",
  },
  {
    id: "republican_era_drama",
    label: "民国年代",
    summary: "民国氛围： vintage 装束、石库门与旧上海街景、年代材质。",
    styleInstructions:
      "Republican-era Chinese (1920s to 1940s) atmosphere: vintage wardrobe, shikumen houses, old Shanghai streets, period interiors, and practical period materials such as wood, stone, brass, and paper when the scene is set in that era. Follow the explicit scene and character descriptions for the exact era and location; do not add post-1949 or present-day elements unless explicitly described.",
    avoidInstructions:
      "No modern cars, electronics, or contemporary clothing in era scenes unless explicitly described. No text, watermarks, or labels.",
    styleTag: "REPUBLICAN ERA VINTAGE 1920S-1940S MOOD",
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

// 首帧图提示词的风格片段：通用质感基线在前、具体题材氛围在后。
export function buildKeyframeStylePromptLines(
  universal: DramaUniversalArtStyle,
  specific: DramaSpecificStyle | null,
): string[] {
  const tags = [universal.styleTag, specific?.styleTag].filter(Boolean).join(", ");
  return [
    `vertical 9:16 short drama keyframe, single decisive first frame for image-to-video generation, ${tags}`,
    universal.styleInstructions,
    ...(specific ? [specific.styleInstructions] : []),
  ];
}

// 角色设计稿/立绘提示词的风格片段。
export function buildCharacterStylePromptLines(
  universal: DramaUniversalArtStyle,
  specific: DramaSpecificStyle | null,
): string[] {
  const tags = [universal.styleTag, specific?.styleTag].filter(Boolean).join(", ");
  return [
    `${tags}, cinematic quality, 8K detail`,
    universal.styleInstructions,
    ...(specific ? [specific.styleInstructions] : []),
  ];
}

// negative prompt 的风格禁区：通用 + 具体两层合并。
export function combineStyleAvoidInstructions(
  universal: DramaUniversalArtStyle,
  specific: DramaSpecificStyle | null,
): string {
  return [universal.avoidInstructions, specific?.avoidInstructions].filter(Boolean).join(" ");
}
