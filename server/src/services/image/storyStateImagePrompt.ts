import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";
import type { StoryAssetKind } from "../../platform/assets/StoryAssetStateImageStorage";

import { scenePanoramaLayoutLinesFor } from "../drama/visual/dramaVisualStyles";
import { ROOM_ARCHITECTURE_PROMPT_LINES } from "./roomArchitecture";

/**
 * 状态图提示词组装（场景状态分支含 2:1 等距柱状全景硬契约）。
 *
 * 从 StoryAssetStateImageService 下沉到 services/image：提示词组装只依赖
 * services 层的画风/布局/建筑常量，属于图片生成基础设施；这样小说域之外的
 * 调用方（如通用环境资产生成）也能复用同一份全景契约，而不会形成
 * settings（低层）反向依赖 modules/novel（高层）的依赖方向。
 * 契约锁定在 server/tests/storyAssetStateImage.test.js。
 */
function sanitizeSceneStateDescription(value: string): string {
  return value
    .replace(/(?:巨型|大型|带血角|血角|凶猛)*(?:猛兽|怪物|异兽|野兽|动物|生物)/giu, "地面爪痕与破坏痕迹")
    .replace(/人物|角色|人类|行人|人群/gu, "活动痕迹")
    .replace(/\b(?:people|person|character|characters|animal|animals|monster|monsters|creature|creatures|beast|beasts|crowd|crowds)\b/giu, "environmental traces");
}

export function buildStateImagePrompt(
  input: {
    kind: StoryAssetKind;
    assetName: string;
    baseAppearance: string | null;
    state: Pick<StoryAssetState, "label" | "description" | "imagePrompt" | "ageGroup" | "sceneType" | "timeOfDay" | "weather">;
    gender?: string | null;
    hasReference: boolean;
  },
  styleLines: string[],
): string {
  const stateDescription = input.kind === "scene"
    ? sanitizeSceneStateDescription(input.state.description)
    : input.state.description;
  const stateImagePrompt = input.kind === "scene"
    ? sanitizeSceneStateDescription(input.state.imagePrompt)
    : input.state.imagePrompt;
  const subjectLine =
    input.kind === "character" ? "character state reference image"
      : input.kind === "scene" ? "scene state reference image"
        : "prop state reference image";
  const lines = [
    ...styleLines,
    subjectLine,
    `subject: ${input.assetName}`,
    input.gender ? `gender: ${input.gender}` : "",
    input.state.ageGroup ? `age group: ${input.state.ageGroup}` : "",
    ...(input.kind === "scene"
      ? [
        input.state.sceneType ? `scene type: ${input.state.sceneType}` : "",
        input.state.timeOfDay ? `time of day: ${input.state.timeOfDay}` : "",
        input.state.weather ? `weather: ${input.state.weather}` : "",
      ]
      : []),
    input.baseAppearance ? `base appearance: ${input.baseAppearance}` : "",
    `state: ${input.state.label}`,
    `state change: ${stateDescription}`,
    `state image prompt: ${stateImagePrompt}`,
    input.hasReference
      // 参考图只锁主体身份：时代观感跟当前风格方向走——换时代风格（如 现代都市→末世废土）
      // 重新生成时环境要有明显转变，不能照抄参考图的旧时代样式（2026-08-23 用户要求）；
      // 干净日常风格里旧图的脏污磨损仍不得带入。
      ? "keep the same subject identity as the reference image; the era look follows the current style direction — when it differs from the reference's look, transform the environment boldly to fully express the new style, and do not carry over wear, dirt or damage from the reference image unless the style direction or the state describes it"
      : "",
    ...(input.kind === "scene"
      ? [
        // 场景状态图必须是 360° 等距柱状全景（2026-08-22 用户要求，可在前端全景预览里旋转查看）；
        // 措辞沿用旧版全景接口验证过的口径（StoryAssetImageService.generateSceneImage）。
        "360-degree equirectangular panorama of the empty scene environment, standard 2:1 aspect ratio, seamless horizontal wrap-around",
        "seamless horizontal wrap-around view of the whole space",
        "consistent palette, materials, architecture and lighting across the entire panorama",
        // 室内场景追加强化行：家具/墙根必须留在地平线以上，下半区只出纯地板材质
        //（2026-08-26 用户反馈：室内图床桌椅被画进下半区，3D 投射后地板上长家具，影响分镜摆位）。
        ...scenePanoramaLayoutLinesFor(input.state.sceneType),
        // 建筑合理性（2026-08-27 用户反馈：卧室出现两个门）：门/窗数量确定性、禁镜像复制墙段。
        ...ROOM_ARCHITECTURE_PROMPT_LINES,
        // 参考图往往本身就越线：若允许模型照抄参考图构图，越线会代代相传（2026-08-26 用户
        // 反馈重新生成仍越线的主要泄漏点）。参考图只锁材质/光照/身份，垂直构图一律随契约。
        ...(input.hasReference
          ? ["the reference image locks materials, lighting and scene identity only; never copy its furniture placement, object sizes or vertical composition — the layout rules above always override the reference's composition"]
          : []),
        "pure empty environment reference",
        "no people, no characters, no animals, no monsters, no creatures, no crowds, no living subjects",
        "narrative living subjects remain off-screen and may appear only as environmental traces",
      ]
      : [
        // 角色/道具参考图统一透明底（2026-08-22）：底图要能直接叠进分镜首帧。
        "fully transparent background, genuine PNG alpha channel",
        "no backdrop color, no solid fill, no checkerboard pattern, no studio floor, no ground shadow",
        "clean composition, strong subject focus",
        // 道具只渲染道具本身（2026-08-22 用户要求）：描述/提示词里提到的周围环境与
        // 其它物品（抹布、木板等）只是上下文，不是画面内容。
        ...(input.kind === "prop"
          ? [
            "render exactly one prop: the subject itself, alone, nothing else in frame",
            "other objects, surfaces or scenery mentioned in the state description or image prompt are context metadata only and must not appear",
          ]
          : []),
      ]),
    // 旧数据的状态提示词可能带画风/背景/视图词：这里声明它们只是内容描述的一部分，
    // 渲染方向、背景与画幅一律以上方规则为准，不因提示词里的旧词改变。
    "any style, background or framing words inside the state image prompt are metadata only; rendering direction, background and framing follow the rules above",
    "no text, no watermark, no subtitles, no logo",
  ];
  return lines.filter(Boolean).join(", ");
}
