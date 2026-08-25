# 工作树文件系统隔离与受控清理设计

## 背景

`shared/` 是客户端和服务端共同使用的源码契约层。此前主工作区出现过整目录文件被删除的事故：Git 历史没有对应删除提交，但活动工作树之间存在把 `shared`、`node_modules` 指向其他 checkout 的 Junction，随后手工清理失败的工作树时影响了真实源码。现有守卫只检查 Git 未提交状态，无法发现跨 checkout 的文件系统链接，也无法阻止“清理失败但继续删分支”的半完成状态。

本设计只治理开发工作流，不修改业务代码、数据库和运行时数据。目标是让“源码目录和依赖目录必须属于当前 checkout”成为可执行的前置条件，并让清理动作在无法安全完成时停在原地。

## 目标

1. 主工作区和每个 `codex/*` 工作树都禁止把源码或依赖解析到其他工作树、仓库根目录或未知目录。
2. `shared/` 必须存在、是当前 checkout 的普通目录，并且在 `main` 上保持 Git 干净。
3. 创建、启动、提交、合并和推送前都执行同一套文件系统隔离检查；发现 Junction、符号链接或缺失源码时立即失败并给出路径与目标。
4. 提供显式的工作树清理入口。它只处理 Git 已登记的非 `main` 工作树，先验证工作树干净且无外部链接，再调用 Git 的受控删除；任何删除失败都不递归兜底、不删除分支。
5. 为上述规则提供 Node 内置测试，覆盖跨工作树链接、缺失 `shared`、清理失败、主工作区脏状态和正常隔离路径。

## 非目标

- 不自动恢复被删除的文件，不执行 `git restore`、数据库重置或 Prisma 数据丢失迁移。
- 不修改已有并行工作树，不删除未明确指定的目录或分支。
- 不禁止 pnpm 在当前 checkout 内建立的链接；只阻止解析到 checkout 外部的链接。
- 不递归扫描整个 `.pnpm` 内容仓库；检查范围聚焦源码目录和本项目依赖入口，避免启动明显变慢。

## 方案

### 1. 统一安全模块

新增 `scripts/worktree-filesystem-safety.cjs`，提供以下职责：

- 解析当前 checkout、Git common dir 和已登记工作树路径；所有路径比较使用规范化绝对路径和 `realpath`，避免大小写、`.`、`..` 绕过。
- 检查 `shared`、`client`、`server`、`scripts` 等源码根目录必须是当前 checkout 内的普通目录；`shared` 缺失时给出恢复提示，不自动修复。
- 检查根目录、`client/node_modules`、`server/node_modules`、`shared/node_modules` 的直接依赖入口和 `@ai-novel/shared` 解析目标。允许当前 checkout 内的 pnpm 链接，拒绝指向主 checkout、其他 worktree 或 checkout 外部的 Junction/符号链接。
- 提供可测试的 `assertWorktreeFilesystemIsolation`、`assertMainSourceIntegrity` 和 `inspectReparsePoints`，错误信息包含“链接路径 -> 真实目标”。

安全检查不跟随外部链接递归遍历。对链接只读取 `lstat` 和 `realpath`，对普通目录只扫描约定的顶层入口；因此检查本身不会因为 `node_modules` 规模而扩大破坏面。

### 2. 工作流入口接入

- `workspace-integrity-guard.cjs` 在主工作区完整性检查之外，始终运行文件系统隔离检查；启动命令在发现源码缺失或外部链接时直接退出。
- `create-codex-worktree.cjs` 创建前检查主工作区，创建后先运行 `pnpm install --frozen-lockfile` 建立独立依赖，再安装 hooks 和复查隔离性。初始化失败时只尝试 Git 的非破坏性登记清理；如果 Git 拒绝删除，不递归删除目录，不删除仍登记的分支，并打印精确恢复步骤。
- `integrate-codex-worktree.cjs` 在准备合并前、准备合并后和提交/推送前检查主工作区与源工作树，任何文件系统异常都会触发 `git merge --abort` 并释放集成锁。
- `git-workflow-guard.cjs` 的 commit/pre-push 检查复用安全模块，避免通过绕过启动命令的方式提交或推送受污染工作树。
- `dev-service-supervisor.cjs` 使用完整 startup guard，避免 Vite 还活着但源码/依赖实际已经串到别的工作树。

### 3. 受控清理入口

新增 `scripts/cleanup-codex-worktree.cjs` 和 `pnpm workflow:cleanup`：

1. 只能从干净的 `main` 运行。
2. 目标必须是 Git 登记的、非 detached、非 `main` 的 `codex/*` 工作树，且分支已经合入当前 `main`。
3. 目标工作树必须干净，且通过无外部链接检查；任一条件不满足就停止。
4. 先对当前工作树明确的 `node_modules`、`client/node_modules`、`server/node_modules`、`shared/node_modules` 做非跟随式链接复查，只移除这些已验证的依赖根；再执行 `git worktree remove --force <validated-path>`，随后确认登记已消失、路径已消失，最后才删除本地分支。
5. Git 删除失败时保留目录和分支，输出原始错误与人工处理建议；不使用 `Remove-Item -Recurse`、`rmdir /s` 或未解析的 glob 作为兜底。

`--force` 只在目标已通过路径边界和 reparse-point 检查、且本地依赖根已被安全移除后使用，且只作用于 Git 登记的精确工作树路径。依赖清理只允许固定的四个 `node_modules` 根，并逐项 `lstat` 检查链接目标在当前 checkout 内；不接受任意目录或 glob。这样可以清理正常工作树中的本地依赖，同时避免跨工作树 Junction 被 Git 删除流程跟随。

## 数据流与失败处理

```text
创建 / 启动 / 提交 / 合并 / 推送 / 清理
                |
                v
      worktree-filesystem-safety
        |             |
        |             +-- 源码目录和 shared 完整
        +-- 依赖入口只解析到当前 checkout
                |
       失败 ----+---- 通过
       立即停止       继续原有 Git/服务流程
```

失败信息必须说明：检查阶段、路径、解析后的目标、建议使用的受控入口。检查失败不自动恢复文件、不删除目录、不修改数据库。

## 验收标准

- 在任意 checkout 的 `shared` 创建指向另一个 checkout 的 Junction/符号链接时，`pnpm check:workspace-integrity`、`pnpm dev:raw`、commit 和 pre-push 均非零退出，并报告源路径与目标路径。
- `shared` 被删除或关键源码目录缺失时，启动和集成前检查失败，且检查不修改工作区。
- 新工作树在独立 `pnpm install --frozen-lockfile` 后通过隔离检查；不会创建指向主工作区的依赖 Junction。
- 清理正常已合入工作树时，Git 登记、目标目录和本地分支按顺序消失；清理失败时目录和分支仍保留，且不执行递归删除。
- 现有工作流测试与新增安全测试全部通过，主工作区和其他登记工作树的状态不被触碰。
