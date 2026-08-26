# 场景资产 3D 环境默认参数调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将室内、室外、自然场景资产的 3D 环境未自定义默认值统一为 `1/8`、`1.7/10`、`1/20`，并保持显式自定义环境与历史数据兼容。

**Architecture:** 继续以服务端 `StoryScene3dEnvironment` 作为类型映射、归一化和历史快照识别的唯一来源。客户端 viewer 只保留无场景数据时的室外默认回退；场景编辑器、空间标记分析和分镜阻挡继续消费服务端已解析的环境对象。

**Tech Stack:** TypeScript、Node.js `node:test`、React/TypeScript、pnpm workspace、Markdown wiki/release notes。

---

### Task 1: Lock the new default contract with failing server tests

**Files:**
- Modify: `server/tests/storyScene3dEnvironment.test.mjs:13-121`

- [x] **Step 1: Update the test expectations before changing production code**

Change the generic default assertion to:

```js
assert.deepEqual(DEFAULT_STORY_SCENE_3D_ENVIRONMENT, {
  projectionCenterHeight: 1.7,
  domeRadius: 10,
  yawDeg: 0,
  intensity: 1,
});
```

Replace the type-default test with exact assertions for all three types:

```js
assert.deepEqual(getDefaultStoryScene3dEnvironment("interior"), {
  projectionCenterHeight: 1,
  domeRadius: 8,
  yawDeg: 0,
  intensity: 1,
});
assert.deepEqual(getDefaultStoryScene3dEnvironment("exterior"), {
  projectionCenterHeight: 1.7,
  domeRadius: 10,
  yawDeg: 0,
  intensity: 1,
});
assert.deepEqual(getDefaultStoryScene3dEnvironment("nature"), {
  projectionCenterHeight: 1,
  domeRadius: 20,
  yawDeg: 0,
  intensity: 1,
});
assert.deepEqual(getDefaultStoryScene3dEnvironment("unknown"), getDefaultStoryScene3dEnvironment("exterior"));
```

Add assertions that old unmarked snapshots migrate while an explicitly customized snapshot remains unchanged:

```js
for (const legacy of [
  { projectionCenterHeight: 2, domeRadius: 10 },
  { projectionCenterHeight: 2, domeRadius: 15 },
  { projectionCenterHeight: 2, domeRadius: 20 },
]) {
  assert.deepEqual(
    resolveStoryScene3dEnvironment("interior", JSON.stringify(legacy)),
    getDefaultStoryScene3dEnvironment("interior"),
  );
}
const customized = serializeStoryScene3dEnvironment(
  { projectionCenterHeight: 2, domeRadius: 15 },
  { customized: true },
);
assert.deepEqual(
  resolveStoryScene3dEnvironment("interior", customized),
  { projectionCenterHeight: 2, domeRadius: 15, yawDeg: 0, intensity: 1 },
);
```

- [x] **Step 2: Run the focused test to verify it fails for the old defaults**

Run:

```powershell
pnpm --filter @ai-novel/server prisma:generate
pnpm --filter @ai-novel/server build
node --test server/tests/storyScene3dEnvironment.test.mjs
```

Expected: FAIL on the generic and per-type default assertions because production code still returns `2 / 15`, `2 / 10`, and `2 / 20`.

### Task 2: Implement the server-side typed default and migration policy

**Files:**
- Modify: `server/src/modules/novel/story-settings/application/StoryScene3dEnvironment.ts:12-125`

- [x] **Step 1: Add the exact type maps and make the generic fallback outdoor `1.7 / 10`**

Keep `STORY_SCENE_3D_DEFAULT_DOME_RADIUS_BY_TYPE` for compatibility, add a projection-height map, and make `getDefaultStoryScene3dEnvironment` set both fields:

```ts
export const DEFAULT_STORY_SCENE_3D_ENVIRONMENT: StoryScene3DEnvironment = {
  projectionCenterHeight: 1.7,
  domeRadius: 10,
  yawDeg: 0,
  intensity: 1,
};

export const STORY_SCENE_3D_DEFAULT_PROJECTION_CENTER_HEIGHT_BY_TYPE: Record<StoryAssetSceneType, number> = {
  interior: 1,
  exterior: 1.7,
  nature: 1,
};
```

Resolve the type once and return its mapped height and diameter without changing the existing type-priority rule.

- [x] **Step 2: Recognize old and new uncustomized snapshots**

Replace the single legacy equality check with deterministic matching for old defaults `(2,10)`, `(2,15)`, `(2,20)` and new defaults `(1,8)`, `(1.7,10)`, `(1,20)`. Compare normalized height, diameter, yaw, and intensity. Preserve the existing precedence: `customized: true` always preserves the normalized input and `customized: false` always resolves through the current type default.

- [x] **Step 3: Run the focused test to verify the minimal implementation passes**

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/storyScene3dEnvironment.test.mjs
```

Expected: all environment tests pass, including exact defaults, outdoor fallback, old snapshot migration, and explicit custom preservation.

### Task 3: Align the client fallback contract

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts:56-61`
- Modify: `client/tests/dramaBlocking3dStaticHdri.contract.test.js:131-134`

- [x] **Step 1: Change the viewer fallback to outdoor `1.7 / 10`**

Set `DEFAULT_BLOCKING_3D_ENVIRONMENT` to height `1.7`, diameter `10`, yaw `0`, and intensity `1`. Do not add scene-type branching to the viewer; the scene page already overlays the server-resolved environment.

- [x] **Step 2: Update and run the static client contract**

Run from the repository root:

```powershell
node --test client/tests/dramaBlocking3dStaticHdri.contract.test.js
```

Expected: the contract passes and still confirms that only height and diameter are configurable while horizon, yaw, and intensity remain fixed.

### Task 4: Update durable documentation and release surfaces

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md:92`
- Modify: `README.md:157`
- Modify: `docs/releases/release-notes.md:14`

- [x] **Step 1: Document the exact type defaults**

Update the workflow rule and latest product notes to state `interior=1/8`, `exterior=1.7/10`, `nature=1/20`, the outdoor fallback, and preservation of explicit custom calibration. Keep the compatibility explanation for the `domeRadius` field and its user-facing diameter meaning.

- [x] **Step 2: Check for stale current-rule text**

```powershell
git diff --check
rg -n '室内 2|室外 15|投射中心高度统一为 `2`|2 / 15' README.md docs/releases/release-notes.md docs/wiki/workflows/drama-blocking-3d.md
```

Expected: no stale current-rule or release-note match remains; historical migration values may remain in the new design document and tests.

### Task 5: Full focused verification and delivery

**Files:**
- No additional source files; verify the complete diff and repository state.

- [x] **Step 1: Run server checks**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server prisma:generate
pnpm --filter @ai-novel/server build
pnpm --filter @ai-novel/server typecheck
node --test server/tests/storyScene3dEnvironment.test.mjs server/tests/storyScene3dPropagationContract.test.js
```

Expected: every command exits with code 0 and the focused tests report zero failures.

- [x] **Step 2: Run client checks**

```powershell
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
node --test client/tests/dramaBlocking3dStaticHdri.contract.test.js
```

Expected: typecheck, build, and the client contract test all pass.

- [ ] **Step 3: Commit and integrate**

```powershell
git status --short
git diff --check
git add server/src/modules/novel/story-settings/application/StoryScene3dEnvironment.ts server/tests/storyScene3dEnvironment.test.mjs client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts client/tests/dramaBlocking3dStaticHdri.contract.test.js docs/wiki/workflows/drama-blocking-3d.md README.md docs/releases/release-notes.md
git commit -s -m "fix: align scene environment default values"
```

From the clean main checkout, run:

```powershell
pnpm workflow:integrate codex/scene-environment-default-values --verify "pnpm typecheck" --push
git status --short
git rev-parse HEAD
git rev-parse origin/main
git worktree list --porcelain
```

Expected: the integration command pushes `origin/main`, both SHA commands match, the main worktree is clean, and the feature worktree is removed after cleanup.
