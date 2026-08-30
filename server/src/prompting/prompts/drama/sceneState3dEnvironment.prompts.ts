import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const sceneState3dEnvironmentOutputSchema = z.object({
  radiusMeters: z.number().min(0.5).max(100).nullable().optional(),
  // 仅兼容仍返回旧结构的模型；归一化器会除以二并转成 radiusMeters。
  domeDiameterMeters: z.number().min(1).max(100).nullable().optional(),
  projectionCenterHeightMeters: z.number().min(0.1).max(20).nullable().optional(),
  panoramaHorizonV: z.number().min(0).max(1).nullable().optional(),
  confidence: z.number().min(0).max(1).default(0),
  evidence: z.string().trim().max(240).optional(),
});

export type SceneState3dEnvironmentOutput = z.infer<typeof sceneState3dEnvironmentOutputSchema>;

export interface SceneState3dEnvironmentPromptInput {
  sceneName: string;
  stateLabel: string;
  imageBase64: string;
  mimeType: string;
}

/**
 * 判断全景图的投射中心和场景尺度。绝对米数只能通过门、人物、家具等画面
 * 参照做近似估算，服务端还会执行范围和置信度校验，不能把模型输出当成测量值。
 */
export const sceneState3dEnvironmentPrompt: PromptAsset<
  SceneState3dEnvironmentPromptInput,
  SceneState3dEnvironmentOutput
> = {
  id: "drama.scene.state.3d_environment",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 5000 },
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  management: {
    productPrompt: true,
    editModes: ["readonly"],
  },
  outputSchema: sceneState3dEnvironmentOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是 360° 场景全景图的 3D 环境尺度分析器。",
      "输入是一张 2:1 等距柱状全景图，图片会被重新投影到一个以投射中心为基准的半球内表面。",
      "请先观察整张图片，再识别图像中投射中心对应的水平线。v 坐标从图片顶部开始，v=0.5 是默认参考线；如果可见地平线、地面与远景的交界或生成构图线明显偏离 50%，返回你观察到的 panoramaHorizonV。",
      "请根据地面从投射中心向半球边界的可见延展范围，结合门、人物、家具、建筑构件等可识别的尺度参照，粗略估算投射中心到半球边界的真实圆半径和投射中心高度。这里的米数是供 3D 预览构图使用的近似值，不是精密测量；不能只因为场景名称或常识臆造尺寸。",
      "如果图片没有可信的尺度参照，无法估算的数值填 null，把 confidence 降低到 0.45 以下，并在 evidence 说明缺少尺度依据。服务端会对低置信度结果使用默认环境。",
      "radiusMeters 是投射中心到半球边界的真实水平圆半径；projectionCenterHeightMeters 是投射中心离地面的世界高度。",
      "只输出符合 schema 的 JSON，不输出 Markdown、解释、单位说明或计算过程。",
    ].join("\n")),
    new HumanMessage({
      content: [
        {
          type: "text",
          text: [
            `场景名称：${input.sceneName.trim()}`,
            `场景状态：${input.stateLabel.trim()}`,
            "请返回这张全景图的 3D 环境尺度估算。",
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
