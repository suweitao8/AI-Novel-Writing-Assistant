import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  STORY_SCENE_3D_MARKER_KINDS,
  type StoryScene3DMarkerKind,
} from "@ai-novel/shared/types/comicDrama";
import type { PromptAsset } from "../../core/promptTypes";

const markerKindSchema = z.enum(STORY_SCENE_3D_MARKER_KINDS);
const markerAnchorSchema = z.enum(["floor", "wall", "ceiling"]);

const markerSchema = z.object({
  kind: markerKindSchema,
  label: z.string().trim().min(1).max(80),
  anchor: markerAnchorSchema,
  position: z.tuple([
    z.number().min(-50).max(50),
    z.number().min(0).max(30),
    z.number().min(-50).max(50),
  ]),
  size: z.tuple([
    z.number().min(0.05).max(30),
    z.number().min(0.05).max(30),
    z.number().min(0.05).max(30),
  ]),
  yawDeg: z.number().min(-180).max(180),
  confidence: z.number().min(0).max(1),
  imageRegion: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  }).optional(),
  evidence: z.string().trim().max(240).optional(),
});

export const sceneState3dMarkersOutputSchema = z.object({
  markers: z.array(markerSchema).max(32),
  analysisNote: z.string().trim().max(500).optional(),
});

export type SceneState3dMarkersOutput = z.infer<typeof sceneState3dMarkersOutputSchema>;

export interface SceneState3dMarkersPromptInput {
  sceneName: string;
  stateLabel: string;
  sceneType: string | null;
  environmentJson: string;
  imageBase64: string;
  mimeType: string;
}

function validateSceneState3dMarkersOutput(
  output: SceneState3dMarkersOutput,
): SceneState3dMarkersOutput {
  const seenLabels = new Set<string>();
  return {
    markers: output.markers
      .map((marker) => ({
        ...marker,
        label: marker.label.trim(),
        evidence: marker.evidence?.trim() || undefined,
      }))
      .filter((marker) => {
        const key = `${marker.kind}:${marker.label}`;
        if (seenLabels.has(key)) return false;
        seenLabels.add(key);
        return true;
      }),
    analysisNote: output.analysisNote?.trim() || undefined,
  };
}

export const sceneState3dMarkersPrompt: PromptAsset<
  SceneState3dMarkersPromptInput,
  SceneState3dMarkersOutput
> = {
  id: "drama.scene.state.3d_markers",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 3000 },
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  management: {
    productPrompt: true,
    editModes: ["readonly"],
  },
  outputSchema: sceneState3dMarkersOutputSchema,
  postValidate: validateSceneState3dMarkersOutput,
  render: (input) => [
    new SystemMessage([
      "你是室内全景图的 3D 空间语义标注器，负责为影视分镜提供可摆位的固定空间参照。",
      "输入是一张 360° 等距柱状全景图或场景状态图；只识别床、桌子、椅子、沙发、书桌、柜子、架子、门、窗户、柜台、楼梯等固定物体，输出的是可用于摆位的固定空间物体/家具标记。",
      "不要标注人物、动物、怪物、临时物品、衣物、食物、文字、装饰小件或仅凭常识猜测且画面中不可见的物体。室外/自然场景没有可信固定物体时返回空数组。",
      "坐标单位按米估算，并以约 1.8 米高的人物作为尺度参照：地面为 y=0，+Z 指向全景图正前方/水平中心，+X 指向画面右侧；position 是长方体中心，size 是 X/Y/Z 尺寸。",
      "floor 锚点的 position.y 仍填写物体中心高度；wall/ceiling 物体按其在空间中的中心高度填写。坐标和尺寸只需近似，宁可少标也不要编造。",
      "imageRegion 是物体在等距柱状输入图中的归一化矩形区域，x/y 是左上角，width/height 为宽高。confidence 反映图像证据强度。",
      "只输出符合 schema 的 JSON，不输出 Markdown、解释文字或坐标计算过程。",
      `可用类别：${(STORY_SCENE_3D_MARKER_KINDS as readonly StoryScene3DMarkerKind[]).join("、")}`,
    ].join("\n")),
    new HumanMessage({
      content: [
        {
          type: "text",
          text: [
            `场景名称：${input.sceneName.trim()}`,
            `场景状态：${input.stateLabel.trim()}`,
            `空间类型：${input.sceneType?.trim() || "未指定"}`,
            `当前 3D 环境参数：${input.environmentJson}`,
            "请识别可用于角色空间摆位的固定物体，并返回标记数组。",
          ].join("\n"),
        },
        {
          type: "image_url",
          image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` },
        },
      ],
    }),
  ],
};
