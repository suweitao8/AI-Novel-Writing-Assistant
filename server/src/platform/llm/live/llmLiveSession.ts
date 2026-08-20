import type { TaskType } from "../../../llm/modelRouter";
import type { PromptInvocationMeta } from "../../../prompting/core/promptTypes";
import { llmLiveBroker, type LlmLiveSession } from "./LlmLiveBroker";

// 已知技术探针的用途说明：这类调用不属于创作流程本身，
// 用户在实况里看到时需要一眼明白它是在检测模型连接。
const KNOWN_LABEL_PURPOSES: Record<string, string> = {
  "llm.connectivity.structured_probe": "测试连接：检查模型能否按要求输出 JSON",
  "llm.connectivity.plain_probe": "测试连接：检查模型能否正常回复文字",
};

// 任务类型 → 用户视角的用途名；正式创作调用按任务类型标注用途。
const TASK_TYPE_PURPOSES: Partial<Record<TaskType, string>> = {
  planner: "大纲与章节规划",
  writer: "正文写作",
  review: "章节审校",
  light_review: "章节快速复核",
  critical_review: "章节严格审校",
  repair: "正文修复",
  replan: "重规划",
  state_resolution: "状态整理",
  summary: "内容摘要",
  fact_extraction: "信息抽取",
  chat: "对话",
  outline_planning: "大纲与章节规划",
  chapter_drafting: "正文写作",
  chapter_review: "章节审校",
  chapter_repair: "正文修复",
  summary_generation: "内容摘要",
};

// 阶段 → 具体用途名：多个不同用途共用同一任务类型（如参考解析的初稿/提取都是
// planner）时，笼统显示「大纲与章节规划」会让用户分不清每个调用在做什么——
// 这些阶段必须在任务类型兜底之前精确命名。
const STAGE_PURPOSES: Record<string, string> = {
  chapter_reference_draft: "参考解析：把参考小说本章改编成分镜初稿",
  chapter_reference_extract: "参考解析：从参考小说本章提取角色、场景、道具",
};

// Prompt id → 具体用途名：漫剧/漫画管线大量 prompt 共用 outline_planning 等
// 任务类型，按 prompt id 精确标注每个环节在做什么。
const PROMPT_ID_PURPOSES: Record<string, string> = {
  "drama.track.recommendation": "漫剧：从小说挑选要改编的章节",
  "drama.source.supplement": "漫剧：补充小说源设定",
  "drama.source.original_bundle": "漫剧：整理原创设定",
  "drama.source.text_bundle": "漫剧：整理导入文本设定",
  "drama.strategy": "漫剧：制定改编策略",
  "drama.episodeOutline": "漫剧：规划分集大纲",
  "drama.episode.script": "漫剧：生成分集剧本",
  "drama.episode.quality": "漫剧：审校分集质量",
  "drama.episode.compliance": "漫剧：分集合规检查",
  "drama.episode.repair": "漫剧：修复分集剧本",
  "drama.storyboard": "漫剧：把剧本拆成分镜",
  "drama.video.prompt": "漫剧：生成视频提示词",
  "comic.episodeOutline": "漫画：规划分集大纲",
  "comic.panelScript": "漫画：生成分格脚本",
  "comic.visualAnchorRewrite": "漫画：改写画面锚点",
};

function derivePurpose(input: {
  label: string;
  promptMeta?: PromptInvocationMeta;
}): string | null {
  const known = KNOWN_LABEL_PURPOSES[input.label];
  if (known) {
    return known;
  }
  const stage = input.promptMeta?.stage;
  if (stage && STAGE_PURPOSES[stage]) {
    return STAGE_PURPOSES[stage];
  }
  const promptId = input.promptMeta?.promptId;
  if (promptId && PROMPT_ID_PURPOSES[promptId]) {
    return PROMPT_ID_PURPOSES[promptId];
  }
  const taskType = input.promptMeta?.taskType;
  if (taskType && TASK_TYPE_PURPOSES[taskType]) {
    return TASK_TYPE_PURPOSES[taskType]!;
  }
  return null;
}

export function beginLlmLiveSession(input: {
  label: string;
  mode: "text" | "structured";
  promptMeta?: PromptInvocationMeta;
  provider?: string | null;
  model?: string | null;
}): LlmLiveSession {
  const meta = input.promptMeta;
  return llmLiveBroker.begin({
    label: input.label,
    purpose: derivePurpose(input),
    mode: input.mode,
    promptId: meta?.promptId ?? null,
    promptVersion: meta?.promptVersion ?? null,
    taskId: meta?.taskId ?? null,
    novelId: meta?.novelId ?? null,
    chapterId: meta?.chapterId ?? null,
    volumeId: meta?.volumeId ?? null,
    stage: meta?.stage ?? null,
    itemKey: meta?.itemKey ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
  });
}
