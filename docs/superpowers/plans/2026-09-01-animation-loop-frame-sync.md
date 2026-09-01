# Animation Loop Frame Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute this plan task-by-task with the repository self-test gate before commit.

**Goal:** Make animation preview playback and the visible frame timeline agree at loop boundaries, with a user-controlled loop switch.

**Architecture:** Keep time/frame conversion in the existing pure `animationFrame.ts` module. Add loop state to `AnimationPreview`, pass it into PlayCanvas `assignAnimation`, normalize only the displayed time for looping, and explicitly stop at the final frame for one-shot playback. The detail page owns the switch state and calls the viewer runtime API so changing the switch does not recreate the GLB, HDRI, or camera.

**Tech Stack:** React 19, TypeScript, PlayCanvas 2.21, existing `Switch` component, Node test runner with `--experimental-strip-types`, Vite.

---

### Task 1: Lock the frame-boundary contract with tests

**Files:**
- Modify: `client/src/pages/animations/animationFrame.test.mjs`
- Modify: `client/src/pages/animations/animationPreviewApp.test.mjs`
- Modify: `client/src/pages/animations/AnimationPreviewPage.test.mjs`

- [ ] **Step 1: Write the failing frame conversion test**

Add a test beside the existing frame-boundary tests:

```js
test("循环模式在片段时长边界回到第 0 帧，单次播放保留末帧", () => {
  assert.equal(secondsToFrame(1, 24, 1, true), 0);
  assert.equal(secondsToFrame(1 - 0.0001, 24, 1, true), 24);
  assert.equal(secondsToFrame(1, 24, 1, false), 24);
});
```

- [ ] **Step 2: Write failing source contracts for loop runtime and UI**

Update the old hard-coded loop assertion to require a loop variable passed to
`assignAnimation`, and add assertions for `setLoop`, `isLooping`, the loop-aware
`secondsToFrame` call, the non-loop boundary stop, the page `Switch`, and the
toggle callback. Keep the existing HDRI, first-frame, and accessibility contracts.

- [ ] **Step 3: Run the focused tests and confirm the expected failure**

Run:

```powershell
node --experimental-strip-types --test client/src/pages/animations/animationFrame.test.mjs client/src/pages/animations/animationPreviewApp.test.mjs client/src/pages/animations/AnimationPreviewPage.test.mjs
```

Expected: the new loop-boundary and loop-control assertions fail against the
current hard-coded implementation; existing tests remain runnable.

### Task 2: Implement loop-aware time and PlayCanvas playback state

**Files:**
- Modify: `client/src/pages/animations/animationFrame.ts:50-70`
- Modify: `client/src/pages/animations/animationPreviewApp.ts:29-65,410-535`

- [ ] **Step 1: Add loop-aware time normalization**

Extend `secondsToFrame` with `loop = false`. For finite non-negative time and a
positive duration, use `seconds % duration` only when looping; otherwise clamp
to the duration. Keep the existing invalid-input and frame-count behavior so
old callers remain one-shot-compatible.

- [ ] **Step 2: Carry loop state through the preview API**

Add `loop?: boolean` to `AnimationPreviewOptions`, default it to `true` inside
the loaded preview, and expose `setLoop(loop: boolean)` plus `isLooping()` on
`AnimationPreview`. Pass the state to `anim.assignAnimation(..., loop)`.

- [ ] **Step 3: Preserve the current frame when the switch changes**

When `setLoop` changes the mode, read the current frame before changing the
state, reassign the active track with the new loop value, re-activate the same
clip, restore the captured frame, and restore whether it was playing. This
prevents a toggle from resetting the HDRI/model view or jumping to frame 0.

- [ ] **Step 4: Synchronize both playback modes at the update boundary**

Call `secondsToFrame(layerTime, frameRate, durationSeconds, loop)` from
`readCurrentFrame`. In the update callback, when `loop === false` and the layer
time reaches the duration, write the final frame, set `anim.playing = false`,
pause the layer, and notify React. In loop mode leave PlayCanvas's layer time
alone and let the modulo conversion expose the wrapped frame.

- [ ] **Step 5: Run the focused tests and typecheck**

Run the focused Node tests from Task 1 and:

```powershell
pnpm --filter @ai-novel/client typecheck
```

Expected: all focused tests pass and the client typecheck exits with code 0.

### Task 3: Add the loop switch to the animation detail page

**Files:**
- Modify: `client/src/pages/animations/AnimationPreviewPage.tsx:1-160,389-433`

- [ ] **Step 1: Bind page state to the viewer API**

Add `loop` state initialized to `true`, pass `loop: true` when opening the
viewer, sync the ready viewer with `isLooping()`, and add a handler that updates
React state and calls `viewerRef.current?.setLoop(nextLoop)`.

- [ ] **Step 2: Render the accessible existing Switch**

Place a labelled `Switch` beside the play button in the timeline controls:

```tsx
<label className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
  <span>循环播放</span>
  <Switch
    checked={loop}
    onCheckedChange={handleLoopChange}
    disabled={!viewer}
    aria-label="循环播放"
  />
</label>
```

Use the existing `Switch` contract (`checked` + `onCheckedChange`) and do not
add explanatory hint copy. The switch remains keyboard-focusable through the
shared component and is disabled until the preview is ready.

- [ ] **Step 3: Run UI source tests and typecheck**

Run:

```powershell
node --experimental-strip-types --test client/src/pages/animations/animationFrame.test.mjs client/src/pages/animations/animationPreviewApp.test.mjs client/src/pages/animations/AnimationPreviewPage.test.mjs
pnpm --filter @ai-novel/client typecheck
```

Expected: all focused tests pass and typecheck exits with code 0.

### Task 4: Document and self-test the user-visible behavior

**Files:**
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`
- Create: `docs/wiki/debugging/animation-loop-frame-sync.md`

- [ ] **Step 1: Record durable debugging guidance**

Document the contract from the design spec: PlayCanvas time may continue past a
looped clip duration, so UI frame conversion must wrap; one-shot mode must stop
the player explicitly because the layer can remain marked playing at its exact
duration. Record the relevant runtime and UI entrypoints, not a changelog.

- [ ] **Step 2: Update user-facing release notes**

Add the loop switch and synchronized frame display to the existing `2026-09-01`
release-note block and refresh the README `## 最新更新` block according to the
release-note workflow.

- [ ] **Step 3: Run the built-in browser smoke test**

Against `http://127.0.0.1:5174/animations/unreal-daily-male-locomotion-jog-forward`
using the Codex in-app browser:

1. Confirm the `循环播放` switch is checked after the preview is ready.
2. Click `播放动画`, sample the timeline until it crosses the short clip's
   boundary, and confirm a low frame follows the last frame while the button
   remains `暂停动画`.
3. Pause, turn the switch off, play again, wait past the clip duration, and
   confirm the button returns to `播放动画`, the status is `已暂停`, and the
   frame is the final frame.
4. Capture the final view and inspect browser console errors; expected errors:
   none.

- [ ] **Step 4: Review the diff and commit the completed unit**

Run `git status --short`, confirm only this feature's files are changed, then
commit with:

```powershell
git add client/src/pages/animations/animationFrame.ts client/src/pages/animations/animationFrame.test.mjs client/src/pages/animations/animationPreviewApp.ts client/src/pages/animations/animationPreviewApp.test.mjs client/src/pages/animations/AnimationPreviewPage.tsx client/src/pages/animations/AnimationPreviewPage.test.mjs docs/superpowers/specs/2026-09-01-animation-loop-frame-sync-design.md docs/superpowers/plans/2026-09-01-animation-loop-frame-sync.md docs/wiki/debugging/animation-loop-frame-sync.md docs/releases/release-notes.md README.md
git commit -s -m "fix: synchronize animation loop frame preview"
```
