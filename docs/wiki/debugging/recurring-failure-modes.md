# 重复故障模式与排查路径

## 背景

项目多次出现的故障往往不是单点 bug，而是边界被绕过：重型任务跑在 API 进程、状态多源推断、Prompt 绕过 registry、章节热路径过长、RAG 检索范围不一致。把这些排查结论沉淀下来，可以避免每次重新定位同类问题。

## 决策

调试时先确认事实源、执行面、投影和治理入口，再看具体代码。不要先用 UI 补丁、关键词兜底或局部 try/catch 掩盖系统性问题。

## 当前规则

- API 卡死先查是否有长任务仍在 Web API 进程执行。
- 状态不一致先查 `DirectorRun / StepRun / Event / Artifact` 与 projection，而不是先改前端显示。
- Prompt 输出问题先查 PromptAsset、schema、repair、semantic retry 和 provider capability。
- 章节产出慢先查热路径是否重新串入多次 LLM 后处理。
- RAG 不命中先查显式文档、绑定文档、全局启用文档和 context resolver。
- 运行时报 `The column main.X does not exist` 先查 Prisma schema 与 dev.db 是否脱节（并会话提交 schema 后数据库未同步），不要从 schema 撤字段来消错。
- API 起不来或秒死先查端口归属：`Get-NetTCPConnection -LocalPort 3100` 能看到 `netstat` 看不见的 Bound 状态占用（Docker Desktop 的 `com.docker.backend.exe` 会留下无容器认领的僵尸绑定）。
- 数据破坏风险操作必须先备份、验证备份，再取得明确批准。

## 示例

常见排查路径：

- 继续导演后所有接口变慢：检查 route 是否直接 await 长任务，Worker 是否独立 lease，SQLite/Prisma 写锁是否被长链路占用。
- 任务中心显示失败但小说页显示运行中：检查 projection 是否由旧 task status、runtime command 和产物事实混合推断。
- 章节正文为空还继续推进：检查 writer 空返回防线、单章自动重试和失败落态。
- 章节审校反复进入修复循环：检查后置质量闭环是否已经封顶为一次修复，最终结果是否已收敛到“未通过但继续生产”，以及工作区是否还把终态章节算成 repair ticket。
- 长弧伏笔被当成当前章阻断：检查时间线钩子的 `resolveMode` 和 `blocking` 是否被误标成 `immediate + blocking`，以及检测器是否把 `short_arc` / `long_arc` 升级成硬失败。
- 重新生成候选没有进入新一轮：检查 batch reuse、command idempotency 和候选阶段运行态。
- 生成没有使用知识库资料：检查 `knowledgeDocumentIds`、小说/世界绑定、启用状态和 prompt context requirement。
- 接口报 `The column main.Character.xxx does not exist`（已出现两次：`LlmUsageRecord` 建表、设定中心 `ageGroup/facePrompt` 加列）：Prisma Client 已按新 schema 生成，但共享 `server/dev.db` 落后于已提交的 schema——`ensure-dev-prisma.cjs` 只在服务启动时按 schema mtime 触发，跨会话提交 schema 后未重启就会出现。处理路径：确认 schema 已含该列/表 → 备份 `dev.db`（含 -wal/-shm，放入已被 ignore 的 `server/tmp/db-backups/`，注意 `dev.backup-*.db` 默认不被 gitignore 覆盖）→ 在 `server/` 执行不带 `--accept-data-loss` 的 `npx prisma db push --schema src/prisma/schema.sqlite.prisma`（只做增量，遇到删除性变更会自动拒绝）→ 用 node:sqlite `PRAGMA table_info` 验证列存在、核对行数 → 实测原报错接口。SQLite 加列对运行中的服务即时生效，无需重启。
- API 服务端反复"打印 listening 后端口不通 / 秒死"（2026-08-19 实例，环境问题已根治）：曾同时存在两个诱因——本机装过两个 Node（`Program Files` 系统 PATH 的 v26 压过 WinGet 用户级的 v22.22.2），以及 Docker Desktop 后端把 3100 占成 Bound 状态（无容器认领、`netstat -ano` 不可见）。**双 Node 已于 2026-08-19 处理：v26 MSI 已卸载（目录、系统 PATH、注册表全部清除），本机现在只有 WinGet 用户级 Node 22.22.2，`node/npm/npx/pnpm` 全部解析到它，标准 `pnpm dev` 不再需要给 PATH 手动加 node22 前缀。** 残留知识点：① `ensure-dev-prisma.cjs` 在 Node 版本与 better-sqlite3 二进制 ABI 不符时会删除二进制再尝试重装，若换用无预编译包的 Node 大版本启动会直接失败且顺手毁掉可用二进制——再遇到启动即报 better-sqlite3 绑定错误，先用 `where node` 核对版本再用匹配版本重跑该脚本恢复；② Docker 僵尸绑定用 `Get-NetTCPConnection -LocalPort 3100` 查真实占用者与 State（Bound 态 netstat 不可见），不必重启 Docker（会波及十几个长期容器），用 `HOST=127.0.0.1` 让服务端绑回环地址即可绕开 0.0.0.0 冲突，用户重启电脑后该绑定自动消失；③ `HOST=::1`（IPv6 回环）无效：vite 代理解析 `localhost` 后拨的是 127.0.0.1。
- 开发进程会被并行会话周期性杀掉（单例脚本匹配 `ts-node-dev + src/app.ts`；也可能有人按端口杀进程树），表现为整条后台任务无错误消失、退出码 4294967295。防复发模式：① 启动命令不含 `ts-node-dev` 字样（用裸 ts-node 启动即不匹配单例脚本）；② 外面套 `while true; do <启动命令>; sleep 3; done` 守护循环并作为常驻后台任务运行，被杀后秒级自愈；③ 不要依赖在"已完成的 Bash 调用"里 nohup 出去的进程——会随调用作业对象关闭被回收。

## 失败模式

不能用来替代根因修复的手段：

- 降低前端轮询频率来掩盖 API 执行面阻塞。
- UI 禁用按钮来避免重复执行，而不处理 command 幂等。
- 给意图识别加关键词 fallback 来掩盖 AI schema 或上下文问题。
- 在业务 service 里补局部 JSON parse 分支来绕过 Prompt Registry。
- 把后台资产回灌失败显示成正文生成失败。

## 相关模块

- `server/src/routes/`
- `server/src/workers/`
- `server/src/services/novel/director/`
- `server/src/services/novel/runtime/`
- `server/src/services/rag/`
- `server/src/prompting/`
- `client/src/pages/tasks/`
- `client/src/pages/novels/`

## 来源文档

- [自动导演执行面隔离与 API 保活计划](../../plans/auto-director-execution-plane-isolation-plan.md)
- [导演模式模块化与状态治理改造清单](../../plans/director-mode-module-state-refactor-checklist.md)
- [正文产出链路瘦身与资产回灌优化计划](../../plans/chapter-output-pipeline-optimization-plan.md)
- [Prompt Governance Audit 2026-05-08](../../checkpoints/prompt-governance-audit-2026-05-08.md)
- [README 最新更新](../../../README.md)
