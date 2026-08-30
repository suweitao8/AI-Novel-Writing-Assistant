# Creative Hub 对话入口

## 背景

漫剧工作台需要一个稳定的对话入口，用于解释当前创作状态、承接 AI 判断并导航到正式创作操作。独立聊天页面和另一套聊天接口会把消息、运行状态与任务投影拆成两套事实来源，无法保证刷新恢复、错误反馈和后续动作的一致性。

## 决策

Creative Hub 是当前产品唯一的对话运行时入口。它负责对话线程、只读查询、结构化工具调用和正式工作台导航；创作写入、章节生产和自动导演动作仍由对应工作台与任务链路承接。

## 当前规则

- `/chat` 仅作为兼容地址跳转到 `/creative-hub`。
- 独立聊天工作台与 `/api/chat` 不属于当前产品链路，不得作为新功能的依赖入口。
- 新增对话能力必须复用 Creative Hub 的 Prompt Registry、运行时、工具合同和状态投影。
- 任何需要创建、修改或执行长任务的请求，都必须导航或转交到正式工作台与任务中心，不能在对话接口内复制一套执行状态。

## 失败模式

- 新代码重新引用独立聊天页面、旧聊天接口或旧聊天状态 store：先确认需求是否应落到 Creative Hub，再移除重复入口。
- 对话显示的任务状态与工作台不一致：检查是否绕过 runtime projection，或是否保存了第二份消息/任务事实。
- 兼容地址打开空白页：确认 `/chat` 仍是无副作用的重定向，而不是恢复旧聊天页面。

## 相关模块

- `client/src/pages/creativeHub/`
- `client/src/router/index.tsx`
- `server/src/creativeHub/`
- `server/src/prompting/`
- `server/src/modules/novel/`

## 来源文档

- [Creative Hub 边界](creative-hub-boundary.md)
- [提示词工作台、上下文装配与统一步骤运行时方案](../../plans/prompt-workbench-context-and-step-runtime-plan.md)
