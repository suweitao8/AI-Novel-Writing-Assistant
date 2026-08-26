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
  /** domeRadius − 边缘缓冲后的角色可站位半径（米）。 */
  stageRadiusMeters?: number;
  /** 3D 拍摄位所在的投射中心高度（米）。 */
  projectionCenterHeight?: number;
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
  version: "v4",
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
      "角色活动范围以场景投射中心为圆心限制在可用站位半径内：任何角色的站位，包括跑动、追逐等大幅度动作的目标位置，都不得超出该半径；靠边约 1 米永远保留为运动缓冲，不要把角色安排到那里。若 floor 地面范围比该半径更小，以更小者为准。",
      "相机拍摄位固定放在场景投射中心 [0, projectionCenterHeight, 0]，高度与投射中心一致：你只能调整视线方向、拍摄距离和焦段来构图，相当于站在场景全景的原始取景点拍摄；服务端会把相机位置重写到投射中心，所以 azim/elev/distance 决定视角与取景，focalPoint 填希望看清的主体位置。",
      "相机必须能同时看清镜头主体，fovDeg、裁剪面和景深参数要与景别、主体距离匹配；景深焦点应落在主要叙事主体，景深范围不能让应当清楚的角色完全失焦。",
      "景别定距离：特写约脸部占画面高一半（distance≈1.5–2）、近景胸部以上（≈2.5–3.5）、中景腰部以上（≈4–6）、全景全身可见且头顶脚下留余量（≈5–8）、远景环境为主（≥10）；focalPoint 高度随景别落在头/胸/重心附近，不要所有景别都挤在同一个 distance。",
      "主体摆放按三分法：主要角色放在画面左右三分线附近而不是正中心；运动、奔跑或指向动作要在其朝向前方留白；头顶保留少量呼吸空间，不要顶到画面边缘或被裁切。",
      "双人对话遵守 180° 轴线规则：两人相向而立（yawDeg 互指对方），相机放在二人连线的同一侧让左右关系清楚；正在说话的角色面向听者，DoF 焦点与 focusDistance 落在说话者身上；三人以上按主次分前后层次，避免所有人并排一条直线。",
      "相机高度用 elev 表达叙事态度：elev 为负是俯拍（展现场面全貌、削弱人物），为正是仰拍（强调高大威压），默认接近平视（-10°到+10°），大俯仰角只用于镜头内容明确需要时。",
      "输出前自检：全部出场角色必须完整位于 16:9 取景框内且不被互相遮挡关键动作部位（服务端会按水平视野兜底扩角，但构图质量以你的一次规划为准）。",
      "只输出符合 schema 的 JSON，不输出 Markdown、解释文字或坐标计算过程。",
    ].join("\n")),
    new HumanMessage([
      `【镜头内容】\n${input.shotJson}`,
      `【场景与环境】\n${input.sceneJson}`,
      `【本镜全部出场角色】\n${input.actorsJson}`,
      input.stageRadiusMeters != null
        ? `【摆位限制】可用站位半径 ${Number(input.stageRadiusMeters).toFixed(2)} 米（投射中心为圆心，边缘保留活动缓冲）；拍摄位固定在 [0, ${input.projectionCenterHeight != null ? Number(input.projectionCenterHeight).toFixed(2) : "1.70"}, 0]。`
        : "",
    ].filter(Boolean).join("\n\n")),
  ],
};
