# 分镜资产语音列表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 将分镜卡片右侧信息整理为左标签、右内容的对齐列表，并统一资产标签与语音信息的展示方式。

**Architecture:** 保持 `ShotVoiceRow` 的图片、3D 编辑、生图和音频生成链路不变，只重构卡片信息区的投影组件。左侧使用固定宽度标签列和语义边框形成竖向对齐线，右侧按同一行顺序渲染分镜设计、资产、语音和配音；场景与角色继续从现有镜头字段读取，不新增后端字段。

**Tech Stack:** React 19、TypeScript、Tailwind CSS 语义 token、现有 `Badge`、`AiButton`、`AudioSegmentPlayer`、Node `node:test` 契约测试。

---

### Task 1: 更新分镜列表契约测试

**Files:**
- Modify: `client/tests/dramaShotDesignVisibility.test.js`
- Test target: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`

- [ ] **Step 1: 写出失败断言**

断言紧凑卡片使用固定标签列、`border-r` 竖向分隔线和四个标签 `分镜设计`、`资产`、`语音`、`配音`；断言不再渲染 `场景/角色` 或 `旁白/对白`。断言场景和角色都使用 `Badge`，且两类标签分别使用 `bg-primary/10` 与 `bg-secondary` 语义色。断言语音行显示 `audioSegmentLabel`、`emotion`，而配音行只保留 `AudioSegmentPlayer` 和生成按钮。

- [ ] **Step 2: 运行测试确认旧实现失败**

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/dramaShotDesignVisibility.test.js
```

预期：旧实现因仍使用 `场景/角色`、`旁白/对白`，且场景没有资产标签、语气不在语音行而失败。

### Task 2: 实现左标签轨道与右侧内容

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`

- [ ] **Step 1: 抽取统一信息列表**

让信息区使用固定的 `grid-cols-[4.75rem_minmax(0,1fr)]` 两列结构；左列以 `border-r border-border/60` 作为竖线，标签按右侧内容行垂直对应。保留镜头头部的 `第 N 镜` 与景别。

- [ ] **Step 2: 统一资产标签**

把场景名和角色状态都渲染成 `Badge`。场景标签使用 `border-primary/40 bg-primary/10 text-primary`，角色标签使用 `border-secondary/70 bg-secondary text-secondary-foreground`，保持主题 token，不引入硬编码颜色；角色标签继续显示状态。

- [ ] **Step 3: 调整语音与配音内容**

将解析后的每段台词放进 `语音` 行，明确显示 `旁白` 或角色名，并在同一行显示 `（语气）`；多个段落使用分隔符合并。`配音` 行隐藏重复的说话人/语气文本，只显示真实播放器或没有音频时的生成入口。保留真实时长、拖动进度、加载禁用与重新生成行为。

- [ ] **Step 4: 保留空状态和现有操作**

没有语音内容时不创建语音/配音空行；有 `dialogue` 但没有音频段时仍显示语音文本和生成按钮。图片预览、3D 图切换、编辑 3D、AI 生图按钮和现有无障碍名称不变。

### Task 3: 验证与交付

**Files:**
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`

- [ ] **Step 1: 运行分镜相关测试和客户端类型检查**

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/dramaShotDesignVisibility.test.js tests/shotVoiceBlockingSketchEntry.test.js tests/comicDramaStoryboardFlow.test.js
pnpm --filter @ai-novel/client typecheck
```

- [ ] **Step 2: 在实际工作台核对**

确认有场景、有角色、旁白、角色对白、语气、有音频和无音频镜头都使用同一套左标签/右内容结构；确认竖线对齐、场景与角色标签颜色不同、配音行没有重复说话人文字。

- [ ] **Step 3: 更新用户可见发布记录并提交**

在当天日期下记录列表布局、资产标签和语音信息变化，随后执行 `git diff --check`、`git commit -s`，再按项目流程合并到 `main`、推送远端、核对 SHA 并清理本次 worktree。
