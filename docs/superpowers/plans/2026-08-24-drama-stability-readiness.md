# 漫剧稳定性与就绪状态统一实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让漫剧总览、分镜列表、配音分段和整集合成对同一集使用一致且可验证的素材就绪状态，并让本地服务短暂重启时的工作台加载状态可恢复、可解释。

**Architecture:** 以 `DramaAudioSegmentsService` 作为当前台词/音色快照的权威投影，在其上增加漫剧镜头就绪摘要边界；studio overview 与 episode assembly 都消费该摘要，不再直接把 JSON 非空当作完成。前端启动门只负责健康探针和可恢复反馈，不把业务状态复制到浏览器。

**Tech Stack:** Node.js + TypeScript + Prisma/SQLite, Express services, React 19 + TanStack Query + Vite, Node test runner, existing semantic UI tokens.

---

### Task 1: 建立可复用的镜头就绪纯函数（TDD）

**Files:**
- Create: `server/src/services/drama/readiness/DramaShotReadiness.ts`
- Test: `server/tests/dramaShotReadiness.test.js`

- [ ] **Step 1: Write the failing tests**

写四个最小行为测试：

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyDramaVisual,
  isDramaKeyframeReady,
  isDramaAudioReady,
} = require("../dist/services/drama/readiness/DramaShotReadiness.js");

test("keyframe only counts done data with a non-empty URL", () => {
  assert.equal(isDramaKeyframeReady(JSON.stringify({ status: "done", url: "/api/drama/shot-images/s1/keyframe" })), true);
  assert.equal(isDramaKeyframeReady(JSON.stringify({ status: "done", url: "" })), false);
  assert.equal(isDramaKeyframeReady(JSON.stringify({ status: "generating", url: "/image" })), false);
  assert.equal(isDramaKeyframeReady("not-json"), false);
});

test("audio only counts every current line as ready for the expected provider", () => {
  const ready = {
    status: "ready",
    lines: [{ lineIndex: 0, status: "ready", audioUrl: "data:audio/wav;base64,AA==" }],
  };
  assert.equal(isDramaAudioReady(ready, [{ lineIndex: 0 }]), true);
  assert.equal(isDramaAudioReady(ready, [{ lineIndex: 0 }, { lineIndex: 1 }]), false);
});

test("missing dialogue does not create a missing-audio state", () => {
  assert.equal(isDramaAudioReady({ status: "missing" }, []), true);
});

test("visual classification prefers video, then keyframe, then placeholder", () => {
  assert.equal(classifyDramaVisual({ videoReady: true, keyframeReady: true }), "video");
  assert.equal(classifyDramaVisual({ videoReady: false, keyframeReady: true }), "keyframe");
  assert.equal(classifyDramaVisual({ videoReady: false, keyframeReady: false }), "placeholder");
});
```

- [ ] **Step 2: Run the test and confirm the expected red failure**

Run from `server/`:

```powershell
pnpm run build
node --test tests/dramaShotReadiness.test.js
```

Expected: module-not-found or missing-export failures because the new readiness module does not exist yet.

- [ ] **Step 3: Implement the smallest pure contract**

Implement JSON-safe predicates with no Prisma access. `isDramaAudioReady` must accept the already-projected line statuses so the function cannot silently treat a stale or missing line as ready. Keep the output union exactly `"video" | "keyframe" | "placeholder"`.

- [ ] **Step 4: Run the focused test and then the existing audio/assembly contracts**

```powershell
pnpm run build
node --test tests/dramaShotReadiness.test.js tests/dramaAudioState.test.js tests/dramaAssemblyJobProgress.test.js
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit the focused unit**

```powershell
git add server/src/services/drama/readiness/DramaShotReadiness.ts server/tests/dramaShotReadiness.test.js
git commit -s -m "test: define drama shot readiness contract"
```

This is an internal contract/test change; run the release-note check and explicitly skip release notes if no user-visible behavior is included.

### Task 2: Batch the audio segment projection and expose episode readiness

**Files:**
- Modify: `server/src/services/drama/audio/DramaAudioSegmentsService.ts`
- Create: `server/src/services/drama/readiness/DramaReadinessService.ts`
- Test: `server/tests/dramaReadinessProjection.test.js`

- [ ] **Step 1: Add failing projection tests**

Cover: one ready line, one stale line, a no-dialogue shot, keyframe status parsing, and aggregation into `shotCount`, `keyframeReadyCount`, `audioReadyCount`, `withKeyframeOnly`, and `withoutVisual`. The test fixture must include an invalid non-empty JSON payload and assert it is not ready.

- [ ] **Step 2: Run the new projection test before implementation**

```powershell
pnpm run build
node --test tests/dramaReadinessProjection.test.js
```

Expected: the new service/export is missing or the expected projection is unavailable.

- [ ] **Step 3: Extract the existing per-episode segment builder**

Keep `listEpisodeAudioSegments(projectId, order)` behavior unchanged, but move the loop that resolves current voice keys into a private builder that accepts a loaded episode and already-loaded narrator/state context. Add a project-level method that loads the project characters, episodes, latest storyboard shots, narrator settings, and novel character states once, then returns segments grouped by episode order and shot id. Do not return base64 audio to overview callers except the existing ready segment URL required by assembly.

- [ ] **Step 4: Implement `DramaReadinessService`**

Add methods with explicit results:

```ts
export interface DramaEpisodeReadiness {
  shotCount: number;
  keyframeReadyCount: number;
  audioReadyCount: number;
  withVideoClip: number;
  withKeyframeOnly: number;
  withoutVisual: number;
  withoutAudioShotCount: number;
}

export class DramaReadinessService {
  getEpisodeReadiness(projectId: string, order: number): Promise<DramaEpisodeReadiness>;
  getProjectReadiness(projectId: string): Promise<{
    shotCount: number;
    keyframeReadyCount: number;
    audioReadyCount: number;
    videoPromptCount: number;
    videoReadyCount: number;
  }>;
}
```

Use the pure predicates from Task 1. A shot with no parsed dialogue lines is audio-ready because it has no TTS obligation. A shot with dialogue is audio-ready only when every projected line is ready for the current provider and current text/voice snapshot.

- [ ] **Step 5: Run projection tests and existing drama tests**

```powershell
pnpm run build
node --test tests/dramaShotReadiness.test.js tests/dramaReadinessProjection.test.js tests/dramaAudioState.test.js tests/dramaLandscapeTtsContracts.test.js tests/dramaStaticShotContracts.test.js
```

Expected: all selected tests pass with no database reset or migration.

- [ ] **Step 6: Commit the readiness projection**

```powershell
git add server/src/services/drama/audio/DramaAudioSegmentsService.ts server/src/services/drama/readiness server/tests/dramaReadinessProjection.test.js
git commit -s -m "feat: centralize drama readiness projection"
```

### Task 3: Wire studio overview and assembly to the same projection

**Files:**
- Modify: `server/src/services/drama/studio/ComicDramaStudioService.ts`
- Modify: `server/src/services/drama/video/DramaEpisodeAssemblyService.ts`
- Modify: `server/tests/comicDramaStudio.test.js`
- Add/modify: `server/tests/dramaRemotionAssembly.test.js`

- [ ] **Step 1: Add a failing cross-surface contract**

Add a fixture-level assertion that the overview ready counts use `status=done` plus real URLs/provider and do not count merely non-null `keyframeData` or `dialogueAudioData`. Add an assembly assertion that a stale line is rejected instead of being copied into the render plan.

- [ ] **Step 2: Run the cross-surface tests and confirm red**

```powershell
pnpm run build
node --test tests/comicDramaStudio.test.js tests/dramaRemotionAssembly.test.js
```

- [ ] **Step 3: Replace raw non-null counts in the studio service**

Keep episode/storyboard/video prompt aggregate queries, but replace the three raw shot counts with `DramaReadinessService` results. Preserve `ComicDramaLinkStats` field names and shot-level semantics so existing clients do not need a migration.

- [ ] **Step 4: Replace assembly audio eligibility with projected ready segments**

Before building an episode plan, obtain the current episode segment projection. Use only `status === "ready"` segment URLs and measured durations for the render plan. Keep the existing static 16:9 visual fallback behavior, but derive `withKeyframeOnly`, `withoutVisual`, and `withoutAudioShotCount` from the same readiness result. A stale/missing audio line must produce the existing actionable error rather than silently rendering old audio.

- [ ] **Step 5: Run focused server verification**

```powershell
pnpm run build
node --test tests/dramaShotReadiness.test.js tests/dramaReadinessProjection.test.js tests/comicDramaStudio.test.js tests/dramaRemotionAssembly.test.js tests/dramaRealAudioDurationContracts.test.js
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit the cross-surface wiring**

```powershell
git add server/src/services/drama/studio/ComicDramaStudioService.ts server/src/services/drama/video/DramaEpisodeAssemblyService.ts server/tests/comicDramaStudio.test.js server/tests/dramaRemotionAssembly.test.js
git commit -s -m "fix: align drama overview and assembly readiness"
```

### Task 4: Make startup reconnect state explicit without adding product noise

**Files:**
- Modify: `client/src/components/layout/ServerStartupGate.tsx`
- Test: `client/tests/serverStartupGateContracts.test.js`

- [ ] **Step 1: Write a failing contract test**

Assert that the startup gate retains the health probe, has distinct checking/waiting/error render paths, exposes a retry button in the recoverable state, and never changes API ports. The test must inspect user-facing labels and the existing `API_BASE_URL` usage rather than testing implementation-only variable names.

- [ ] **Step 2: Run the test and confirm red**

```powershell
pnpm --filter @ai-novel/client test -- tests/serverStartupGateContracts.test.js
```

- [ ] **Step 3: Implement the minimal UI state improvement**

Use existing `Button`, semantic tokens, and `LoaderCircle`/`RefreshCw`. Keep the first short health-check window quiet, then show a concise reconnect state with retry. If the health request returns a non-OK response, show a recoverable error state with a short status message; do not expose stack traces or add a tutorial paragraph. Preserve keyboard activation and visible focus states.

- [ ] **Step 4: Run client typecheck and focused tests**

```powershell
pnpm --filter @ai-novel/client test -- tests/serverStartupGateContracts.test.js
pnpm --filter @ai-novel/client typecheck
```

- [ ] **Step 5: Commit the startup gate unit**

```powershell
git add client/src/components/layout/ServerStartupGate.tsx client/tests/serverStartupGateContracts.test.js
git commit -s -m "fix: clarify drama workspace service reconnect state"
```

### Task 5: Verify the live cross-stage workflow and document durable rules

**Files:**
- Modify if needed: `docs/wiki/workflows/comic-drama-workflow.md`
- Modify if needed: `docs/releases/release-notes.md`, `README.md`

- [ ] **Step 1: Inspect the final diff and run focused checks**

```powershell
git diff main...HEAD --check
pnpm --filter @ai-novel/server typecheck
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/server test:node
pnpm --filter @ai-novel/client test
```

Record unrelated pre-existing failures separately; do not claim the full suite is green unless the full command reports zero failures.

- [ ] **Step 2: Run read-only API checks against the running project**

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3100/api/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3100/api/drama/studio/cmt0z2mgy0012zsb5d716mkzj/overview
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3100/api/drama/projects/cmt5tfmcf0000rcb52n3aup7l/episodes/1/assembly
```

Compare the returned ready counts and record the exact values. Do not start image, audio, or video generation during this smoke check.

- [ ] **Step 3: Use the in-app browser for a read-only smoke flow**

Hard refresh the current studio URL, wait for the workspace, open “分镜” and “成片”, and verify both surfaces show the same picture/audio readiness numbers. Capture console errors if the gate remains visible for more than the normal startup window.

- [ ] **Step 4: Update durable documentation only when the rule is stable**

If the final implementation establishes a reusable readiness or recovery rule, add a concise Background/Decision/Current Rule/Failure Modes entry to `docs/wiki/workflows/comic-drama-workflow.md`. If the diff is user-visible, update the existing date heading in release notes and refresh the README latest-update block; if only tests/internal contracts changed, explicitly skip release notes.

- [ ] **Step 5: Request code review before integration**

Provide the reviewer the base SHA `17d09178`, the final worktree HEAD, the design acceptance criteria, and the focused test output. Fix critical/important findings before integration.

- [ ] **Step 6: Integrate only the verified branch**

From the clean main workspace, re-read the Development Workflow section, confirm no concurrent uncommitted work is being overwritten, and run:

```powershell
pnpm workflow:integrate codex/drama-stability-read-model --push --verify "pnpm --filter @ai-novel/server typecheck"
```

After integration, verify `git status --short`, `git worktree list --porcelain`, `git rev-parse main`, and `git rev-parse origin/main`. Keep unrelated worktrees intact.

### Task 6: Prevent reference parsing from racing with script autosave

**Files:**
- Modify: `client/src/pages/drama/comicDrama/hooks/useNovelChapterWorkspace.ts`
- Modify: `client/src/pages/drama/comicDrama/hooks/useReferenceDraftStage.ts`
- Test: `client/tests/referenceExtractPreviewContracts.test.js`

- [ ] **Step 1: Add a failing contract test**

Assert that the reference parsing action awaits the pending chapter expectation save or disables parsing until that save settles, and that a stale autosave response cannot overwrite the newly applied parse result.

- [ ] **Step 2: Run the focused test and confirm red**

```powershell
pnpm --filter @ai-novel/client test -- tests/referenceExtractPreviewContracts.test.js
```

- [ ] **Step 3: Add one shared flush boundary**

Expose a stable `flushExpectationSave()` promise from `useNovelChapterWorkspace` and call it from `useReferenceDraftStage` immediately before the parse/apply request. Keep the existing debounce for normal editing; only the explicit parse action flushes synchronously. While the promise is pending, disable the parse/apply trigger and keep the existing loading feedback.

- [ ] **Step 4: Run client typecheck and focused tests**

```powershell
pnpm --filter @ai-novel/client test -- tests/referenceExtractPreviewContracts.test.js
pnpm --filter @ai-novel/client typecheck
```

- [ ] **Step 5: Commit the race fix**

```powershell
git add client/src/pages/drama/comicDrama/hooks/useNovelChapterWorkspace.ts client/src/pages/drama/comicDrama/hooks/useReferenceDraftStage.ts client/tests/referenceExtractPreviewContracts.test.js
git commit -s -m "fix: flush drama chapter saves before parsing"
```

### Task 7: Isolate chapter-level busy state and selection

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`
- Modify: `client/src/pages/drama/components/DramaStoryboardBoard.tsx`
- Modify: `client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx`
- Test: `client/tests/comicDramaStoryboardFlow.test.js`
- Test: `client/tests/dramaShotBatchFeedback.test.js`

- [ ] **Step 1: Add failing chapter-switch tests**

Cover three behaviors: a TTS job from episode A must not disable/label episode B; a per-shot audio action in the active episode is disabled while its episode batch is running; selected shot IDs are cleared or intersected with the new storyboard when the chapter changes.

- [ ] **Step 2: Run the tests and confirm red**

```powershell
pnpm --filter @ai-novel/client test -- tests/comicDramaStoryboardFlow.test.js tests/dramaShotBatchFeedback.test.js
```

- [ ] **Step 3: Filter and reset from authoritative IDs**

Filter `ttsJob` by `episodeId === activeEpisode.id`, pass the resulting chapter busy state into each row, and clear `selectedIds`/preview when `storyboard.id` changes. Before submitting a selected-image job, intersect IDs with the current `shots` set.

- [ ] **Step 4: Run focused tests and typecheck**

```powershell
pnpm --filter @ai-novel/client test -- tests/comicDramaStoryboardFlow.test.js tests/dramaShotBatchFeedback.test.js
pnpm --filter @ai-novel/client typecheck
```

- [ ] **Step 5: Commit the chapter isolation fix**

```powershell
git add client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx client/src/pages/drama/components/DramaStoryboardBoard.tsx client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx client/tests/comicDramaStoryboardFlow.test.js client/tests/dramaShotBatchFeedback.test.js
git commit -s -m "fix: isolate drama chapter task state"
```

### Task 8: Make persisted drama jobs recoverable after a service restart

**Files:**
- Modify: `server/src/services/drama/production/batchJobRecovery.ts`
- Modify: `server/src/services/drama/production/DramaBatchOrchestrator.ts`
- Modify: `server/src/services/drama/video/DramaEpisodeAssemblyService.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/dramaBatchRecovery.test.js`

- [ ] **Step 1: Add failing restart-recovery tests**

Assert that a pending/running keyframe, TTS, or full-episode job older than the stale threshold is transitioned to a retryable failed state with a user-readable restart reason, and that a fresh job is not changed. Assert that recovery is idempotent.

- [ ] **Step 2: Run the focused test and confirm red**

```powershell
pnpm --filter @ai-novel/server build
node --test tests/dramaBatchRecovery.test.js
```

- [ ] **Step 3: Implement startup recovery without deleting data**

Add one startup-safe recovery entrypoint that updates only stale `pending`/`running` drama jobs, preserves their progress and target IDs, sets a retryable failure message, and can be called repeatedly. Invoke it alongside existing image interrupted-state healing after the API has opened its database connection. Do not auto-launch paid generation during startup.

- [ ] **Step 4: Add service-level duplicate protection**

Before creating a batch or full-episode job, reuse an existing active job for the same episode/type when its target signature matches; otherwise create a new job. Keep this check in the service layer so route and future callers share it. Document the remaining cross-process limitation in the test if a schema-level idempotency key is not introduced.

- [ ] **Step 5: Run recovery and drama pipeline tests**

```powershell
pnpm --filter @ai-novel/server build
node --test tests/dramaBatchRecovery.test.js tests/dramaBatchConcurrency.test.js tests/dramaPipelineContract.test.js tests/dramaRemotionAssembly.test.js
```

- [ ] **Step 6: Commit recovery behavior**

```powershell
git add server/src/services/drama/production/batchJobRecovery.ts server/src/services/drama/production/DramaBatchOrchestrator.ts server/src/services/drama/video/DramaEpisodeAssemblyService.ts server/src/app.ts server/tests/dramaBatchRecovery.test.js
git commit -s -m "fix: recover stale drama jobs after restart"
```

## Self-review checklist

- [ ] Every design requirement has at least one implementation task and one verification command.
- [ ] The readiness predicate is pure and is used by both overview and assembly paths.
- [ ] Stale audio is rejected using current text/voice projection, not merely a non-empty JSON field.
- [ ] No task changes ports, resets the database, or starts paid generation during verification.
- [ ] UI changes use semantic tokens and existing components and cover checking, waiting, error, retry, keyboard, and disabled states.
- [ ] Full-suite failures are reported with exact counts and separated from focused drama results.
