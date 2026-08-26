# 资产状态编辑弹窗紧凑布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让角色、场景、道具的状态编辑弹窗统一采用“图片在上、状态资料在下”的紧凑双列布局。

**Architecture:** 继续复用 `assetForms.tsx` 中的 `AssetStatesEditor`，只调整共用 JSX 的顺序和 Tailwind 网格，不新增组件或数据字段。状态图片区保留参考图、3D 编辑和 AI 生图操作；状态资料区把状态名与时代风格作为第一行，其他短字段按两列排列，长文本占满整行。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、Node.js contract tests、Vite。

---

### Task 1: 锁定新的字段顺序和网格契约

**Files:**
- Modify: `client/tests/assetStatesEditorContracts.test.js`
- Modify: `client/tests/characterStateHeightInput.contract.test.js`

- [ ] **Step 1: 更新状态详情顺序断言**

把现有“状态设定早于图片”的断言改为图片先于状态资料，并把状态资料区域命名为 `状态资料`。

- [ ] **Step 2: 增加双列布局断言**

断言 `状态资料` 使用 `md:grid-cols-2`，包含“状态名”和“时代风格”，且场景字段不再使用 `grid-cols-3`。

- [ ] **Step 3: 运行定向测试确认红灯**

运行：

```bash
pnpm exec node --experimental-strip-types --test tests/assetStatesEditorContracts.test.js tests/sceneStateImageContracts.test.js tests/characterStateHeightInput.contract.test.js
```

预期：新顺序或新区域断言失败，证明测试确实能捕获当前布局。

### Task 2: 调整共用状态表单布局

**Files:**
- Modify: `client/src/pages/novels/components/storySettings/assetForms.tsx`

- [ ] **Step 1: 保持状态图片区为详情首个区域**

让 `aria-label="状态图片"` 的图片区先于所有状态资料字段，图片参考选择和图片操作继续紧跟预览图。

- [ ] **Step 2: 合并状态资料并设置双列网格**

将状态名、时代风格、角色年龄段/身高、身上状态、场景类型/时间/天气放进 `aria-label="状态资料"` 的 `md:grid-cols-2` 区域；状态名和时代风格作为前两个字段。场景的三个短字段使用两列子网格自然换行，图片提示词和改写行继续 `md:col-span-2`。

- [ ] **Step 3: 保留现有状态行为**

不改变受控值、校验、禁用条件、生成/取消、3D 编辑、提示词改写、保存接口和响应式图片比例。

### Task 3: 回归验证

**Files:**
- Test: `client/tests/assetStatesEditorContracts.test.js`
- Test: `client/tests/sceneStateImageContracts.test.js`
- Test: `client/tests/characterStateHeightInput.contract.test.js`

- [ ] **Step 1: 运行资产状态定向测试**

预期所有相关契约测试通过。

- [ ] **Step 2: 运行客户端类型检查和构建**

运行：

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm build
```

预期类型检查和 Vite 构建均成功。

### Task 4: 记录用户可见规则并交付

**Files:**
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`
- Wiki: 本次是共用表单的局部视觉排列调整，不引入新的模块边界或运行时规则，因此不新增 wiki 条目。

- [ ] **Step 1: 更新用户可见发布说明**

记录角色、场景、道具状态编辑统一为图片置顶、资料双列的布局变化，并同步 README 最新更新区。

- [ ] **Step 2: 浏览器验收三类入口**

在角色、场景、道具编辑弹窗分别确认图片位于上方、状态名与时代风格同一行、短字段两列排列，取消和保存按钮仍可见；检查控制台无新增错误。

- [ ] **Step 3: 提交、集成、推送和清理**

确认工作树只包含本任务改动后，使用签名提交；从干净 `main` 运行带验证的集成推送，最后核对 `HEAD == origin/main` 并删除已合并工作树。
