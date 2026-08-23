# 仓库开发交付闭环

## Background

项目的开发规则已经规定了主工作区、隔离 worktree、专用分支、合并和远程分支边界，但仅有文字约定不足以阻止主工作区出现直接提交。此前“文档/规则文件可在主工作区提交”的例外，使设计文档、实现计划和 wiki 变更能够绕过隔离分支；同时仓库没有启用提交与推送 hook，因此规则无法在命令执行时落地。

## Decision

当用户给出具体的目标状态和范围时，将其视为完整的实现请求；除非用户明确要求只诊断、只审查、只改本地或在交付前暂停，否则必须完成从实现到远程 `main` 的闭环。所有变更类型——包括代码、产品、设计文档、实现计划、wiki 和规则文件——都使用隔离 worktree；主工作区只负责已验证分支的显式集成和推送。

## Current Rule

- 先检查工作区范围和并行 worktree，所有变更统一选择同级隔离 worktree。
- 新 checkout 或新环境先运行 `pnpm setup:git-hooks`，确认本地 `core.hooksPath` 指向仓库内的 `.githooks`。
- 完成实现后运行与范围匹配的聚焦验证；配置或忽略规则要验证实际路径是否被规则命中。
- 用 `git commit -s` 提交完整单元；代码 worktree 还必须合并回 `main`。
- `main` 上的直接 commit、amend、cherry-pick、revert 和 rebase 会被 hook 拒绝；只有显式 merge 产生的 merge commit 可以写入 `main`。
- `pre-push` 只允许从 `main` 工作区推送 `refs/heads/main`，`codex/*` 分支保持本地，不直接推送到远程。
- 从主工作区显式执行 `git push origin main`，不推送临时 worktree 分支。
- 推送后检查 `git status --short --branch`、`git worktree list --porcelain` 和本地/远程提交引用，确认没有遗留的中间状态。
- 正常的实现、验证、提交、合并、推送和清理步骤不逐项向用户索要授权；只有缺少必要事实、存在破坏性风险、超出请求范围或发生并行冲突时才暂停询问。

## Failure Modes

- 只修改文件然后询问“是否提交”：说明需求被降级成了建议，必须回到闭环交付流程。
- 只创建本地提交但未推送：这仍是中间状态，不能报告为完成。
- 代码、文档或规则文件直接写入主工作区：改用同级隔离 worktree；主工作区没有开发提交例外。
- hook 未安装或使用 `--no-verify`：先运行 `pnpm setup:git-hooks`，禁止以绕过 hook 的方式继续开发。
- 忽略规则看似正确但文件仍出现在 Git 状态中：使用 `git check-ignore -v --no-index <path>` 验证实际匹配，而不是凭规则名称推断。

## Related Modules

- `AGENTS.md` 的 `Autonomous Execution Rules` 与 `Development Workflow`
- `.githooks/` 与 `scripts/git-workflow-guard.cjs`
- `.gitignore`
- `git worktree`、`git commit -s`、`git push origin main`
