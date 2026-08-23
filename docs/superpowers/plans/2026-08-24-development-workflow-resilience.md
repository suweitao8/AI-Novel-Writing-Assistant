# 开发工作流隔离与故障阻塞治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把主分支、隔离 worktree、集成推送和本地服务故障收敛成可执行且可验证的开发闭环。

**Architecture:** 使用根目录 Node CLI 作为两个明确入口：`workflow:worktree` 负责从干净 `main` 创建并初始化任务 worktree，`workflow:integrate` 负责取得仓库级锁后准备 merge、签名提交并推送 `main`。启动门禁复用 `workspace-integrity-guard.cjs`，开发编排通过 `concurrently` 的有限重启和失败收敛避免 API 死掉后前端假活。

**Tech Stack:** Node.js 22、pnpm、Git worktree/hooks、Node built-in test runner、concurrently 9.2.1、PowerShell 验证命令。

---

### Task 1: Extend the main-workspace development guard

**Files:**
- Modify: `scripts/workspace-integrity-guard.cjs`
- Test: `scripts/workspace-integrity-guard.test.cjs`
- Modify: `scripts/check-deps.cjs`
- Modify: `server/package.json`

- [ ] **Step 1: Write failing tests for dirty-main and hook configuration**

Add temporary repositories in `scripts/workspace-integrity-guard.test.cjs` that initialize a clean `main`, create a tracked edit and an untracked file, and assert `assertDevelopmentWorkspaceIntegrity` rejects both. Add a `codex/test` case that permits the same edit. Add a case with `MERGE_HEAD` and a case with `core.hooksPath` outside `.githooks`; both must reject.

- [ ] **Step 2: Run the focused test and verify the new cases fail for the missing API**

Run `node --test scripts/workspace-integrity-guard.test.cjs`. Expected: existing tests pass and each new assertion fails because the exported development guard does not exist yet.

- [ ] **Step 3: Implement the guard and wire both root and server startup paths**

Export `assertDevelopmentWorkspaceIntegrity({ cwd })` from `workspace-integrity-guard.cjs`. It must use `git status --porcelain=v1 --untracked-files=all`, reject dirty `main` and `MERGE_HEAD`, and verify `core.hooksPath` resolves to `<checkout>/.githooks` plus `merge.ff=false`. Add `development` action dispatch to the CLI. Call the existing startup check from `check-deps.cjs`, and add `node ../scripts/workspace-integrity-guard.cjs development &&` before `ensure-dev-prisma.cjs` in `server/package.json` so direct API startup cannot bypass the main-workspace rule.

The new guard’s decision shape is:

```js
function assertDevelopmentWorkspaceIntegrity({ cwd = process.cwd() } = {}) {
  if (currentBranch(cwd) !== "main") return;
  const changes = git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (changes) fail("main workspace contains uncommitted development changes...");
  if (hasMergeHead(cwd)) fail("main workspace has an unfinished merge...");
  assertHooksConfig(cwd);
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run `node --test scripts/workspace-integrity-guard.test.cjs`. Expected: all existing and new cases pass with zero failures.

- [ ] **Step 5: Commit the guard unit**

Run `git add scripts/workspace-integrity-guard.cjs scripts/workspace-integrity-guard.test.cjs scripts/check-deps.cjs server/package.json server/scripts/ensure-dev-prisma.cjs` and `git commit -s -m "fix: block development from dirty main workspaces"`.

### Task 2: Add the standard worktree creation entry point

**Files:**
- Create: `scripts/create-codex-worktree.cjs`
- Create: `scripts/create-codex-worktree.test.cjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for slug validation, sibling paths, and main preconditions**

Test `normalizeTaskSlug`, `branchNameForTask`, and `defaultWorktreePath` with valid/invalid names. Test the command-level precondition helpers reject a dirty main, a detached HEAD, an active merge, and an existing branch/path without invoking a real user path.

- [ ] **Step 2: Run `node --test scripts/create-codex-worktree.test.cjs` and confirm the missing module failure**

Expected: the test runner reports that `scripts/create-codex-worktree.cjs` cannot be loaded.

- [ ] **Step 3: Implement the CLI**

Resolve the repo root with `git rev-parse --show-toplevel`, require branch `main`, require clean status and no `MERGE_HEAD`, normalize one task argument to lowercase `[a-z0-9-]`, reject collisions, run `git worktree add -b codex/<slug> <repo-parent>-<slug> main`, then run `pnpm setup:git-hooks` with `cwd` set to the new worktree. Export pure helpers for tests and never run cleanup or push.

The command invocation must be equivalent to:

```text
pnpm workflow:worktree character-aesthetic-v2
-> D:/Github/AI-Novel-Writing-Assistant-character-aesthetic-v2
-> branch codex/character-aesthetic-v2
-> pnpm setup:git-hooks (cwd=new worktree)
```

- [ ] **Step 4: Run the focused tests and a dry real creation in a temporary Git repository**

Run `node --test scripts/create-codex-worktree.test.cjs`. Then invoke the CLI against a disposable repository fixture and verify `git worktree list --porcelain` reports a sibling `codex/workflow-fixture` worktree with hooks configured.

- [ ] **Step 5: Add the package command and commit**

Add `"workflow:worktree": "node scripts/create-codex-worktree.cjs"`, stage only Task 2 files, and run `git commit -s -m "feat: add isolated worktree workflow entry"`.

### Task 3: Add locked main integration and push entry point

**Files:**
- Create: `scripts/integrate-codex-worktree.cjs`
- Create: `scripts/integrate-codex-worktree.test.cjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for branch ownership, lock acquisition, and conflict rollback**

Use temporary repositories with a local bare `origin` to test: non-main invocation is rejected; non-`codex/*` source is rejected; a dirty source worktree is rejected; a held lock reports the owner; a clean source creates a prepared merge only through the integration command; a conflict is aborted so `MERGE_HEAD` is absent and `main` status is clean.

- [ ] **Step 2: Run `node --test scripts/integrate-codex-worktree.test.cjs` and verify it fails before the CLI exists**

Expected: module-not-found failure for `scripts/integrate-codex-worktree.cjs`.

- [ ] **Step 3: Implement the integration CLI**

Require `main`, a clean main worktree, a local `codex/*` branch backed by a clean worktree, and no existing merge. Acquire `<git-common-dir>/codex-main-integration.lock` atomically with `fs.openSync(..., "wx")`, record PID/branch/time, detect live owners, and remove only the current owner’s lock in `finally`. Execute `git merge --no-ff --no-commit`, run `git diff --cached --check`, optionally execute `--verify <command>`, commit with `git commit -s --no-edit`, and push only when `--push` is supplied. On merge or verification failure run `git merge --abort` while main was initially clean. Export validation and lock helpers for tests.

The critical integration sequence must remain:

```js
const lock = acquireIntegrationLock({ gitCommonDir, branch: taskBranch });
try {
  runGit(["merge", "--no-ff", "--no-commit", taskBranch]);
  runGit(["diff", "--cached", "--check"]);
  runGit(["commit", "-s", "--no-edit"]);
  if (options.push) runGit(["push", "origin", "main"]);
} catch (error) {
  if (hasMergeHead()) runGit(["merge", "--abort"]);
  throw error;
} finally {
  lock.release();
}
```

- [ ] **Step 4: Run the focused integration tests and inspect the final Git state**

Run `node --test scripts/integrate-codex-worktree.test.cjs`. Verify clean success yields a merge commit with two parents, `git status --short` is empty, and the local bare `origin/main` equals `main`; verify conflict and lock cases leave no merge state.

- [ ] **Step 5: Add the package command and commit**

Add `"workflow:integrate": "node scripts/integrate-codex-worktree.cjs"`, stage only Task 3 files, and run `git commit -s -m "feat: add locked main integration workflow"`.

### Task 4: Make service failure visible and recoverable

**Files:**
- Modify: `package.json`
- Create: `scripts/dev-orchestration-policy.test.cjs`

- [ ] **Step 1: Write a regression test for the orchestration contract**

Read the root `package.json` and assert `dev:raw` contains `--restart-tries 3`, `--restart-after exponential`, and `--kill-others-on-fail`, while retaining exactly the shared, server, and client commands. This test fails against the current script because no restart or fail-fast flags are present.

- [ ] **Step 2: Run `node --test scripts/dev-orchestration-policy.test.cjs` and verify the expected failure**

Expected: assertion failure identifying the missing restart/fail-fast options.

- [ ] **Step 3: Update `dev:raw` to use bounded restart and group shutdown**

Set the exact root script to:

```json
"dev:raw": "concurrently --restart-tries 3 --restart-after exponential --kill-others-on-fail \"pnpm dev:shared\" \"pnpm dev:server\" \"pnpm dev:client\""
```

Keep Prisma’s existing safety failure behavior unchanged; a persistent schema/data problem must stop clearly instead of looping forever.

- [ ] **Step 4: Run the policy test and a disposable process simulation**

Run `node --test scripts/dev-orchestration-policy.test.cjs`, then run a temporary command group where one child fails twice and succeeds on the third attempt, confirming restart; run a permanently failing child and confirm the group exits nonzero rather than leaving a sibling process alive.

- [ ] **Step 5: Commit the service orchestration unit**

Run `git add package.json scripts/dev-orchestration-policy.test.cjs` and `git commit -s -m "fix: contain development service failures"`.

### Task 5: Document the durable workflow and failure diagnosis

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/wiki/workflows/repository-development-delivery.md`
- Create: `docs/wiki/debugging/development-service-and-worktree-blockers.md`
- Modify: `README.md` only if the existing latest-update section requires a link; otherwise leave release surfaces unchanged because this is internal workflow infrastructure.

- [ ] **Step 1: Add the exact commands and invariants**

Document `pnpm workflow:worktree <task>`, worktree-only development, `pnpm workflow:integrate codex/<task> --push`, the integration lock, the dirty-main startup failure, and the rule that `--no-verify`, `--force`, database reset, and `--accept-data-loss` are not recovery paths.

- [ ] **Step 2: Add the evidence-backed failure matrix and diagnosis commands**

Record the API `3100`/Vite `5174` distinction, `/api/health` check, process/log inspection, Prisma safety behavior, and the historical pre-guard direct commit without turning the Wiki into a per-commit changelog.

- [ ] **Step 3: Review rules and run documentation checks**

Run `rg -n "TBD|TODO|pnpm workflow:|workflow:integrate|main workspace" AGENTS.md docs/wiki/workflows/repository-development-delivery.md docs/wiki/debugging/development-service-and-worktree-blockers.md`; inspect changed text for user-facing release-note wording. Because this is internal-only workflow infrastructure, explicitly record that release notes are intentionally skipped.

- [ ] **Step 4: Commit the documentation unit**

Stage only the three workflow documentation files and run `git commit -s -m "docs: document isolated development workflow"`.

### Task 6: Full verification and controlled integration

**Files:**
- Verify: all files changed by Tasks 1-5

- [ ] **Step 1: Run the workflow test suite**

Run `node --test scripts/git-workflow-guard.test.cjs scripts/workspace-integrity-guard.test.cjs scripts/create-codex-worktree.test.cjs scripts/integrate-codex-worktree.test.cjs scripts/dev-orchestration-policy.test.cjs`. Expected: zero failures.

- [ ] **Step 2: Verify main remains untouched during implementation**

From the primary checkout run `git -C D:/Github/AI-Novel-Writing-Assistant status --short --branch`, `git -C D:/Github/AI-Novel-Writing-Assistant log -1 --format=%H`, and `git worktree list --porcelain`. Confirm primary `main` remains clean and the implementation branch is the only worktree owning these changes.

- [ ] **Step 3: Run focused static checks in the isolated worktree**

Run `node --check` for every new `.cjs`, `pnpm check:workspace-integrity`, and `git diff --check`. If dependencies are installed, run `pnpm test:git-workflow` and the complete workflow test command again.

- [ ] **Step 4: Prepare the verified branch for integration**

Confirm `git status --short --branch` is clean, `git log --oneline --decorate -8` shows only signed coherent units, and `git diff main...HEAD --stat` contains no runtime database or generated artifacts. Do not push the feature branch.

- [ ] **Step 5: Integrate only from primary main**

Run from `D:/Github/AI-Novel-Writing-Assistant`: `pnpm workflow:integrate codex/development-workflow-guard --push --verify "node --test scripts/git-workflow-guard.test.cjs scripts/workspace-integrity-guard.test.cjs scripts/create-codex-worktree.test.cjs scripts/integrate-codex-worktree.test.cjs scripts/dev-orchestration-policy.test.cjs"`. Then verify `git status --short --branch`, `git worktree list --porcelain`, `git rev-parse main`, and `git ls-remote origin refs/heads/main` agree. Preserve all pre-existing worktrees and remove this task worktree only after the merge and push are verified.
