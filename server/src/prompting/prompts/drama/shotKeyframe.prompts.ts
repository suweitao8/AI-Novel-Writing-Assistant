import { HumanMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";

export interface DramaShotKeyframePromptInput {
  styleLines: string[];
  location?: string | null;
  settingLines: string[];
  shotSize?: string | null;
  action: string;
  dialogue?: string | null;
  visualPrompt?: string | null;
  characters: string[];
  hasConfirmedBlockingSketch: boolean;
}

export function buildDramaShotKeyframePrompt(input: DramaShotKeyframePromptInput): string {
  const lines = [
    ...input.styleLines,
    "静态画面：整镜保持这一张横屏首帧图，不设计运镜",
    "构图干净，主体突出",
    input.hasConfirmedBlockingSketch
      ? "锁定摆位草图确定的场景视角、角色位置、相对大小、朝向与前后关系；只还原最终影视化画面，不渲染草图中的边框、姓名、控制点或其它辅助标记"
      : "",
    input.location ? `地点：${input.location}` : "",
    ...input.settingLines,
    input.shotSize ? `景别：${input.shotSize}` : "",
    `画面内容：${input.action}`,
    input.dialogue ? `台词语境（不要渲染字幕）：${input.dialogue}` : "",
    input.visualPrompt ? `画面提示词：${input.visualPrompt}` : "",
    input.characters.length ? `角色：${input.characters.join("｜")}` : "",
    "所有出场角色保持服装、发型、五官、年龄与情绪一致",
    "不要文字、水印、字幕或标志",
  ];
  return lines.filter(Boolean).join("，");
}

export const dramaShotKeyframePrompt: PromptAsset<DramaShotKeyframePromptInput, string> = {
  id: "drama.shot.keyframe",
  version: "v1",
  taskType: "planner",
  mode: "text",
  language: "zh",
  contextPolicy: { maxTokensBudget: 4000 },
  management: {
    productPrompt: true,
    editModes: ["readonly"],
  },
  render: (input) => [new HumanMessage(buildDramaShotKeyframePrompt(input))],
  postValidate: (output) => output.trim(),
};
