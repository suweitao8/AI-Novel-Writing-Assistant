// 参考小说设定提取契约（v3）：漫剧工作室「解析」时从本章参考文本提取出的
// 角色 / 场景 / 道具 / 世界观建议。结果随章节持久化（Chapter.referenceExtractionJson），
// 用户在「提取」页签勾选确认后创建进设定中心；同名资产带外观大变化时以
// stateLabel/stateNote 描述，创建时追加为资产的新外观状态。

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
  /** 一句话概述（角色以 appearance/personality 为主，description 仅兜底） */
  description?: string;
  /** 外貌一句话（性别/年龄/体型/整体样貌合并描述） */
  appearance?: string;
  /** 性格一句话 */
  personality?: string;
  /** 角色画面提示词（生图用；状态变化时写新状态的画面） */
  imagePrompt?: string;
  /** 音色提示词（配音用） */
  voicePrompt?: string;
  stateLabel?: string;
  stateNote?: string;
}

export interface ReferenceExtractionPayload {
  characters: ReferenceExtractCharacter[];
  scenes: ReferenceExtractItem[];
  props: ReferenceExtractItem[];
  worldview: Array<{ name: string; description: string }>;
}
