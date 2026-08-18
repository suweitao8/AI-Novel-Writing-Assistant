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

function derivePurpose(input: {
  label: string;
  promptMeta?: PromptInvocationMeta;
}): string | null {
  const known = KNOWN_LABEL_PURPOSES[input.label];
  if (known) {
    return known;
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
