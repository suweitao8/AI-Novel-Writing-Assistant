# 脚本到分镜与视频合成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 在漫剧工作台中补齐“当前选中章节脚本 → 分镜 → 视频合成”的可操作流程。脚本页点击“生成”只处理当前章节；分镜页在已有分镜后提供“合成”，并显示合成状态和视频结果。

**Architecture:** 新增一个由小说章节驱动的服务端桥接命令：读取当前章节已保存的 `Chapter.expectation`，复用或创建该小说的 `novel_import` 漫剧项目，同步资产，写入对应 `DramaEpisode.content`，再调用现有分镜生成服务。前端用一个统一的生成 mutation 连接脚本页和分镜空状态；视频合成复用现有整集合成 API 与状态轮询，抽成可复用组件后接入漫剧分镜列表。

**Tech Stack:** TypeScript, React, TanStack Query, Fastify, Zod, Prisma, Vitest/Node test.

---

## Task 1: Add failing server bridge tests

**Files:**
- Create: `server/tests/comicDramaStoryboardBridge.test.js`
- Reference: `server/src/services/drama/studio/ComicDramaStoryboardBridgeService.ts`
- Reference: `server/src/modules/drama/http/dramaRoutes.ts`

- [ ] Add a service-level test with stubbed Prisma/project/storyboard services proving that an empty selected chapter is rejected before creating a project.
- [ ] Add a happy-path test proving the bridge reuses the latest `novel_import` project, assembles the source bundle, upserts only the selected episode with the saved script, and invokes storyboard generation for that order.
- [ ] Add a route contract assertion for `POST /studio/:novelId/chapters/:order/storyboard` and the request body options.
- [ ] Run the focused test before implementation and record the expected failure.

## Task 2: Add failing client flow tests

**Files:**
- Create: `client/tests/comicDramaStoryboardFlow.test.js`
- Reference: `client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx`
- Reference: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`
- Reference: `client/src/api/media/drama.ts`

- [ ] Add source-level contract assertions that the script action uses the selected chapter order and saved script state, exposes the exact label `生成`, and calls the new studio bridge API.
- [ ] Add assertions that the storyboard panel exposes `生成` when no storyboard exists and `合成` plus assembly status/video handling when a storyboard exists.
- [ ] Run the focused client test before implementation and record the expected failure.

## Task 3: Implement the server-side selected-chapter bridge

**Files:**
- Create: `server/src/services/drama/studio/ComicDramaStoryboardBridgeService.ts`
- Modify: `server/src/modules/drama/http/dramaRoutes.ts`
- Modify: `client/src/api/media/drama.ts`

- [ ] Implement `generateStoryboardFromNovelChapter(novelId, chapterOrder, options)` with validation for novel, selected chapter, and non-empty saved script.
- [ ] Reuse the latest `source: "novel_import"` project for the novel or create one with the selected visual style; then call the existing source-bundle assembler so character, scene, and prop assets stay connected.
- [ ] Upsert only the selected `DramaEpisode` using the chapter order/title and `Chapter.expectation` as `content`, then call the existing `DramaStoryboardService` for that episode.
- [ ] Add the `POST /api/drama/studio/:novelId/chapters/:order/storyboard` route with validated LLM and visual-style options.
- [ ] Add the typed client API function used by the studio page.
- [ ] Run the focused server bridge tests and the server TypeScript build.

## Task 4: Add the “生成” action to the comic studio

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx`
- Modify: `client/src/pages/drama/comicDrama/hooks/useNovelChapterWorkspace.ts` only if a selected-chapter save readiness value must be exposed

- [ ] Add one shared mutation that sends the selected chapter order, waits for pending script save to finish, and calls the new bridge API.
- [ ] Add the exact `生成` action to the script tab header; disable it when there is no selected chapter, no saved script, or the script is still dirty/saving.
- [ ] Pass the same action into the storyboard empty state so entering the storyboard tab cannot leave the user at a dead end.
- [ ] On success invalidate the overview/source links, switch to the storyboard tab, and show concise success/error feedback.
- [ ] Remove or stop using the old content-count-gated bootstrap mutation so `Chapter.content` being empty no longer disables this workflow.
- [ ] Run the focused client flow tests and the client typecheck/build checks that cover the touched modules.

## Task 5: Add “合成” to the storyboard page

**Files:**
- Create: `client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx`
- Modify: `client/src/pages/drama/components/DramaVisualPanel.tsx`
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`

- [ ] Extract the existing episode assembly status/query/mutation/video-preview behavior into the reusable assembly panel without changing the legacy visual panel behavior.
- [ ] Add the panel below the selected episode’s storyboard shots and expose the compact action label `合成` in the comic studio.
- [ ] Keep polling while an assembly job is active, display errors and retry affordance, and render the resulting video/SRT when complete.
- [ ] Ensure the action is scoped to the currently selected episode order and cannot start a second concurrent assembly job.
- [ ] Run the focused client flow tests and any existing drama visual-panel tests.

## Task 6: Document and verify the workflow contract

**Files:**
- Create or modify: `docs/wiki/workflows/comic-drama-storyboard-bridge.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] Document the durable rule that the comic studio’s saved script source is `Chapter.expectation`, while storyboard generation consumes the synchronized `DramaEpisode.content`; include failure modes and retry behavior.
- [ ] Update the user-facing release notes and README latest-update section for the new `生成`/`合成` workflow.
- [ ] Run the complete targeted verification set, inspect the final diff, and confirm unrelated worktree changes are untouched.

## Checkpoints

- After Tasks 1–2: both focused tests fail for the missing bridge/UI contract, confirming the tests cover the requested gap.
- After Tasks 3–5: focused server/client checks pass and the generated storyboard and assembly actions are wired to the selected order.
- Before completion: release/wiki documentation is updated, final typecheck/build/test output is captured, and no success claim is made without that evidence.
