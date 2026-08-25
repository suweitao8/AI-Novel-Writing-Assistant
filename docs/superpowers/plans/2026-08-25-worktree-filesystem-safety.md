# 工作树文件系统隔离与受控清理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 防止主工作区和 `codex/*` 工作树通过 Junction/符号链接共享源码或依赖，并让工作树清理失败时不遗留“目录已删、分支已删”这类半完成状态。

**Architecture:** 新增无副作用的 `worktree-filesystem-safety.cjs`，用 `lstat`/`realpath` 检查当前 checkout 的源码根目录和依赖入口是否解析到 checkout 外部；所有开发入口复用这一模块。创建器为新工作树执行独立的锁文件安装，新增的清理器只处理已登记且已合入的工作树，并在 Git 删除失败时保留现场。

**Tech Stack:** Node.js CommonJS、Node `node:test`、Git worktree、pnpm workspace、Windows Junction/符号链接。

---

### Task 1: 建立文件系统隔离守卫的红灯测试

**Files:**
- Create: `scripts/worktree-filesystem-safety.test.cjs`
- Create: `scripts/worktree-filesystem-safety.cjs`

- [ ] **Step 1: 写出普通 checkout 和外部链接的测试夹具**

测试夹具创建一个临时 Git 仓库，提交 `shared/types/example.ts`、`client/`、`server/` 和 `scripts/`，并使用 `fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir")` 创建目录链接。夹具清理只针对测试临时目录，不调用生产清理器。

- [ ] **Step 2: 写出失败测试**

```js
test("accepts a checkout whose source and dependency roots are local", (t) => {
  const fixture = createFixture(t);
  fs.mkdirSync(path.join(fixture, "node_modules"), { recursive: true });
  assert.doesNotThrow(() => assertWorktreeFilesystemIsolation({ cwd: fixture }));
});

test("rejects shared when it is a junction to another checkout", (t) => {
  const fixture = createFixture(t);
  const other = createFixture(t);
  fs.rmSync(path.join(fixture, "shared"), { recursive: true, force: true });
  linkDirectory(path.join(other, "shared"), path.join(fixture, "shared"));

  assert.throws(
    () => assertWorktreeFilesystemIsolation({ cwd: fixture }),
    /shared[\s\S]*outside|shared[\s\S]*->/i,
  );
});

test("rejects a dependency root that resolves to another checkout", (t) => {
  const fixture = createFixture(t);
  const other = createFixture(t);
  linkDirectory(path.join(other, "node_modules"), path.join(fixture, "node_modules"));

  assert.throws(
    () => assertWorktreeFilesystemIsolation({ cwd: fixture }),
    /node_modules[\s\S]*outside|node_modules[\s\S]*->/i,
  );
});

test("rejects a missing shared source directory", (t) => {
  const fixture = createFixture(t);
  fs.rmSync(path.join(fixture, "shared"), { recursive: true, force: true });

  assert.throws(() => assertWorktreeFilesystemIsolation({ cwd: fixture }), /shared.*missing/i);
});
```

- [ ] **Step 3: 运行测试确认确实红灯**

Run: `node --test scripts/worktree-filesystem-safety.test.cjs`

Expected: FAIL，因为新模块尚未导出 `assertWorktreeFilesystemIsolation`。

- [ ] **Step 4: 提交测试夹具**

```powershell
git add scripts/worktree-filesystem-safety.test.cjs
git commit -s -m "test: cover cross-worktree filesystem links"
```

### Task 2: 实现守卫并接入启动与 Git hooks

**Files:**
- Modify: `scripts/worktree-filesystem-safety.cjs`
- Modify: `scripts/workspace-integrity-guard.cjs`
- Modify: `scripts/git-workflow-guard.cjs`
- Modify: `scripts/worktree-filesystem-safety.test.cjs`
- Modify: `scripts/workspace-integrity-guard.test.cjs`
- Modify: `scripts/git-workflow-guard.test.cjs`

- [ ] **Step 1: 实现最小路径和链接检查**

```js
function assertWorktreeFilesystemIsolation({ cwd = process.cwd(), phase = "workspace" } = {}) {
  const root = repositoryRoot(cwd);
  assertRegularDirectory(path.join(root, "shared"), { required: true, phase });
  for (const sourceName of ["client", "server", "scripts"]) {
    const sourcePath = path.join(root, sourceName);
    if (fs.existsSync(sourcePath)) assertRegularDirectory(sourcePath, { required: false, phase });
  }
  for (const dependencyRoot of DEPENDENCY_ROOTS) inspectDependencyRoot(path.join(root, dependencyRoot), root, phase);
  return { root };
}
```

`assertRegularDirectory` 必须先 `lstat`，拒绝符号链接/Junction，即使目标在当前 checkout 内；依赖根允许当前 checkout 内的 pnpm 链接，但 `realpath` 不得落在 `root` 外。错误必须包含检查阶段、链接路径和真实目标。

- [ ] **Step 2: 运行隔离测试确认绿灯**

Run: `node --test scripts/worktree-filesystem-safety.test.cjs`

Expected: 4 个测试通过，外部 `shared`、外部 `node_modules` 和缺失 `shared` 均被阻断。

- [ ] **Step 3: 接入 workspace startup guard**

在 `assertDevelopmentWorkspaceIntegrity` 的分支判断之前调用：

```js
assertWorktreeFilesystemIsolation({ cwd, phase: "development startup" });
```

`assertMainWorkspaceSharedIntegrity` 保留原有 Git 状态检查；`assertStartupIntegrity` 不自动恢复文件。为现有临时仓库夹具补齐 `shared/`，确保旧测试验证的是原有行为而不是夹具缺失。

- [ ] **Step 4: 接入 commit/pre-push guard**

在 `assertCommitAllowed` 和 `assertPushAllowed` 中复用同一检查：

```js
assertWorktreeFilesystemIsolation({ cwd: process.cwd(), phase: "git hook" });
```

只读失败，不执行 `git restore`、删除目录或数据库命令。

- [ ] **Step 5: 运行现有守卫回归测试**

Run: `node --test scripts/worktree-filesystem-safety.test.cjs scripts/workspace-integrity-guard.test.cjs scripts/git-workflow-guard.test.cjs`

Expected: 全部通过，并保留主工作区脏状态、普通分支契约限制和直接提交阻断。

- [ ] **Step 6: 提交守卫单元**

```powershell
git add scripts/worktree-filesystem-safety.cjs scripts/worktree-filesystem-safety.test.cjs scripts/workspace-integrity-guard.cjs scripts/workspace-integrity-guard.test.cjs scripts/git-workflow-guard.cjs scripts/git-workflow-guard.test.cjs
git commit -s -m "fix: block cross-worktree filesystem sharing"
```

### Task 3: 收紧创建、启动和集成流程

**Files:**
- Modify: `scripts/create-codex-worktree.cjs`
- Modify: `scripts/create-codex-worktree.test.cjs`
- Modify: `scripts/integrate-codex-worktree.cjs`
- Modify: `scripts/integrate-codex-worktree.test.cjs`
- Modify: `scripts/dev-service-supervisor.cjs`
- Modify: `package.json`

- [ ] **Step 1: 为创建器补充失败测试**

创建器临时仓库必须包含最小 `shared/` 和可冻结的 `pnpm-lock.yaml`。测试断言创建完成后工作树的 `shared` 是普通目录、hooks 已配置、隔离检查通过；另一个测试把主工作区 `shared` 替成外部链接，断言创建命令在创建前失败且不创建目标路径。

- [ ] **Step 2: 运行创建器测试确认新断言红灯**

Run: `node --test scripts/create-codex-worktree.test.cjs`

Expected: 新增的隔离断言测试先失败，原因是创建器还没有调用文件系统安全模块和独立安装。

- [ ] **Step 3: 实现创建后的独立依赖安装和复查**

创建成功后按以下顺序执行：

```js
runInstall(resolvedTarget); // pnpm install --frozen-lockfile
runSetup(resolvedTarget);   // pnpm setup:git-hooks
assertWorktreeFilesystemIsolation({ cwd: resolvedTarget, phase: "worktree creation" });
```

初始化失败时调用不带 `--force` 的 `git worktree remove`；删除失败或目标仍登记时保留目录和分支并输出精确路径，不使用递归删除兜底。

- [ ] **Step 4: 在集成前后加安全检查**

`assertIntegrationPreconditions` 检查 main 和 source worktree；准备 `--no-ff --no-commit` 后再次检查 main，提交前再检查一次。任意检查失败走现有 `git merge --abort` 路径。

- [ ] **Step 5: 让 supervisor 运行完整启动检查并更新命令**

`assertSupervisorStartupIntegrity` 调用 `assertStartupIntegrity`，并在 `package.json` 增加：

```json
"workflow:cleanup": "node scripts/cleanup-codex-worktree.cjs"
```

- [ ] **Step 6: 运行创建、集成和编排测试**

Run: `node --test scripts/create-codex-worktree.test.cjs scripts/integrate-codex-worktree.test.cjs scripts/dev-orchestration-policy.test.cjs`

Expected: 创建成功、脏 source 阻断、冲突回滚和 supervisor 兄弟进程收敛测试全部通过。

- [ ] **Step 7: 提交创建与集成单元**

```powershell
git add scripts/create-codex-worktree.cjs scripts/create-codex-worktree.test.cjs scripts/integrate-codex-worktree.cjs scripts/integrate-codex-worktree.test.cjs scripts/dev-service-supervisor.cjs package.json
git commit -s -m "fix: isolate worktree creation and integration"
```

### Task 4: 新增受控工作树清理入口

**Files:**
- Create: `scripts/cleanup-codex-worktree.cjs`
- Create: `scripts/cleanup-codex-worktree.test.cjs`
- Modify: `package.json`

- [ ] **Step 1: 写清理器红灯测试**

覆盖三条路径：未合入分支被拒绝、脏工作树被拒绝、已合入且干净的工作树被精确删除。清理失败测试通过注入 `removeWorktree` 函数返回失败，断言分支仍然存在，证明不会“删分支掩盖目录删除失败”。

- [ ] **Step 2: 运行清理测试确认红灯**

Run: `node --test scripts/cleanup-codex-worktree.test.cjs`

Expected: FAIL，因为脚本和 `workflow:cleanup` 入口尚不存在。

- [ ] **Step 3: 实现清理前置条件和后置确认**

```js
function cleanupCodexWorktree({ cwd = process.cwd(), target, removeWorktree = removeRegisteredWorktree } = {}) {
  const candidate = assertCleanupPreconditions({ cwd, target });
  const result = removeWorktree(candidate);
  assertWorktreeWasRemoved({ cwd, candidate });
  runGit(cwd, ["branch", "-d", candidate.branchName]);
  return result;
}
```

目标只能是当前 main 已登记的 `codex/*` 非 detached 工作树，且 `git merge-base --is-ancestor <branch> main` 成功。先通过路径边界和文件系统隔离检查，再执行精确的 `git worktree remove --force <validated-path>`；任何异常都原样抛出，不递归删除。

- [ ] **Step 4: 运行清理测试确认绿灯**

Run: `node --test scripts/cleanup-codex-worktree.test.cjs`

Expected: 未合入/脏/删除失败均保留目标和分支，正常路径按“登记 -> 目录 -> 分支”顺序完成。

- [ ] **Step 5: 提交清理单元**

```powershell
git add scripts/cleanup-codex-worktree.cjs scripts/cleanup-codex-worktree.test.cjs package.json
git commit -s -m "feat: add guarded worktree cleanup"
```

### Task 5: 记录长期规则并完成验证

**Files:**
- Create: `docs/wiki/workflows/worktree-filesystem-safety.md`
- Modify: `docs/superpowers/specs/2026-08-25-worktree-filesystem-safety-design.md`（仅在自审发现矛盾时）

- [ ] **Step 1: 写入开发 Wiki**

记录 `shared` 所有权、依赖安装边界、禁止手工 Junction、创建/启动/集成/清理入口和故障恢复路径。内容记录长期规则和失败模式，不写成当前提交的变更清单。

- [ ] **Step 2: 运行全套工作流测试和静态检查**

Run: `pnpm test:workflow`

Expected: exit code 0，所有脚本测试通过。

Run: `git diff --check`

Expected: 无输出。

- [ ] **Step 3: 运行当前隔离工作树启动前检查**

Run: `pnpm check:workspace-integrity`

Expected: exit code 0；同时用测试夹具演练外部 Junction，确认命令非零并且不修改文件。

- [ ] **Step 4: 做交付前范围检查**

Run: `git status --short --branch`、`git worktree list --porcelain`、`git diff main...HEAD --stat`

Expected: 任务分支只包含本设计/计划、脚本、测试和 Wiki；主工作区及其他工作树没有被修改。本任务只改变开发者工作流，不更新面向最终用户的 release notes/README。

- [ ] **Step 5: 在工作树提交后通过受控入口集成**

先在工作树运行聚焦测试并 `git commit -s`，再从干净 main 运行：

```powershell
pnpm workflow:integrate codex/worktree-filesystem-safety --push --verify "pnpm test:workflow"
```

Expected: 集成锁生效、合并提交通过、`origin/main` 与本地 main 一致；不手工运行 `git merge`、`git push` 或递归删除其他工作树。
