// 空白小说的用户大纲与分章细纲契约。
// outline（简略大纲）是用户手写的原文；chapters（分章细纲）是 AI 推理、用户确认后的剧情契约，
// 导演链规划（卷战略/节奏板/章节列表/章节细化）必须遵循它，只做节奏与衔接性补全。

export interface NovelChapterOutlineItem {
  order: number;
  title: string;
  synopsis: string;
  keyEvents: string[];
  characterNames: string[];
  sceneNames: string[];
}

export interface NovelChapterOutlineDocument {
  schemaVersion: 1;
  premise: string;
  chapters: NovelChapterOutlineItem[];
  confirmedAt: string;
}

export interface NovelOutlineState {
  novelId: string;
  outline: string;
  chapters: NovelChapterOutlineItem[] | null;
  premise: string | null;
  confirmedAt: string | null;
}

export interface NovelOutlineExpandDraft {
  premise: string;
  suggestedChapterCount: number;
  chapters: Array<Omit<NovelChapterOutlineItem, "order"> & { order: number }>;
  notes: string[];
}
