# 场景类型驱动的 3D 环境默认参数 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让室内、室外、自然场景在 3D 场景编辑和分镜阻挡预览中分别使用高度 2、半球直径 10/15/20 的统一默认参数，同时保留用户已经保存的自定义参数。

**Architecture:** 在服务端 `StoryScene3dEnvironment` 领域模块集中处理场景类型归一化、类型默认值、旧 `2/15` 快照识别和自定义标记；投影、场景服务、导入、空间标记分析和分镜阻挡读取同一个解析器。3D 编辑器继续消费场景接口返回的 `scene3dEnvironment`，不复制一份前端映射。

**Tech Stack:** TypeScript、Prisma JSON 字段、Node `node:test`、React/Vite、pnpm workspace。

---

### Task 1: 为类型默认和自定义保留建立领域契约

**Files:**
- Modify: `server/tests/storyScene3dEnvironment.test.mjs`
- Modify: `server/src/modules/novel/story-settings/application/StoryScene3dEnvironment.ts`

- [ ] **Step 1: Write the failing tests**

在现有测试文件的 import 中加入 `getDefaultStoryScene3dEnvironment`、`resolveStorySceneType` 和 `resolveStoryScene3dEnvironment`，并追加以下测试：

```js
test("场景类型决定 3D 默认高度和半球直径", () => {
  assert.deepEqual(getDefaultStoryScene3dEnvironment("interior"), {
    projectionCenterHeight: 2,
    domeRadius: 10,
    panoramaHorizonV: 0.5,
    yawDeg: 0,
    intensity: 1,
  });
  assert.equal(getDefaultStoryScene3dEnvironment("exterior").domeRadius, 15);
  assert.equal(getDefaultStoryScene3dEnvironment("nature").domeRadius, 20);
  assert.equal(getDefaultStoryScene3dEnvironment("unknown").domeRadius, 15);
});

test("状态类型优先于场景兼容类型，缺失时按室外兜底", () => {
  assert.equal(resolveStorySceneType("interior", "nature"), "nature");
  assert.equal(resolveStorySceneType("interior", null), "interior");
  assert.equal(resolveStorySceneType(null, "nature"), "nature");
  assert.equal(resolveStorySceneType("invalid", undefined), "exterior");
});

test("历史固定默认快照按场景类型迁移，已标记自定义值保持不变", () => {
  const legacy = JSON.stringify(DEFAULT_STORY_SCENE_3D_ENVIRONMENT);
  assert.equal(resolveStoryScene3dEnvironment("interior", legacy).domeRadius, 10);
  assert.equal(resolveStoryScene3dEnvironment("nature", legacy).domeRadius, 20);

  const custom = serializeStoryScene3dEnvironment(
    { projectionCenterHeight: 4.5, domeRadius: 15, panoramaHorizonV: 0.58 },
    { customized: true },
  );
  assert.deepEqual(resolveStoryScene3dEnvironment("interior", custom), {
    projectionCenterHeight: 4.5,
    domeRadius: 15,
    panoramaHorizonV: 0.58,
    yawDeg: 0,
    intensity: 1,
  });
});

test("未配置序列化记录会随类型解析，显式 null 仍然代表未配置", () => {
  const storedDefault = serializeStoryScene3dEnvironment(
    getDefaultStoryScene3dEnvironment("nature"),
    { customized: false },
  );
  assert.equal(resolveStoryScene3dEnvironment("nature", storedDefault).domeRadius, 20);
  assert.equal(resolveStoryScene3dEnvironment("interior", null).domeRadius, 10);
});
```

- [ ] **Step 2: Run the new tests and verify they fail for the missing behavior**

Run from the worktree root:

```powershell
node --test server/tests/storyScene3dEnvironment.test.mjs
```

Expected: FAIL because the new domain exports do not exist yet; the failure must be an import/export or missing-function failure, not a syntax error in the test.

- [ ] **Step 3: Implement the minimal domain API**

Extend `StoryScene3dEnvironment.ts` with the following behavior while keeping `parseStoryScene3dEnvironment` backward-compatible for callers that do not have scene type context:

```ts
import type { StoryAssetSceneType } from "@ai-novel/shared/types/novelReferenceExtraction";

export const STORY_SCENE_3D_DEFAULT_DOME_RADIUS_BY_TYPE: Record<StoryAssetSceneType, number> = {
  interior: 10,
  exterior: 15,
  nature: 20,
};

export function normalizeStorySceneType(value: unknown): StoryAssetSceneType | null {
  return value === "interior" || value === "exterior" || value === "nature"
    ? value
    : null;
}

export function resolveStorySceneType(
  sceneType: unknown,
  fallbackStateType?: unknown,
): StoryAssetSceneType {
  return normalizeStorySceneType(fallbackStateType)
    ?? normalizeStorySceneType(sceneType)
    ?? "exterior";
}

export function getDefaultStoryScene3dEnvironment(sceneType?: unknown): StoryScene3DEnvironment {
  const resolvedType = resolveStorySceneType(undefined, sceneType);
  return {
    ...DEFAULT_STORY_SCENE_3D_ENVIRONMENT,
    domeRadius: STORY_SCENE_3D_DEFAULT_DOME_RADIUS_BY_TYPE[resolvedType],
  };
}

export function serializeStoryScene3dEnvironment(
  input: StoryScene3DEnvironmentInput | Partial<StoryScene3DEnvironment> | null | undefined,
  options: { customized?: boolean } = {},
): string {
  return JSON.stringify({
    ...normalizeStoryScene3dEnvironment(input),
    customized: options.customized ?? input != null,
  });
}

export function resolveStoryScene3dEnvironment(
  sceneType: unknown,
  raw: string | null | undefined,
  fallbackStateType?: unknown,
): StoryScene3DEnvironment {
  const defaultEnvironment = getDefaultStoryScene3dEnvironment(
    resolveStorySceneType(sceneType, fallbackStateType),
  );
  if (!raw?.trim()) return defaultEnvironment;
  try {
    const parsed = JSON.parse(raw) as Partial<StoryScene3DEnvironment> & { customized?: unknown };
    const normalized = normalizeStoryScene3dEnvironment(parsed);
    const isLegacyDefault = JSON.stringify(normalized) === JSON.stringify(DEFAULT_STORY_SCENE_3D_ENVIRONMENT);
    return parsed.customized === true || (parsed.customized === undefined && !isLegacyDefault)
      ? normalized
      : defaultEnvironment;
  } catch {
    return defaultEnvironment;
  }
}
```

The implementation must keep the existing clamp ranges and force `yawDeg: 0` / `intensity: 1`. `parseStoryScene3dEnvironment` may continue to normalize a raw JSON snapshot with the generic exterior-compatible default for legacy callers, while all scene-aware callers use `resolveStoryScene3dEnvironment`.

- [ ] **Step 4: Run the domain tests and confirm green**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/storyScene3dEnvironment.test.mjs
```

Expected: all tests in `storyScene3dEnvironment.test.mjs` pass with no uncaught errors.

- [ ] **Step 5: Commit the domain contract**

```powershell
git add server/src/modules/novel/story-settings/application/StoryScene3dEnvironment.ts server/tests/storyScene3dEnvironment.test.mjs
git commit -s -m "feat: add scene type 3d environment defaults"
```

### Task 2: 让场景创建、导入和接口投影使用统一解析器

**Files:**
- Modify: `server/tests/storyScene3dPropagationContract.test.js`
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsProjection.ts`
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsService.ts`
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsBundlePersistence.ts`

- [ ] **Step 1: Add failing source-contract assertions**

在 `server/tests/storyScene3dPropagationContract.test.js` 中读取投影和导入文件，并追加：

```js
const projection = read("src/modules/novel/story-settings/application/StorySettingsProjection.ts");
const bundlePersistence = read("src/modules/novel/story-settings/application/StorySettingsBundlePersistence.ts");

assert.match(service, /resolveStoryScene3dEnvironment\\(/);
assert.match(projection, /resolveStoryScene3dEnvironment\\(/);
assert.match(bundlePersistence, /getDefaultStoryScene3dEnvironment\\(/);
```

Run:

```powershell
node --test server/tests/storyScene3dPropagationContract.test.js
```

Expected: FAIL because the current files still call `parseStoryScene3dEnvironment` directly.

- [ ] **Step 2: Implement projection and service wiring**

In `projectScene`, normalize the states once, then pass the first normalized state type as the preferred type and the scene row type as the compatibility fallback:

```ts
const states = normalizeSceneStates(parseStates(row.statesJson), row);
const environment = resolveStoryScene3dEnvironment(
  row.sceneType,
  row.scene3dEnvironmentJson,
  states[0]?.sceneType,
);
return {
  id: row.id,
  name: row.name,
  sceneType: row.sceneType,
  summary: row.summary,
  environmentPrompt: row.environmentPrompt,
  significance: row.significance,
  timeOfDay: row.timeOfDay ?? null,
  weather: row.weather ?? null,
  image: parseStoryAssetImage(row.imageData),
  mapNodeId: row.mapNodeId,
  mapUnmappable: row.mapUnmappable,
  sortOrder: row.sortOrder,
  source: row.source,
  states: scopeStateImageUrls(states, novelId, "scene", row.id),
  scene3dEnvironment: environment,
  updatedAt: row.updatedAt.toISOString(),
};
```

Apply the same two local variables in `StorySettingsService.listScenes`. In `createScene`, use `resolveStorySceneType(input.sceneType, states[0]?.sceneType)` and write the type-aware default as an uncustomized record when `scene3dEnvironment` is omitted or null:

```ts
const resolvedSceneType = resolveStorySceneType(input.sceneType, states[0]?.sceneType);
scene3dEnvironmentJson: serializeStoryScene3dEnvironment(
  input.scene3dEnvironment ?? getDefaultStoryScene3dEnvironment(resolvedSceneType),
  { customized: input.scene3dEnvironment != null },
),
```

In `updateScene`, preserve the existing conditional update. When `scene3dEnvironment` is supplied, serialize objects with `{ customized: true }` and null with `{ customized: false }`; when it is omitted, leave the stored JSON untouched:

```ts
...(input.scene3dEnvironment !== undefined
  ? {
    scene3dEnvironmentJson: serializeStoryScene3dEnvironment(
      input.scene3dEnvironment,
      { customized: input.scene3dEnvironment !== null },
    ),
  }
  : {}),
```

In `StorySettingsBundlePersistence`, serialize `getDefaultStoryScene3dEnvironment(scene.sceneType)` with `{ customized: false }` for imported scenes. Do not change the public DTO or expose the internal `customized` marker.

- [ ] **Step 3: Run focused tests and verify the source contract passes**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/storyScene3dEnvironment.test.mjs server/tests/storyScene3dPropagationContract.test.js
```

Expected: both test files pass.

- [ ] **Step 4: Commit the scene service wiring**

```powershell
git add server/src/modules/novel/story-settings/application/StorySettingsProjection.ts server/src/modules/novel/story-settings/application/StorySettingsService.ts server/src/modules/novel/story-settings/application/StorySettingsBundlePersistence.ts server/tests/storyScene3dPropagationContract.test.js
git commit -s -m "feat: apply scene type defaults in settings projection"
```

### Task 3: 让空间标记和分镜阻挡上下文使用同一场景类型

**Files:**
- Modify: `server/tests/storyScene3dPropagationContract.test.js`
- Modify: `server/src/modules/novel/story-settings/application/StoryScene3dMarkerService.ts`
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`

- [ ] **Step 1: Add failing integration-contract assertions**

在契约测试中读取标记服务，并追加：

```js
const markerService = read("src/modules/novel/story-settings/application/StoryScene3dMarkerService.ts");

assert.match(markerService, /resolveStoryScene3dEnvironment\\(/);
assert.match(blockingService, /resolveStoryScene3dEnvironment\\(/);
```

Run:

```powershell
node --test server/tests/storyScene3dPropagationContract.test.js
```

Expected: FAIL until both downstream services are wired.

- [ ] **Step 2: Implement downstream wiring**

In `StoryScene3dMarkerService`, keep `sceneType: true` in the initial scene select and resolve the scene-level environment after the normalized states are available:

```ts
const environment = resolveStoryScene3dEnvironment(
  initialRow.sceneType,
  initialRow.scene3dEnvironmentJson,
  initialStates[0]?.sceneType,
);
```

Use this environment for `environmentJson` and marker radius exactly as before. The analyzed state can be any state, but the scene-level environment must continue to use the default state's type. In `DramaShotBlockingSketchService`, calculate the default state once for every scene candidate and resolve the environment with that state type:

```ts
const sceneCandidates = sceneRows.map((scene) => {
  const state = selectSceneState(scene.statesJson, scene);
  return {
    name: scene.name,
    assetId: scene.id,
    state,
    environment: resolveStoryScene3dEnvironment(
      scene.sceneType,
      scene.scene3dEnvironmentJson,
      state?.sceneType,
    ),
  };
}).filter((scene): scene is {
  name: string;
  assetId: string;
  state: StoryAssetState;
  environment: StoryScene3DEnvironment;
} => Boolean(scene.state));
```

Remove the direct scene-aware `parseStoryScene3dEnvironment` imports from these two files. Preserve the existing `environment: matchedScene.environment` propagation into the blocking context.

- [ ] **Step 3: Run downstream tests and typecheck**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/storyScene3dPropagationContract.test.js server/tests/storyScene3dEnvironment.test.mjs
pnpm --filter @ai-novel/server typecheck
```

Expected: all focused tests pass and server typecheck exits 0.

- [ ] **Step 4: Commit downstream wiring**

```powershell
git add server/src/modules/novel/story-settings/application/StoryScene3dMarkerService.ts server/src/services/drama/visual/DramaShotBlockingSketchService.ts server/tests/storyScene3dPropagationContract.test.js
git commit -s -m "feat: propagate scene type environment defaults"
```

### Task 4: Update durable documentation and user-visible release notes

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md:89`
- Modify: `docs/releases/release-notes.md:5-25`
- Modify: `README.md:145-180`

- [ ] **Step 1: Update the wiki rule**

Replace the current fixed-default sentence in the `NovelScene.scene3dEnvironmentJson` section with the durable contract: height is always `2`; default dome diameter is `10` for `interior`, `15` for `exterior`, and `20` for `nature`; state type is authoritative, scene column is compatibility fallback, missing type is exterior; explicit custom environment values are preserved; horizon/range/yaw/intensity rules remain unchanged.

- [ ] **Step 2: Update the current release note and README latest update**

Add one concise user-facing bullet under `### 2026-08-26` in `docs/releases/release-notes.md`, and the same latest-update bullet in `README.md`, describing that 3D scene defaults adapt to indoor/outdoor/natural scene types while manual settings remain unchanged. Do not mention JSON fields, migration markers, implementation files, or test names in user-facing copy.

- [ ] **Step 3: Check documentation and commit**

```powershell
git diff --check
node scripts/check-docs-manifest.cjs
```

Expected: no whitespace errors and documentation manifest check passes.

```powershell
git add docs/wiki/workflows/drama-blocking-3d.md docs/releases/release-notes.md README.md
git commit -s -m "docs: document scene type 3d defaults"
```

### Task 5: Final verification and delivery

**Files:**
- Verify all changes in the branch; do not add new source files in this task.

- [ ] **Step 1: Run focused server and client checks**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/storyScene3dEnvironment.test.mjs server/tests/storyScene3dPropagationContract.test.js
pnpm --filter @ai-novel/server typecheck
pnpm --filter @ai-novel/client typecheck
git diff --check
```

Expected: all commands exit 0. UI browser acceptance remains a user-facing check per project verification rules; code-level evidence must show that the editor consumes server-returned `scene3dEnvironment` and no second client mapping was introduced.

- [ ] **Step 2: Review the complete diff and branch status**

```powershell
git status --short
git diff main...HEAD --stat
git diff main...HEAD -- server/src/modules/novel/story-settings/application/StoryScene3dEnvironment.ts server/src/modules/novel/story-settings/application/StorySettingsProjection.ts server/src/modules/novel/story-settings/application/StorySettingsService.ts server/src/modules/novel/story-settings/application/StoryScene3dMarkerService.ts server/src/services/drama/visual/DramaShotBlockingSketchService.ts
```

Expected: only the scene-type default feature, its tests, design/plan documents, wiki, release notes, and README update are present; no unrelated worktree files are staged.

- [ ] **Step 3: Integrate, push, and clean up**

From the clean main worktree, after re-running `pnpm check:workspace-integrity`:

```powershell
pnpm workflow:integrate codex/drama-scene-type-environment-defaults --push --verify "pnpm --filter @ai-novel/server test"
```

Then verify:

```powershell
git status --short
git rev-parse main
git rev-parse origin/main
git worktree list --porcelain
```

Expected: main and `origin/main` point to the same commit, the main worktree is clean, and this feature worktree/branch has been removed by the integration workflow after successful promotion.
