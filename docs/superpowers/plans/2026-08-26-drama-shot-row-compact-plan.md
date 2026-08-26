# 分镜卡片四行紧凑布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将分镜列表右侧信息压缩为分镜设计、场景/角色、旁白/对白、配音四个内容行，同时隐藏紧凑卡片中的运镜和英文画面提示词。

**Architecture:** 保持 `ShotVoiceRow` 作为分镜卡片边界，只在 `ShotVoiceListPanel.tsx` 内重构 `ShotDesignSummary` 与信息区渲染。`visualPrompt`、`cameraMove` 和现有音频/图片数据流继续由 API 与生成链路保留，紧凑卡片只改变投影层。

**Tech Stack:** React 19、TypeScript、Tailwind CSS 语义 token、现有 `AiButton`/`Badge`、Node `node:test` 契约测试。

---

### Task 1: 更新紧凑卡片契约测试

**Files:**
- Modify: `client/tests/dramaShotDesignVisibility.test.js`
- Test target: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`

- [ ] **Step 1: 写出四行布局的失败断言**

将现有测试改为检查紧凑卡片仍包含 `分镜设计`、`场景/角色`、`旁白/对白`、`配音` 四个用户可见标签，并检查源码不再包含紧凑卡片使用的 `运镜`、`画面提示词`、`<details`。保留 `shot.action`、`shot.location`、`shot.characterRefs`、`shot.characterStates`、`shot.dialogue` 和 `AudioSegmentPlayer` 的断言，以锁定真实数据和音频入口。

- [ ] **Step 2: 运行测试确认它因旧布局失败**

运行：

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/dramaShotDesignVisibility.test.js
```

预期：失败原因是旧 `ShotDesignSummary` 仍渲染 `运镜`、`画面提示词` 或 `<details>`。

### Task 2: 实现四行紧凑布局

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`

- [ ] **Step 1: 用两行紧凑摘要替换带边框摘要块**

保留角色引用与状态合并逻辑，令 `ShotDesignSummary` 返回无额外卡片边框的纵向两行：第一行用 `分镜设计` 标签显示 `shot.action`，第二行用 `场景/角色` 标签显示地点和角色状态徽标。删除 `cameraMove` 和 `visualPrompt` 的读取与渲染；设计内容使用现有语义文字样式和 `line-clamp-2` 限制高度。

- [ ] **Step 2: 将旁白/对白收敛为单行信息行**

把解析后的多个音频段合并到同一个 `旁白/对白` 行中，保留每段的说话人标签和文本；没有解析段时继续使用 `shot.dialogue`，不把 `action` 当作台词。文本保留最多两行的截断能力。

- [ ] **Step 3: 将配音按钮和真实播放器收敛为单行**

令配音区在 `segments.length > 0 || Boolean(shot.dialogue?.trim())` 时渲染，并添加 `配音` 标签。没有可播放音频时只显示 `生成配音`；已有可播放音频时显示 `AudioSegmentPlayer` 的真实时长/可拖动进度和 `重新生成`。保留现有加载禁用和 `AiButton`。

- [ ] **Step 4: 保留镜头头部的序号和景别，不引入运镜**

继续显示 `第 N 镜` 和 `shot.shotSize`，不显示 `durationSec` 或 `cameraMove`，不改变左侧 16:9 图片、3D 图切换和生成图片操作。

### Task 3: 回归验证与交付准备

**Files:**
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 运行分镜相关测试**

运行：

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/dramaShotDesignVisibility.test.js tests/shotVoiceBlockingSketchEntry.test.js tests/comicDramaStoryboardFlow.test.js
```

预期：所有测试通过。

- [ ] **Step 2: 运行客户端 TypeScript 检查**

运行：

```powershell
pnpm --filter @ai-novel/client typecheck
```

预期：退出码为 0，无 TypeScript 错误。

- [ ] **Step 3: 检查实际运行页面**

在现有 `http://localhost:5174` 分镜工作台确认：有图/无图、无音频/有音频、解析段/原始 `dialogue` 四种状态均保持可操作；每张卡片右侧最多出现四个内容行，且不存在运镜或英文画面提示词行。

- [ ] **Step 4: 更新用户可见发布记录**

按仓库发布记录规则在当天日期下合并一条面向用户的说明，README 只保留最新日期摘要，并确认没有写入内部实现细节。

- [ ] **Step 5: 提交并交付**

先检查 `git diff --check` 和目标文件范围，再使用 `git commit -s` 提交；完成代码审查、集成到 `main`、推送 `origin/main`、验证远端一致并清理本次 worktree。
