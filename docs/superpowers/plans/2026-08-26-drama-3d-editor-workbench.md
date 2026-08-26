# 场景与分镜 3D 编辑工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将场景 3D 编辑器和分镜 3D 草图改造成浏览器主内容区满高、自适应视口、右侧上下分区并带根场景对象的统一工作台。

**Architecture:** 在 `comicDrama/components/editor3d/` 新增只负责布局和对象列表的共享组件。两个页面保留各自的 viewer、保存和业务状态，只把页头、视口、对象项和当前对象的属性/操作交给共享壳渲染；场景根对象是前端选择语义，不新增后端实体或改变已有保存合同。

**Tech Stack:** React 19、TypeScript、Tailwind CSS token、shadcn/ui Card/Button/Badge、lucide-react、Node test contract tests、PlayCanvas viewer。

---

### Task 1: Lock the shared workbench and object-list contract with failing tests

**Files:**
- Create: `client/tests/drama3dEditorWorkbench.contract.test.js`
- Modify: `client/tests/storyScene3dEditorContracts.test.js`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`

- [ ] **Step 1: Write the failing test**

Add source-contract assertions that require:

```js
const shell = read("src/pages/drama/comicDrama/components/editor3d/Drama3DEditorShell.tsx");
const objectPanel = read("src/pages/drama/comicDrama/components/editor3d/Drama3DObjectPanel.tsx");
const scenePage = read("src/pages/drama/comicDrama/DramaScene3DPage.tsx");
const blockingPage = read("src/pages/drama/comicDrama/DramaBlocking3DPage.tsx");

test("共享 3D 工作台使用满高布局并把右侧拆成对象和操作两区", () => {
  assert.match(shell, /h-full/);
  assert.match(shell, /min-h-0/);
  assert.match(shell, /grid-rows-/);
  assert.match(shell, /overflow-hidden/);
  assert.match(objectPanel, /场景对象/);
  assert.match(objectPanel, /aria-pressed/);
  assert.match(objectPanel, /focus-visible:ring/);
});

test("两个页面都注册根场景对象并接入共享工作台", () => {
  assert.match(scenePage, /kind: "scene"/);
  assert.match(blockingPage, /kind: "scene"/);
  assert.match(scenePage, /Drama3DEditorShell/);
  assert.match(blockingPage, /Drama3DEditorShell/);
  assert.match(scenePage, /属性与操作/);
  assert.match(blockingPage, /属性与操作/);
});
```

Also update the existing 3D runtime contract to assert the current `createBackdropGeometryData` module boundary and the current 1.7-meter reference actor, so the baseline contract describes the code that is actually in `main`.

- [ ] **Step 2: Run tests to verify they fail**

Run from `client/`:

```powershell
pnpm exec node --experimental-strip-types --test tests/drama3dEditorWorkbench.contract.test.js
```

Expected: FAIL because the shared workbench files and page integration do not exist yet.

- [ ] **Step 3: Commit the red contract**

```powershell
git add client/tests/drama3dEditorWorkbench.contract.test.js client/tests/storyScene3dEditorContracts.test.js client/tests/dramaBlocking3dPage.contract.test.js
git commit -s -m "test: define responsive drama 3d workbench contract"
```

### Task 2: Implement the shared full-height shell and object panel

**Files:**
- Create: `client/src/pages/drama/comicDrama/components/editor3d/Drama3DEditorShell.tsx`
- Create: `client/src/pages/drama/comicDrama/components/editor3d/Drama3DObjectPanel.tsx`
- Create: `client/src/pages/drama/comicDrama/components/editor3d/index.ts`
- Test: `client/tests/drama3dEditorWorkbench.contract.test.js`

- [ ] **Step 1: Define the object item contract**

In `Drama3DObjectPanel.tsx`, export a `Drama3DObjectItem` type with `id`, `label`, `kind`, `meta`, `selected`, `disabled`, and `onSelect`. Render a `Card` titled `场景对象`, a scrollable list, and one native button per item. Use `cn()` for selected/disabled classes, lucide icons by object kind, `aria-pressed`, `aria-label` where needed, and `focus-visible:ring-2 focus-visible:ring-ring`. Render an explicit empty state when `items` is empty.

- [ ] **Step 2: Define the shell layout**

In `Drama3DEditorShell.tsx`, accept `header`, `viewport`, `objects`, and `actions` React nodes. Render:

```tsx
<div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
  <header className="shrink-0">{header}</header>
  <div className="grid min-h-0 min-w-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <section className="min-h-0 min-w-0 overflow-hidden">{viewport}</section>
    <aside className="grid min-h-0 min-w-0 grid-rows-[minmax(10rem,0.8fr)_minmax(0,1.2fr)] gap-3 overflow-hidden" aria-label="场景对象与操作">
      <section className="min-h-0 overflow-hidden">{objects}</section>
      <section className="min-h-0 overflow-hidden">{actions}</section>
    </aside>
  </div>
</div>
```

Keep the shell color/layout classes on semantic tokens and do not add a new UI dependency.

- [ ] **Step 3: Run the focused contract**

Run:

```powershell
pnpm exec node --experimental-strip-types --test tests/drama3dEditorWorkbench.contract.test.js
```

Expected: the shared component assertions pass; page integration assertions remain red until Tasks 3–4.

- [ ] **Step 4: Commit the shared components**

```powershell
git add client/src/pages/drama/comicDrama/components/editor3d client/tests/drama3dEditorWorkbench.contract.test.js
git commit -s -m "feat: add responsive drama 3d editor shell"
```

### Task 3: Migrate the scene 3D editor to scene-object inspection

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`
- Modify: `client/tests/storyScene3dEditorContracts.test.js`
- Test: `client/tests/drama3dEditorWorkbench.contract.test.js`

- [ ] **Step 1: Add selection state and object projection**

Use a `selectedObjectId` union containing `scene`, `reference`, and `marker:<id>`. Subscribe to both viewer actor selection and marker selection so direct canvas selection updates the object panel. Clicking `scene` calls `viewer.selectActor(null)`, clicking the fixed reference selects `REFERENCE_ACTOR_LABEL`, and clicking a marker calls `focusMarker`.

Project objects in this order: root scene object, visible spatial markers, fixed 1.7-meter reference object. When markers become stale or disappear, return selection to `scene`.

- [ ] **Step 2: Move scene properties and operations into the lower panel**

Render the shared shell with a `Drama3DObjectPanel` above and a lower Card titled `属性与操作`. For the root scene object, show scene name/state/environment availability, the existing projection-center and dome-radius controls, and the existing AI marker analysis button. For a marker, show label, marker kind, confidence, position, size, and a focus button. For the reference object, show its fixed 1.7-meter scale role and a fit-view button.

- [ ] **Step 3: Remove the fixed aspect ratio and outer right-panel scroll**

Change the page root from `min-h-[calc(100dvh-7rem)]` to the shared shell; change the canvas card content from `aspect-video` to `h-full min-h-0`; keep the canvas `h-full w-full`. Ensure the old long `aside` is no longer present outside the shared two-region shell.

- [ ] **Step 4: Run scene contracts and typecheck**

Run:

```powershell
pnpm exec node --experimental-strip-types --test tests/drama3dEditorWorkbench.contract.test.js tests/storyScene3dEditorContracts.test.js
pnpm typecheck
```

Expected: scene workbench assertions pass and typecheck remains green; blocking page integration assertions may remain pending until Task 4.

- [ ] **Step 5: Commit the scene migration**

```powershell
git add client/src/pages/drama/comicDrama/DramaScene3DPage.tsx client/tests/storyScene3dEditorContracts.test.js client/tests/drama3dEditorWorkbench.contract.test.js
git commit -s -m "feat: organize scene 3d editor by scene objects"
```

### Task 4: Migrate the blocking 3D sketch to the same object/action model

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`
- Test: `client/tests/drama3dEditorWorkbench.contract.test.js`

- [ ] **Step 1: Add root/actor/marker selection synchronization**

Use `scene`, `actor:<characterName>`, and `marker:<id>` selection ids. Make the root scene object the initial selection after loading actors/layout; clicking a role or marker synchronizes PlayCanvas selection, and viewer callbacks synchronize the list back. Keep the existing add/remove behavior in the actor object rows.

- [ ] **Step 2: Recompose the lower operations area by selected object**

For `scene`, render shot design and scene/environment summaries, the AI automatic composition button, and camera fit/reset actions. For `actor`, render the existing static pose, model color, spatial placement, and height details. For `marker`, render marker details and focus action plus camera controls. Keep all existing disabled/loading states and exit-save behavior.

- [ ] **Step 3: Move the AI button out of the page header and remove the fixed aspect ratio**

Keep the page header for navigation/status; place the existing `AiButton` in the root scene action panel. Render the page through `Drama3DEditorShell`, make the canvas card fill its grid cell, and remove the old long scrolling `aside`.

- [ ] **Step 4: Run the full focused 3D contract set**

Run:

```powershell
pnpm exec node --experimental-strip-types --test tests/drama3dEditorWorkbench.contract.test.js tests/storyScene3dEditorContracts.test.js tests/dramaBlocking3dPage.contract.test.js tests/dramaBlocking3dHeight.contract.test.js tests/dramaBlocking3dCamera.contract.test.js tests/dramaBlocking3dSceneMarkers.test.js
pnpm typecheck
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 5: Commit the blocking migration**

```powershell
git add client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx client/tests/dramaBlocking3dPage.contract.test.js client/tests/drama3dEditorWorkbench.contract.test.js
git commit -s -m "feat: split blocking 3d objects and operations"
```

### Task 5: Document the stable workflow and prepare delivery

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Update the development wiki**

Add a durable rule under the current workflow: both editors use a full-height workbench; the upper right object tree has a root scene object; the lower inspector owns selected-object properties and actions; only the appropriate inner region scrolls.

- [ ] **Step 2: Update user-facing release surfaces**

Add a concise `2026-08-26` release note describing the responsive 3D editor, scene object selection, and separated properties/actions. Update only the newest `README.md` `## 最新更新` block and link; preserve historical entries.

- [ ] **Step 3: Run release-scope and final checks**

Run:

```powershell
pnpm typecheck
pnpm exec node --experimental-strip-types --test tests/drama3dEditorWorkbench.contract.test.js tests/storyScene3dEditorContracts.test.js tests/dramaBlocking3dPage.contract.test.js tests/dramaBlocking3dHeight.contract.test.js tests/dramaBlocking3dCamera.contract.test.js tests/dramaBlocking3dSceneMarkers.test.js
git diff --check
git status --short
```

Expected: typecheck and all focused tests pass, diff check is empty, and only the planned files are modified. Visual browser acceptance remains explicitly user-owned per project rules.

- [ ] **Step 4: Commit documentation and finish the isolated branch**

```powershell
git add docs/wiki/workflows/drama-blocking-3d.md docs/releases/release-notes.md README.md
git commit -s -m "docs: record responsive drama 3d workbench"
```

After all commits are clean, integrate from the clean main checkout with:

```powershell
pnpm workflow:integrate codex/scene-editor-responsive-object-panel --verify "pnpm typecheck" --push
```

Then verify local `main` equals `origin/main`, remove only the completed worktree/branch through the repository cleanup workflow, and report the final SHA and the browser verification handoff.
