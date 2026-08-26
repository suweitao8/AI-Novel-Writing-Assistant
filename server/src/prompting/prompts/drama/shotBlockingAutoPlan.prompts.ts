import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const blockingPoseSchema = z.enum([
  "standing",
  "talking",
  "arms_crossed",
  "sitting",
  "crouching",
  "kneeling",
  "lying",
  "prone",
  "walking",
  "running",
  "pointing",
  "holding",
  "interacting",
  "fighting",
  "sword",
]);

const autoPlanActorSchema = z.object({
  characterName: z.string().trim().min(1).max(120),
  position: z.tuple([
    z.number().min(-100).max(100),
    z.number().min(0).max(50),
    z.number().min(-100).max(100),
  ]),
  yawDeg: z.number().min(-180).max(180),
  scale: z.tuple([
    z.number().min(0.1).max(10),
    z.number().min(0.1).max(10),
    z.number().min(0.1).max(10),
  ]),
  pose: blockingPoseSchema,
});

const autoPlanCameraSchema = z.object({
  azim: z.number().min(-180).max(180),
  elev: z.number().min(-89).max(89),
  distance: z.number().min(0.25).max(100),
  focalPoint: z.tuple([
    z.number().min(-100).max(100),
    z.number().min(-100).max(100),
    z.number().min(-100).max(100),
  ]),
  fovDeg: z.number().min(30).max(100),
  nearClip: z.number().min(0.05).max(5),
  farClip: z.number().min(20).max(300),
  depthOfFieldEnabled: z.boolean(),
  focusDistance: z.number().min(0.25).max(100),
  focusRange: z.number().min(0.1).max(100),
  blurRadius: z.number().min(0).max(10),
});

export const dramaShotBlockingAutoPlanOutputSchema = z.object({
  actors: z.array(autoPlanActorSchema).min(1).max(12),
  camera: autoPlanCameraSchema,
  compositionNote: z.string().trim().min(1).max(240).optional(),
});

export type DramaShotBlockingAutoPlanOutput = z.infer<typeof dramaShotBlockingAutoPlanOutputSchema>;

export interface DramaShotBlockingAutoPlanPromptInput {
  shotJson: string;
  sceneJson: string;
  actorsJson: string;
}

function validateAutoPlanOutput(output: DramaShotBlockingAutoPlanOutput): DramaShotBlockingAutoPlanOutput {
  const names = output.actors.map((actor) => actor.characterName.trim());
  if (new Set(names).size !== names.length) {
    throw new Error("自动构图输出包含重复角色。");
  }
  return {
    ...output,
    actors: output.actors.map((actor) => ({ ...actor, characterName: actor.characterName.trim() })),
    compositionNote: output.compositionNote?.trim() || undefined,
  };
}

export const dramaShotBlockingAutoPlanPrompt: PromptAsset<
  DramaShotBlockingAutoPlanPromptInput,
  DramaShotBlockingAutoPlanOutput
> = {
  id: "drama.shot.blocking.autoPlan",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 5000 },
  management: {
    productPrompt: true,
    editModes: ["readonly"],
  },
  outputSchema: dramaShotBlockingAutoPlanOutputSchema,
  postValidate: validateAutoPlanOutput,
  render: (input) => [
    new SystemMessage([
      "你是横屏影视化漫剧的分镜构图导演，负责把一个镜头变成可直接查看的 3D blocking 草图。",
      "画面必须是 16:9 横屏；先理解动作、关系、景别和运镜，再决定角色的空间位置、朝向、姿势、相对大小和相机轨道。",
      "输入角色带有 heightMeters 近似身高。保持角色之间的身高差；输出的 scale 是针对镜头构图的局部乘数，默认接近 [1,1,1]，不能用它把儿童、高个角色和普通成年人缩放成同样高。",
      "输出 actors 时必须使用输入名单中的全部角色，每个角色恰好出现一次，不得遗漏、改名、合并或创造角色；角色必须落在地面并保持画面关系清楚。",
      "如果 sceneJson 提供了空间固定物体标记，必须把它们当作场景中的真实障碍和叙事参照：角色不要与床、桌、椅、柜子、门窗等标记长方体重叠；需要坐下、倚靠或经过时，使用相邻位置表达关系。没有标记时不要自行编造固定物体坐标。",
      "kind 为 floor 的空间标记是角色可行走地面范围：角色站位必须落在该长方体范围之内，不能站到它的边界之外或墙面上；它是站立区域而不是障碍物，不要刻意远离它。",
      "相机必须能同时看清镜头主体，fovDeg、裁剪面和景深参数要与景别、主体距离匹配；景深焦点应落在主要叙事主体，景深范围不能让应当清楚的角色完全失焦。",
      "只输出符合 schema 的 JSON，不输出 Markdown、解释文字或坐标计算过程。",
    ].join("\n")),
    new HumanMessage([
      `【镜头内容】\n${input.shotJson}`,
      `【场景与环境】\n${input.sceneJson}`,
      `【本镜全部出场角色】\n${input.actorsJson}`,
    ].join("\n\n")),
  ],
};
