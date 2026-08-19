import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  VISUAL_STYLE_TAG_FORBIDDEN_WORDS,
  findVisualStyleTagForbiddenWords,
} from "@ai-novel/shared/types/visualStyle";

export interface VisualStyleAnalyzeInput {
  /** 参考图 base64（不含 data: 前缀） */
  imageBase64: string;
  /** 参考图 MIME 类型，如 image/png */
  mimeType: string;
  /** 用户对想要风格的补充说明（可选） */
  userHint?: string;
}

const visualStyleAnalyzeOutputSchema = z.object({
  styleInstructions: z.string().min(20).max(3000),
  avoidInstructions: z.string().min(10).max(2000),
  styleTag: z.string().min(2).max(80),
  suggestedName: z.string().min(2).max(60),
  suggestedLabel: z.string().min(1).max(24),
});

export type VisualStyleAnalyzeOutput = z.infer<typeof visualStyleAnalyzeOutputSchema>;

/**
 * 参考图画面风格分析（搬移自 mydrama generators/style_analyzer.py 的提示词语义）。
 * 只分析「媒介 + 渲染质感 + 调色」，不提炼故事内容；styleTag 禁止年代/内容词。
 */
export const visualStyleAnalyzePrompt: PromptAsset<VisualStyleAnalyzeInput, VisualStyleAnalyzeOutput> = {
  id: "visual_style.analyze",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: visualStyleAnalyzeOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是画面风格分析师，服务对象是不懂美术概念的写作新手作者。",
      "用户上传一张参考图，你把它提炼成一条可复用的「画面风格预设」，供小说封面、角色立绘、漫画等图像生成任务统一使用。",
      "",
      "只输出合法 JSON，不要输出 Markdown、代码块或额外解释。",
      "",
      "核心规则：",
      "1. 只描述渲染媒介与质感：是真人实拍、2D 动漫、3D 国漫还是插画；线条、上色、光影、镜头感、调色、材质细节。",
      "2. 绝不把参考图里的具体故事内容写进风格：年代、地点、服装款式、建筑、道具、人物长相、性别、年龄、种族都属于内容，由角色/场景描述决定，风格不得覆盖。",
      "3. styleInstructions 为英文正向描述（不超过 100 词），结尾必须声明：本风格只作用于媒介与质感，角色/场景/道具的具体描述与参考图优先。",
      "4. avoidInstructions 为英文负向守护（FORBIDDEN: 开头），只限制错误媒介与质量问题（水印、文字、畸形解剖、塑料皮肤、过度 HDR 等），不得禁止任何故事内容。",
      `5. styleTag 是拼在每张图 prompt 里的短锚点（2-4 个词，全大写英文），只允许媒介/质感词；严禁出现这些词：${VISUAL_STYLE_TAG_FORBIDDEN_WORDS.join("、")}。`,
      "6. suggestedLabel 是面向用户的中文风格名（不超过 8 个字），同样不得包含年代/内容词。",
      "",
      "输出字段：",
      "- styleInstructions：英文正向渲染说明。",
      "- avoidInstructions：英文负向守护（FORBIDDEN: 开头）。",
      "- styleTag：2-4 个全大写英文词的媒介/质感锚点。",
      "- suggestedName：英文风格名。",
      "- suggestedLabel：中文风格名（不超过 8 个字）。",
    ].join("\n")),
    new HumanMessage({
      content: [
        {
          type: "text",
          text: [
            "请分析这张参考图的画面风格，并按系统规则输出风格预设 JSON。",
            input.userHint?.trim() ? `用户补充说明：${input.userHint.trim()}` : "",
          ].filter(Boolean).join("\n"),
        },
        {
          type: "image_url",
          image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` },
        },
      ],
    }),
  ],
  postValidate: (output) => {
    const normalized = {
      styleInstructions: output.styleInstructions.trim(),
      avoidInstructions: output.avoidInstructions.trim(),
      styleTag: output.styleTag.trim().toUpperCase().replace(/\s+/g, " "),
      suggestedName: output.suggestedName.trim(),
      suggestedLabel: output.suggestedLabel.trim(),
    };
    if (findVisualStyleTagForbiddenWords(normalized.styleTag).length > 0) {
      throw new Error(
        `styleTag 含有年代/内容词（${findVisualStyleTagForbiddenWords(normalized.styleTag).join("、")}），styleTag 只允许媒介/质感词。`,
      );
    }
    if (findVisualStyleTagForbiddenWords(normalized.suggestedLabel).length > 0) {
      throw new Error("风格名称含有年代/内容词，请只描述画面媒介与质感。");
    }
    return normalized;
  },
};
