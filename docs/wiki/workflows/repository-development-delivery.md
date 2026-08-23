# 仓库开发交付闭环

## Background

项目的开发规则已经规定了主工作区、隔离 worktree、专用分支、合并和远程分支边界，但仅有文字约定不足以阻止主工作区出现直接提交。此前“文档/规则文件可在主工作区提交”的例外，使设计文档、实现计划和 wiki 变更能够绕过隔离分支；同时仓库没有启用提交与推送 hook，因此规则无法在命令执行时落地。

## Decision

当用户给出具体的目标状态和范围时，将其视为完整的实现请求；除非用户明确要求只诊断、只审查、只改本地或在交付前暂停，否则必须完成从实现到远程 `main` 的闭环。所有变更类型——包括代码、产品、设计文档、实现计划、wiki 和规则文件——都使用隔离 worktree；主工作区只负责已验证分支的显式集成和推送。

## Current Rule

- 先检查工作区范围和并行 worktree，所有变更统一选择同级隔离 worktree。
- 新任务优先运行 `pnpm workflow:worktree <task>`；它只从干净 `main` 创建同级 `codex/<task>` worktree，并自动安装 hooks。
- 新 checkout 或新环境先运行 `pnpm setup:git-hooks`，确认本地 `core.hooksPath` 指向仓库内的 `.githooks`。
- `pnpm check:workspace-integrity` 是开发启动前置门禁；`main` 只要存在任意未提交的非 ignored 文件、未完成 merge、缺失 hooks 或错误的 `merge.ff`，就必须停止并迁移到隔离 worktree。
- 安装脚本同时设置 `merge.ff=false`；普通 `git merge` 必须留下 merge commit，不能把 feature 分支 fast-forward 到 `main`。
- 完成实现后运行与范围匹配的聚焦验证；配置或忽略规则要验证实际路径是否被规则命中。
- 用 `git commit -s` 提交完整单元；代码 worktree 还必须合并回 `main`。
- `main` 上的直接 commit、amend、cherry-pick、revert 和 rebase 会被 hook 拒绝；只有显式 merge 产生的 merge commit 可以写入 `main`。
- `pre-push` 只允许从 `main` 工作区推送 `refs/heads/main`，`codex/*` 分支保持本地，不直接推送到远程。
- 从主工作区显式执行 `git push origin main`，不推送临时 worktree 分支。
- 集成优先使用 `pnpm workflow:integrate codex/<task> --push [--verify "<command>"]`；它用 common Git dir 锁串行化对话间的集成，并在冲突或验证失败时自动中止准备合并。
- 推送后检查 `git status --short --branch`、`git worktree list --porcelain` 和本地/远程提交引用，确认没有遗留的中间状态。
- 正常的实现、验证、提交、合并、推送和清理步骤不逐项向用户索要授权；只有缺少必要事实、存在破坏性风险、超出请求范围或发生并行冲突时才暂停询问。

## Failure Modes

- 只修改文件然后询问“是否提交”：说明需求被降级成了建议，必须回到闭环交付流程。
- 只创建本地提交但未推送：这仍是中间状态，不能报告为完成。
- 代码、文档或规则文件直接写入主工作区：改用同级隔离 worktree；主工作区没有开发提交例外。
- hook 未安装或使用 `--no-verify`：先运行 `pnpm setup:git-hooks`，禁止以绕过 hook 的方式继续开发。
- 主工作区有普通文件变化但仍启动服务：`check:workspace-integrity` 会阻止启动；不要在主目录恢复、覆盖或继续编辑并行会话的文件。
- API 子进程退出而 Vite 仍存活：由 `scripts/dev-service-supervisor.cjs` 负责有限重启和整组收敛；先查 `3100/api/health` 与 `.logs`，不要只刷新浏览器。
- 集成锁被占用：确认持有进程和分支，等待其结束；不要删除活跃锁或绕过标准集成入口。
- 忽略规则看似正确但文件仍出现在 Git 状态中：使用 `git check-ignore -v --no-index <path>` 验证实际匹配，而不是凭规则名称推断。

## Related Modules

- `AGENTS.md` 的 `Autonomous Execution Rules` 与 `Development Workflow`
- `.githooks/` 与 `scripts/git-workflow-guard.cjs`
- `scripts/workspace-integrity-guard.cjs`、`scripts/create-codex-worktree.cjs`、`scripts/integrate-codex-worktree.cjs`
- `scripts/dev-service-supervisor.cjs`
- `.gitignore`
- `git worktree`、`git commit -s`、`git push origin main`
