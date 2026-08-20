// 参考文本 → 本章初稿契约：漫剧工作室「参考」页签把粘贴的小说原文
// AI 改编成分镜式初稿草稿（不落库，写入 Chapter.expectation 前由用户确认）。
// 每个分镜单元两行：分镜画面 + 旁白/角色台词，单元之间空行分隔。

export interface ChapterReferenceDraftSegment {
  /** 这一格分镜的景别 */
  shot: "大远景" | "远景" | "全景" | "中景" | "近景" | "特写";
  /** 这一格分镜的画面描述（谁在画面中、动作/姿势/神态、环境） */
  storyboard: string;
  /** 旁白行固定为「旁白」；台词行为原文中说话角色的名字 */
  speaker: string;
  kind: "narration" | "dialogue";
  /** 台词行的表情神态（旁白行为空串） */
  mood: string;
  /** 这一格的旁白内容或台词 */
  text: string;
}

export interface ChapterReferenceDraftPayload {
  segments: ChapterReferenceDraftSegment[];
  /** 按分镜单元拼好的初稿文本（分镜：景别，画面\n说话人（神态）：内容，单元间空行），直接可写入初稿编辑器 */
  draftText: string;
}
