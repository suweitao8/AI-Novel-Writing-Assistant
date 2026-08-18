# 拆书假成功（成功但内容全空）

## 背景

用户上传小说执行拆书后，任务状态显示 `succeeded`，但所有启用的栏目（总览、情节结构、人物体系、风格技巧等）`aiContent` 全部为空、`usedTokens=0`、耗时几十毫秒、LLM 调用日志零条。用户完全无法从界面得知失败原因。

## 决策

拆书链路中任何 LLM 调用失败都必须显式失败：section 标 `failed`、任务标 `failed` 并写入 `lastError`，由界面展示具体原因并提供重试。禁止用裸 `catch` 吞掉异常返回空结果或降级空笔记——那会把“配置错误”伪装成“AI 分析完了但没内容”。

## 当前规则

- `server/src/services/bookAnalysis/` 下所有调用 `runStructuredPrompt` 的路径（section 生成、逐段源笔记、优化草稿）失败时直接抛出，由上层处理：
  - `runFullAnalysis` / `runSingleSection` 的每 section catch：标 `failed`、收集 `errors`，最终 `errors.length > 0` 时任务标 `failed` 且 `lastError = errors.join(" | ")`。
  - 笔记阶段抛错走 `runFullAnalysis` 外层 catch：`markFailed(analysisId, message)`。
- 拆书任务的 `provider` 不允许写死厂商：未显式指定时按 `getTextModelProvider()`（模型设置的文本槽）解析，运行时另有 `analysis.provider ?? getTextModelProvider()` 兜底。
- 影响范围：拆书全链路（`bookAnalysis` 服务族）与知识库拆书发布，不涉及章节生产与自动导演。

## 示例

- 推荐：LLM 抛 `未配置 API Key` → 任务 `failed` + lastError 可见 → 用户去模型设置配置后点重试。
- 禁止：`catch { return { markdown: "", ... } }` 或 `catch { return 空笔记 }`——曾经导致 2026-08-19 的假成功事故（deepseek 未配置 + 三处吞错叠加）。

## 失败模式

- 症状：拆书任务毫秒级完成、状态成功、栏目全空、`usedTokens=0`。
- 排查路径：看 `.logs/<日期>/server.llm.jsonl` 是否有对应时刻的 request 记录（零条 = 请求发出前就被配置拦截）；看任务 `provider` 字段是否指向未配置厂商；grep 该链路是否新增了裸 `catch`。
- 短期掩盖手段（禁止）：把失败降级成空结果继续跑、在 UI 上把空内容渲染成“暂无数据”。

## 相关模块

- `server/src/services/bookAnalysis/writing/bookAnalysis.sectionWriter.ts`
- `server/src/services/bookAnalysis/caching/bookAnalysis.cache.ts`
- `server/src/services/bookAnalysis/bookAnalysis.generation.ts`（错误汇聚与状态落库）
- `server/src/services/bookAnalysis/application/BookAnalysisCommandService.ts`（provider 解析）
- `server/src/llm/factory.ts`（文本槽统一回退）

## 来源文档

- 发布说明：`../../releases/release-notes.md`（2026-08-19 拆书失败显式化条目）
