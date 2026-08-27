# LLM 调用耗时台账（LlmUsageRecord）

## 背景

创作工作室、章节生产等非自动导演通道的 LLM 调用此前没有任何持久化耗时记录：实况面板（llm-live）只能看实时流，任务结束后无法回答"这次任务慢在哪一步"。自动导演通道有自己的 `DirectorLlmUsageRecord` 做归因结算，但它是导演专属，不覆盖短篇生产、审校、修复等链路。

2026-08-19 的性能排查（用户反馈"解析短篇耗时 13 分钟"）暴露了这个盲区：只能靠各业务表的 createdAt/updatedAt 反推各阶段耗时。

## 决策

- 新增全局表 `LlmUsageRecord`（sqlite + postgres 双 schema），作为**跨通道的结构化调用底账**。
- 落账点选在 `server/src/llm/structuredInvoke.ts` 的 `invokeStructuredAttempt`：这是所有结构化调用的统一收口，成功与失败路径各记一条，天然拿到 provider/model/strategy/耗时/token/修复次数。
- 记录是 **fire-and-forget**：`recordLlmUsage` 内部 catch 所有数据库异常，只留 console.warn，绝不影响主生成链路。
- `durationMs` 是该次尝试的端到端墙钟时间（含流式返回 + 解析 + JSON 修复），不是纯模型时间——诊断"步骤耗时"时这正是想要的口径。
- 与 `DirectorLlmUsageRecord` 并存是刻意的：导演表做归因结算，本表做"慢在哪一步"的诊断底账，两边数据不互通。

## 当前规则

- 写入：`server/src/platform/llm/usage/llmUsageRecorder.ts`，仅由 structuredInvoke 调用。业务代码不要直接往这张表写数据。
- 读取：`GET /api/llm/usage-records?taskId=&novelId=&limit=`（`server/src/routes/llm.ts`，limit 上限 200）。
- 前端展示：任务抽屉（`client/src/pages/novels/components/TaskLlmUsageSection.tsx`）按 taskId 拉取，15 秒自动刷新。
- taskId/novelId/stage/itemKey 来自 `PromptInvocationMeta`（promptRunner 组装）；走 structuredInvoke 但没带 promptMeta 的调用，这些列为空但 label/provider/model/耗时仍然有效。

## 相关：思考模式开关

- 模型设置（文本模型卡片）暴露 per-provider 的 `reasoningEnabled` 开关，落库到 APIKey 设置，由 `server/src/llm/factory.ts` 读取。
- 禁用参数只对已知支持思考开关的模型生效：DeepSeek thinking 系列（`thinking: {type:"disabled"}`）、Qwen 系（`enable_thinking: false`）。对不支持的端点关闭是安全的 no-op——**不要**对任意 openai_compatible 端点盲发未知参数（OpenAI 等严格端点会 400）。codex 订阅桥的思考深度由桥侧 `model_reasoning_effort` 控制（见 codex-image-provider.md），不经 factory 的 reasoningEnabled 开关。

## 失败模式

- 表不存在（迁移未跑）：落账静默失败，console 出现 `[llm-usage] failed to persist...`，主链路不受影响。开发库由 dev 启动时的 `ensure-dev-prisma.cjs` 自动 `db push` 补齐。
- 连通性探针（`llm.connectivity.*`）不走 structuredInvoke，不会出现在台账里——诊断时不要期望看到它们。

## 相关模块

- `server/src/llm/structuredInvoke.ts`（写入点）
- `server/src/platform/llm/usage/llmUsageRecorder.ts`（落账服务）
- `server/src/routes/llm.ts`（查询接口）
- `client/src/pages/novels/components/TaskLlmUsageSection.tsx`（任务抽屉展示）
- `docs/wiki/architecture/llm-live-feed.md`（实时实况，与本台账互补）
