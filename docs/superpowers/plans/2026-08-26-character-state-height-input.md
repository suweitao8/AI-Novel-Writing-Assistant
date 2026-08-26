# 角色状态手动身高输入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让角色状态支持输入米制身高，并让分镜按当前状态优先使用该身高以保持角色相对比例稳定。

**Architecture:** 身高作为 `StoryAssetState.heightMeters` 的可选人工覆盖值进入现有 `statesJson`，不新增数据库列。共享类型负责兼容归一化，服务端负责角色专属 schema 校验，状态编辑器负责输入与实时反馈，blocking 服务通过纯解析函数统一执行“状态人工值 > 角色 AI 值 > 默认值”的优先级。

**Tech Stack:** TypeScript, Zod, React, Vitest/Node contract tests, Prisma JSON persistence.

---

### Task 1: 提交设计文档

**Files:**
- Create: `docs/superpowers/specs/2026-08-26-character-state-height-input-design.md`
- Create: `docs/superpowers/plans/2026-08-26-character-state-height-input.md`

- [x] **Step 1: 写入设计和执行计划**
- [x] **Step 2: 自检范围、回退优先级、验证命令和空值语义**
- [x] **Step 3: 提交设计文档**

Run: `git add docs/superpowers/specs/2026-08-26-character-state-height-input-design.md docs/superpowers/plans/2026-08-26-character-state-height-input.md && git commit -s -m "docs: design character state height input"`

### Task 2: 共享状态契约与服务端校验

**Files:**
- Modify: `shared/types/novelReferenceExtraction.ts`
- Modify: `server/src/modules/novel/story-settings/http/storySettingsRoutes.ts`
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsStatePolicy.ts`
- Test: `server/tests/characterStateHeight.contract.test.js`

- [x] **Step 1: 写失败测试**
  - 断言 `parseStoryAssetStatesJson` 保留 `heightMeters: 1.75`。
  - 断言超出 `0.70–2.40` 的状态不作为有效状态进入归一化结果。
  - 断言角色状态 schema 接受 `heightMeters`，场景/道具基础 schema 不接受该字段（通过源契约测试覆盖 schema 分层）。
- [x] **Step 2: 运行测试确认因字段未实现而失败**
- [x] **Step 3: 最小实现字段、范围常量和归一化**
- [x] **Step 4: 运行共享/服务端契约测试确认通过**

### Task 3: 角色状态编辑器输入与资产卡片

**Files:**
- Modify: `client/src/pages/novels/components/storySettings/assetForms.tsx`
- Modify: `client/src/components/storyAssets/storyAssetPresentation.ts`
- Test: `client/tests/characterStateHeightInput.contract.test.js`

- [x] **Step 1: 写失败测试**
  - 检查角色状态编辑器存在米制数字输入、范围和步进属性。
  - 检查清空输入会删除人工身高，超范围会阻止归一化保存。
  - 检查默认状态人工身高优先于角色级 profile 并显示“手动设定”。
- [x] **Step 2: 运行测试确认失败**
- [x] **Step 3: 添加输入、inline 错误状态和保存归一化**
- [x] **Step 4: 更新资产卡片展示来源**
- [x] **Step 5: 运行客户端契约测试与 typecheck**

### Task 4: 分镜按当前状态解析身高

**Files:**
- Modify: `server/src/services/drama/visual/CharacterHeightProfileService.ts`
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- Test: `server/tests/characterStateHeightBlocking.contract.test.js`

- [x] **Step 1: 写失败测试**
  - 给定状态 `heightMeters=1.75` 和角色 profile `1.92`，解析结果为 `1.75`、来源为 manual。
  - 状态没有身高时返回 profile 值和原来源。
  - profile 不存在时返回 `1.8` 和 legacy 来源。
- [x] **Step 2: 运行测试确认失败**
- [x] **Step 3: 添加纯解析函数并接入 novel_import blocking actor**
- [x] **Step 4: 运行 blocking 聚焦测试、服务端 build 和 Prisma generate**

### Task 5: 文档、发布说明与交付

**Files:**
- Modify: `docs/wiki/architecture/character-height-proportion.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [x] **Step 1: 更新长期架构规则和用户可见更新**
- [x] **Step 2: 检查工作区只包含本任务文件**
- [ ] **Step 3: 运行 readme-release-updater 流程、提交并签名**
- [ ] **Step 4: 用 `pnpm workflow:integrate codex/shared-character-state-height-input --verify "<focused checks>" --push` 集成并推送**
- [ ] **Step 5: 清理已合并 worktree，核对 `main == origin/main` 和最终状态**
