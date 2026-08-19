/**
 * 画面风格（Visual Style Preset）
 *
 * 搬移自旧项目 mydrama 的 visual style preset 体系（src/novelvideo/styles/presets）。
 * 核心设计约束（必须长期保持，详见 docs/wiki/architecture/visual-style-presets.md）：
 * 1. 风格预设只描述「媒介 + 渲染质感 + 镜头感 + 调色」，不描述故事内容。
 * 2. 具体年代、地点、服装、建筑、道具、人物长相一律来自角色/场景/分镜描述，风格预设不得覆盖。
 * 3. styleTag 是拼在每张图 prompt 附近的高信号锚点，只允许媒介/质感词，
 *    禁止年代/内容词（PERIOD、ERA、民国、古装等），否则会隐蔽覆盖正文与设定。
 */

export type VisualStyleFamily = "live_action" | "animation";
export type VisualStyleAnimationSubtype = "2d" | "3d" | "hybrid";
/** builtin = 代码内置预设（只读）；manual = 手动创建；analyzed = 参考图自动分析生成 */
export type VisualStyleOrigin = "builtin" | "manual" | "analyzed";

export interface VisualStylePreset {
  /** 稳定标识（内置预设沿用 mydrama 的 id，如 guoman_fantasy） */
  key: string;
  /** 英文名（保留 mydrama 原值，便于溯源） */
  name: string;
  /** 面向用户的中文标签 */
  label: string;
  /** 渲染方式与质感说明（正提示词） */
  styleInstructions: string;
  /** 媒介与质量守护（负提示词，FORBIDDEN 风格） */
  avoidInstructions: string;
  /** 拼入每张图 prompt 的短锚点，只允许媒介/质感词 */
  styleTag: string;
  styleFamily: VisualStyleFamily;
  animationSubtype?: VisualStyleAnimationSubtype;
  origin: VisualStyleOrigin;
}

/** 列表/选择器使用的摘要 DTO */
export interface VisualStyleSummary {
  /** 自定义风格的数据库 id；内置预设为 null */
  id: string | null;
  key: string;
  label: string;
  name: string | null;
  styleFamily: VisualStyleFamily;
  animationSubtype: VisualStyleAnimationSubtype | null;
  origin: VisualStyleOrigin;
  isPreset: boolean;
}

/** 风格详情（含完整提示词字段；id 为自定义风格的数据库 id，内置预设为 null） */
export type VisualStyleDetail = VisualStylePreset & { id: string | null };

/** 参考图风格分析（visual_style.analyze）的结构化输出 */
export interface VisualStyleAnalysisDraft {
  styleInstructions: string;
  avoidInstructions: string;
  styleTag: string;
  suggestedName: string;
  suggestedLabel: string;
}

export const VISUAL_STYLE_FAMILY_LABELS: Record<VisualStyleFamily, string> = {
  live_action: "真人写实",
  animation: "动画",
};

export const VISUAL_STYLE_ANIMATION_SUBTYPE_LABELS: Record<VisualStyleAnimationSubtype, string> = {
  "2d": "2D",
  "3d": "3D",
  hybrid: "混合媒介",
};

export function formatVisualStyleFamilyLabel(
  family: VisualStyleFamily,
  subtype?: VisualStyleAnimationSubtype | null,
): string {
  const base = VISUAL_STYLE_FAMILY_LABELS[family] ?? family;
  if (family === "animation" && subtype) {
    return `${base} · ${VISUAL_STYLE_ANIMATION_SUBTYPE_LABELS[subtype] ?? subtype.toUpperCase()}`;
  }
  return base;
}

/**
 * styleTag 禁用词：这些词描述年代/内容而非媒介质感，
 * 出现在每张图都注入的锚点里会静默覆盖正文设定（mydrama 的 covert-injection 教训）。
 */
export const VISUAL_STYLE_TAG_FORBIDDEN_WORDS = [
  "PERIOD",
  "REPUBLICAN",
  "ERA",
  "DYNASTY",
  "MODERN",
  "ANCIENT",
  "DRAMA",
  "民国",
  "古装",
  "年代",
] as const;

/** 校验 styleTag 不含年代/内容词；返回命中的禁用词列表（空数组 = 合规） */
export function findVisualStyleTagForbiddenWords(styleTag: string): string[] {
  const normalized = (styleTag || "").toUpperCase();
  return VISUAL_STYLE_TAG_FORBIDDEN_WORDS.filter((word) => {
    if (/[\u4e00-\u9fff]/.test(word)) {
      return styleTag.includes(word);
    }
    return normalized.includes(word);
  });
}

/** 内置画面风格预设（与 mydrama styles/presets/*.json 一一对应，内容忠实搬移） */
export const VISUAL_STYLE_PRESETS: VisualStylePreset[] = [
  {
    key: "guoman_fantasy",
    name: "3D Xianxia Guoman",
    label: "3D玄幻国漫",
    styleInstructions:
      "Create a premium stylized 3D Chinese animation render with high-precision PBR materials, refined 3D edge lighting, clean high-definition rendering, and a polished Unreal Engine / Octane-style finish. Apply this style only to the rendering medium, materials, lighting, and finish; do not infer or change faces, ages, genders, body proportions, clothing, accessories, social status, props, environments, or transparency from the style preset. Always follow explicit character descriptions, reference images, beat, scene, and prop descriptions; do not override them with the style preset.",
    avoidInstructions:
      "FORBIDDEN: live-action photography, Western comic style, flat 2D cel anime, chibi, unintended age drift, influencer face, oily vulgar glamour, cheap web-novel cover look, low-poly game asset, plastic toy texture, wax figure appearance, over-smoothed skin, excessive HDR, messy ornament overload, deformed hands, extra limbs, broken anatomy, text, labels, watermarks.",
    styleTag: "PREMIUM 3D GUOMAN CG",
    styleFamily: "animation",
    animationSubtype: "3d",
    origin: "builtin",
  },
  {
    key: "anime",
    name: "Anime Style",
    label: "动漫风格",
    styleInstructions:
      "Create a high-quality stylized 2D anime cel-animation render with crisp medium-weight outlines, flat color fills, controlled two-layer cel shading, clean color separation, and a polished anime production key-frame finish. Apply this style only to the rendering medium, linework, color treatment, shading, and finish; do not infer or change facial features, eye proportions, hairstyles, body proportions, clothing, props, environments, or backgrounds from the style preset. Always follow explicit character descriptions, reference images, beat, scene, and prop descriptions; do not override them with the style preset.",
    avoidInstructions:
      "FORBIDDEN: photorealistic rendering, 3D CGI, photograph textures. NOT realistic skin pores or film grain. No gradient shading or soft blending — use FLAT cel-shading only. No watermarks, signatures, or text overlays. No bad anatomy, extra limbs, or mutated hands.",
    styleTag: "ANIME",
    styleFamily: "animation",
    animationSubtype: "2d",
    origin: "builtin",
  },
  {
    key: "realistic",
    name: "Realistic Modern",
    label: "写实现代",
    styleInstructions:
      "Create a live-action image with grounded realism. Use natural lighting and restrained contrast, avoiding glossy fashion-editorial polish. Ensure realistic skin texture with visible pores, subtle imperfections, and no beauty-retouching. Use a natural 50mm cinematic lens feel with moderate depth of field. Keep the final image photographic and human, with subtle film grain and controlled color grading. Follow the beat, scene, character, and prop descriptions for exact era, wardrobe, architecture, technology, and materials.",
    avoidInstructions:
      "FORBIDDEN: anime, cartoon, illustration, painting styles. NOT CGI or 3D rendered. No plastic skin, wax figure, or mannequin appearance. No AI artifacts, uncanny valley effects, or HDR overprocessing. No extra limbs, mutated hands, or deformed features. No text, watermarks, or labels on image.",
    styleTag: "NATURAL PHOTOREALISTIC, CLEAN GRADE",
    styleFamily: "live_action",
    origin: "builtin",
  },
  {
    key: "chinese_period_drama",
    name: "Chinese Period Drama",
    label: "写实古装剧",
    styleInstructions:
      "Create a live-action Chinese period drama image with grounded historical realism when the beat or scene context calls for a period setting. Use natural lighting appropriate to the time of day with soft realistic falloff and restrained contrast. Ensure realistic skin texture with visible pores, subtle imperfections, and no beauty-retouching. Use a natural 50mm cinematic lens feel with moderate depth of field, not glossy fashion photography. Follow the beat, scene, character, and prop descriptions for exact era, wardrobe, architecture, technology, and materials; do not override explicit modern, foreign, or traversal-story details. Keep color grading restrained and filmic, avoiding poster-like polish or painterly haze.",
    avoidInstructions:
      "NOT anime, NOT cartoon, NOT illustration. No plastic skin or airbrushed texture. No AI artifacts or oversaturated HDR. No extra limbs, mutated hands, or deformed faces. No text, watermarks, or labels on image.",
    styleTag: "CINEMATIC FILMIC REALISM, WARM SOFT GRADE",
    styleFamily: "live_action",
    origin: "builtin",
  },
  {
    key: "republican_era_drama",
    name: "Republican Era Drama",
    label: "民国年代剧",
    styleInstructions:
      "Create a live-action Republican-era Chinese drama image with grounded historical realism and a 1920s to 1940s atmosphere when the beat or scene context calls for it. Use natural lighting appropriate to the time of day with soft realistic falloff and restrained contrast. Keep the image photographic and human, with realistic skin texture, visible pores, subtle imperfections, and no beauty-retouching. Use a natural 50mm cinematic lens feel with moderate depth of field. Favor vintage wardrobe, shikumen houses, old Shanghai streets, period interiors, wood, stone, fabric, paper, brass, and practical materials only when they fit the explicit scene. Follow the beat, scene, character, and prop descriptions for exact era, wardrobe, architecture, technology, and materials; do not override explicit modern, ancient, foreign, or traversal-story details. Keep color grading restrained and filmic with a warm neutral palette and subtle film grain.",
    avoidInstructions:
      "Do not create anime, cartoon, or illustration styles. Never add plastic skin, airbrushed texture, or wax figure appearance. Ensure no AI artifacts, oversaturated colors, or HDR overprocessing. Do not include extra limbs, mutated hands, or deformed faces. No text, watermarks, or labels on image.",
    styleTag: "VINTAGE FADED FILM, WARM NOSTALGIC GRADE",
    styleFamily: "live_action",
    origin: "builtin",
  },
  {
    key: "post_apocalyptic",
    name: "Post-Apocalyptic",
    label: "写实末日风格",
    styleInstructions:
      "Create a photorealistic live-action film render — not animation, illustration, or CGI. When the beat or scene context calls for a post-apocalyptic setting, use desaturated muted tones, dusty grays and browns, harsh natural light, weathering, dirt, sweat, cracked concrete, rusted metal, peeling paint, overgrown vegetation, and practical survival detail. Follow the beat, scene, character, and prop descriptions for exact character type, era, location, wardrobe, technology, and materials; do not override explicit non-apocalyptic, modern, ancient, foreign, traversal-story, or non-human details. Maintain gritty realism with documentary-like authenticity.",
    avoidInstructions:
      "ABSOLUTELY FORBIDDEN: anime, manga, cartoon, illustrated, or painted styles. NOT CGI, NOT 3D animated. For visible human skin, avoid artificial smoothing; apply dirt and weathering only when supported by the character and scene context. No text, watermarks, or labels on image.",
    styleTag: "DESATURATED GRITTY REALISM, HARSH LIGHT",
    styleFamily: "live_action",
    origin: "builtin",
  },
];

export function getBuiltinVisualStyle(key: string | null | undefined): VisualStylePreset | null {
  if (!key) return null;
  return VISUAL_STYLE_PRESETS.find((preset) => preset.key === key) ?? null;
}

/**
 * 把画面风格渲染为统一的 prompt 片段，供各图像生成链路注入。
 * 片段只包含媒介/质感约束，并显式声明「不得覆盖角色/场景/分镜的具体描述」。
 */
export function buildVisualStylePromptText(style: VisualStylePreset): string {
  const lines = [
    `[VISUAL STYLE: ${style.label} (${style.key})]`,
    `STYLE ANCHOR: ${style.styleTag}`,
    `RENDERING: ${style.styleInstructions}`,
    `STYLE GUARDS: ${style.avoidInstructions}`,
  ];
  if (style.styleFamily === "animation" && style.animationSubtype) {
    lines.push(`MEDIUM: ${style.animationSubtype.toUpperCase()} ANIMATION`);
  }
  return lines.join("\n");
}
