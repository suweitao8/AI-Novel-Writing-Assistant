// 参考文本 → 本章初稿契约：漫剧工作室「参考」页签把粘贴的小说原文
// AI 压缩成逐行标注旁白/角色的初稿草稿（不落库，写入 Chapter.expectation 前由用户确认）。

export interface ChapterReferenceDraftSegment {
  /** 旁白行固定为「旁白」；台词行为原文中说话角色的名字 */
  speaker: string;
  kind: "narration" | "dialogue";
  /** 一行一句的精简内容 */
  text: string;
}

export interface ChapterReferenceDraftPayload {
  segments: ChapterReferenceDraftSegment[];
  /** 按行拼接好的初稿文本（speaker：text），直接可写入初稿编辑器 */
  draftText: string;
}
