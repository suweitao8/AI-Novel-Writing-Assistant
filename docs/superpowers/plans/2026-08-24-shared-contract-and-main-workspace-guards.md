# Shared 契约层与主工作区保护 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 阻止主工作区 `shared/` 被未察觉地修改或删除，且只允许经过明确契约分支的共享类型改动合并进 main。

**Architecture:** 新增一个只读的工作区完整性守卫，专门检查主工作区下 `shared/` 的 Git 状态和 Vite 必需运行时文件。现有 Git 守卫复用该检查，并在提交层要求 `shared/` 变更来自 `codex/shared-*`，在主分支整合层验证合并源为 `codex/*`。

**Tech Stack:** Node.js CommonJS、Git hooks、Node 内置测试框架、pnpm workspace。

---

### Task 1: 覆盖主工作区完整性检查的失败路径

**Files:**
- Create: `scripts/workspace-integrity-guard.test.cjs`
- Create: `scripts/workspace-integrity-guard.cjs`

- [ ] **Step 1: 写出失败测试**

```js
test("main workspace rejects an unstaged deletion under shared", () => {
  const fixture = createRepository();
  writeCommittedFile(fixture, "shared/types/example.ts", "export type Example = string;\n");
  fs.rmSync(path.join(fixture, "shared/types/example.ts"));
  assert.throws(() => assertMainWorkspaceSharedIntegrity({ cwd: fixture }), /shared.*deleted/i);
});

test("feature worktree does not reject its own shared edit", () => {
  const fixture = createRepository();
  runGit(fixture, ["switch", "-c", "codex/shared-contract-test"]);
  writeFile(fixture, "shared/types/example.ts", "export type Example = string;\n");
  assert.doesNotThrow(() => assertMainWorkspaceSharedIntegrity({ cwd: fixture }));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/workspace-integrity-guard.test.cjs`

Expected: FAIL，因为 `workspace-integrity-guard.cjs` 尚不存在。

- [ ] **Step 3: 实现最小完整性守卫**

```js
function assertMainWorkspaceSharedIntegrity({ cwd = process.cwd() } = {}) {
  if (currentBranch(cwd) !== "main") return;
  const changes = gitLines(cwd, ["status", "--porcelain=v1", "--untracked-files=all", "--", "shared"]);
  if (changes.length > 0) {
    fail(`main workspace contains uncommitted shared changes:\n${changes.join("\n")}`);
  }
}

function assertClientRuntimeIntegrity({ cwd = process.cwd() } = {}) {
  const refreshRuntime = resolveClientRuntime(cwd, "@vitejs/plugin-react/dist/refresh-runtime.js");
  if (!fs.existsSync(refreshRuntime)) {
    fail("Vite React refresh runtime is missing; reinstall locked dependencies before starting the client.");
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/workspace-integrity-guard.test.cjs`

Expected: PASS，包含 main 删除阻断和隔离分支放行。

- [ ] **Step 5: 提交该单元**

```bash
git add scripts/workspace-integrity-guard.cjs scripts/workspace-integrity-guard.test.cjs
git commit -s -m "test: guard main workspace shared integrity"
```

### Task 2: 在启动预检中使用完整性守卫

**Files:**
- Modify: `scripts/check-deps.cjs`
- Test: `scripts/workspace-integrity-guard.test.cjs`

- [ ] **Step 1: 写出失败测试**

```js
test("startup integrity check reports a missing Vite refresh runtime", () => {
  const fixture = createProjectFixture({ omitRefreshRuntime: true });
  assert.throws(() => assertStartupIntegrity({ cwd: fixture }), /refresh runtime.*missing/i);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/workspace-integrity-guard.test.cjs`

Expected: FAIL，因为启动检查尚未检查 Vite 运行时文件。

- [ ] **Step 3: 实现最小集成**

```js
const { assertStartupIntegrity } = require("./workspace-integrity-guard.cjs");

try {
  assertStartupIntegrity({ cwd: ROOT });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/workspace-integrity-guard.test.cjs`

Expected: PASS。

- [ ] **Step 5: 提交该单元**

```bash
git add scripts/check-deps.cjs scripts/workspace-integrity-guard.test.cjs
git commit -s -m "fix: fail fast on workspace startup integrity"
```

### Task 3: 收紧 shared 契约分支与 main 合并策略

**Files:**
- Modify: `scripts/git-workflow-guard.cjs`
- Modify: `scripts/git-workflow-guard.test.cjs`
- Create: `.githooks/pre-merge-commit`

- [ ] **Step 1: 写出失败测试**

```js
test("shared changes require a codex/shared branch and reject deletions", () => {
  const directory = createRepository();
  installTestHooks(directory);
  createInitialCommit(directory);
  runGit(directory, ["switch", "-c", "codex/ui-card"]);
  writeAndStage(directory, "shared/types/asset.ts", "export type Asset = string;\n");
  assert.notEqual(runGit(directory, ["commit", "-m", "change shared"]).status, 0);
  runGit(directory, ["switch", "-c", "codex/shared-asset-contract"]);
  assert.equal(runGit(directory, ["commit", "-m", "change shared"]).status, 0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/git-workflow-guard.test.cjs`

Expected: FAIL，因为普通功能分支当前仍可提交 shared 变更。

- [ ] **Step 3: 实现最小策略**

```js
const SHARED_CONTRACT_BRANCH = /^codex\/shared-[a-z0-9][a-z0-9-]*$/;

function assertStagedSharedChangesAllowed() {
  const changes = stagedNameStatus("shared");
  if (changes.length === 0) return;
  if (!SHARED_CONTRACT_BRANCH.test(currentBranch())) {
    fail("shared changes require a dedicated codex/shared-<topic> worktree branch.");
  }
  if (changes.some((change) => change.status.includes("D"))) {
    fail("deleting tracked files under shared is blocked; perform a reviewed contract migration instead.");
  }
}
```

在 main 上让 `pre-merge-commit` 拒绝自动合并；开发者必须先执行 `git merge --no-ff --no-commit codex/<task>`，随后 `pre-commit` 验证 `MERGE_HEAD` 被一个 `refs/heads/codex/*` 引用包含。pre-push 前调用 `assertMainWorkspaceSharedIntegrity` 并复核最终第一父提交链。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/git-workflow-guard.test.cjs`

Expected: PASS，覆盖直接提交、合规合并、非 codex 合并、普通分支 shared 变更、合规契约分支和 shared 删除。

- [ ] **Step 5: 提交该单元**

```bash
git add .githooks/pre-merge-commit scripts/git-workflow-guard.cjs scripts/git-workflow-guard.test.cjs
git commit -s -m "fix: require explicit shared contract branches"
```

### Task 4: 记录长期开发边界

**Files:**
- Create: `docs/wiki/architecture/shared-contract-boundary.md`
- Modify: `package.json`

- [ ] **Step 1: 写入共享契约边界文档**

```markdown
## Current Rule

`shared/` 只承载客户端与服务端必须共同理解的稳定数据契约。UI 局部状态、显示格式和单端实现不得放入该目录。
```

- [ ] **Step 2: 添加显式检查入口**

```json
"check:workspace-integrity": "node scripts/workspace-integrity-guard.cjs startup"
```

- [ ] **Step 3: 运行文档与命令验证**

Run: `pnpm check:workspace-integrity`

Expected: 在隔离工作树 PASS；在当前主工作区检测到 shared 删除时以非零退出，且不修改文件。

- [ ] **Step 4: 提交该单元**

```bash
git add docs/wiki/architecture/shared-contract-boundary.md package.json
git commit -s -m "docs: define shared contract ownership boundary"
```

### Task 5: 完整验证与集成

**Files:**
- Modify: `docs/releases/release-notes.md`（仅当用户可见启动提示有变化时）
- Modify: `README.md`（仅当存在用户可见发布说明时）

- [ ] **Step 1: 运行全部防护测试**

Run: `node --test scripts/git-workflow-guard.test.cjs scripts/workspace-integrity-guard.test.cjs`

Expected: PASS。

- [ ] **Step 2: 运行工作区启动检查**

Run: `pnpm check:workspace-integrity`

Expected: 隔离工作树 PASS。

- [ ] **Step 3: 检查提交范围和工作树**

Run: `git status --short && git worktree list --porcelain`

Expected: 仅本任务文件在任务分支；主工作区未被修改。

- [ ] **Step 4: 以显式准备合并集成并推送 main**

Run: `git merge --no-ff --no-commit codex/shared-main-integrity-guard`，验证合并内容后运行 `git commit -s --no-edit`，最后运行 `git push origin main`。

Expected: 自动合并被 Hook 拒绝；只有由 `codex/*` 分支准备、并在 `MERGE_HEAD` 仍可验证时写入的 merge commit 能进入 main。
