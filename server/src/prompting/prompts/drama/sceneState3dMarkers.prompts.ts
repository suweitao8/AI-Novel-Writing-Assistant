import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  STORY_SCENE_3D_MARKER_KINDS,
  type StoryScene3DMarkerKind,
} from "@ai-novel/shared/types/comicDrama";
import type { PromptAsset } from "../../core/promptTypes";

/** 视觉模型可输出的固定物体类别，与服务端共享的标记类别保持一致。 */
const VISION_MARKER_KINDS = STORY_SCENE_3D_MARKER_KINDS as unknown as [
  StoryScene3DMarkerKind,
  ...StoryScene3DMarkerKind[],
];

const markerKindSchema = z.enum(VISION_MARKER_KINDS);
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
  }),
  evidence: z.string().trim().max(240).optional(),
});

export const sceneState3dMarkersOutputSchema = z.object({
  markers: z.array(markerSchema).max(48),
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
  const markers = output.markers
    .map((marker) => ({
      ...marker,
      label: marker.label.trim(),
      evidence: marker.evidence?.trim() || undefined,
    }))
    .map((marker) => {
      // 同名实例不丢弃，按顺序补序号，保留模型标出的全部物体。
      let uniqueLabel = marker.label;
      let suffix = 2;
      while (seenLabels.has(`${marker.kind}:${uniqueLabel}`)) {
        uniqueLabel = `${marker.label}${suffix}`;
        suffix += 1;
      }
      seenLabels.add(`${marker.kind}:${uniqueLabel}`);
      return { ...marker, label: uniqueLabel.slice(0, 80) };
    });
  return {
    markers,
    analysisNote: output.analysisNote?.trim() || undefined,
  };
}

export const sceneState3dMarkersPrompt: PromptAsset<
  SceneState3dMarkersPromptInput,
  SceneState3dMarkersOutput
> = {
  id: "drama.scene.state.3d_markers",
  version: "v8",
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
      "floor 锚点的 position.y 仍填写物体中心高度；wall/ceiling 物体按其在空间中的中心高度填写。坐标和尺寸只需近似估算，但不能因为保守而漏标：物体可见且属于可用类别就必须输出。",
      "每一个返回的 marker 都必须对应输入图片中实际可见的固定物体，并且必须填写 imageRegion；imageRegion 是该物体在等距柱状输入图中的归一化矩形区域，x/y 是左上角，width/height 为宽高，矩形应尽量紧贴物体可见主体，不要把大块墙面、地面或天空一起框进去。不要只根据场景名称或文字描述生成 marker。",
      "服务端会把 imageRegion 的水平中心作为物体的真实全景经度确定方向，并把标记长方体统一贴到全景半球内表面上（门窗完全贴住球面）；不做图像测距。position.x/z 只是兼容用的粗略字段，不能用它抵消或猜测深度，也不要把图片像素、归一化比例或框坐标直接填进 position。confidence 反映图像证据强度。",
      "size 只填写按人物尺度估算的近似米制尺寸；服务端会结合 imageRegion 的可见跨度和 kind 类别范围校准最终长方体大小和贴面厚度。框必须紧贴物体可见边缘：门的框底部必须贴住门底与地面的接触线；窗户的框要紧贴可见窗框边缘，不要把整段墙面框进去；家具的框要包含腿脚或落地部分，底部贴近物体与地面的接触线；框不准会让方位、大小和贴面位置一起偏移。",
      "识别范围覆盖整张图片：等距柱状全景图的垂直中部（v≈0.5）大致是拍摄时的视线高度，家具、门、桌椅大多位于这条线以下的下半区，窗户、柜顶等位于上半区，上下两半都要逐一检查标注，不能只标某一侧或某个高度带。",
      "按从左到右的顺序分段扫描整条 360° 水平视野，同一类别的所有可见实例分别输出独立 marker，并用不同 label 区分（例如 椅子1、椅子2）；被其他物体部分遮挡但仍能辨认轮廓的固定物体也要标注，框贴住可见主体即可，只有完全无法辨认是什么的碎片才跳过。",
      "不要把任何推断出的分界、接缝或色带当作标注依据；只按真实图片证据填写 imageRegion，服务端会按当前 3D 环境参数统一反算。",
      "只输出符合 schema 的 JSON，不输出 Markdown、解释文字或坐标计算过程。",
      "不要输出地面、地板、可行走范围或房间轮廓类的标记。",
      `可用类别：${VISION_MARKER_KINDS.join("、")}`,
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
            "请识别这张全景图中可用于角色空间摆位与分镜参照的全部完整固定物体，按从左到右分段扫描并返回标记数组。",
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
