# 工作树文件系统隔离与安全清理

## Background

`shared/` 是客户端和服务端共同依赖的源码契约层。Git worktree 只隔离版本文件，不会自动隔离通过 Windows Junction、符号链接或手工复制建立的依赖目录。若某个工作树把 `shared` 或 `node_modules` 指向另一个 checkout，另一个会话执行清理时可能影响真实源码，且 Git 状态未必能在第一时间解释原因。

## Decision

开发工作流采用“每个 checkout 自有源码和依赖”的边界：

- `shared/` 必须是当前 checkout 中的普通目录，不能通过 Junction 或符号链接共享。
- 创建工作树后必须在该目录执行 `pnpm install --frozen-lockfile`，pnpm store 可以复用下载缓存，但 `node_modules` 解析目标不能落到其他 checkout。
- 启动、commit、push、创建和集成前都调用 `scripts/worktree-filesystem-safety.cjs`。检查只读 `lstat`/`realpath`，不自动恢复文件。
- `client`、`server`、`scripts` 存在时也必须是普通源码目录；依赖入口可以是当前 checkout 内的 pnpm 链接，不能指向 checkout 外部。
- 工作树清理只能使用 `pnpm workflow:cleanup codex/<task>`。清理器只接受当前 `main` 已登记、已合入、干净且通过链接检查的工作树。
- 创建新工作树、集成或清理前必须通过 `pnpm workflow:audit`；Git 的 `prunable` 登记、分支对应但未登记的同级目录和缺失登记都属于未解决生命周期异常。
- 历史孤立目录只能使用 `pnpm workflow:recover-worktree codex/<task>` 先做只读验证；只有人工明确加 `--apply`，且源码逐文件匹配已合入分支、路径边界和依赖链接都通过时，才允许清理。

## Current Rule

### 创建

从干净的 `main` 运行：

```powershell
pnpm workflow:worktree <task-name>
```

创建器会先检查 main，再创建同级 `codex/*` 工作树、安装锁定依赖、安装 hooks，并复查隔离性。初始化失败时不会使用递归删除；如果 Git 无法安全登记清理，目录和分支会保留，等待人工检查。

### 开发与启动

```powershell
pnpm check:workspace-integrity
pnpm dev
```

如果出现 `external filesystem link detected`、`source directory must be a real directory` 或 `required source directory is missing`，应停止服务启动，记录错误中的路径和目标，确认当前工作树是否被手工链接或误清理。不要在 `main` 上执行 `git restore`，也不要直接删除目录。

在创建或集成前先运行：

```powershell
pnpm workflow:audit
```

只读审计失败时，先处理报告中的登记/孤立目录，不要绕过门禁创建或合并新的工作树。

### 集成

```powershell
pnpm workflow:integrate codex/<task> --push --verify "pnpm test:workflow"
```

集成器在准备合并前、准备合并后、提交前和推送前检查 main 与源工作树。失败时会中止准备中的 merge，并释放集成锁；主工作区不应留下 `MERGE_HEAD`。

### 清理

```powershell
pnpm workflow:cleanup codex/<task>
```

清理顺序固定为：验证 main 和目标工作树 → 先完整验证六个固定 workspace 依赖根及其内部链接，再一次性移除（`node_modules`、`client/node_modules`、`server/node_modules`、`shared/node_modules`、`site/node_modules`、`video/node_modules`）→ `git worktree remove --force <已验证的精确路径>` → 确认 Git 登记和目录都消失 → `git branch -d <branch>`。依赖清理不会跟随链接，且只作用于这些已验证的依赖目录；流程不使用 `Remove-Item -Recurse`、`rmdir /s` 或 glob 兜底，也不会因后一个依赖根异常而先删掉前一个。任一环节失败时保留现场并根据错误继续诊断。

## Failure Modes

| 现象 | 处理 | 禁止操作 |
| --- | --- | --- |
| `shared` 指向另一个 checkout | 记录 `路径 -> 目标`，在拥有该工作树的会话中恢复为普通目录后再继续 | 直接在 main 删除/恢复整个 shared |
| `node_modules` 指向另一个 checkout | 删除链接本身并在当前工作树执行锁定安装，先确认目标不是源码目录 | 用递归命令跟随链接清理 |
| 创建器安装失败 | 保留脚本打印的工作树和分支路径，检查锁文件、Node/pnpm 版本和磁盘状态 | 手工 `rmdir /s` 后删除分支 |
| 清理器提示未合入或工作树不干净 | 先完成提交并通过集成入口，或明确处理未提交文件 | 强制清理并丢弃并行会话改动 |
| 审计提示 `prunable` 或 `orphan-worktree-directory` | 使用 `pnpm workflow:audit` 定位；仅对内容完全匹配的已合入孤立目录执行显式恢复 | 手工 `rmdir /s`、`Remove-Item -Recurse` 或先删分支 |
| 启动页持续“连接本地创作服务” | 先运行完整 workspace integrity 检查，再检查 API 日志和固定端口；不要绕过门禁 | 改端口或用数据丢失参数重启 |

## Related Modules

- `scripts/worktree-filesystem-safety.cjs`：路径、源码目录、依赖入口和链接目标检查。
- `scripts/workspace-integrity-guard.cjs`：主工作区 Git 状态、启动门禁和客户端运行时检查。
- `scripts/create-codex-worktree.cjs`：独立工作树创建、依赖安装和创建后复查。
- `scripts/integrate-codex-worktree.cjs`：带文件系统复查的锁定集成流程。
- `scripts/cleanup-codex-worktree.cjs`：只清理已合入且干净的登记工作树。
- `scripts/worktree-lifecycle-audit.cjs`：汇总 Git 登记、`prunable` 状态和分支对应的孤立目录。
- `scripts/recover-orphan-worktree.cjs`：对已合入且逐文件匹配的孤立目录提供 dry-run/显式 apply 恢复。
- `scripts/git-workflow-guard.cjs`：commit/pre-push 复用文件系统门禁。

## Source Documents

- `docs/superpowers/specs/2026-08-25-worktree-filesystem-safety-design.md`
- `docs/superpowers/plans/2026-08-25-worktree-filesystem-safety.md`
