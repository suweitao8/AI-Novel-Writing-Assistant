# AI 创作实况（LLM Live Feed）

## 背景

“AI 创作实况”面板通过 SSE（`/api/llm-live/stream`）实时展示每次大模型调用。早期每条记录只显示调用方传入的内部 `label`（如 `llm.connectivity.structured_probe`、`novel.chapter_draft@3`），没有时间和用途说明，用户无法分辨这条请求是创作流程的一部分还是系统自检。

## 决策

- `LlmLiveContext`（`shared/types/llmLive.ts`）增加 `purpose?: string | null` 字段，承载用户视角的用途说明。
- 用途在服务端统一推导，位置是 `server/src/platform/llm/live/llmLiveSession.ts` 的 `beginLlmLiveSession`：
  1. 优先查 `KNOWN_LABEL_PURPOSES`（技术探针字典，如连通性测试）；
  2. 其次用 `promptMeta.taskType` 查 `TASK_TYPE_PURPOSES`（正式创作调用按任务类型命名，如“正文写作”“章节审校”）；
  3. 都命不中时为 `null`，前端回退展示原始 `label`。
- 前端（`client/src/components/liveExecution/LiveExecutionDialog.tsx`）：标题显示 `purpose ?? label`；行首显示 `startedAt` 时刻（`HH:mm:ss`）；已完成条目显示耗时（`completedAt - startedAt`）；展开后显示原始 `label` 与 `model`，供排查使用。

## 当前规则

- 新增技术探针或非 Prompt Registry 的 LLM 调用时，必须同时在 `KNOWN_LABEL_PURPOSES` 登记用户可读的用途文案，避免实况面板出现新的裸标识。
- 新增任务类型（TaskType）时，同步补 `TASK_TYPE_PURPOSES` 的中文名称。
- `purpose` 是展示字段，不参与任何路由或执行逻辑判断。

## 故障模式

- 实况里出现裸 label：说明该调用既不在探针字典、也没带 `promptMeta.taskType`，按上面规则补登记。
- 时间/耗时缺失：快照的 `startedAt`/`completedAt` 由 `LlmLiveBroker` 维护，缺失通常是异常中断（`failed`/`cancelled`）未写 `completedAt`。

## 相关模块

- `server/src/platform/llm/live/LlmLiveBroker.ts`：会话快照与 SSE 事件源。
- `server/src/platform/llm/live/llmLiveSession.ts`：会话创建与用途推导。
- `server/src/platform/llm/live/http/llmLiveRoutes.ts`：SSE 路由。
- `client/src/hooks/useLlmLiveFeed.ts`、`client/src/components/liveExecution/LiveExecutionDialog.tsx`：前端订阅与展示。
- `shared/types/llmLive.ts`：前后端共享契约。
