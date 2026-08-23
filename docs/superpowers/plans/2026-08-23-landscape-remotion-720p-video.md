# 横屏 16:9 Remotion 720p 视频链路 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 将漫剧从分镜到整集成片的默认输出改为 Remotion 横屏 16:9 开发规格 1280×720，并用真实 MP4/ffprobe 完成闭环验证。

**Architecture:** 服务端继续负责从 `DramaEpisode` 装配镜头、配音和字幕时间轴；独立 `video/` workspace package 只负责 Remotion Composition。服务端把首帧/占位素材复制到临时 public 目录，Remotion 生成无声横屏视频，ffmpeg 规范化并拼接音频后封装，最后用 ffprobe 校验并保存产物状态。

**Tech Stack:** TypeScript, React 19, Remotion 4, ffmpeg/ffprobe, Node test, Prisma, TanStack Query.

---

### Task 1: Freeze the landscape render contract

**Files:**
- Create: `server/src/services/drama/video/renderProfile.ts`
- Create: `server/tests/dramaRenderProfile.test.js`
- Modify: `server/src/services/drama/DramaVideoPromptService.ts:148`
- Modify: `server/src/services/drama/video/LocalFfmpegVideoProvider.ts:8-166`
- Modify: `server/tests/dramaPipelineContract.test.js:381-526`

- [ ] **Step 1: Write failing profile tests**

  Add tests for `getDramaRenderProfile()` returning `{id:"720p", width:1280, height:720, fps:24}` by default, returning 1920×1080 only when explicitly configured for `1080p`, and rejecting any non-16:9 dimensions. Add a MIME helper test asserting WAV data URLs map to `.wav` and MPEG data URLs map to `.mp3`.

- [ ] **Step 2: Run the profile test to verify it fails**

  Run `pnpm --filter @ai-novel/shared build; pnpm --filter @ai-novel/server prisma:generate; pnpm --filter @ai-novel/server build; node --test server/tests/dramaRenderProfile.test.js`.

  Expected: the new module is missing and the test fails before any implementation exists.

- [ ] **Step 3: Implement one profile source of truth**

  Export `DramaRenderProfile`, `DRAMA_RENDER_PROFILES`, `getDramaRenderProfile(env = process.env)`, and `assertLandscape16x9(width, height)`. Use `DRAMA_VIDEO_PROFILE=720p` as the default; accept only `720p` or `1080p`. Change the local ffmpeg provider to consume this profile and change the video prompt default/aspect-ratio contract to `16:9`.

- [ ] **Step 4: Run the profile and existing drama tests**

  Run the commands from Step 2 plus `node --test server/tests/dramaPipelineContract.test.js`.

  Expected: profile tests pass, the contract expects `16:9`, and no drama provider test asserts `9:16` or vertical output.

- [ ] **Step 5: Commit**

  `git add server/src/services/drama/video/renderProfile.ts server/src/services/drama/DramaVideoPromptService.ts server/src/services/drama/video/LocalFfmpegVideoProvider.ts server/tests/dramaRenderProfile.test.js server/tests/dramaPipelineContract.test.js && git commit -s -m "feat: define landscape drama render profiles"`

### Task 2: Add the isolated Remotion video package

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `video/package.json`
- Create: `video/tsconfig.json`
- Create: `video/remotion.config.ts`
- Create: `video/src/index.tsx`
- Create: `video/src/DramaEpisodeVideo.tsx`
- Create: `video/src/types.ts`
- Create: `video/src/Root.tsx`
- Create: `video/tests/landscapeComposition.test.js`

- [ ] **Step 1: Write the failing package contract test**

  Assert that the package exposes `DramaEpisodeVideo`, the root composition id is `DramaEpisodeVideo`, default props are 1280×720/24fps, and scene props include `startFrame`, `durationInFrames`, `image`, `title`, and `kind`.

- [ ] **Step 2: Run the package test to verify it fails**

  Run `node --test video/tests/landscapeComposition.test.js`.

  Expected: the `video/` package and composition source do not exist.

- [ ] **Step 3: Add the package and composition**

  Add Remotion 4 and React 19 dependencies, register `video/` in the workspace, and implement a composition that:

  ```tsx
  <AbsoluteFill>
    {scenes.map((scene) => (
      <Sequence from={scene.startFrame} durationInFrames={scene.durationInFrames} key={scene.id}>
        <SceneLayer scene={scene} />
      </Sequence>
    ))}
    <SubtitleLayer subtitles={subtitles} show={showSubtitles} />
  </AbsoluteFill>
  ```

  `SceneLayer` uses `Img` for copied keyframes and renders a dark text card when no image exists. All dimensions come from `useVideoConfig`; no 1080×1920 or 9:16 constant is allowed.

- [ ] **Step 4: Run package typecheck and bundle smoke test**

  Run `pnpm --filter @ai-novel/video exec tsc -p tsconfig.json --noEmit`, `node --test video/tests/landscapeComposition.test.js`, and `pnpm --filter @ai-novel/video exec remotion compositions src/index.tsx`.

  Expected: the `DramaEpisodeVideo` composition reports 1280×720 and 24fps.

- [ ] **Step 5: Commit**

  `git add pnpm-workspace.yaml video pnpm-lock.yaml && git commit -s -m "feat: add landscape remotion video composition"`

### Task 3: Build the server-side Remotion renderer adapter

**Files:**
- Create: `server/src/services/drama/video/DramaRemotionRenderer.ts`
- Create: `server/src/services/drama/video/dramaVideoTimeline.ts`
- Create: `server/tests/dramaRemotionRenderer.test.js`
- Modify: `server/src/services/drama/video/ffmpegUtils.ts` only if a reusable process helper is required

- [ ] **Step 1: Write failing adapter tests**

  Add dependency-injected tests proving the renderer writes a props file with the selected profile, copies an image into the public directory, invokes the Remotion CLI with `DramaEpisodeVideo`, `--public-dir`, and `--props`, and returns a silent output path. Add timeline tests for deterministic seconds-to-frames conversion and contiguous scene/subtitle ranges.

- [ ] **Step 2: Run the adapter tests to verify they fail**

  Run `pnpm --filter @ai-novel/shared build; pnpm --filter @ai-novel/server prisma:generate; pnpm --filter @ai-novel/server build; node --test server/tests/dramaRemotionRenderer.test.js`.

  Expected: the renderer and timeline modules are missing.

- [ ] **Step 3: Implement the adapter and timeline builder**

  The renderer port must accept `{jobId, profile, scenes, subtitles, publicFiles, outputPath, showSubtitles}` and return `{outputPath, durationInFrames}`. Use `pnpm exec remotion render src/index.tsx DramaEpisodeVideo <output> --props=<json> --public-dir=<tempPublic>` from the `video/` package directory, with an explicit timeout and cleanup responsibility owned by the caller.

- [ ] **Step 4: Run the adapter tests**

  Run `node --test server/tests/dramaRemotionRenderer.test.js` and the server build. Expected: all injected command/timeline assertions pass.

- [ ] **Step 5: Commit**

  `git add server/src/services/drama/video/DramaRemotionRenderer.ts server/src/services/drama/video/dramaVideoTimeline.ts server/tests/dramaRemotionRenderer.test.js server/src/services/drama/video/ffmpegUtils.ts && git commit -s -m "feat: add server remotion renderer adapter"`

### Task 4: Replace vertical ffmpeg episode assembly with Remotion plus audio mux

**Files:**
- Modify: `server/src/services/drama/video/DramaEpisodeAssemblyService.ts`
- Create: `server/tests/dramaEpisodeAssemblyRemotion.test.js`
- Modify: `client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx`

- [ ] **Step 1: Write failing assembly tests**

  With injected renderer/process/ffprobe dependencies, assert that one episode produces:

  ```text
  title card -> shot 1 -> shot 2 -> end card
  silent Remotion video -> normalized audio timeline -> final MP4
  ```

  Assert that missing keyframes/audio create warnings but still finish `done`, while renderer/mux/ffprobe failures finish `error`. Assert that WAV data URLs are written and probed as WAV, and that final output metadata must be 1280×720 with both H.264 video and AAC audio.

- [ ] **Step 2: Run the assembly tests to verify they fail**

  Run `node --test server/tests/dramaEpisodeAssemblyRemotion.test.js`.

  Expected: the current service still uses vertical ffmpeg clips and has no injected Remotion path.

- [ ] **Step 3: Implement the Remotion assembly path**

  Reuse the existing episode loading and audio-driven `buildShotPlan` behavior, but replace per-shot vertical clip rendering/concat with:

  1. Create contiguous Remotion scene props and SRT cues.
  2. Copy keyframes or generated horizontal fallback assets into the renderer public directory.
  3. Normalize each dialogue audio item to 44.1 kHz stereo PCM WAV; generate silence for missing audio/title/end cards; concatenate into one audio timeline.
  4. Render the silent Remotion video at the selected landscape profile.
  5. Mux `video copy + AAC audio` with ffmpeg, run ffprobe, and only then persist `assembledVideoData.status="done"`.
  6. Treat per-shot degradation as warnings, not a failed task.

- [ ] **Step 4: Update progress phases and UI status**

  Replace `clips/concat/subtitles` phase labels with `render/audio/mux` labels and show `横屏 16:9 · 1280×720` in the assembly panel. Keep the existing disabled/running/retry/preview behavior.

- [ ] **Step 5: Run focused assembly verification**

  Run `pnpm --filter @ai-novel/shared build; pnpm --filter @ai-novel/server prisma:generate; pnpm --filter @ai-novel/server build; node --test server/tests/dramaEpisodeAssemblyRemotion.test.js server/tests/dramaRemotionRenderer.test.js`.

- [ ] **Step 6: Commit**

  `git add server/src/services/drama/video/DramaEpisodeAssemblyService.ts server/tests/dramaEpisodeAssemblyRemotion.test.js client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx && git commit -s -m "feat: render drama episodes with landscape remotion"`

### Task 5: Align client contracts, docs, and regression tests

**Files:**
- Modify: `client/tests/comicDramaStoryboardFlow.test.js`
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx` only if its stale source assertion exposes a real product mismatch
- Modify: `docs/wiki/workflows/comic-drama-episode-assembly.md`
- Modify: `docs/wiki/workflows/comic-drama-workflow.md`
- Modify: `docs/wiki/architecture/mydrama-asset-index.md` if the active path record still says Remotion is unmigrated
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Fix the focused client contract test**

  Narrow the negative assertion from `/生成分镜/` to the removed user-facing button phrase, while keeping positive assertions for the current `生成` button, assembly panel, status polling, and video preview.

- [ ] **Step 2: Update durable workflow documentation**

  State that the active default is Remotion landscape 1280×720/24fps, the final audio mux is ffmpeg, and 1920×1080 is a later profile. Remove active-path claims that the product outputs vertical video or that Remotion is still unmigrated.

- [ ] **Step 3: Update user-facing release surfaces**

  Add a date-based release note that the comic drama assembly now produces a landscape 16:9 development video with preview/download behavior; refresh the README latest update block without exposing internal module names.

- [ ] **Step 4: Run client checks**

  Run `pnpm --filter @ai-novel/client typecheck` and `node --experimental-strip-types --test client/tests/comicDramaStoryboardFlow.test.js`.

- [ ] **Step 5: Commit**

  `git add client/tests/comicDramaStoryboardFlow.test.js client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx docs/wiki docs/releases/release-notes.md README.md && git commit -s -m "docs: align comic drama workflow with landscape video"`

### Task 6: Real render smoke test and final audit

**Files:**
- Create: `video/scripts/render-smoke.mjs` or `server/tests/fixtures/` only if needed for a deterministic local fixture
- Modify: no production files unless verification exposes a defect

- [ ] **Step 1: Generate deterministic local fixture media**

  Use ffmpeg to create a short 2-shot 1280×720 test image/video input and short WAV tones, then invoke the Remotion package and server mux path without touching the project database.

- [ ] **Step 2: Verify the real MP4 with ffprobe**

  Assert `codec_type=video`, `codec_name=h264`, `width=1280`, `height=720`, `r_frame_rate=24/1`, and an AAC audio stream. Confirm duration is positive and close to the timeline duration.

- [ ] **Step 3: Run the full targeted suite**

  Run:

  ```text
  pnpm --filter @ai-novel/shared build
  pnpm --filter @ai-novel/server prisma:generate
  pnpm --filter @ai-novel/server build
  node --test server/tests/dramaRenderProfile.test.js server/tests/dramaRemotionRenderer.test.js server/tests/dramaEpisodeAssemblyRemotion.test.js server/tests/comicDramaStoryboardBridge.test.js server/tests/dramaPipelineContract.test.js
  pnpm --filter @ai-novel/client typecheck
  node --experimental-strip-types --test client/tests/comicDramaStoryboardFlow.test.js
  pnpm --filter @ai-novel/video exec tsc -p tsconfig.json --noEmit
  ```

- [ ] **Step 4: Inspect diff and worktree state**

  Confirm only the feature commits are present, no secrets/generated output is staged, the main worktree remains untouched, and `git worktree list --porcelain` still shows all pre-existing worktrees.

- [ ] **Step 5: Commit any verification-only fixture changes**

  Commit only if a deterministic test fixture was added; otherwise leave generated media untracked/removed.

- [ ] **Step 6: Request review and prepare integration**

  Review the branch diff against `main`, resolve all important findings, then use the project integration workflow to merge the verified branch back into main. Do not push the feature branch.
