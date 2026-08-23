# 漫剧分镜配音显示状态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让分镜配音区只在存在真实可播放音频时展示进度条，没有音频时只保留生成入口。

**Architecture:** 在现有 `ShotVoiceRow` 内派生 `readySegments`，以它控制播放器和占位区域；继续使用现有的生成按钮和 `AudioSegmentPlayer`，不改服务端契约。客户端契约测试先覆盖无音频、部分完成和全部完成三种结构，再调整 JSX。

**Tech Stack:** React 19、TypeScript、Tailwind CSS 语义 token、现有客户端 Node contract tests。

---

### Task 1: 为配音显示状态补充失败测试

**Files:**
- Modify: `client/tests/storyboardLandscapeTtsContracts.test.js`
- Test: `client/tests/storyboardLandscapeTtsContracts.test.js`

- [ ] **Step 1: 写出新的显示契约断言**

在“每个分镜行都能试听”测试后增加断言，要求源代码存在 `readySegments`、按 `status === "ready" && segment.audioUrl` 筛选，并在 `readySegments.length === 0` 时不渲染音频播放器或“未生成”文案；同时保留 `AudioSegmentPlayer` 和 `AiButton`。

- [ ] **Step 2: 运行测试确认失败**

运行：

```powershell
node --test tests/storyboardLandscapeTtsContracts.test.js
```

预期：新增契约断言失败，因为当前组件仍然把非 ready 分段渲染成“未生成”。

### Task 2: 按真实音频状态调整分镜行

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx:566-690`

- [ ] **Step 1: 派生可播放分段**

在 `ShotVoiceRow` 中加入：

```ts
const readySegments = segments.filter((segment) => segment.status === "ready" && segment.audioUrl);
const hasReadyAudio = readySegments.length > 0;
```

并保留现有 `pendingCount`、`shouldForceRegenerate` 和按钮回调。

- [ ] **Step 2: 只渲染可播放分段**

将音频区内的 `segments.map` 改为 `readySegments.map`，移除非 ready 分段的状态点和“未生成/需重配”占位分支。音频区保留生成按钮；当 `hasReadyAudio` 为假时，让按钮使用 `ml-auto` 靠右显示。

- [ ] **Step 3: 保持完整状态反馈**

保留 `props.regenerating` 对按钮的禁用和 spinner；保留 `AudioSegmentPlayer` 的真实时长、播放和拖动行为；使用 `cn()` 合并“有播放器/无播放器”两种布局类名，不新增硬编码颜色或组件。

- [ ] **Step 4: 运行客户端契约测试确认通过**

运行：

```powershell
node --test tests/storyboardLandscapeTtsContracts.test.js
```

预期：测试全部通过。

### Task 3: 回归、文档与交付

**Files:**
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 检查用户可见变更并更新发布记录**

在现有最新日期区块增加“无配音时只显示生成入口，有配音后显示试听进度条”的用户视角说明；README 只保留最新日期区块和完整更新链接。

- [ ] **Step 2: 运行针对性检查**

运行客户端配音契约测试和客户端类型检查；类型检查若被仓库既有错误阻断，记录与本次文件相关的筛选结果。

- [ ] **Step 3: 提交并集成**

使用 `git commit -s` 提交隔离分支；确认主工作区规则后合并到 `main`，显式推送 `origin main`，并清理已合并的工作区与本地分支。
