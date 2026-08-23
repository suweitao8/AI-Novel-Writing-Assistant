# 开发工作流隔离与故障阻塞治理设计

## Background

最近一次“正在连接本地创作服务”不是前端页面本身损坏，而是开发编排中的 API 子进程退出后，Vite 客户端仍继续运行。`5174` 仍然可访问，但 `3100/api/health` 被代理为 `ECONNREFUSED`，前端门禁没有可用服务就持续等待。

Git 侧也存在过主分支直接提交：`322897bd` 于 2026-08-23 22:07 写入 `main`，早于 `b66c3a55` 合入的主分支 Hook。当前 Hook 已能拦截直接 commit 和错误 merge，但它不能阻止开发者先在 `main` 修改普通文件，也不能替新 checkout 自动建立完整的开发入口。多个对话因此可能共享一个主工作区或同时准备集成，互相阻塞。

## Goals

1. `main` 只作为干净的集成、运行和推送工作区，开发变更必须进入同级 `codex/<task>` worktree。
2. 新 worktree 自动完成 Hook 初始化，降低“忘记安装保护”的概率。
3. 集成过程由单一入口串行化，避免多个对话同时修改 `main` 或留下半成品 merge。
4. API 子进程的短暂异常能够自动恢复；连续失败时整组开发进程明确退出并保留日志，不能留下只显示“连接中”的假活页面。
5. 保留现有数据安全边界：不使用 `--no-verify`、不接受 Prisma 数据丢失、不重置数据库。

## Non-goals

- 不把 `codex/*` 功能分支推送到远程；远程只保留 `main`。
- 不自动删除其他对话仍可能使用的 worktree、分支或未提交改动。
- 不把业务代码、数据库迁移或产品 UI 改动混入本次流程治理。
- 不用一个新的“万能 shared/”目录承接流程工具；流程脚本归根目录 `scripts/`，文档归 Wiki。

## Decision

### 1. 开发入口：标准 worktree 创建器

新增 `scripts/create-codex-worktree.cjs` 与 `pnpm workflow:worktree`。命令只能从干净的 `main` 创建任务，验证当前没有未完成 merge、主工作区无未提交文件、任务名可安全映射为 slug，然后在仓库同级创建 `codex/<slug>` 分支和 worktree，最后在新目录运行 `pnpm setup:git-hooks`。

如果创建目标或分支已经存在，命令失败而不覆盖任何目录。脚本不会推送分支，也不会修改其他 worktree。

### 2. 主工作区开发门禁

扩展 `scripts/workspace-integrity-guard.cjs`，在开发启动前增加“主工作区必须干净”的检查：

- 当前分支是 `main` 时，任何 tracked 或 untracked 非 ignored 变化都阻止启动；
- `MERGE_HEAD` 存在时阻止启动，要求先完成或中止集成；
- `core.hooksPath` 必须指向当前 checkout 的 tracked `.githooks`，`merge.ff` 必须为 `false`；
- `codex/*` worktree 不受主工作区脏状态规则影响，但仍保留依赖和客户端运行时检查。

根目录 `pnpm dev` 与 server 的 `dev:api` 都经过这条门禁，避免只启动某一个子服务绕过流程。

### 3. 集成入口与跨对话锁

新增 `scripts/integrate-codex-worktree.cjs` 与 `pnpm workflow:integrate`。它只接受 `main` 工作区和本地 `codex/*` 分支，按以下顺序执行：

1. 获取仓库级原子锁；
2. 确认 `main` 干净、没有未完成 merge，任务 worktree 干净且分支确实由本地 worktree 持有；
3. 执行 `git merge --no-ff --no-commit codex/<task>`；
4. 检查暂存内容格式，必要时运行用户指定的聚焦验证命令；
5. 执行 `git commit -s --no-edit`，让现有 Hook 再次验证 `MERGE_HEAD` 和来源分支；
6. 用显式 `git push origin main` 推送，并复核本地和远程引用。

冲突会自动中止本次准备合并并保留清晰错误，不把冲突状态留给其他对话。锁文件使用 Git common dir 下的原子创建，记录 PID、分支和时间；进程已经结束的陈旧锁可以安全清理，活跃锁必须等待或退出，禁止绕过。

默认不清理任务 worktree。只有显式使用清理选项且已确认分支已合入、worktree 干净时才允许清理，避免误删并行会话的工作。

### 4. 开发服务故障收敛

将 `dev:raw` 交给 `scripts/dev-service-supervisor.cjs`，不再直接依赖 `concurrently` 管理重启。supervisor 为每个服务单独记录重启次数和指数退避，只重启真正退出的服务；当一个服务超过重试上限时，终止全部仍存活的兄弟进程并停止重启计时器。这样临时 `ECONNRESET` 可以自愈，真实启动失败不会让前端继续假装等待，也不会因为终止兄弟进程而把客户端重新拉起。

Prisma 的安全前置检查保持原样：如果 schema 变化可能删除非空数据，启动必须失败并要求备份/迁移决策，不能通过 `--accept-data-loss` 绕过。

### 5. 文档与回归验证

更新开发交付 Wiki、AGENTS 工作流命令和故障排查条目，记录四类可复现问题：主分支直接提交、主工作区脏状态、API 退出而 Vite 存活、Prisma 安全检查阻塞。新增脚本测试覆盖正常路径、拒绝路径、锁竞争、冲突回滚、worktree 初始化和服务编排策略。

## Failure handling

| 现象 | 根因 | 新入口行为 |
| --- | --- | --- |
| `5174` 可访问但 `/api/health` 连接拒绝 | API 子进程退出，旧编排没有重启/收敛 | supervisor 只重启 API；最终整组退出并留下日志 |
| `main` 有未提交文件仍启动开发 | 启动检查只关注 `shared/` | 开发命令直接报告文件并要求创建 worktree |
| Hook 未安装导致主分支可提交 | 新 checkout 缺少本地 hooks 配置 | worktree 创建器自动安装；启动前核验配置 |
| 多个对话同时合并 | 没有集成级锁 | 集成入口持有 common-dir 原子锁 |
| Prisma 提示可能丢失数据 | schema 与本地数据库不兼容 | 保持失败，不接受数据丢失，不自动改库 |

## Acceptance criteria

- 主工作区 `main` 有任意未提交文件时，`pnpm check:workspace-integrity` 和 `pnpm dev` 均以可读错误退出。
- `pnpm workflow:worktree sample-task` 只创建同级 `codex/sample-task` worktree，并自动安装 hooks。
- 直接 `git commit`、自动 merge、feature 分支 push 以及非 codex 来源合并仍被 Hook 拒绝。
- 两个集成进程同时运行时，只有一个获得锁；冲突或失败后 `main` 不遗留 merge 状态。
- 模拟 API 子进程短暂退出时，`dev:raw` 会按策略重启；超过次数后 supervisor 会停止所有子进程且不重新拉起被终止的客户端。
- 所有流程脚本测试通过，主工作区和所有既有 worktree 的未提交改动不被触碰。
