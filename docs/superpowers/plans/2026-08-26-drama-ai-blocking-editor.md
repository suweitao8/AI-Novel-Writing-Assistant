# 分镜 3D 草图编辑器内 AI 构图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将分镜 AI 摆位收敛到 3D 草图编辑器，在当前镜头视口中应用 AI 的角色、相机和景深设计，并显示、保存本镜镜头设计说明。

**Architecture:** 复用现有 POST .../blocking-sketch/auto-plan 和 PlayCanvas viewer.loadLayout，不新增 AI 接口。后端 editor context 增加只读 shot 摘要，草图数据增加可选 compositionNote；前端仅在编辑器顶部按钮被点击时调用 AI，成功后把布局作为未保存草图展示，退出时沿用 JSON、PNG、confirm 链路。

**Tech Stack:** React 19、TypeScript、React Query、Tailwind/shadcn 风格组件、Express 5、Zod、Node node:test、PlayCanvas。

---

### Task 1: Extend the editor contracts for shot context and composition notes

**Files:**
- Modify: client/src/api/media/drama.ts
- Modify: server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts
- Modify: server/src/modules/drama/http/dramaRoutes.ts
- Test: server/tests/dramaShotBlockingSketchContracts.test.mjs
- Test: server/tests/dramaShotBlockingSketchRoutes.test.js

- [ ] **Step 1: Write the failing contract tests**

Add this test to dramaShotBlockingSketchContracts.test.mjs:

~~~js
test("镜头设计说明可随草图快照规范化并兼容旧数据", () => {
  const normalized = normalizeBlockingSketchData({
    ...validSketch,
    compositionNote: "低机位贴近血角兽，角色从画面右侧压入前景。",
  });

  assert.equal(normalized.compositionNote, "低机位贴近血角兽，角色从画面右侧压入前景。");
  assert.equal(normalizeBlockingSketchData(validSketch).compositionNote, undefined);
});
~~~

Add this test to dramaShotBlockingSketchRoutes.test.js:

~~~js
test("草图保存路由接受可选的 AI 镜头设计说明", () => {
  assert.match(source, /compositionNote: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(240\)\.optional\(\)/);
});
~~~

- [ ] **Step 2: Run the focused tests and confirm the intended failure**

Run:

~~~powershell
node --test server/tests/dramaShotBlockingSketchContracts.test.mjs server/tests/dramaShotBlockingSketchRoutes.test.js
~~~

Expected: normalization returns undefined and the route assertion reports that the compositionNote schema is missing.

- [ ] **Step 3: Implement the minimal contract changes**

Add the same optional property to the client and server sketch-data types:

~~~ts
compositionNote?: string;
~~~

In normalizeBlockingSketchData, copy compositionNote only when it is a non-empty string after trimming; keep it undefined for legacy data. Add the exact Zod property to blockingSketchDataSchema so the existing save schema accepts it. Do not change layout validation or add an endpoint.

- [ ] **Step 4: Re-run the contract tests**

Run the command from Step 2. Expected: PASS with no new warnings.

- [ ] **Step 5: Commit the contract unit**

~~~powershell
git add client/src/api/media/drama.ts server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts server/src/modules/drama/http/dramaRoutes.ts server/tests/dramaShotBlockingSketchContracts.test.mjs server/tests/dramaShotBlockingSketchRoutes.test.js
git commit -s -m "feat: persist drama blocking composition notes"
~~~

### Task 2: Return the current shot summary from the blocking-sketch editor context

**Files:**
- Modify: server/src/services/drama/visual/DramaShotBlockingSketchService.ts
- Modify: client/src/api/media/drama.ts
- Test: server/tests/dramaShotBlockingAutoPlanService.test.js

- [ ] **Step 1: Write the failing service assertion**

In the existing editor-context test, use a shot fixture containing these values and append:

~~~js
test("编辑器上下文返回当前镜头的设计摘要", async () => {
  const context = await service.getEditorContext("project-1", "shot-1");

  assert.deepEqual(context.shot, {
    order: 4,
    location: "废墟广场",
    shotSize: "近景",
    cameraMove: "缓慢推进",
    durationSec: 3.5,
    action: "血角兽抬头冲向镜头",
    dialogue: "",
    visualPrompt: "低机位，红色天光",
  });
});
~~~

- [ ] **Step 2: Run the service test and confirm it fails**

~~~powershell
node --test server/tests/dramaShotBlockingAutoPlanService.test.js
~~~

Expected: context.shot is absent while the existing auto-plan assertions remain green.

- [ ] **Step 3: Implement one server-owned shot summary mapper**

Add a typed shot property to DramaShotBlockingSketchEditorContext and return this summary from every existing getEditorContext project-type branch:

~~~ts
shot: {
  order: shot.order,
  location: shot.location ?? "",
  shotSize: shot.shotSize ?? "",
  cameraMove: shot.cameraMove ?? "",
  durationSec: shot.durationSec ?? null,
  action: shot.action ?? "",
  dialogue: shot.dialogue ?? "",
  visualPrompt: shot.visualPrompt ?? "",
},
~~~

The summary is read-only presentation data. Keep the existing auto-plan prompt input and database shape unchanged.

- [ ] **Step 4: Update the client type and rerun the service test**

Add the matching shot type in client/src/api/media/drama.ts, then run Step 2. Expected: PASS.

- [ ] **Step 5: Commit the context unit**

~~~powershell
git add client/src/api/media/drama.ts server/src/services/drama/visual/DramaShotBlockingSketchService.ts server/tests/dramaShotBlockingAutoPlanService.test.js
git commit -s -m "feat: expose shot summary in blocking editor"
~~~

### Task 3: Make the editor the only AI blocking entry

**Files:**
- Modify: client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx
- Modify: client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx
- Test: client/tests/shotVoiceBlockingSketchEntry.test.js
- Test: client/tests/dramaBlocking3dPage.contract.test.js

- [ ] **Step 1: Write failing source-contract assertions**

Replace the list test that expects AI摆位 with:

~~~js
test("分镜列表只提供编辑 3D 草图入口，AI 构图由编辑器承接", () => {
  assert.match(source, /blocking-3d\?order=/);
  assert.match(source, /编辑3D/);
  assert.doesNotMatch(source, /AI摆位/);
  assert.doesNotMatch(source, /autoPlan=1/);
});
~~~

Replace the old automatic-query test in dramaBlocking3dPage.contract.test.js with:

~~~js
test("打开编辑器不会因缺少布局或查询参数自动调用 AI", () => {
  assert.doesNotMatch(pageSource, /searchParams\.get\("autoPlan"\)/);
  assert.doesNotMatch(pageSource, /autoPlanRequested/);
  assert.doesNotMatch(pageSource, /shouldAutoPlan/);
});

test("编辑器按钮调用自动构图并把镜头设计说明留在未保存状态", () => {
  assert.match(pageSource, /autoPlanDramaShotBlockingSketch/);
  assert.match(pageSource, /viewer\.loadLayout\(result\.data\.layout\)/);
  assert.match(pageSource, /compositionNote/);
  assert.match(pageSource, /AI 构图完成，有未保存修改/);
  assert.doesNotMatch(pageSource, /autoPlan=1/);
});
~~~

- [ ] **Step 2: Run the client contracts and confirm the intended failure**

~~~powershell
node --test client/tests/dramaBlocking3dPage.contract.test.js client/tests/shotVoiceBlockingSketchEntry.test.js
~~~

Expected: the new assertions fail because production source still contains the list button and automatic opening effect.

- [ ] **Step 3: Remove only the list-level AI action**

Delete the AiButton whose handler navigates to blocking-3d?order=...&autoPlan=1 in ShotVoiceListPanel.tsx. Keep the neighboring 编辑3D button, the keyframe 生成AI图/重新生图 button and the AiButton import.

- [ ] **Step 4: Remove automatic opening behavior from the editor**

In DramaBlocking3DPage.tsx, keep the query parameter used for order, but remove autoPlanRequested, autoPlanMode, autoPlanKeyRef and the effect that calls handleAutoPlan when the page opens. Keep handleAutoPlan as the header AiButton click handler with its existing API call, viewer.loadLayout, selection sync, dirty state, success toast and error toast.

- [ ] **Step 5: Add explicit note state and pass it to the existing save payload**

Initialize from the loaded context and update only after a successful AI response:

~~~tsx
const [compositionNote, setCompositionNote] = useState("");

useEffect(() => {
  setCompositionNote(context?.sketch?.compositionNote ?? "");
}, [context?.sketch?.compositionNote]);
~~~

After viewer.loadLayout(result.data.layout), set compositionNote to result.data.compositionNote ?? "". Extend buildSketchData with a currentCompositionNote argument and include this trimmed optional field in the existing returned object:

~~~tsx
...(currentCompositionNote.trim()
  ? { compositionNote: currentCompositionNote.trim() }
  : {}),
~~~

Do not set the note in the error path and do not change the existing JSON, PNG and confirm ordering.

- [ ] **Step 6: Rerun the client contracts**

Run the command from Step 2. Expected: PASS, including the existing unsaved-state and leave-lock assertions.

- [ ] **Step 7: Commit the editor-entry unit**

~~~powershell
git add client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx client/tests/dramaBlocking3dPage.contract.test.js client/tests/shotVoiceBlockingSketchEntry.test.js
git commit -s -m "feat: move drama ai blocking into editor"
~~~

### Task 4: Add the current-shot preview and mirror the design note in the editor UI

**Files:**
- Modify: client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx
- Modify: client/tests/dramaBlocking3dPage.contract.test.js

- [ ] **Step 1: Write the failing UI contract**

Add:

~~~js
test("编辑器显示当前镜头与 AI 镜头设计面板", () => {
  assert.match(pageSource, /<Card/);
  assert.match(pageSource, /镜头设计/);
  assert.match(pageSource, /景别/);
  assert.match(pageSource, /运镜/);
  assert.match(pageSource, /时长/);
  assert.match(pageSource, /AI 构图说明/);
  assert.match(pageSource, /镜头预览/);
  assert.match(pageSource, /context\.shot\.action/);
});
~~~

- [ ] **Step 2: Run the test and confirm it fails**

~~~powershell
node --test client/tests/dramaBlocking3dPage.contract.test.js
~~~

Expected: the new panel assertions fail because the current editor has no 镜头设计 or 镜头预览 section.

- [ ] **Step 3: Implement the panel with existing design-system primitives**

Place a Card in the right-side editor content before actor/scene controls. Render the current shot and note with existing CardHeader, CardTitle, CardContent, Badge and typography tokens:

~~~tsx
<Card>
  <CardHeader>
    <CardTitle>镜头设计</CardTitle>
    <Badge>镜头预览</Badge>
  </CardHeader>
  <CardContent>
    <div>景别：{context.shot.shotSize || "未设置"}</div>
    <div>运镜：{context.shot.cameraMove || "未设置"}</div>
    <div>时长：{context.shot.durationSec == null ? "未设置" : "已设置"}</div>
    <div>动作：{context.shot.action || "未设置"}</div>
    {context.shot.dialogue ? <div>对白：{context.shot.dialogue}</div> : null}
    <div>AI 构图说明</div>
    <p>{compositionNote || "点击顶部「AI 自动构图」生成本镜设计。"}</p>
  </CardContent>
</Card>
~~~

Keep the header AI button as the only AI action. Keep the canvas aria-label="3D 草图视口" and aria-busy={saving || autoPlanning}. Add the visible 镜头预览 badge near the canvas so the camera result is explicit. Do not add new colors or an explanatory paragraph.

- [ ] **Step 4: Run focused UI tests and typecheck**

~~~powershell
node --test client/tests/dramaBlocking3dPage.contract.test.js
pnpm --filter @ai-novel/client typecheck
~~~

Expected: both commands exit with code 0.

- [ ] **Step 5: Commit the preview-panel unit**

~~~powershell
git add client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx client/tests/dramaBlocking3dPage.contract.test.js
git commit -s -m "feat: show drama shot design in blocking editor"
~~~

### Task 5: Update durable workflow documentation and release surfaces

**Files:**
- Modify: docs/wiki/workflows/drama-blocking-3d.md
- Modify: docs/releases/release-notes.md
- Modify: README.md

- [ ] **Step 1: Document the stable workflow rule**

Add this subsection under the existing 3D blocking rules:

~~~markdown
### 编辑器内 AI 构图

- AI 摆位的唯一入口是每一镜的「编辑3D」页面；分镜列表不再直接发起 AI 摆位请求。
- 打开编辑器只恢复已有布局。用户点击「AI 自动构图」后，模型返回的角色、相机和景深布局立即进入当前镜头预览，但在用户检查前只属于未保存编辑状态。
- AI 返回的 compositionNote 与镜头景别、运镜、时长、动作和对白在编辑器的「镜头设计」面板中展示，并随草图 JSON 保存；保存仍需同时完成 PNG 上传和确认。
- AI 请求失败时保留当前布局和已有说明，不离开编辑器，不写入半成品。
~~~

- [ ] **Step 2: Update user-visible release surfaces**

Inspect git status --short and git diff before editing. Under the existing 2026-08-26 heading in docs/releases/release-notes.md, add one user-facing bullet explaining that AI 构图 is now launched inside 编辑3D, immediately previews the current shot, and shows its camera design. Refresh README.md’s 最新更新 so it contains only the current date block and the existing full-history link.

- [ ] **Step 3: Verify documentation formatting and commit**

~~~powershell
git diff --check
~~~

Then stage the three documentation files and create the signed commit:

~~~powershell
git add docs/wiki/workflows/drama-blocking-3d.md docs/releases/release-notes.md README.md
git commit -s -m "docs: document editor-owned drama ai blocking"
~~~

Expected: git diff --check has no output and the signed commit succeeds.

### Task 6: Verify, integrate, browser-test, and clean up

**Files:**
- Verify: client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx
- Verify: server/src/services/drama/visual/DramaShotBlockingSketchService.ts
- Verify: docs/wiki/workflows/drama-blocking-3d.md

- [ ] **Step 1: Run all directly affected tests**

~~~powershell
node --test client/tests/dramaBlocking3dPage.contract.test.js client/tests/shotVoiceBlockingSketchEntry.test.js client/tests/dramaShotBlockingSketchApi.test.js
~~~

~~~powershell
node --test server/tests/dramaShotBlockingSketchContracts.test.mjs server/tests/dramaShotBlockingSketchRoutes.test.js server/tests/dramaShotBlockingAutoPlanPrompt.test.js server/tests/dramaShotBlockingAutoPlanService.test.js
~~~

Expected: all tests pass.

- [ ] **Step 2: Run client and server checks**

~~~powershell
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
pnpm --filter @ai-novel/server typecheck
pnpm --filter @ai-novel/server build
~~~

Expected: all commands exit with code 0.

- [ ] **Step 3: Inspect the branch scope**

~~~powershell
git diff main...HEAD --stat
~~~

~~~powershell
git diff --check main...HEAD
~~~

~~~powershell
git status --short --branch
~~~

Expected: only this feature’s design, code, tests, wiki, release note and README changes are present; the worktree is clean after commits.

- [ ] **Step 4: Integrate and push from the clean main workspace**

~~~powershell
pnpm workflow:integrate codex/drama-ai-blocking-editor --push --verify "pnpm --filter @ai-novel/client typecheck"
~~~

Afterward run each check separately:

~~~powershell
git status --short --branch
~~~

~~~powershell
git rev-parse main
~~~

~~~powershell
git rev-parse origin/main
~~~

~~~powershell
git worktree list --porcelain
~~~

Expected: main is clean, local main equals origin/main, and the feature worktree is removed only after successful integration. Do not change ports or touch other active worktrees.

- [ ] **Step 5: Run browser regression on the fixed local services**

Use the existing in-app browser at http://localhost:5174 and API at http://localhost:3100:

1. Open a shot’s 编辑3D page and confirm 镜头设计 and 镜头预览 are visible.
2. Reload without clicking AI and confirm the page does not show AI 构图中 and does not replace an existing layout.
3. Click the single editor AI 自动构图 button and confirm the canvas camera/actors update, the composition note appears, and the page remains unsaved until returning.
4. Visit the shot list and confirm there is no second AI摆位 button.
5. Check browser console errors and the API response; if the configured model provider is unavailable, report that limitation separately from passing code checks.

- [ ] **Step 6: Remove the isolated worktree after successful delivery**

Confirm the branch is merged, remove only D:\Github\AI-Novel-Writing-Assistant-drama-ai-blocking-editor, delete the spent local branch through the project workflow, run git worktree prune, and re-check main status before reporting completion.
