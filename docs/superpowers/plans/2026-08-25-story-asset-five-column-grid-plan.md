# 故事资产五列卡片布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将角色、场景、道具资产页签改为桌面端五列的图片-名称-状态卡片，同时保持大纲侧栏的 compact 横向卡片。

**Architecture:** 三类资产页签只调整各自的展示栅格；共享 `StoryAssetCard` 根据既有 `compact` 属性分成资产页竖向主卡片与大纲侧栏横向紧凑卡片。展示模型、图片裁切和编辑/删除业务不变，状态信息继续从默认状态和图片状态读取。

**Tech Stack:** React 19、Tailwind CSS、现有 `StoryAssetCard`/`StoryAssetPreview`、Node test、TypeScript、Vite。

---

### Task 1: 锁定五列栅格和卡片信息层级

**Files:**
- Create: `client/tests/storyAssetGridContracts.test.js`
- Modify: `client/tests/storyAssetPreviewContracts.test.js` only if shared preview assertions need a new stable class contract

- [ ] **Step 1: Write the failing test**

  读取 `StoryAssetCard.tsx` 与三个 `Settings*Tab.tsx`，断言资产页存在 `xl:grid-cols-5`，非 compact 卡片使用全宽方形预览、名称和状态数量，且不在主卡片路径渲染摘要；断言 compact 路径仍保留摘要。

- [ ] **Step 2: Run the focused contract test and verify it fails**

  Run:

  ```powershell
  pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/storyAssetGridContracts.test.js
  ```

  Expected: FAIL because the current asset tabs still contain `md:grid-cols-2` and `StoryAssetCard` is a single horizontal summary card.

### Task 2: Implement the asset-page card and responsive grid

**Files:**
- Modify: `client/src/components/storyAssets/StoryAssetCard.tsx`
- Modify: `client/src/pages/novels/components/storySettings/SettingsCharactersTab.tsx`
- Modify: `client/src/pages/novels/components/storySettings/SettingsScenesTab.tsx`
- Modify: `client/src/pages/novels/components/storySettings/SettingsPropsTab.tsx`
- Modify: `client/src/components/storyAssets/README.md`

- [ ] **Step 1: Add the vertical non-compact card path**

  Keep `compact` as the explicit sidebar variant. In the default path, render the square `StoryAssetPreview` above a full-width main button, truncate only the name, and show the default state label/count plus generating/error feedback. Do not render the verbose summary or attribute badges in this path. Keep actions outside the main button and position them as a small auxiliary group on the card edge.

- [ ] **Step 2: Change the three settings grids**

  Replace `grid-cols-1 gap-3 md:grid-cols-2` with the responsive sequence `grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` in characters, scenes, and props tabs.

- [ ] **Step 3: Update the component boundary note**

  Document that the settings asset grid uses the vertical five-column card and the outline sidebar uses `compact` horizontal cards.

- [ ] **Step 4: Run the focused contract test and verify it passes**

  Run the command from Task 1 and expect all assertions to pass.

### Task 3: Regression verification and delivery

**Files:**
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `docs/wiki/architecture/story-settings-hub.md`

- [ ] **Step 1: Run focused asset tests**

  ```powershell
  pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/storyAssetGridContracts.test.js tests/storyAssetPreviewContracts.test.js tests/storyAssetPresentation.test.mjs
  ```

- [ ] **Step 2: Run client typecheck and production build**

  ```powershell
  pnpm --filter @ai-novel/client typecheck
  pnpm --filter @ai-novel/client build
  ```

- [ ] **Step 3: Verify the real asset page**

  In the 5174 workbench, open the asset tab at the desktop viewport and confirm the role, scene and prop grids each use five columns when enough assets exist; verify square previews, visible names/statuses, preserved delete controls, and that clicking a card opens the existing edit dialog.

- [ ] **Step 4: Update user-facing release surfaces**

  Add one current-date release note describing the five-column asset shelf and the focused image/name/status presentation; refresh the README latest update block without exposing implementation details.

  In `docs/wiki/architecture/story-settings-hub.md`, record the durable boundary that the settings asset shelf is a five-column vertical comparison surface while the outline sidebar remains a `compact` horizontal card surface.

- [ ] **Step 5: Commit and integrate**

  Commit the coherent change with `git commit -s`, then use `pnpm workflow:integrate codex/asset-grid-five-columns --push --verify "pnpm --filter @ai-novel/client typecheck"` from a clean main workspace.
