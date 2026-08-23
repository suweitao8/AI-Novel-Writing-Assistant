# Shared 契约层与主工作区保护设计

## Background

`shared/` 是客户端和服务端共同依赖的契约层。资产、状态和 API 字段需要跨端同步时，修改这里是合理的；例如资产图片不可变修复仅增加了 `StoryAssetState` 的三个跨端字段。

本次故障不是一次 Git 合并：主工作区的 82 个 `shared/` 文件均为未暂存删除，Git 历史没有对应删除，而所有隔离工作树保有完整副本。主工作区同时出现了不完整的 `node_modules`，导致 Vite 的 React 刷新运行时文件缺失。现有 Hook 只拦截主分支提交与非 main 推送，不能发现未提交的工作树删除，也没有要求共享契约改动显式声明。

## Decision

建立三层独立防线：

1. 主工作区完整性：在开发服务启动和推送前，检查主工作区中所有受 Git 管理的 `shared/` 文件是否被修改、删除或新增。发现时立即中止，并给出只读诊断与恢复指引；不会自动还原文件。
2. 契约改动准入：任何暂存的 `shared/` 改动都只能来自 `codex/shared-*` 分支。普通 `codex/*` 功能分支不能顺带修改跨端契约；需要契约变化时，开发者必须使用明确命名的独立分支。删除 `shared/` 的已跟踪文件一律被 Hook 阻止，必须拆成经人工审查的迁移，不允许通过环境变量静默绕过。
3. 主分支整合：主分支继续只接受合并提交；合并源必须是本地存在的 `codex/*` 分支。推送前再检查主工作区完整性和第一父提交链，防止 `--no-verify` 造成的直接提交或快速合并流入远端。

## Components

- `scripts/workspace-integrity-guard.cjs`：只负责主工作区未提交的 `shared/` 变更和关键运行时依赖文件完整性检查，可供启动脚本和 Git 守卫复用。
- `scripts/git-workflow-guard.cjs`：只负责 Git 分支、提交、暂存变更和推送历史策略；调用完整性守卫而不重复解析工作树状态。
- `.githooks/pre-merge-commit`：确保主分支的合并在写入提交前验证合并来源。
- `scripts/check-deps.cjs`：启动前调用完整性守卫，因此不完整依赖或主工作区 `shared/` 被误删时给出明确失败，而不是让 Vite 静态加载页无限停留。
- `scripts/*.test.cjs`：在临时 Git 仓库中验证阻断和允许路径。
- `docs/wiki/architecture/shared-contract-boundary.md`：记录长期边界和故障诊断路径。

## Data Flow

```
开发启动 / Git Hook
        |
        +-- workspace-integrity-guard
        |      +-- main 主工作区：shared 必须与 HEAD 一致
        |      +-- client 运行时：Vite React 刷新文件必须存在
        |
        +-- git-workflow-guard
               +-- shared 暂存变更：仅 codex/shared-*，禁止删除
               +-- main 提交：仅来自 codex/* 的 merge commit
               +-- 推送：仅 main，第一父链全为 merge commit
```

## Failure Handling

- 主工作区发现 `shared/` 未提交变更：报出变更清单和“不要在主工作区继续开发”的指引；不执行 `git restore`，避免覆盖并发会话。
- 依赖运行时文件缺失：在服务启动前退出，并指向锁文件重装与重启流程。
- 普通功能分支修改 `shared/`：提交被拒绝，要求创建 `codex/shared-<topic>` 契约分支。
- 共享文件删除：提交被拒绝。删除必须作为独立迁移处理，而不是普通功能提交的一部分。
- 主分支直接提交、非 `codex/*` 合并、或直接推送功能分支：均由 Hook 阻止。

## Verification

- 用临时仓库覆盖主分支直接提交、非 codex 合并、普通功能分支改 shared、共享文件删除、合规契约分支、以及 pre-push 旁路提交。
- 用临时主工作区覆盖未暂存 `shared/` 删除的启动前失败；在非主工作区确认不误拦截。
- 运行现有 Git 工作流测试与新增完整性测试。
- 在主工作区真实运行完整性检查，预期针对当前误删的 `shared/` 给出阻断诊断，而不修改文件。

## Non-goals

- 不自动恢复当前 `shared/` 文件，也不归责到某个进程：Windows 文件审计没有记录该删除操作。
- 不禁止经过明确契约分支且通过验证的跨端类型演进。
- 不改变远端仓库权限；本变更提供本地强制防线，远端规则需要另行在托管平台配置。
