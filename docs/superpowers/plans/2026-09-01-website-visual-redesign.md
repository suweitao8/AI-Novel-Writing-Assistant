# Website Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AI 小说/漫剧工作台统一为参考 `D:\Github\mydrama` 的暗色创作工作台视觉，同时保留当前路由、业务流程、主题切换和专用 3D/视频画布行为。

**Architecture:** 先扩展当前语义 token 和共享 UI 原语，再改造 AppLayout、TopNav、Sidebar、MobileSiteShell。页面层只做必要的容器和层级标记，依靠共享组件和 token 覆盖首页、漫剧、小说、资产库和设置等入口，避免复制旧项目的业务结构。

**Tech Stack:** React 19、Vite、Tailwind CSS、CSS 变量、现有 shadcn/ui 原语、lucide-react、Node `node:test` 契约测试、Codex 内置浏览器。

---

## 文件边界

- Create: `client/src/components/layout/visualSystem.contract.test.mjs`，验证 token、壳层标记和基础组件的关键视觉契约。
- Modify: `client/src/index.css`，扩展 ink/paper/night 的 surface、control、shadow、motion token 与工作台工具类；保留现有 3D/移动端专用规则。
- Modify: `client/src/components/ui/card.tsx`，统一面板、标题和内容 padding。
- Modify: `client/src/components/ui/button.tsx`，统一控件圆角、按压和 hover/focus 状态。
- Modify: `client/src/components/ui/input.tsx`，统一字段材质、边界和焦点反馈。
- Modify: `client/src/components/ui/badge.tsx`，统一紧凑状态标签形状和字重。
- Modify: `client/src/components/ui/select.tsx`、`client/src/components/common/SelectControl.tsx`、`client/src/components/ui/tabs.tsx`，统一选择器和页签的工作台外观。
- Modify: `client/src/components/ui/dialog.tsx`、`client/src/components/ui/toast.tsx`，统一浮层表面和状态反馈。
- Modify: `client/src/components/layout/AppLayout.tsx`，添加工作台壳层标记、内容滚动边界和页面容器类。
- Modify: `client/src/components/layout/TopNav.tsx`，改为紧凑半透明顶栏、稳定的入口层级和胶囊页签。
- Modify: `client/src/components/layout/Sidebar.tsx`，改为独立导航表面、清晰分组和活动指示。
- Modify: `client/src/components/layout/mobile/MobileSiteShell.tsx`，使移动顶栏、更多面板和底部导航复用同一材质。
- Modify: `client/src/pages/Home.tsx`、`client/src/pages/drama/DramaProjectPage.tsx`、`client/src/pages/drama/comicDrama/ComicDramaListPage.tsx`、`client/src/pages/novels/NovelList.tsx`、`client/src/pages/novels/NovelCreate.tsx`、`client/src/pages/settings/views/SettingsOverviewPage.tsx`，仅补充工作台页面语义类和修正明显的顶层间距/标题层级。
- Modify: `README.md`、`docs/releases/release-notes.md`，记录用户可见的全站视觉统一。
- Modify: `docs/wiki/product/model-library.md` 或新增 `docs/wiki/architecture/visual-system.md`，记录 token 和壳层维护边界。

## Task 1: 建立可验证的视觉契约

**Files:**
- Create: `client/src/components/layout/visualSystem.contract.test.mjs`

- [ ] **Step 1: Write the failing contract tests**

测试读取真实源码，先声明这次重设计必须存在的稳定边界：工作台 token、壳层标记、基础组件使用语义类、页面不再使用旧的自动主题 debounce 或硬编码全局背景。测试不验证具体像素，避免把视觉调整锁死。

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

test("工作台 token 覆盖 surface、control、shadow 与 motion", () => {
  const css = read("index.css");
  for (const token of [
    "--surface-panel",
    "--surface-subtle",
    "--control-hover",
    "--shadow-panel",
    "--duration-base",
    "--ease-out-quint",
  ]) {
    assert.match(css, new RegExp(`${token}\\s*:`));
  }
  assert.match(css, /\.studio-shell/);
  assert.match(css, /prefers-reduced-motion/);
});

test("共享壳层和基础组件使用工作台语义边界", () => {
  assert.match(read("components/layout/AppLayout.tsx"), /studio-shell/);
  assert.match(read("components/layout/TopNav.tsx"), /studio-top-nav/);
  assert.match(read("components/layout/Sidebar.tsx"), /studio-sidebar/);
  assert.match(read("components/ui/card.tsx"), /studio-card/);
  assert.match(read("components/ui/button.tsx"), /studio-button/);
});

test("基础组件不回退到硬编码白色或 slate 背景", () => {
  for (const relativePath of [
    "components/ui/card.tsx",
    "components/ui/button.tsx",
    "components/ui/input.tsx",
    "components/ui/badge.tsx",
  ]) {
    const source = read(relativePath);
    assert.doesNotMatch(source, /bg-white|text-black|bg-slate-/);
  }
});
```

- [ ] **Step 2: Run the contract tests and confirm the expected red state**

Run: `node --test client/src/components/layout/visualSystem.contract.test.mjs`

Expected: FAIL because the new token names and `studio-*` semantic markers do not exist yet.

- [ ] **Step 3: Commit the red test only**

```bash
git add client/src/components/layout/visualSystem.contract.test.mjs
git commit -s -m "test: define visual system contracts"
```

## Task 2: Implement the semantic visual system

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Add the token layer before changing component classes**

在现有 `:root`、`:root[data-theme="paper"]`、`:root[data-theme="night"]`、`.dark` 和 `.dark[data-theme="paper"]`/`.dark[data-theme="night"]` 中补齐下列语义变量，所有主题都定义完整值：

```css
  --surface-panel: hsl(var(--card));
  --surface-subtle: hsl(var(--muted) / 0.42);
  --surface-raised: hsl(var(--card) / 0.92);
  --control-hover: hsl(var(--accent));
  --control-active: hsl(var(--primary) / 0.16);
  --focus-ring: hsl(var(--ring) / 0.42);
  --shadow-panel: 0 18px 50px hsl(var(--foreground) / 0.12), 0 1px 0 hsl(var(--foreground) / 0.04) inset;
  --shadow-floating: 0 24px 70px hsl(var(--foreground) / 0.22), 0 1px 0 hsl(var(--foreground) / 0.06) inset;
  --radius-panel: 1rem;
  --radius-control: 0.625rem;
  --radius-pill: 9999px;
  --duration-fast: 150ms;
  --duration-base: 220ms;
  --duration-slow: 320ms;
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
```

暗色 ink 值使用冷墨色和低对比度 panel；paper/night 只改变 hue/lightness，不改变 token 名称。不能把这些变量写成新的产品色板。

- [ ] **Step 2: Add scoped shell and surface utilities**

在 `@layer utilities` 中添加 `.studio-shell`、`.studio-top-nav`、`.studio-sidebar`、`.studio-main`、`.studio-card`、`.studio-control`、`.studio-pill` 工具类。它们只消费语义 token，并为透明度不支持的浏览器提供不透明 `background` fallback。加入 `prefers-reduced-motion: reduce`，关闭这些工具类的 transition。

- [ ] **Step 3: Run the contract tests and CSS syntax/type checks**

Run: `node --test client/src/components/layout/visualSystem.contract.test.mjs`

Expected: FAIL only on the component marker assertions, proving token tests are now green before React component work begins.

## Task 3: Restyle shared primitives

**Files:**
- Modify: `client/src/components/ui/card.tsx`
- Modify: `client/src/components/ui/button.tsx`
- Modify: `client/src/components/ui/input.tsx`
- Modify: `client/src/components/ui/badge.tsx`
- Modify: `client/src/components/ui/select.tsx`
- Modify: `client/src/components/common/SelectControl.tsx`
- Modify: `client/src/components/ui/tabs.tsx`
- Modify: `client/src/components/ui/dialog.tsx`
- Modify: `client/src/components/ui/toast.tsx`

- [ ] **Step 1: Update Card defaults to the panel hierarchy**

`Card` 默认类改为 `studio-card rounded-[var(--radius-panel)] border border-border/70 bg-[var(--surface-panel)] text-card-foreground shadow-[var(--shadow-panel)]`，Header/Content/Footer 使用 1rem 到 1.25rem 的 8px 基线 padding；保留调用方的 `className` 覆盖能力，使用 `cn()` 合并。

- [ ] **Step 2: Update controls without changing props or behavior**

`Button` 的基础类加入 `studio-button rounded-[var(--radius-control)] transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-out-quint)] active:scale-[0.985]`；outline/ghost/secondary 只引用语义 token。`Input`、`SelectControl` 和 Radix Select 统一高度、panel field background、placeholder、focus ring 和禁用态。`Badge` 默认紧凑全圆角，保留 variant 的语义颜色。

- [ ] **Step 3: Update tabs, dialog and toast surfaces**

Tabs active state 使用 `bg-[var(--control-active)] text-primary`，Dialog/Toast 使用 `surface-raised`、`shadow-floating` 和统一边框。不得改变组件的可访问性属性、事件回调、portal 行为或关闭逻辑。

- [ ] **Step 4: Run the contract test and existing primitive tests**

Run: `node --test client/src/components/layout/visualSystem.contract.test.mjs client/src/components/ui/*.test.mjs`

Expected: all collected tests pass; if the glob has no matches, the command still must report the contract tests as passing.

## Task 4: Restyle desktop and mobile shells

**Files:**
- Modify: `client/src/components/layout/AppLayout.tsx`
- Modify: `client/src/components/layout/TopNav.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/components/layout/mobile/MobileSiteShell.tsx`

- [ ] **Step 1: Add stable semantic shell markers**

`AppLayout` 的桌面根容器添加 `studio-shell`，主内容添加 `studio-main`；不要改变 `Outlet`、`TaskRecoveryProvider`、`LLMSelectionBootstrap`、`PageTabsProvider` 或 workspace rail 的分支条件。

- [ ] **Step 2: Apply the old project’s navigation rhythm**

`TopNav` 保持当前链接和页签数据，使用约 48 到 56px 的紧凑高度、半透明 panel、低对比边框和单行布局；页面页签仍位于 header 中央，操作槽位仍在右侧。`Sidebar` 保持所有分组和 badge 查询，使用独立 surface、约 15rem 到 16rem 宽度、分组标题和单一活动条。不要删除任何入口。

- [ ] **Step 3: Align mobile shell material and safe areas**

移动顶栏、更多入口面板、底部导航和主体都使用 `.studio-*` token；保留 `safe-area-inset-bottom`、更多入口开关、页面标题和导航状态。窄屏内容继续使用 `mobile-site-main` 的滚动和折叠规则。

- [ ] **Step 4: Run shell contract tests**

Run: `node --test client/src/components/layout/visualSystem.contract.test.mjs client/src/components/layout/startupHealth.test.mjs client/src/components/layout/novelWorkspaceRailState.test.mjs`

Expected: all tests pass.

## Task 5: Tune representative page surfaces

**Files:**
- Modify: `client/src/pages/Home.tsx`
- Modify: `client/src/pages/drama/DramaProjectPage.tsx`
- Modify: `client/src/pages/drama/comicDrama/ComicDramaListPage.tsx`
- Modify: `client/src/pages/novels/NovelList.tsx`
- Modify: `client/src/pages/novels/NovelCreate.tsx`
- Modify: `client/src/pages/settings/views/SettingsOverviewPage.tsx`

- [ ] **Step 1: Add page-level semantic class at each root**

每个页面根节点添加 `studio-page` 和已有 route/data 标记；不改变数据查询、mutation、表单字段、路由和用户文案。

- [ ] **Step 2: Reduce hierarchy noise and normalize top spacing**

把最外层页面容器的标题/操作区改成统一的左对齐 header；重复的外层 border/card 只保留有层级意义的一层；统计卡片、状态条和空状态使用基础 Card/Badge；不在 3D、视频、Canvas 或编辑器内部套用 `studio-card`。

- [ ] **Step 3: Keep asset libraries and workspace pages compatible**

模型库和动画库保留已实现的分类、搜索、分页和卡片信息；小说编辑、漫剧分镜、世界和资产页只消费新的 token，不改生成、保存、预览和任务逻辑。

- [ ] **Step 4: Add page-level source contracts for preserved IA**

在 `visualSystem.contract.test.mjs` 中断言 `/drama`、`/models`、`/animations`、`/novels`、`/settings` 的入口标签或 data 标记仍存在，防止视觉重构误删导航和主要操作。

## Task 6: Self-test and visual regression

**Files:**
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`
- Modify: `docs/wiki/architecture/visual-system.md`

- [ ] **Step 1: Run focused tests and typecheck**

Run: `node --test client/src/components/layout/visualSystem.contract.test.mjs client/src/components/layout/startupHealth.test.mjs client/src/components/layout/novelWorkspaceRailState.test.mjs`

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: all tests and typecheck exit 0.

- [ ] **Step 2: Run the production build**

Run: `pnpm --filter @ai-novel/client build`

Expected: Vite prints `✓ built` and exits 0; existing bundle-size or Browserslist notices may remain warnings.

- [ ] **Step 3: Run the built-in browser smoke test**

Against `http://127.0.0.1:5174`, visit `/`、`/drama`、`/models`、`/animations`、`/novels`、`/settings` and one novel edit route. Capture desktop screenshots at the top of the page and 390px screenshots for `/`、`/models` and `/settings`. Click top navigation, one sidebar entry, one model/animation filter, one button, and one dialog trigger. Verify no horizontal overflow, no dead link, no new console error, and correct scrolling.

- [ ] **Step 4: Document the stable rule**

更新发布记录为用户可见描述；新增 wiki 说明 token、壳层和 3D/视频专用表面的边界。纯内部契约测试不单独写 release note。

- [ ] **Step 5: Commit the coherent visual redesign**

```bash
git add client/src/index.css client/src/components client/src/pages/Home.tsx client/src/pages/drama client/src/pages/novels client/src/pages/settings/views/SettingsOverviewPage.tsx docs/releases/release-notes.md README.md docs/wiki/architecture/visual-system.md
git commit -s -m "refactor: unify website visual system"
```

## Task 7: Final integration

- [ ] **Step 1: Confirm the feature worktree is clean and only contains this redesign**

Run: `git status --short --branch` and `git diff main...HEAD --stat`.

Expected: clean feature worktree; diff contains only the design document, implementation, focused tests and user-facing documentation.

- [ ] **Step 2: Request code review and resolve findings**

Review the diff against `docs/superpowers/specs/2026-09-01-website-visual-redesign-design.md`. Check that no route, field name, query, generated-media path, or specialized canvas style was changed accidentally.

- [ ] **Step 3: Integrate with the repository gate**

From the clean `main` workspace run:

```bash
pnpm workflow:integrate codex/website-visual-redesign --push --verify "pnpm --filter @ai-novel/client typecheck"
```

- [ ] **Step 4: Verify the final remote state and clean the worktree**

Run `git status --short --branch`, compare `git rev-parse HEAD` with `git ls-remote origin refs/heads/main`, then run `pnpm workflow:cleanup codex/website-visual-redesign` and `git worktree prune`.
