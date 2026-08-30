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
  /** 前景道具交互：角色与本镜动作发生坐/躺/倚靠等交互的空间标记 id（必须来自 sceneJson）。 */
  interactionMarkerId: z.string().trim().max(80).optional(),
});

const blockingRelationSchema = z.object({
  /** 关系主动方；on_top_of 中表示位于上方、施加动作的一方。 */
  subjectCharacterName: z.string().trim().min(1).max(120),
  /** 关系承载方；on_top_of 中表示位于下方、被承载的一方。 */
  objectCharacterName: z.string().trim().min(1).max(120),
  relation: z.enum([
    "on_top_of",
    "under",
    "beside",
    "in_front_of",
    "behind",
    "facing",
    "holding",
    "attacking",
    "following",
  ]),
  sizeRelation: z.enum(["larger", "smaller", "similar"]),
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
  relations: z.array(blockingRelationSchema).max(24),
  camera: autoPlanCameraSchema,
  compositionNote: z.string().trim().min(1).max(240).optional(),
});

export type DramaShotBlockingAutoPlanOutput = z.infer<typeof dramaShotBlockingAutoPlanOutputSchema>;

export interface DramaShotBlockingAutoPlanPromptInput {
  shotJson: string;
  sceneJson: string;
  actorsJson: string;
  /** radiusMeters − 边缘缓冲后的角色可站位半径（米）。 */
  stageRadiusMeters?: number;
  /** 3D 拍摄位所在的投射中心高度（米）。 */
  projectionCenterHeight?: number;
}

function parsePromptActorNames(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .map((actor) => (
          actor && typeof actor === "object" && "characterName" in actor
            ? (actor as { characterName?: unknown }).characterName
            : undefined
        ))
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
        .map((name) => name.trim().toLocaleLowerCase()),
    );
  } catch {
    return new Set();
  }
}

/** sceneJson 里真实存在的前景道具标记 id 集合；解析失败按空集合处理。 */
export function parseSceneJsonMarkerIds(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Set();
    const markers = (parsed as { markers?: unknown }).markers;
    if (!Array.isArray(markers)) return new Set();
    return new Set(
      markers
        .map((marker) => (marker && typeof marker === "object" ? (marker as { id?: unknown }).id : undefined))
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    );
  } catch {
    return new Set();
  }
}

function validateAutoPlanOutput(
  output: DramaShotBlockingAutoPlanOutput,
  input?: DramaShotBlockingAutoPlanPromptInput,
): DramaShotBlockingAutoPlanOutput {
  const names = output.actors.map((actor) => actor.characterName.trim());
  const normalizedNames = names.map((name) => name.toLocaleLowerCase());
  if (new Set(normalizedNames).size !== names.length) {
    throw new Error("自动构图输出包含重复角色。");
  }
  const actorNames = new Set(normalizedNames);
  const expectedActorNames = parsePromptActorNames(input?.actorsJson);
  if (expectedActorNames.size > 0) {
    const missing = [...expectedActorNames].filter((name) => !actorNames.has(name));
    const extra = [...actorNames].filter((name) => !expectedActorNames.has(name));
    if (missing.length > 0 || extra.length > 0 || actorNames.size !== expectedActorNames.size) {
      throw new Error("自动构图输出的角色名单与输入镜头不一致。");
    }
  }
  const relationKeys = new Set<string>();
  const relations = output.relations.map((relation) => {
    const subjectCharacterName = relation.subjectCharacterName.trim();
    const objectCharacterName = relation.objectCharacterName.trim();
    if (subjectCharacterName.toLocaleLowerCase() === objectCharacterName.toLocaleLowerCase()) {
      throw new Error("自动构图关系不能指向同一个角色。");
    }
    if (!actorNames.has(subjectCharacterName.toLocaleLowerCase()) || !actorNames.has(objectCharacterName.toLocaleLowerCase())) {
      throw new Error("自动构图关系引用了不在 actors 中的角色。");
    }
    const key = [
      subjectCharacterName.toLocaleLowerCase(),
      relation.relation,
      objectCharacterName.toLocaleLowerCase(),
    ].join("|");
    if (relationKeys.has(key)) {
      throw new Error("自动构图输出包含重复关系。");
    }
    relationKeys.add(key);
    return { ...relation, subjectCharacterName, objectCharacterName };
  });
  if (names.length > 1 && relations.length === 0) {
    throw new Error("多角色自动构图必须明确输出角色关系。");
  }
  // 前景道具交互必须指向 sceneJson 里真实存在的空间标记；
  // 指向不存在的 id 属于 AI 幻觉，交给结构化重试修复而不是静默丢弃。
  const markerIds = parseSceneJsonMarkerIds(input?.sceneJson);
  for (const actor of output.actors) {
    const interactionMarkerId = actor.interactionMarkerId?.trim();
    if (!interactionMarkerId) continue;
    if (markerIds.size === 0 || !markerIds.has(interactionMarkerId)) {
      throw new Error(`自动构图的道具交互指向了不存在的空间标记：${interactionMarkerId}`);
    }
  }
  return {
    ...output,
    actors: output.actors.map((actor) => ({
      ...actor,
      characterName: actor.characterName.trim(),
      interactionMarkerId: actor.interactionMarkerId?.trim() || undefined,
    })),
    relations,
    compositionNote: output.compositionNote?.trim() || undefined,
  };
}

export const dramaShotBlockingAutoPlanPrompt: PromptAsset<
  DramaShotBlockingAutoPlanPromptInput,
  DramaShotBlockingAutoPlanOutput
> = {
  id: "drama.shot.blocking.autoPlan",
  version: "v8",
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
  semanticRetryPolicy: {
    maxAttempts: 1,
    buildMessages: ({ baseMessages, validationError }) => [
      ...baseMessages,
      new HumanMessage([
        "上一版自动构图的角色关系没有通过校验，请重新输出完整 JSON。",
        `校验信息：${validationError}`,
        "必须让 relations 中的 subjectCharacterName 和 objectCharacterName 都来自 actors，且每个 subject/object/relation 组合只能出现一次；多角色不能返回空 relations。",
        "如果校验信息提到空间标记，说明 interactionMarkerId 指向了不存在的道具：必须改用 sceneJson 中真实存在的 marker id，或在没有道具交互时省略该字段。",
        "对于 on_top_of，subject 是上方主体，object 是下方承载者：object 贴地并使用 lying/prone，subject 只能使用 crouching 或 kneeling；不要给 subject 使用 prone 或 lying，因为当前 UAL 运行时没有专用趴姿，会错误表现为仰卧；sizeRelation 必须表达真实体量关系。",
        "不要输出解释文字、Markdown 或自定义 pose，只输出符合 schema 的完整 JSON。",
      ].join("\n")),
    ],
  },
  render: (input) => [
    new SystemMessage([
      "你是横屏影视化漫剧的分镜构图导演，负责把一个镜头变成可直接查看的 3D blocking 草图。",
      "画面必须是 16:9 横屏；先理解动作、关系和景别，再决定角色的空间位置、朝向、姿势、相对大小和相机机位。",
      "输入角色带有 heightMeters 近似身高。保持角色之间的身高差；输出的 scale 是针对镜头构图的局部乘数，默认接近 [1,1,1]，不能用它把儿童、高个角色和普通成年人缩放成同样高。",
      "输出 actors 时必须使用输入名单中的全部角色，每个角色恰好出现一次，不得遗漏、改名、合并或创造角色；角色必须落在地面并保持画面关系清楚。",
      "先从镜头动作中识别有方向的角色关系，再根据关系规划坐标、姿势和大小；relations 的 subject 是有向关系的主动/参照方，object 是被作用/承载方；仅在 on_top_of 中 subject 是上方主体。",
      "on_top_of 表示 subject 位于 object 上方：object 必须是贴地的承载者并使用 lying 或 prone，subject 只能使用 crouching 或 kneeling；不要给 subject 使用 prone 或 lying，因为当前 UAL 运行时没有专用趴姿，会错误表现为仰卧；不要把上下角色颠倒。under 表示 subject 在 object 下方。",
      "sizeRelation 必须填写 subject 相对 object 的真实体量：larger 表示 subject 更大，smaller 表示 subject 更小，similar 表示体量接近；不能只依赖局部 scale 抹平输入角色的身高差。",
      "多角色镜头 relations 不能留空；每条关系的两端都必须是 actors 中的角色，方向必须和动作语义一致，不能重复或自指。",
      "如果 sceneJson 提供了空间标记，它们是真实存在的前景道具（床、桌、椅、沙发、书桌、柜子等）和固定结构（门窗、楼梯）：场景里的每一件道具都按其 marker id、label、位置和尺寸理解，规划时优先让角色用上与动作相关的道具。",
      "道具交互规则：动作涉及坐下时，把角色直接摆到椅子/沙发/床沿的座位处——座面高约 0.4-0.5 米（position.y≈0.45），身体落在该道具长方体范围内，pose=sitting，并把该道具的 marker id 填入 interactionMarkerId；动作涉及躺下或睡觉时，把角色摆到床面/沙发上（position.y≈床垫面 0.5 米左右），pose=lying，interactionMarkerId 指向该床或沙发；动作涉及伏案、倚靠桌柜时，角色紧贴道具边缘，pose 用 sitting 或 interacting，interactionMarkerId 指向该道具。交互角色的朝向按动作语义面向谈话对象、桌面或镜头焦点。",
      "未参与交互的道具仍是障碍：角色不得与门窗、楼梯、柜子以及本镜动作没有用到的桌椅床沙发重叠，也不要站进任何标记长方体内部；只有 interactionMarkerId 指向的道具才允许身体进入其范围。没有标记时不要自行编造固定物体坐标。",
      "interactionMarkerId 只能填 sceneJson 里真实存在的 marker id，每个角色最多指向一个道具；本镜没有道具交互时省略该字段。compositionNote 里用一句话点出谁坐在/躺在了什么道具上。",
      "角色活动范围以场景投射中心为圆心限制在可用站位半径内：任何角色的站位，包括跑动、追逐等大幅度动作的目标位置，都不得超出该半径；靠边约 1 米永远保留为运动缓冲，不要把角色安排到那里。",
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
