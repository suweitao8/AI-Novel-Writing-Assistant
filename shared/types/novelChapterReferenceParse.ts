// 参考文本「解析」一次产出两份成果（2026-08-20 起合并为单次大模型调用）：
// - 分镜式初稿（segments + 序列化 draftText），写入 Chapter.expectation 前由用户确认；
// - 本章设定提取建议（extraction：角色/场景/道具/世界观），随章节持久化到
//   Chapter.referenceExtractionJson，前端「提取」页签逐条核对应用。
import type { ChapterReferenceDraftPayload } from "./novelChapterReferenceDraft";
import type { ReferenceExtractionPayload } from "./novelReferenceExtraction";

export interface ChapterReferenceParsePayload extends ChapterReferenceDraftPayload {
  /** 同一次解析产出的设定建议（与初稿共享同一份原文，人物/场景天然一致） */
  extraction: ReferenceExtractionPayload;
}
