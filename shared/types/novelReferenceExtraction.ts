// 参考小说设定提取契约：漫剧工作室「提取」页签从参考原文提取出的
// 角色 / 场景 / 世界观建议（不落库，用户确认后创建进设定中心）。

export interface ReferenceExtractItem {
  name: string;
  description: string;
}

export interface ReferenceExtractCharacter extends ReferenceExtractItem {
  /** 身份定位，如 男主/女主/反派/导师/配角 */
  role: string;
}

export interface ReferenceExtractionPayload {
  characters: ReferenceExtractCharacter[];
  scenes: ReferenceExtractItem[];
  worldview: ReferenceExtractItem[];
}
