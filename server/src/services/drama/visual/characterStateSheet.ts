import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

export const CHARACTER_STATE_VIEW_SPECS = [
  {
    id: "front_portrait",
    label: "正面头像",
    framing: "正面头像：头肩近景，脸部正对镜头，五官和发型清晰可见",
  },
  {
    id: "side_portrait",
    label: "侧面头像",
    framing: "侧面头像：头肩近景，严格 90 度侧脸，侧面轮廓、五官和发型清晰可见",
  },
  {
    id: "front_full_body",
    label: "正面全身",
    framing: "正面全身：正面站立，从头顶到鞋底完整可见，身体比例自然",
  },
  {
    id: "back_full_body",
    label: "背面全身",
    framing: "背面全身：背对镜头站立，从后脑到鞋底完整可见，清楚呈现发型和服装背面",
  },
] as const;

export type CharacterStateViewId = (typeof CHARACTER_STATE_VIEW_SPECS)[number]["id"];

/**
 * Grok Build 的原生图片产物是 1280x720。四视图直接由一次生图生成，
 * 因此这里的模板只描述最终板式，不再把四张独立图片裁切成四栏。
 */
export const CHARACTER_STATE_SHEET_TEMPLATE = {
  size: { width: 1280, height: 720 },
  slots: [
    { id: "front_portrait", x: 0, width: 320 },
    { id: "side_portrait", x: 320, width: 320 },
    { id: "front_full_body", x: 640, width: 320 },
    { id: "back_full_body", x: 960, width: 320 },
  ],
} as const;

export interface CharacterStateSheetPromptInput {
  assetName: string;
  gender?: string | null;
  ageGroup?: string | null;
  appearance?: string | null;
  stateLabel: string;
  stateDescription: string;
  stateImagePrompt: string;
  styleLines?: string[];
  hasReference?: boolean;
}

export interface CharacterStateViewPrompt {
  id: CharacterStateViewId;
  label: string;
  prompt: string;
  negativePrompt: string;
}

export const CHARACTER_STATE_SHEET_NEGATIVE_PROMPT = [
  "multiple people, extra person, duplicate character, duplicate face",
  "environment, room, street, scenery, props, weapons",
  "text, labels, numbers, logo, watermark",
  "cropped body, cropped feet, extra limbs, malformed hands or feet",
  "collage, poster, fashion editorial, real photograph, anime illustration",
  "第二个人、额外人物、多人、重复人物、环境场景、房间、街道、道具堆、文字、标签、水印、裁切身体、多余肢体、畸形手脚",
].join(", ");

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function buildCharacterDataLines(input: CharacterStateSheetPromptInput): string[] {
  return [
    `character: ${clean(input.assetName)}`,
    input.gender ? `gender: ${clean(input.gender)}` : "",
    input.ageGroup ? `age group: ${clean(input.ageGroup)}` : "",
    input.appearance ? `stable appearance and physique: ${clean(input.appearance)}` : "",
    `current state: ${clean(input.stateLabel)}`,
    `state description: ${clean(input.stateDescription)}`,
    `state image prompt: ${clean(input.stateImagePrompt)}`,
  ].filter(Boolean);
}

/**
 * 构建单次生图的完整四视图提示词。
 *
 * 角色状态图不能把「四视图」拆成四次独立生图：那会让模型分别决定
 * 人脸、比例和背景，再由本地裁切器强行拼接，最终只像四张图的拼盘。
 * 这个提示词把板式、视角顺序和身份锁定放在同一个模型请求中。
 */
export function buildCharacterStateSheetPrompt(input: CharacterStateSheetPromptInput): string {
  const styleLines = (input.styleLines ?? []).map(clean).filter(Boolean);
  const referenceLine = input.hasReference
    ? "If a reference image is supplied, use it as the identity anchor; preserve the same face, hair, body proportions and clothing, changing only the state details explicitly described below."
    : "Generate exactly one character from the structured character data below; do not invent another person or narrative subject.";

  return [
    "Create ONE production character reference board, not four separate images and not a poster.",
    "FORMAT AND LAYOUT (HARD CONSTRAINT): one clean 16:9 image with four equal-width vertical panels arranged left to right, separated only by subtle equal gutters; each panel contains exactly one view.",
    "PANEL 1 — FRONT FACE CLOSE-UP: head and shoulders, face looking straight at the camera, clear facial structure and hairstyle.",
    "PANEL 2 — EXACT 90-DEGREE SIDE FACE CLOSE-UP: head and shoulders, profile looking to the right, clear nose, jawline, ear and hair silhouette.",
    "PANEL 3 — FRONT FULL BODY: the same person facing the camera in a neutral standing pose, complete figure from the top of the head through both shoes, never cropped.",
    "PANEL 4 — BACK FULL BODY: the same person facing away in the same neutral standing pose, complete figure from the back of the head through both shoes, clearly showing the back of the hair and clothing.",
    "The four panels are the required four views in this exact order: front face, side face, front full body, back full body.",
    "IDENTITY LOCK (CRITICAL): all four panels must show the same single person, same face structure, hairline, hairstyle, hair volume, skin tone, age impression, clothing, colors, body proportions and lighting; only the camera angle and framing change.",
    referenceLine,
    "角色四视图必须是单一生产参考板；不添加环境故事或其他人物。",
    "CHARACTER DATA (follow this over any generic visual assumption):",
    ...buildCharacterDataLines(input),
    styleLines.length > 0 ? "PROJECT RENDERING DIRECTION:" : "",
    ...styleLines,
    "RENDERING: high-budget Unreal Engine 5 cinematic game character asset, sculpted digital-human materials, detailed skin, hair and fabric, controlled neutral turntable lighting, premium Chinese fantasy game production quality; use the style direction only for rendering medium, materials and light, never to change the explicit character data.",
    "Legacy medium words inside the character data, such as 写实动漫风格, are metadata only; they must not turn this production board into a flat illustration, anime image, real photograph or fashion portrait.",
    "BACKGROUND: one plain light-grey or white production-board background across all four panels; no scenery, room, street, furniture, floor props, weapons, effects or narrative environment.",
    "Do not put more than one view in any panel. Do not merge the face panels. Do not add panel labels, numbers or text.",
    `AVOID: ${CHARACTER_STATE_SHEET_NEGATIVE_PROMPT}`,
  ].filter(Boolean).join("\n");
}

export function buildCharacterStateViewPrompts(
  input: CharacterStateSheetPromptInput,
): CharacterStateViewPrompt[] {
  const effectiveStyleLines = (input.styleLines ?? []).map(clean).filter(Boolean);
  const identityLines = [
    `角色：${clean(input.assetName)}`,
    input.gender ? `性别：${clean(input.gender)}` : "",
    input.ageGroup ? `年龄段：${clean(input.ageGroup)}` : "",
    input.appearance ? `稳定外貌与体型：${clean(input.appearance)}` : "",
    `当前状态：${clean(input.stateLabel)}`,
    `状态变化：${clean(input.stateDescription)}`,
    `当前状态图片提示词：${clean(input.stateImagePrompt)}`,
  ].filter(Boolean);
  const referenceLine = input.hasReference
    ? "使用提供的角色状态参考图锁定同一张脸、发型、体型和服装，只改变当前状态明确写出的变化。"
    : "只根据以上结构化角色资料生成，不添加环境故事或其他人物。";
  const common = [
    "专业角色四视图设计参考图中的单个视图",
    "纯白或浅灰色游戏资产展示板背景，统一中性转台光，无摄影棚布景、无房间、无街道、无相机写真感",
    "同一个角色、同一张脸、同一套服装、同一发型、同一体型比例",
    referenceLine,
    "统一影视化游戏美术方向优先：角色、场景、道具都必须呈现虚幻引擎5级高预算游戏过场的高模CG材质与电影级光影；角色资产采用经过数字雕刻的游戏角色模型和高预算动作游戏的影视化3D数字人设定稿质感，整体渲染参考《黑神话：悟空》《凡人修仙传》这类高预算东方游戏和影视美术，只参考数字雕刻、材质、光影和镜头质感，不复制具体角色、服饰或场景；角色资料中的旧风格词只补充人物内容，不得把成片改成平面动漫、插画、真人摄影、摄影棚模特、证件照或普通照片",
    ...identityLines,
    ...effectiveStyleLines,
    "最终渲染优先级：先执行虚幻引擎5高模CG游戏资产与电影级光影方向，再执行人物资料中的外貌、年龄、体型、服装和状态内容；资料中的旧媒介词不改变渲染方式",
    "画面干净，主体居中，不能出现文字、标签或水印",
  ];

  return CHARACTER_STATE_VIEW_SPECS.map((view) => ({
    id: view.id,
    label: view.label,
    prompt: [...common, view.framing].join("，"),
    negativePrompt: CHARACTER_STATE_SHEET_NEGATIVE_PROMPT,
  }));
}

export async function composeCharacterStateSheet(input: {
  viewPaths: Partial<Record<CharacterStateViewId, string>>;
  outputPath: string;
}): Promise<void> {
  // 仅保留给旧调用方/测试；角色状态主链路使用 buildCharacterStateSheetPrompt
  // 直接生成整张板，不再调用这个四张图拼接器。
  const layers: sharp.OverlayOptions[] = [];
  for (const slot of CHARACTER_STATE_SHEET_TEMPLATE.slots) {
    const sourcePath = input.viewPaths[slot.id as CharacterStateViewId];
    if (!sourcePath) {
      throw new Error(`角色四视图缺少图片：${slot.id}`);
    }
    await fs.access(sourcePath);
    const view = await sharp(sourcePath)
      .rotate()
      .resize({
        width: slot.width,
        height: CHARACTER_STATE_SHEET_TEMPLATE.size.height,
        fit: "cover",
        position: "centre",
      })
      .png()
      .toBuffer();
    layers.push({ input: view, left: slot.x, top: 0 });
  }

  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await sharp({
    create: {
      width: CHARACTER_STATE_SHEET_TEMPLATE.size.width,
      height: CHARACTER_STATE_SHEET_TEMPLATE.size.height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(layers)
    .png()
    .toFile(input.outputPath);
}
