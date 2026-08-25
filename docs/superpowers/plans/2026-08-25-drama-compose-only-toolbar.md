# 漫剧分镜单一合成入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant storyboard-page batch buttons and make the remaining “合成” action prepare missing images and audio concurrently before starting video assembly.

**Architecture:** Keep the existing per-shot generation APIs and assembly API. Add a small UI-agnostic preparation coordinator that starts/reuses keyframe and TTS batch jobs in parallel, conditionally waits for their terminal states, and exposes the preparation callback to the existing assembly controller. Only the storyboard toolbar changes; the video tab’s full assembly settings remain intact.

**Tech Stack:** React 19, TypeScript, TanStack Query, existing drama API client, Node test runner, Vite.

---

### Task 1: Add failing preparation and toolbar contracts

**Files:**
- Create: `client/tests/dramaEpisodePreparation.test.js`
- Modify: `client/tests/comicDramaStoryboardFlow.test.js`

- [ ] **Step 1: Write a failing coordinator test**

Cover these concrete behaviors through the production coordinator API:

```js
const started = [];
const result = await prepareDramaEpisodeAssets({
  tasks: [
    { type: "keyframes", start: async () => { started.push("keyframes"); return "keyframes-1"; } },
    { type: "tts", start: async () => { started.push("tts"); return "tts-1"; } },
  ],
  getJobs: async () => [
    { id: "keyframes-1", status: "done" },
    { id: "tts-1", status: "done" },
  ],
  pollIntervalMs: 0,
});

assert.deepEqual(started.sort(), ["keyframes", "tts"]);
assert.deepEqual(result, { keyframes: "done", tts: "done" });
```

Also test that an existing active job is reused without calling its `start`, and that a failed job rejects before assembly can continue.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/dramaEpisodePreparation.test.js
```

Expected: fail because `client/src/pages/drama/comicDrama/dramaEpisodePreparation.ts` does not exist yet.

- [ ] **Step 3: Strengthen the storyboard toolbar contract**

Update `client/tests/comicDramaStoryboardFlow.test.js` to require that `ShotVoiceListPanel.tsx` contains one `DramaEpisodeAssemblyButton` but no toolbar labels or title for `生成分镜`, `统一写实重生成`, or `生成配音`; retain assertions for the empty-state `生成分镜` and per-shot generation entry.

- [ ] **Step 4: Run the toolbar contract and confirm RED**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --test tests/comicDramaStoryboardFlow.test.js
```

Expected: fail because the current toolbar still contains the three removed actions.

### Task 2: Implement the condition-based concurrent preparation coordinator

**Files:**
- Create: `client/src/pages/drama/comicDrama/dramaEpisodePreparation.ts`
- Test: `client/tests/dramaEpisodePreparation.test.js`

- [ ] **Step 1: Implement task start and active-job reuse**

Define `DramaEpisodePreparationTask`, `DramaEpisodePreparationJob`, and `prepareDramaEpisodeAssets`. Each task has a type, an optional existing `jobId`, and an optional `start()` callback. Start all new tasks with `Promise.all`; do not call `start()` for an existing job.

- [ ] **Step 2: Implement condition-based terminal polling**

Poll `getJobs()` until every selected job is `done`. Treat `failed` and `paused` as an actionable error, and use a bounded timeout with an explicit Chinese error message. Use a condition check plus `setTimeout`, not a single fixed sleep.

- [ ] **Step 3: Run the coordinator test and confirm GREEN**

Run the same focused command from Task 1 and require all coordinator tests to pass with zero failures.

### Task 3: Wire preparation into assembly and reduce the toolbar

**Files:**
- Modify: `client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx`
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`
- Modify: `client/tests/comicDramaStoryboardFlow.test.js`

- [ ] **Step 1: Add an optional preparation callback to the assembly controller**

Add `prepare?: () => Promise<void>` to the assembly props. Make the existing assembly mutation await `prepare()` before calling `startDramaEpisodeAssembly`. Keep the prop optional so the video tab remains unchanged.

- [ ] **Step 2: Complete the assembly button loading state**

When `controller.isPending` is true, render the existing `Loader2` icon and the label `准备素材中...`; when the server assembly is running, render a loader and `合成中...`; preserve the existing done/retry labels and disabled behavior.

Extend `client/tests/comicDramaStoryboardFlow.test.js` to assert that the assembly panel exposes the optional preparation callback and both preparation/assembly loading labels.

- [ ] **Step 3: Build the storyboard preparation callback**

In `ShotVoiceListPanel.tsx`, derive missing keyframe shot ids and whether TTS has pending audio. Reuse active keyframe/TTS jobs; otherwise call the existing batch-job mutations with `force: false` for TTS and missing shot ids for keyframes. Pass both tasks to `prepareDramaEpisodeAssets` so requests launch concurrently, then invalidate project/audio queries before assembly starts.

- [ ] **Step 4: Remove only the redundant toolbar actions**

Delete the top-level batch keyframe button, the `AiButton` for “统一写实重生成”, and the top-level TTS button. Keep the `DramaEpisodeAssemblyButton`, the empty-state storyboard button, and all per-shot actions.

- [ ] **Step 5: Run the coordinator and toolbar tests**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/dramaEpisodePreparation.test.js tests/comicDramaStoryboardFlow.test.js tests/shotVoiceBlockingSketchEntry.test.js
```

Expected: all tests pass and the source contract confirms only the assembly toolbar action remains.

### Task 4: Validate, document, and deliver

**Files:**
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `docs/wiki/workflows/drama-visual-style-consistency.md`

- [ ] **Step 1: Run client typecheck and production build**

```powershell
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
```

- [ ] **Step 2: Run browser acceptance**

Open the running `http://localhost:5174/drama/studio/cmt0z2mgy0012zsb5d716mkzj`, switch to “分镜”, and verify the toolbar has only “合成”; verify the empty-state and per-shot controls remain available where applicable. Do not click generation or assembly in the live project.

- [ ] **Step 3: Update user-visible and durable documentation**

Add a date-based release note and README latest-update bullet describing the single compose entry and automatic concurrent preparation. Add a stable workflow rule explaining that the global realistic style is configured in 画风管理 and the storyboard toolbar should not duplicate a style-specific regeneration action.

- [ ] **Step 4: Run final diff checks and commit**

```powershell
git diff --check
git status --short
git add README.md client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx client/src/pages/drama/comicDrama/dramaEpisodePreparation.ts client/tests/comicDramaStoryboardFlow.test.js client/tests/dramaEpisodePreparation.test.js client/tests/shotVoiceBlockingSketchEntry.test.js docs/releases/release-notes.md docs/wiki/workflows/drama-visual-style-consistency.md
git commit -s -m "fix(drama): make storyboard compose the single batch entry"
```

- [ ] **Step 5: Integrate and verify `main`**

From the clean main workspace run the repository integration entry point with a focused server/client verification command, push `origin/main`, verify local and remote SHA equality, then remove this merged worktree and branch.
