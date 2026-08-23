# 开发服务与工作区阻塞排查

## Background

本地创作工作台由 Vite 客户端和 API 服务组成。客户端端口 `5174` 可以继续响应页面，即使 API `3100` 已经退出；这时页面会停在“正在连接本地创作服务”，浏览器代理会持续记录 `connect ECONNREFUSED 127.0.0.1:3100`。这不是通过刷新页面或切换端口可以解决的问题。

并行开发还可能把未提交文件写入共享的 `main` 工作区，或让两个对话同时准备 merge。文件覆盖、Hook 失效和半成品 merge 会把其他对话一起拖入阻塞状态。

## Decision

把工作区隔离和服务进程收敛作为同一个开发运行合同：

- `main` 只承担干净集成、运行和推送；代码、文档、规则和测试都在同级 `codex/*` worktree 中完成。
- `pnpm check:workspace-integrity` 在启动前检查主分支脏状态、`MERGE_HEAD`、hooks 路径和 `merge.ff`。
- `pnpm workflow:worktree <task>` 是新任务的标准创建入口。
- `pnpm workflow:integrate codex/<task> --push` 是合并和推送入口，使用 Git common dir 下的原子锁。
- `dev-service-supervisor.cjs` 只重启真正退出的子服务；持续失败时终止全部子服务，避免 Vite 独自存活。

## Diagnosis path

先确认页面所在层，再确认 API，再确认进程和工作区：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3100,5174
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3100/api/health
git status --short --branch
git worktree list --porcelain
pnpm check:workspace-integrity
```

结果解释：

- `5174` 在、`3100` 不在：检查最新 `.logs/<date>/*-dev.log` 的 server lane，尤其是 `ELIFECYCLE`、`ECONNRESET`、Prisma 输出和退出码。
- `3100/api/health` 返回 `200`：API 已恢复，浏览器门禁会自动继续；若页面仍未变化，再刷新当前页面并检查浏览器 console。
- `check:workspace-integrity` 报主工作区变化：不要在 `main` 上恢复或覆盖文件；保留现状，使用 `pnpm workflow:worktree <task>` 创建隔离目录。
- 集成锁被占用：读取锁中的 PID、分支和时间，确认持有进程仍在运行后等待，不删除活跃锁。

## Prisma safety boundary

`server/scripts/ensure-dev-prisma.cjs` 可以在开发启动时执行 `prisma generate` 和安全的 schema 检查。如果 Prisma 报告可能删除非空数据，启动失败是保护行为；必须先做明确备份和迁移决策，不能使用 `--accept-data-loss`、`db reset` 或删除 `dev.db` 来“恢复网站”。

## Failure modes

- 只启动 Vite 或只刷新浏览器：不会修复缺失的 API 进程。
- 在 `main` 修改后继续启动服务：会让多个对话共享脏状态，即使最后的 commit Hook 能拦截，阻塞也已经发生。
- 手工 `git merge`、删除集成锁或使用 `--no-verify`：绕过了来源校验和并行保护，可能留下无法判断归属的 `main` 状态。
- API 持续失败时无限自动重启：会掩盖 Prisma、依赖或端口的真实错误；supervisor 采用有限次数并整组退出，日志是下一步诊断入口。

## Related modules

- `scripts/workspace-integrity-guard.cjs`
- `scripts/create-codex-worktree.cjs`
- `scripts/integrate-codex-worktree.cjs`
- `scripts/dev-service-supervisor.cjs`
- `client/src/components/layout/ServerStartupGate.tsx`
- `server/scripts/ensure-dev-prisma.cjs`
- `docs/wiki/workflows/repository-development-delivery.md`

## Source documents

- `docs/superpowers/specs/2026-08-24-development-workflow-resilience-design.md`
- `docs/superpowers/plans/2026-08-24-development-workflow-resilience.md`
