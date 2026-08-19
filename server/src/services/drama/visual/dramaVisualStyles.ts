// 漫剧画面风格：从旧项目（mydrama/supertale）移植的风格预设体系。
// 风格只约束「渲染媒介」（线稿/上色/材质/光照/成片质感），不覆盖角色外貌、服装、场景等明确描述；
// 这与旧项目 style_instructions 的设计一致，避免风格预设篡改角色设定。
// 注入点：镜头首帧图（DramaShotKeyframeService）与角色设计稿/立绘（DramaCharacterImageService）。

export interface DramaVisualStylePreset {
  id: string;
  label: string;
  /** 渲染媒介与质感的正向指令（英文，直接拼入图片提示词）。 */
  styleInstructions: string;
  /** 风格禁区（英文，拼入 negative prompt）。 */
  avoidInstructions: string;
  /** 短风格标签（英文大写短语，强化模型对风格族的识别）。 */
  styleTag: string;
  styleFamily: "animation" | "live_action";
}

export const DRAMA_VISUAL_STYLE_PRESETS: DramaVisualStylePreset[] = [
  {
    id: "anime",
    label: "动漫风格",
    styleInstructions: "Create a high-quality stylized 2D anime cel-animation render with crisp medium-weight outlines, flat color fills, controlled two-layer cel shading, clean color separation, and a polished anime production key-frame finish. Apply this style only to the rendering medium, linework, color treatment, shading, and finish; do not infer or change facial features, eye proportions, hairstyles, body proportions, clothing, props, environments, or backgrounds from the style preset. Always follow explicit character descriptions, reference images, and scene descriptions; do not override them with the style preset.",
    avoidInstructions: "FORBIDDEN: photorealistic rendering, 3D CGI, photograph textures. NOT realistic skin pores or film grain. No gradient shading or soft blending - use FLAT cel-shading only. No watermarks, signatures, or text overlays. No bad anatomy, extra limbs, or mutated hands.",
    styleTag: "ANIME",
    styleFamily: "animation",
  },
  {
    id: "guoman_fantasy",
    label: "3D玄幻国漫",
    styleInstructions: "Create a premium stylized 3D Chinese animation render with high-precision PBR materials, refined 3D edge lighting, clean high-definition rendering, and a polished Unreal Engine / Octane-style finish. Apply this style only to the rendering medium, materials, lighting, and finish; do not infer or change faces, ages, genders, body proportions, clothing, accessories, social status, props, environments, or transparency from the style preset. Always follow explicit character descriptions, reference images, and scene descriptions; do not override them with the style preset.",
    avoidInstructions: "FORBIDDEN: live-action photography, Western comic style, flat 2D cel anime, chibi, unintended age drift, influencer face, oily vulgar glamour, cheap web-novel cover look, low-poly game asset, plastic toy texture, wax figure appearance, over-smoothed skin, excessive HDR, messy ornament overload, deformed hands, extra limbs, broken anatomy, text, labels, watermarks.",
    styleTag: "PREMIUM 3D GUOMAN CG",
    styleFamily: "animation",
  },
  {
    id: "realistic",
    label: "写实现代",
    styleInstructions: "Create a live-action image with grounded realism. Use natural lighting and restrained contrast, avoiding glossy fashion-editorial polish. Ensure realistic skin texture with visible pores, subtle imperfections, and no beauty-retouching. Use a natural 50mm cinematic lens feel with moderate depth of field. Keep the final image photographic and human, with subtle film grain and controlled color grading. Follow the beat, scene, character, and prop descriptions for exact era, wardrobe, architecture, technology, and materials.",
    avoidInstructions: "FORBIDDEN: anime, cartoon, illustration, painting styles. NOT CGI or 3D rendered. No plastic skin, wax figure, or mannequin appearance. No AI artifacts, uncanny valley effects, or HDR overprocessing. No extra limbs, mutated hands, or deformed features. No text, watermarks, or labels on image.",
    styleTag: "NATURAL PHOTOREALISTIC, CLEAN GRADE",
    styleFamily: "live_action",
  },
  {
    id: "post_apocalyptic",
    label: "写实末日",
    styleInstructions: "Create a photorealistic live-action film render - not animation, illustration, or CGI. When the scene context calls for a post-apocalyptic setting, use desaturated muted tones, dusty grays and browns, harsh natural light, weathering, dirt, sweat, cracked concrete, rusted metal, peeling paint, overgrown vegetation, and practical survival detail. Follow the scene, character, and prop descriptions for exact character type, era, location, wardrobe, technology, and materials; do not override explicit non-apocalyptic, modern, ancient, foreign, or traversal-story details. Maintain gritty realism with documentary-like authenticity.",
    avoidInstructions: "ABSOLUTELY FORBIDDEN: anime, manga, cartoon, illustrated, or painted styles. NOT CGI, NOT 3D animated. For visible human skin, avoid artificial smoothing; apply dirt and weathering only when supported by the character and scene context. No text, watermarks, or labels on image.",
    styleTag: "DESATURATED GRITTY REALISM, HARSH LIGHT",
    styleFamily: "live_action",
  },
  {
    id: "chinese_period_drama",
    label: "写实古装剧",
    styleInstructions: "Create a live-action Chinese period drama image with grounded historical realism when the scene context calls for a period setting. Use natural lighting appropriate to the time of day with soft realistic falloff and restrained contrast. Ensure realistic skin texture with visible pores, subtle imperfections, and no beauty-retouching. Use a natural 50mm cinematic lens feel with moderate depth of field, not glossy fashion photography. Follow the scene, character, and prop descriptions for exact era, wardrobe, architecture, technology, and materials; do not override explicit modern, foreign, or traversal-story details. Keep color grading restrained and filmic, avoiding poster-like polish or painterly haze.",
    avoidInstructions: "NOT anime, NOT cartoon, NOT illustration. No plastic skin or airbrushed texture. No AI artifacts or oversaturated HDR. No extra limbs, mutated hands, or deformed faces. No text, watermarks, or labels on image.",
    styleTag: "CINEMATIC FILMIC REALISM, WARM SOFT GRADE",
    styleFamily: "live_action",
  },
  {
    id: "republican_era_drama",
    label: "民国年代剧",
    styleInstructions: "Create a live-action Republican-era Chinese drama image with grounded historical realism and a 1920s to 1940s atmosphere when the scene context calls for it. Use natural lighting appropriate to the time of day with soft realistic falloff and restrained contrast. Keep the image photographic and human, with realistic skin texture, visible pores, subtle imperfections, and no beauty-retouching. Use a natural 50mm cinematic lens feel with moderate depth of field. Favor vintage wardrobe, shikumen houses, old Shanghai streets, period interiors, wood, stone, fabric, paper, brass, and practical materials only when they fit the explicit scene. Follow the scene, character, and prop descriptions for exact era, wardrobe, architecture, technology, and materials; do not override explicit modern, ancient, foreign, or traversal-story details. Keep color grading restrained and filmic with a warm neutral palette and subtle film grain.",
    avoidInstructions: "Do not create anime, cartoon, or illustration styles. Never add plastic skin, airbrushed texture, or wax figure appearance. Ensure no AI artifacts, oversaturated colors, or HDR overprocessing. Do not include extra limbs, mutated hands, or deformed faces. No text, watermarks, or labels on image.",
    styleTag: "VINTAGE FADED FILM, WARM NOSTALGIC GRADE",
    styleFamily: "live_action",
  },
];

export const DEFAULT_DRAMA_VISUAL_STYLE_ID = "post_apocalyptic";

export function resolveDramaVisualStyle(styleId: string | null | undefined): DramaVisualStylePreset | null {
  const normalized = styleId?.trim();
  if (!normalized) {
    return null;
  }
  return DRAMA_VISUAL_STYLE_PRESETS.find((preset) => preset.id === normalized) ?? null;
}

// 首帧图提示词的风格片段：风格指令 + 风格标签。
export function buildKeyframeStylePromptLines(style: DramaVisualStylePreset | null): string[] {
  if (!style) {
    return ["vertical 9:16 short drama keyframe, photorealistic cinematic still frame"];
  }
  return [
    `vertical 9:16 short drama keyframe, single decisive first frame for image-to-video generation, ${style.styleTag}`,
    style.styleInstructions,
  ];
}

// 角色设计稿/立绘提示词的风格片段。
export function buildCharacterStylePromptLines(style: DramaVisualStylePreset | null): string[] {
  if (!style) {
    return ["cinematic quality, photorealistic, 8K detail", "Asian face, vertical short drama style, professional costume design"];
  }
  return [
    `${style.styleTag}, cinematic quality, 8K detail`,
    style.styleInstructions,
  ];
}
