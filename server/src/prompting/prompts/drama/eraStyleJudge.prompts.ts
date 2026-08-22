// 时代风格按剧情判定：一段剧情文本 + 可选风格清单 → 选出该故事节点所处的时代风格。
// 背景（2026-08-22 用户要求）：书的默认时代风格（如末世废土）是全局值，但故事有时代推进——
// 第一章可能仍是崩溃前的现代生活，章末才进入末世。生成资产状态图/分镜首帧时不能拿全局风格
// 一刀切，要按「这段剧情当下处于什么时代」来选；剧情线索不明时回落现行解析结果。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const eraStyleJudgeSchema = z.object({
  /** 选中的风格 key：必须来自 availableStyles 里给出的 key（内置预设 id 或自定义风格名）。 */
  styleKey: z.string().min(1).max(40),
  /** 一句话依据（说明剧情里的时代线索，供日志排查）。 */
  reason: z.string().min(2).max(120),
}).strict();

export interface EraStyleJudgePromptInput {
  /** 本次生成对象（如「叶竹 · 初始状态 状态图」「第12镜 首帧（叶城大学宿舍）」）。 */
  target: string;
  /** 该故事节点附近的剧情文本（章节脚本 / 集正文与镜头画面台词）。 */
  scriptExcerpt: string;
  /** 可选风格清单：key+label+摘要。 */
  availableStyles: Array<{ key: string; label: string; summary: string }>;
  /** 现行解析出的风格 key（脚本标记/项目/小说默认链的产物）；线索不足时选它。 */
  defaultKey?: string;
}

export interface EraStyleJudgeOutput extends z.infer<typeof eraStyleJudgeSchema> {}

function validateEraStyleJudge(
  output: EraStyleJudgeOutput,
  input: EraStyleJudgePromptInput,
): EraStyleJudgeOutput {
  const keys = new Set(input.availableStyles.map((style) => style.key));
  if (!keys.has(output.styleKey.trim())) {
    throw new Error(
      `选出的风格「${output.styleKey}」不在可选清单里（${[...keys].join("、")}），必须从清单中选择。`,
    );
  }
  return output;
}

export const eraStyleJudgePrompt: PromptAsset<EraStyleJudgePromptInput, EraStyleJudgeOutput> = {
  id: "drama.visual.era_style_judge",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 4000 },
  outputSchema: eraStyleJudgeSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是漫剧的美术监督：判断「这段剧情当下处于哪个时代风格」，为画面生成选择时代氛围。",
      "判断依据按优先级：剧情文本里的当下状态（城市是否正常运转、有无废墟/崩溃/战乱描述、科技与生活细节、称谓与语气）> 全书题材背景。",
      "【关键】书的题材可以是末世/玄幻/古代，但故事有推进：开篇可能仍是崩溃前的现代日常，某章之后才进入废土。只看这段文本描述的「当下」，不要被题材背景带偏。",
      "文本里时代线索明确就选对应风格；线索模糊或混合时选 defaultKey（现行解析结果），不要硬猜。",
      "styleKey 必须从 availableStyles 给出的 key 里选，不得发明新风格。",
      "所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateEraStyleJudge,
};
