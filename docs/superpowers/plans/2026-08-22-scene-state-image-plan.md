# 场景状态图片统一实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让设定中心和大纲详情中的场景图片完全以状态图为准，并让首帧参考链不再把旧 360° 全景图当作场景主图。

**Architecture:** 保留旧 `NovelScene.imageData` 及兼容接口，产品展示和首帧引用改由 `statesJson` 的初始状态图片驱动。前端移除场景独立全景区块，复用现有的 `AssetStatesEditor`；服务端只收紧场景参考图选择，不改数据库结构。

**Tech Stack:** React 19、TypeScript、Tailwind token、Node test runner、Prisma-backed server services。

---

### Task 1: 固化场景编辑器的图片契约

**Files:**
- Create: `client/tests/sceneStateImageContracts.test.js`
- Modify: `client/src/pages/novels/components/storySettings/SettingsScenesTab.tsx`

- [ ] **Step 1: Write the failing test**

  断言场景设置页不再导入或调用独立场景图片生成接口、不再出现独立全景标题，同时保留 `AssetStatesEditor` 的 `kind="scene"` 入口。

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `pnpm --filter @ai-novel/client exec node --test tests/sceneStateImageContracts.test.js`

  Expected: FAIL because `SettingsScenesTab.tsx` still contains `generateStorySceneImage` and `360° 全景参考图`.

- [ ] **Step 3: Implement the minimal UI change**

  删除场景页的 `generateStorySceneImage` 导入、`imageMutation` 和独立全景区块；保留场景基础字段和 `AssetStatesEditor states={states} kind="scene"`。

- [ ] **Step 4: Run the focused test and verify it passes**

  Run: `pnpm --filter @ai-novel/client exec node --test tests/sceneStateImageContracts.test.js`

  Expected: PASS。

- [ ] **Step 5: Commit**

  `git add client/tests/sceneStateImageContracts.test.js client/src/pages/novels/components/storySettings/SettingsScenesTab.tsx && git commit -s -m "fix: show scene images by state"`

### Task 2: 移除大纲详情中的场景全景主图

**Files:**
- Modify: `client/tests/sceneStateImageContracts.test.js`
- Modify: `client/src/pages/drama/comicDrama/components/OutlineSettingsAside.tsx`

- [ ] **Step 1: Extend the failing test**

  断言场景详情分支不再读取 `scene.image?.url` 或渲染“全景图”，而是继续通过 `DetailStates states={scene.states}` 展示状态图片。

- [ ] **Step 2: Run the test and verify it fails**

  Run: `pnpm --filter @ai-novel/client exec node --test tests/sceneStateImageContracts.test.js`

  Expected: FAIL because大纲详情仍渲染 `scene.image`。

- [ ] **Step 3: Implement the minimal change**

  删除场景详情中的 `scene.image` `<img>`，保留场景类型/时间/天气、环境提示词和 `DetailStates`。

- [ ] **Step 4: Run the test and verify it passes**

  Run: `pnpm --filter @ai-novel/client exec node --test tests/sceneStateImageContracts.test.js`

  Expected: PASS。

- [ ] **Step 5: Commit**

  `git add client/tests/sceneStateImageContracts.test.js client/src/pages/drama/comicDrama/components/OutlineSettingsAside.tsx && git commit -s -m "fix: use scene state images in outline details"`

### Task 3: 收紧首帧场景参考图来源

**Files:**
- Create: `server/tests/dramaSceneReferenceImage.test.js`
- Modify: `server/src/services/drama/visual/DramaShotKeyframeService.ts`

- [ ] **Step 1: Write the failing test**

  添加源代码契约测试，要求场景 `imageUrl` 来自 `initial.imageUrl`，并断言场景映射不再使用 `parseImageStateSummary(imageData)?.url` 回落。

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `node --test tests/dramaSceneReferenceImage.test.js`

  Expected: FAIL because当前映射仍有全景图回落表达式。

- [ ] **Step 3: Implement the minimal server change**

  在场景映射中删除 `parseImageStateSummary(imageData)?.url` 的回落，只保留 `initial.imageUrl`；同步更新 `SceneSettingLite` 注释，明确它代表初始状态图。

- [ ] **Step 4: Run the focused test and verify it passes**

  Run: `node --test tests/dramaSceneReferenceImage.test.js`

  Expected: PASS。

- [ ] **Step 5: Commit**

  `git add server/tests/dramaSceneReferenceImage.test.js server/src/services/drama/visual/DramaShotKeyframeService.ts && git commit -s -m "fix: source scene references from initial state"`

### Task 4: 回归验证与交付

**Files:**
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`
- Modify: `docs/wiki/architecture/` 下对应场景/设定资产边界文档（若已有对应文档）

- [ ] **Step 1: Run focused client and server tests**

  Run: `pnpm --filter @ai-novel/client exec node --test tests/sceneStateImageContracts.test.js`

  Run: `node --test tests/dramaSceneReferenceImage.test.js` from `server`。

- [ ] **Step 2: Run type checks**

  Run: `pnpm --filter @ai-novel/client typecheck`

  Run: `pnpm --filter @ai-novel/server typecheck`

- [ ] **Step 3: Run browser acceptance on port 5174**

  Open场景编辑器，确认没有独立“360° 全景参考图”区域；确认状态列表和右侧详情使用同一状态图片；确认大图预览入口仍可用。

- [ ] **Step 4: Update user-facing release notes**

  按 `readme-release-updater` 规则在当前日期合并一条用户视角说明，并刷新 README 的最新更新块；在 wiki 中记录场景状态图是正式图片来源、旧全景图仅兼容保留的长期边界。

- [ ] **Step 5: Commit, merge, push, and restart the app runtime**

  在功能分支提交所有验证后的改动，合并到主工作区的 `main`，运行 `git push origin main`，然后重启 5174 前端（API 若只读服务端逻辑则按实际需要重启）并重新做一次浏览器验收。
