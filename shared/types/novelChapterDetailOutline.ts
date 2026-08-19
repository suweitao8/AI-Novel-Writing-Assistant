// 单章细纲契约：把某章大纲（Chapter.expectation）展开成的情节节拍。
// 存储在 Chapter.detailOutlineJson；V1 定位为人工创作辅助，不注入自动导演写作上下文。

export interface ChapterDetailOutlineBeat {
  /** 一句话情节推进：谁做了什么、发生了什么变化 */
  summary: string;
  /** 关键转折/揭示/冲突升级（可空） */
  keyEvent: string | null;
}

export interface ChapterDetailOutlinePayload {
  beats: ChapterDetailOutlineBeat[];
  notes: string | null;
}

export interface ChapterDetailOutlineDocument extends ChapterDetailOutlinePayload {
  schemaVersion: 1;
  generatedAt: string;
  savedAt: string;
}
