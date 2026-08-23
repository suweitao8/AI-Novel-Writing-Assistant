# 脚本场景与角色状态连续分组 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让脚本中的场景行与其下方角色状态面板在视觉上成为同一个连续分组。

**Architecture:** 保持 `ScriptItem`、状态标记写入和自动保存不变，只在 `ScriptTab` 的场景渲染分支增加统一容器。场景行去掉自己的卡片背景，角色状态面板改为同一容器内的透明下半段，并用顶部细线分隔。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、Node.js 内置测试。

---

### Task 1: 锁定场景组连续渲染契约

**Files:**
- Create: `client/tests/scriptSceneStateGroupingContracts.test.js`
- Read: `client/src/pages/drama/comicDrama/components/ScriptTab.tsx`

- [ ] **Step 1: 写失败测试**

新增源代码契约测试，要求场景渲染分支存在统一的 `overflow-hidden rounded-xl border ... bg-emerald-500/10` 容器，并要求角色状态面板使用 `border-t ... bg-transparent`，同时禁止旧的 `mt-1 rounded-xl border-border/60 bg-muted/20` 独立卡片样式。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/scriptSceneStateGroupingContracts.test.js`

Expected: FAIL，因为当前场景行和角色状态面板仍分别渲染为两个卡片。

### Task 2: 实现场景与角色状态连续分组

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/ScriptTab.tsx:390-435`
- Modify: `client/src/pages/drama/comicDrama/components/ScriptTab.tsx:703-772`

- [ ] **Step 1: 增加统一场景组容器**

在 `visibleItems.map` 的场景分支中，用一个 `overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10` 的 `div` 包住 `SceneRow` 与 `SceneStatePanel`，保持两者的 props 和状态切换回调不变。

- [ ] **Step 2: 收敛子行样式**

将 `SceneRow` 根节点保留 `group flex ... px-3 py-2` 布局，移除它自己的 `rounded-xl bg-emerald-500/10`；将 `SceneStatePanel` 根节点改为透明背景、无独立圆角，并增加 `border-t border-emerald-500/20`，保留原有三列/窄屏单列布局。

- [ ] **Step 3: 运行契约测试确认通过**

Run: `node --test tests/scriptSceneStateGroupingContracts.test.js`

Expected: PASS，且状态下拉仍由 `SelectControl` 提供原有键盘选择行为。

### Task 3: 回归验证与交付

**Files:**
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `client/tests/scriptSceneStateGroupingContracts.test.js`

- [ ] **Step 1: 更新用户可见产品说明**

在 2026-08-23 日期块补充一条面向用户的说明：脚本场景和角色状态现在以连续分组显示，便于识别状态归属。

- [ ] **Step 2: 运行验证**

Run: `node --test tests/scriptSceneStateGroupingContracts.test.js tests/scriptNarrationContracts.test.js tests/scriptTabHookOrder.test.js`

Run: `pnpm --filter @ai-novel/client typecheck`

Run: `pnpm --filter @ai-novel/client build`

Run: `git diff --check`

Expected: 相关测试全部通过，客户端类型检查和构建退出码为 0，差异检查无输出。

- [ ] **Step 3: 提交实现**

使用 `git add` 只暂存本计划涉及的文件，运行 `git commit -s -m "fix(drama): connect scene and character state rows"`，提交前确认没有暂存数据库、依赖或构建产物。
