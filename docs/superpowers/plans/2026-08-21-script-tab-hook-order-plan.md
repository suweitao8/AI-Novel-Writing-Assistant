# 漫剧 Studio 脚本页 Hook 顺序修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `ScriptTab` 在章节加载完成后因 Hook 顺序变化导致的 Studio 空白页，并用回归契约和真实浏览器验证防止复发。

**Architecture:** 保留 `ScriptTab` 现有单组件结构和实体名单 memo 化，只将 `entityNames` 的 `useMemo` 提前到所有条件返回之前，使加载中、无章节、已加载三条渲染路径执行相同 Hook 序列。由于客户端当前没有 React DOM 测试依赖，新增 Node 源代码契约锁定这个结构性约束，最终用运行中的 Studio 页面完成真实渲染验证。

**Tech Stack:** React 19, TypeScript, Vite, Node built-in test runner, React Query, Codex in-app browser.

---

### Task 1: Add the failing Hook-order regression contract

**Files:**
- Create: `client/tests/scriptTabHookOrder.test.js`
- Reference: `client/src/pages/drama/comicDrama/components/ScriptTab.tsx`

- [x] **Step 1: Write the failing test**

Create a Node test that reads `ScriptTab.tsx`, locates `const entityNames = useMemo`, and asserts it appears before both conditional guards:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scriptTabSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/ScriptTab.tsx", import.meta.url),
  "utf8",
);

test("ScriptTab declares entityNames before loading guards", () => {
  const entityNamesIndex = scriptTabSource.indexOf("const entityNames = useMemo");
  const loadingGuardIndex = scriptTabSource.indexOf("if (workspace.chaptersQuery.isPending)");
  const emptyChapterGuardIndex = scriptTabSource.indexOf("if (!workspace.currentChapter)");

  assert.notEqual(entityNamesIndex, -1, "entityNames memo should exist");
  assert.notEqual(loadingGuardIndex, -1, "loading guard should exist");
  assert.notEqual(emptyChapterGuardIndex, -1, "empty chapter guard should exist");
  assert.ok(entityNamesIndex < loadingGuardIndex, "entityNames memo must precede loading guard");
  assert.ok(entityNamesIndex < emptyChapterGuardIndex, "entityNames memo must precede empty chapter guard");
});
```

- [x] **Step 2: Run the new test and verify it fails for the existing bug**

Run from the worktree root:

```powershell
node --test client/tests/scriptTabHookOrder.test.js
```

Expected: FAIL because the current `entityNames` memo is below both early returns.

### Task 2: Move the memoized entity names before conditional returns

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/ScriptTab.tsx:275-294`

- [x] **Step 1: Move the existing `entityNames` declaration**

Place this unchanged declaration immediately after `scriptUsage` and before `if (workspace.chaptersQuery.isPending)`:

```tsx
  const entityNames = useMemo(() => ({
    characters: characters.map((character) => character.name),
    scenes: scenes.map((scene) => scene.name),
    props: propList.map((prop) => prop.name),
  }), [characters, scenes, propList]);
```

Remove the original declaration below the two conditional returns. Do not change the memo dependencies, rendering branches, API calls, or data shape.

- [x] **Step 2: Run the regression test and verify it passes**

Run:

```powershell
node --test client/tests/scriptTabHookOrder.test.js
```

Expected: PASS with one test and zero failures.

### Task 3: Run focused static verification

**Files:**
- Verify: `client/tests/scriptTabHookOrder.test.js`
- Verify: `client/src/pages/drama/comicDrama/components/ScriptTab.tsx`

- [x] **Step 1: Run the client typecheck**

```powershell
pnpm --filter @ai-novel/client typecheck
```

Expected: exit code 0.

- [x] **Step 2: Run the client test suite and record pre-existing failures separately**

```powershell
pnpm --filter @ai-novel/client test
```

Expected: the new Hook-order regression test passes. If unrelated existing client contract failures remain, report their exact count and do not attribute them to this patch.

Observed: the new regression test passed; the full client suite reported 152/164 passing and 12 pre-existing contract failures.

- [x] **Step 3: Run the comic/drama server-focused contracts**

```powershell
node --test server/tests/comicCharacterBridge.test.js server/tests/comicDecoupling.test.js server/tests/comicDramaDeleteContract.test.js server/tests/comicDramaReferenceNovel.test.js server/tests/comicDramaStudio.test.js server/tests/dramaArtStyle.test.js server/tests/dramaDecoupling.test.js server/tests/dramaForge.test.js server/tests/dramaPipelineContract.test.js
```

Expected: all existing comic/drama contracts pass.

Observed: 37/37 comic/drama contracts passed after generating Prisma Client and compiling the server worktree.

### Task 4: Verify the actual Studio page and commit the coherent fix

**Files:**
- Verify: `http://localhost:5174/drama/studio/cmt0z2mgy0012zsb5d716mkzj`

- [ ] **Step 1: Use the existing in-app browser tab to verify the Studio page**

Reload the current tab only after checking that no unsaved user input is present. Verify the root is not empty, the Studio content is visible, and the browser console contains no `Rendered more hooks than during the previous render` or Hook-order error from `ScriptTab`.

- [x] **Step 2: Check the diff and working tree**

```powershell
git diff --check
git status --short
git diff -- client/src/pages/drama/comicDrama/components/ScriptTab.tsx client/tests/scriptTabHookOrder.test.js
```

Expected: only the intended component, regression test, design document, plan, README, and release notes are changed; no database, generated runtime files, or unrelated source changes appear.

- [x] **Step 3: Commit the fix**

```powershell
git add client/src/pages/drama/comicDrama/components/ScriptTab.tsx client/tests/scriptTabHookOrder.test.js docs/superpowers/specs/2026-08-21-script-tab-hook-order-design.md docs/superpowers/plans/2026-08-21-script-tab-hook-order-plan.md
git commit -m "fix(comicDrama): keep ScriptTab hooks stable during loading"
```

Expected: one coherent commit on `codex/fix-script-hooks`.
