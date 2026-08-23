# 漫剧字幕模糊阴影样式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Remotion 漫剧成片字幕从黑色底板统一改为旧项目风格的白字模糊阴影。

**Architecture:** 保留现有服务端字幕时间轴与 Remotion 合成链路，只收敛 `SubtitleLayer` 的视觉样式。测试通过源码契约锁定无底板和阴影参数，再用真实 API 合成与浏览器前后对比验证最终视频。

**Tech Stack:** React, TypeScript, Remotion, Node test runner, ffprobe, Codex in-app browser.

---

### Task 1: Lock the subtitle visual contract with a failing test

**Files:**
- Modify: `video/tests/landscapeComposition.test.js`
- Reference: `video/src/DramaEpisodeVideo.tsx`

- [ ] **Step 1: Write the failing test**

Add a test that reads `src/DramaEpisodeVideo.tsx`, extracts the `SubtitleLayer` source, and asserts that it contains the old-project shadow plus the approved font family while rejecting the black-panel declarations.

```js
test("subtitle layer uses the old-project blurred shadow without a black panel", () => {
  const composition = read("src/DramaEpisodeVideo.tsx");
  const subtitleLayer = composition.slice(composition.indexOf("function SubtitleLayer"));

  assert.match(subtitleLayer, /fontFamily:\s*[`\"]SimHei, [^`\"]*Microsoft YaHei/);
  assert.match(subtitleLayer, /textShadow:\s*[`\"]0 4px 12px rgba\(0,0,0,\.9\)/);
  assert.doesNotMatch(subtitleLayer, /backgroundColor:\s*[`\"]rgba\(0, 0, 0/);
  assert.doesNotMatch(subtitleLayer, /borderRadius:/);
  assert.doesNotMatch(subtitleLayer, /padding:\s*[`\"]12px 24px/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ai-novel/video test`

Expected: the existing composition tests pass, and the new subtitle contract fails because the current component still contains the black background, rounded corners, and old `textShadow` value.

### Task 2: Implement the old-project subtitle style

**Files:**
- Modify: `video/src/DramaEpisodeVideo.tsx:70-99`

- [ ] **Step 1: Replace only the subtitle style declarations**

Keep the current positioning, `maxWidth`, speaker color, active subtitle selection, and text content. Change the text container style to:

```tsx
{
  maxWidth: width * 0.82,
  color: "#fff",
  textAlign: "center",
  fontFamily: 'SimHei, "Microsoft YaHei", sans-serif',
  fontSize: Math.max(24, Math.round(width * 0.025)),
  lineHeight: 1.45,
  textShadow: "0 4px 12px rgba(0,0,0,.9)",
}
```

- [ ] **Step 2: Run the focused tests to verify green**

Run: `pnpm --filter @ai-novel/video test`

Expected: all video composition tests pass with zero failures.

### Task 3: Verify the rendered artifact and browser comparison

**Files:**
- No additional source files.
- Runtime artifact: local episode assembly output only.

- [ ] **Step 1: Run static verification**

Run: `pnpm --filter @ai-novel/video typecheck`

Expected: TypeScript exits with code 0.

- [ ] **Step 2: Verify the Remotion composition contract**

Run: `pnpm --filter @ai-novel/video compositions`

Expected: `DramaEpisodeVideo 24 1280x720 240 (10.00 sec)`.

- [ ] **Step 3: Re-run the real 720p assembly**

Use the existing episode assembly API for project `cmt5tfmcf0000rcb52n3aup7l`, episode `1`, and wait until `assembled.status` is `done` and `activeJob` is `null`.

- [ ] **Step 4: Inspect the new MP4 in the in-app browser**

Keep the existing old artifact tab open, open the new `videoUrl` in another tab, and compare a frame with visible subtitles. Confirm the new subtitle has no black rectangle and remains readable through the blurred shadow.

### Task 4: Commit and integrate

**Files:**
- Commit the source test, component style, design spec, and implementation plan.

- [ ] **Step 1: Review the diff and status**

Run: `git diff --check; git status --short`

- [ ] **Step 2: Commit the coherent change**

Run: `git add video/src/DramaEpisodeVideo.tsx video/tests/landscapeComposition.test.js docs/superpowers/specs/2026-08-23-drama-subtitle-shadow-design.md docs/superpowers/plans/2026-08-23-drama-subtitle-shadow.md; git commit -s -m "fix: match drama subtitle shadow style"`

- [ ] **Step 3: Merge the verified branch into main and push**

After verification, merge the branch into `main`, run the final status/worktree checks, and push the explicit `origin main` ref.
