// 参考小说设定提取契约（v5）：漫剧工作室「解析」时从本章参考文本提取出的
// 角色 / 场景 / 道具 / 世界观建议。结果随章节持久化（Chapter.referenceExtractionJson），
// 用户在「提取」页签逐条核对修改后点「应用」创建进设定中心。
// v5 起角色带结构化 gender/ageGroup/physique（应用时直接预填设定表单）；
// v3 的 stateLabel/stateNote 提取时已不再生成，仅为已持久化的旧结果保留。

/** 资产外观状态：同一资产随剧情推进的外观形态（换装/受伤/昼夜/损坏…）。 */
export interface StoryAssetState {
  id: string;
  /** 状态短名，如 初始/警察制服/受伤/黑夜/破损 */
  label: string;
  /** 这个状态下外观发生了什么（一句话） */
  description: string;
  /** 该状态的画面提示词（生图用） */
  imagePrompt: string;
  /** 该状态的音色提示词（配音用，仅角色有） */
  voicePrompt?: string;
  /** 来自第几章（初始状态可空） */
  chapterOrder?: number;
  /**
   * 生成该状态图片时用哪个状态的图当参考（同一资产内的状态 id）：
   * 典型用法是新状态参考上一状态（保持长相一致只换装/加伤），也可参考任意别的
   * 状态；不填＝不用参考图，直接生成全新形象（2026-08-20 用户要求的灵活配置）。
   */
  referenceStateId?: string | null;
}

export interface ReferenceExtractItem {
  name: string;
  description: string;
  /** 画面提示词（场景=环境画面，道具=实物画面） */
  imagePrompt?: string;
  /** 外观状态短名：同名资产本章发生重大外观变化时才有 */
  stateLabel?: string;
  /** 外观变化说明：发生了什么、相对上一状态变了哪里 */
  stateNote?: string;
}

export interface ReferenceExtractCharacter {
  name: string;
  /** 身份定位，如 男主/女主/反派/导师/配角 */
  role: string;
  /** 性别（v5 起结构化输出；unknown=原文看不出） */
  gender?: "male" | "female" | "other" | "unknown";
  /** 年龄段（child=少年/儿童、youth=青年、middle=中年、elder=老年；null=原文推不出） */
  ageGroup?: "child" | "youth" | "middle" | "elder" | null;
  /** 体型短词（v2 起不再生成：体型并入 appearance；仅为已持久化的旧结果保留） */
  physique?: string;
  /** 一句话概述（角色以 appearance 为主，description 仅兜底） */
  description?: string;
  /** 外貌体型一句话（v2 起含体型：发型发色、五官、穿着、标志性特征；性别/年龄段走结构化字段不在此重复） */
  appearance?: string;
  /** 性格一句话（v2 起不再生成，仅为旧结果保留；视频创作只关注画面/音色提示词） */
  personality?: string;
  /** 角色画面提示词（生图用） */
  imagePrompt?: string;
  /** 音色提示词（配音用） */
  voicePrompt?: string;
  /** 以下为 v3 时期外观状态机字段：提取环节已不再生成，仅为已持久化的旧提取结果保留 */
  stateLabel?: string;
  stateNote?: string;
}

export interface ReferenceExtractionPayload {
  characters: ReferenceExtractCharacter[];
  scenes: ReferenceExtractItem[];
  props: ReferenceExtractItem[];
  worldview: Array<{ name: string; description: string }>;
}
