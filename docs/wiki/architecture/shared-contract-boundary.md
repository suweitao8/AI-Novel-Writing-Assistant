# Shared 契约层边界

## Background

`shared/` 是网页客户端与服务端共同依赖的数据契约层。它保存跨端必须一致的领域类型、API 负载、资源状态和纯确定性工具。由于视觉资产、角色状态、解析结果等会同时被 API 和 UI 消费，新增跨端字段时修改 `shared/` 是必要且合理的。

主工作区是整合入口，不是开发目录。若在这里直接编辑、删除或批量覆盖 `shared/`，Git 在提交前无法自动记录行为，正在运行的前端还会在下一次模块读取时受到影响。

## Current Rule

1. `shared/` 只放客户端和服务端必须共同理解的稳定契约；页面局部状态、展示格式、组件实现和单端服务逻辑不得放入这里。
2. 普通功能在独立 `codex/*` 工作树开发。涉及 `shared/` 的契约变化必须从 `codex/shared-<topic>` 工作树发起，不能作为普通功能分支的顺带改动。
3. Hook 拒绝删除受 Git 管理的 `shared/` 文件。若确实需要移除契约，必须作为单独迁移设计：先迁移所有消费者、验证，再人工审查删除步骤。
4. `main` 只接收准备好的合并：先执行 `git merge --no-ff --no-commit codex/<task>`，检查合并结果，再执行 `git commit -s --no-edit`。自动合并提交、直接 main 提交和非 `codex/*` 合并均被阻止。
5. 开发启动与 main 推送前运行工作区完整性检查。主工作区一旦出现 `shared/` 的未提交变化，应立即停止，不要使用批量恢复或覆盖命令处理并发工作。

## Verification Commands

```powershell
pnpm check:workspace-integrity
node --test scripts/workspace-integrity-guard.test.cjs scripts/git-workflow-guard.test.cjs
```

`pnpm check:workspace-integrity` 同时检查：

- main 工作区中 `shared/` 的未提交变化；
- 客户端 Vite React 刷新运行时文件是否存在。

当检查失败时，先阅读输出的 Git 状态。对于主工作区，恢复必须只针对已验证的路径，并在恢复前保存现场；不要将别的工作树的文件整目录复制到 main。

## Failure Modes

### 主工作区 shared 被误删

表现：`git status -- shared` 出现大量 `D`，前端可能在模块加载或类型构建阶段失败。

诊断：确认删除未暂存、没有其他并发改动，并检查其他隔离工作树是否仍有完整副本。Git 不会记录未提交的物理删除来源；若操作系统未启用文件审计，不能据此推断删除进程。

恢复：在用户确认后备份当前状态，再从已验证的 `main` HEAD 恢复精确路径。恢复后运行工作区完整性检查和客户端启动预检。

### node_modules 被重装或清理后旧 Vite 仍在运行

表现：`/@react-refresh` 返回 500，报错指向已不存在的 pnpm 虚拟仓库路径，页面停在 HTML 启动占位。

处理：使用锁文件重建依赖，确认 `pnpm check:workspace-integrity` 通过，再重启固定端口 5174 的本项目 Vite 进程。不要改端口绕过问题。

## Related Modules

- `scripts/workspace-integrity-guard.cjs`
- `scripts/check-deps.cjs`
- `scripts/git-workflow-guard.cjs`
- `.githooks/pre-commit`
- `.githooks/pre-merge-commit`
- `.githooks/pre-push`
