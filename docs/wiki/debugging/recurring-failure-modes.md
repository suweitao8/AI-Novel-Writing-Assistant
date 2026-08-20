# 重复故障模式与排查路�?

## 背景

项目多次出现的故障往往不是单点 bug，而是边界被绕过：重型任务跑在 API 进程、状态多源推断、Prompt 绕过 registry、章节热路径过长、RAG 检索范围不一致。把这些排查结论沉淀下来，可以避免每次重新定位同类问题�?

## 决策

调试时先确认事实源、执行面、投影和治理入口，再看具体代码。不要先�?UI 补丁、关键词兜底或局�?try/catch 掩盖系统性问题�?

## 当前规则

- API 卡死先查是否有长任务仍在 Web API 进程执行�?
- 状态不一致先�?`DirectorRun / StepRun / Event / Artifact` �?projection，而不是先改前端显示�?
- Prompt 输出问题先查 PromptAsset、schema、repair、semantic retry �?provider capability�?
- 章节产出慢先查热路径是否重新串入多次 LLM 后处理�?
- RAG 不命中先查显式文档、绑定文档、全局启用文档�?context resolver�?
- 运行时报 `The column main.X does not exist` 先查 Prisma schema �?dev.db 是否脱节（并会话提交 schema 后数据库未同步），不要从 schema 撤字段来消错�?
- API 起不来或秒死先查端口归属：`Get-NetTCPConnection -LocalPort 3100` 能看�?`netstat` 看不见的 Bound 状态占用（Docker Desktop �?`com.docker.backend.exe` 会留下无容器认领的僵尸绑定）�?
- 数据破坏风险操作必须先备份、验证备份，再取得明确批准�?
- 手工/浏览�?E2E 验证不得在共�?`server/dev.db` 留持久夹具数据：验证完当场清理；自动化测试一律用内联数据�?`mkdtemp` 临时库，禁止依赖 dev.db 里的持久行�?

## 示例

常见排查路径�?

- 继续导演后所有接口变慢：检�?route 是否直接 await 长任务，Worker 是否独立 lease，SQLite/Prisma 写锁是否被长链路占用�?
- 任务中心显示失败但小说页显示运行中：检�?projection 是否由旧 task status、runtime command 和产物事实混合推断�?
- 章节正文为空还继续推进：检�?writer 空返回防线、单章自动重试和失败落态�?
- 章节审校反复进入修复循环：检查后置质量闭环是否已经封顶为一次修复，最终结果是否已收敛到“未通过但继续生产”，以及工作区是否还把终态章节算�?repair ticket�?
- 长弧伏笔被当成当前章阻断：检查时间线钩子�?`resolveMode` �?`blocking` 是否被误标成 `immediate + blocking`，以及检测器是否�?`short_arc` / `long_arc` 升级成硬失败�?
- 重新生成候选没有进入新一轮：检�?batch reuse、command idempotency 和候选阶段运行态�?
- 生成没有使用知识库资料：检�?`knowledgeDocumentIds`、小�?世界绑定、启用状态和 prompt context requirement�?
- 接口�?`The column main.Character.xxx does not exist`（已出现三次：`LlmUsageRecord` 建表、设定中�?`ageGroup/facePrompt` 加列、`Novel.referenceKnowledgeDocumentId` 加列）：Prisma Client 已按�?schema 生成，但共享 `server/dev.db` 落后于已提交�?schema——`ensure-dev-prisma.cjs` 只在服务启动时按 schema mtime 触发，跨会话提交 schema 后未重启就会出现。处理路径：确认 schema 已含该列/�?�?备份 `dev.db`（含 -wal/-shm，放入已�?ignore �?`server/tmp/db-backups/`，注�?`dev.backup-*.db` 默认不被 gitignore 覆盖）→ �?`server/` 执行不带 `--accept-data-loss` �?`npx prisma db push --schema src/prisma/schema.sqlite.prisma`（只做增量，遇到删除性变更会自动拒绝）→ �?node:sqlite `PRAGMA table_info` 验证列存在、核对行�?�?实测原报错接口。SQLite 加列对运行中的服务即时生效，无需重启。该问题还有第二种表现（2026-08-20 实例，美术风格体系合并后）：�?`Unknown field \`xxx\` for select statement on model \`Yyy\``——这�?**Prisma 客户�?*（node_modules 里生成的代码）落后于已提交的 schema，而非数据库落后；`ensure-dev-prisma.cjs` 只在服务启动时触发，运行中的 ts-node-dev 子进程一直持有旧客户端。此�?`prisma db push` 会同时把列推进数据库并重新生成客户端，但**运行中的服务必须重载才能用上新客户端**：`touch server/src/app.ts` 触发 ts-node-dev respawn（约 10-15 秒）即可，无需重启整个 dev 栈。快速判别：`The column ... does not exist` = 数据库旧（push 即可）；`Unknown field ... for select` = 客户端旧（push + 触发 respawn）�?
- API 服务端反�?打印 listening 后端口不�?/ 秒死"�?026-08-19 实例，环境问题已根治）：曾同时存在两个诱因——本机装过两�?Node（`Program Files` 系统 PATH �?v26 压过 WinGet 用户级的 v22.22.2），以及 Docker Desktop 后端�?3100 占成 Bound 状态（无容器认领、`netstat -ano` 不可见）�?*�?Node 已于 2026-08-19 处理：v26 MSI 已卸载（目录、系�?PATH、注册表全部清除），本机现在只有 WinGet 用户�?Node 22.22.2，`node/npm/npx/pnpm` 全部解析到它，标�?`pnpm dev` 不再需要给 PATH 手动�?node22 前缀�?* 残留知识点：�?`ensure-dev-prisma.cjs` �?Node 版本�?better-sqlite3 二进�?ABI 不符时会删除二进制再尝试重装，若换用无预编译包的 Node 大版本启动会直接失败且顺手毁掉可用二进制——再遇到启动即报 better-sqlite3 绑定错误，先�?`where node` 核对版本再用匹配版本重跑该脚本恢复；�?Docker 僵尸绑定�?`Get-NetTCPConnection -LocalPort 3100` 查真实占用者与 State（Bound �?netstat 不可见），不必重�?Docker（会波及十几个长期容器），用 `HOST=127.0.0.1` 让服务端绑回环地址即可绕开 0.0.0.0 冲突，用户重启电脑后该绑定自动消失；�?`HOST=::1`（IPv6 回环）无效：vite 代理解析 `localhost` 后拨的是 127.0.0.1�?
- 重启电脑后固定端口报 `listen EACCES 0.0.0.0:3100/5174`、netstat 查不到任何占用者（2026-08-19 实例，已根治）：WinNAT（Hyper-V/Docker/WSL2）每次开机会随机圈一批端口做�?排除�?禁止应用绑定，`netsh interface ipv4 show excludedportrange protocol=tcp` 可看到端口落在无 `*` 标记的动态区间内，且任意地址（含 127.0.0.1）都绑不上；表现为整栈里一个服务正常另一�?EACCES。根治步骤：`net stop winnat` 释放动态保�?�?对每个固定端口执�?`netsh int ipv4 add excludedportrange protocol=tcp startport=<port> numberofports=1`（端口正被进程占用时会报"另一个程序正在使用此文件"，需先停服务栈再加）�?`net start winnat`�?100 �?5174 已于 2026-08-19 打上�?`*` 的管理级保留，NAT 不会再圈；未来新增固定端口遇到同样问题按此处理，禁止用换端口规避。另注：`mydrama-frontend-1` 容器只是 expose 5173 并未 publish 到宿主机，宿主机 5173 �?socket�?5173 �?Docker 占用"的历史说法指 Docker 后端的虚拟保留�?
- 开发进程会被并行会话周期性杀掉（单例脚本匹配 `ts-node-dev + src/app.ts`；也可能有人按端口杀进程树），表现为整条后台任务无错误消失、退出码 4294967295。防复发模式：① 启动命令不含 `ts-node-dev` 字样（用�?ts-node 启动即不匹配单例脚本）；�?外面�?`while true; do <启动命令>; sleep 3; done` 守护循环并作为常驻后台任务运行，被杀后秒级自愈；�?不要依赖�?已完成的 Bash 调用"�?nohup 出去的进程——会随调用作业对象关闭被回收�?
- 页面�?上游模型服务连接失败"且所有任务类型同时中招（2026-08-20 实例）：`ModelRouteConfig` 全量路由�?`opencode` 提供商（`server/.env` �?`OPENCODE_BASE_URL=http://127.0.0.1:18762/v1`），它依赖两�?*不自启的本地守护进程**——opencode serve�?8763）和 OpenCode Go 桥接�?8762）。电脑重启后两者不在，服务�?fetch 立即连接被拒，errorHandler 把一切网络型错误统一包装成该文案（host 缺失时显示为"上游模型服务"）。处置：在仓库根目录执行 `pnpm opencode:bridge`（守护式拉起并等健康检查就绪后自动退出，日志�?`%LOCALAPPDATA%\AINovel\opencode-go-bridge\logs`），再用 `curl http://127.0.0.1:18762/health` 与一�?`/v1/chat/completions` 实调验证；首次真实调用可能冷启动偏慢，重试一次再下结论�?
- 漫剧项目列表出现来历不明的占位项目（2026-08-21 实例�?E2E守卫-漫剧-勿动"）：这是此前会话做浏览器 E2E 验证时手工建的小说夹具——它只是一条普通的 `productionKind=comic_drama` �?`Novel` 行，列表按该字段正常查询就会显示，代�?测试/脚本对它零依赖（自动化测试全用内联数据或临时库）。清理路径：备份 dev.db 后调 `DELETE /api/drama/projects/by-novel/:novelId`（会先清 drama 侧软引用再级联删小说�?RAG）。禁止用标题关键词过滤来"隐藏"这类项目——那�?AI-first 规则明令禁止的特例字符串规则；正确做法是验证会话自己收走夹具�?

## 失败模式

不能用来替代根因修复的手段：

- 降低前端轮询频率来掩�?API 执行面阻塞�?
- UI 禁用按钮来避免重复执行，而不处理 command 幂等�?
- 给意图识别加关键�?fallback 来掩�?AI schema 或上下文问题�?
- 在业�?service 里补局�?JSON parse 分支来绕�?Prompt Registry�?
- 把后台资产回灌失败显示成正文生成失败�?

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

- [自动导演执行面隔离与 API 保活计划](../../archive/plans/auto-director-execution-plane-isolation-plan.md)
- [导演模式模块化与状态治理改造清单](../../plans/director-mode-module-state-refactor-checklist.md)
- [正文产出链路瘦身与资产回灌优化计划](../../plans/chapter-output-pipeline-optimization-plan.md)
- [Prompt Governance Audit 2026-05-08](../../checkpoints/prompt-governance-audit-2026-05-08.md)
- [README 最新更新](../../../README.md)
