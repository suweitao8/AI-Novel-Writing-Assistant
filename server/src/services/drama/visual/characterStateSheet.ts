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
    id: "front_full_body",
    label: "正面全身",
    framing: "正面全身：正面站立，从头顶到鞋底完整可见，身体比例自然",
  },
  {
    id: "side_full_body",
    label: "侧面全身",
    framing: "侧面全身：严格 90 度侧面站立，从头顶到鞋底完整可见，清楚呈现侧面轮廓",
  },
  {
    id: "back_full_body",
    label: "背面全身",
    framing: "背面全身：背对镜头站立，从后脑到鞋底完整可见，清楚呈现发型和服装背面",
  },
] as const;

export type CharacterStateViewId = (typeof CHARACTER_STATE_VIEW_SPECS)[number]["id"];

export const CHARACTER_STATE_SHEET_TEMPLATE = {
  size: { width: 1536, height: 1024 },
  slots: [
    { id: "front_portrait", x: 0, width: 512 },
    { id: "front_full_body", x: 512, width: 341 },
    { id: "side_full_body", x: 853, width: 341 },
    { id: "back_full_body", x: 1194, width: 342 },
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

const CHARACTER_SHEET_NEGATIVE_PROMPT = [
  "第二个人",
  "额外人物",
  "多人",
  "重复人物",
  "环境场景",
  "房间",
  "街道",
  "道具堆",
  "文字",
  "标签",
  "水印",
  "裁切身体",
  "多余肢体",
  "畸形手脚",
].join("、");

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function buildCharacterStateViewPrompts(
  input: CharacterStateSheetPromptInput,
): CharacterStateViewPrompt[] {
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
    "纯白或浅灰色摄影棚背景，均匀柔光，无环境、无房间、无街道",
    "同一个角色、同一张脸、同一套服装、同一发型、同一体型比例",
    referenceLine,
    ...identityLines,
    ...(input.styleLines ?? []).map(clean).filter(Boolean),
    "画面干净，主体居中，不能出现文字、标签或水印",
  ];

  return CHARACTER_STATE_VIEW_SPECS.map((view) => ({
    id: view.id,
    label: view.label,
    prompt: [...common, view.framing].join("，"),
    negativePrompt: CHARACTER_SHEET_NEGATIVE_PROMPT,
  }));
}

export async function composeCharacterStateSheet(input: {
  viewPaths: Partial<Record<CharacterStateViewId, string>>;
  outputPath: string;
}): Promise<void> {
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
