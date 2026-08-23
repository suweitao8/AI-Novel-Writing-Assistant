# 仓库开发交付闭环

## Background

项目的开发规则已经规定了主工作区、隔离 worktree、专用分支、合并和远程分支边界，但仅有这些步骤还不足以保证每次需求都真正交付。明确的目标如果被误读成“只做检查或给建议”，就会留下本地修改、未提交或未推送的中间状态，迫使用户逐步补充本应由开发流程自动完成的指令。

## Decision

当用户给出具体的目标状态和范围时，将其视为完整的实现请求；除非用户明确要求只诊断、只审查、只改本地或在交付前暂停，否则必须完成从实现到远程 `main` 的闭环。执行方式由变更类型决定：代码和产品变更使用隔离 worktree，文档和规则文件变更可使用主工作区的例外。

## Current Rule

- 先检查工作区范围和并行 worktree，再按变更类型选择隔离 worktree 或主工作区规则文件例外。
- 完成实现后运行与范围匹配的聚焦验证；配置或忽略规则要验证实际路径是否被规则命中。
- 用 `git commit -s` 提交完整单元；代码 worktree 还必须合并回 `main`。
- 从主工作区显式执行 `git push origin main`，不推送临时 worktree 分支。
- 推送后检查 `git status --short --branch`、`git worktree list --porcelain` 和本地/远程提交引用，确认没有遗留的中间状态。
- 正常的实现、验证、提交、合并、推送和清理步骤不逐项向用户索要授权；只有缺少必要事实、存在破坏性风险、超出请求范围或发生并行冲突时才暂停询问。

## Failure Modes

- 只修改文件然后询问“是否提交”：说明需求被降级成了建议，必须回到闭环交付流程。
- 只创建本地提交但未推送：这仍是中间状态，不能报告为完成。
- 代码直接写入主工作区：改用同级隔离 worktree；只有文档或规则文件变更适用主工作区例外。
- 忽略规则看似正确但文件仍出现在 Git 状态中：使用 `git check-ignore -v --no-index <path>` 验证实际匹配，而不是凭规则名称推断。

## Related Modules

- `AGENTS.md` 的 `Autonomous Execution Rules` 与 `Development Workflow`
- `.gitignore`
- `git worktree`、`git commit -s`、`git push origin main`
