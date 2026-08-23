# 漫剧旁白字幕纯正文 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让旁白在 Remotion 视频字幕和 SRT 中只显示整条白色正文，让对白继续显示角色名。

**Architecture:** 复用音频条目已有的 `narration/dialogue` 结构化类型，沿 `DramaEpisodeAssemblyService → DramaRemotionEpisodeAssembler → buildDramaVideoTimeline → DramaEpisodeVideo` 传递。对没有类型的旧记录只保留明确的兼容推断，不改脚本源文本。

**Tech Stack:** TypeScript, React, Remotion, Node test runner, Prisma-backed drama assembly service.

---

### Task 1: Add failing narration/display contract tests

**Files:**
- Modify: `server/tests/dramaRemotionAssembly.test.js`
- Modify: `server/tests/dramaRemotionRenderer.test.js`
- Modify: `video/tests/landscapeComposition.test.js`

- [ ] **Step 1: Write the failing assembler test**

Change the fixture audio line to include the existing structured type and assert the rendered timeline carries it and the generated SRT contains only the narration text:

```js
audioLines: [{
  text: "向前走。",
  speaker: "旁白",
  type: "narration",
  durationSec: 2,
  sourcePath: audioSource,
}],
```

Add these assertions after the timeline timing assertions:

```js
assert.equal(renderCalls[0].timeline.subtitles[0].type, "narration");
assert.match(await fs.readFile(srtPath, "utf8"), /向前走/);
assert.doesNotMatch(await fs.readFile(srtPath, "utf8"), /旁白：/);
```

Replace the old assertion that requires `/旁白：向前走/` because that is the behavior being removed.

- [ ] **Step 2: Add the dialogue control case**

In `server/tests/dramaRemotionRenderer.test.js`, pass `type: "dialogue"` for the `speaker: "林澈"` subtitle input and include `type: "dialogue"` in the expected timeline object. This locks the data path without treating every speaker as narration.

- [ ] **Step 3: Add the Remotion source contract**

Extend `video/tests/landscapeComposition.test.js` with:

```js
test("narration subtitles omit the speaker label while dialogue subtitles keep it", () => {
  const composition = read("src/DramaEpisodeVideo.tsx");
  const subtitleLayer = composition.slice(composition.indexOf("function SubtitleLayer"));

  assert.match(subtitleLayer, /active\.type === "narration"/);
  assert.match(subtitleLayer, /!isNarration/);
  assert.match(subtitleLayer, /active\.speaker/);
});
```

- [ ] **Step 4: Run the tests to verify RED**

Run from the worktree after the server build is available:

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/dramaRemotionAssembly.test.js server/tests/dramaRemotionRenderer.test.js
pnpm --filter @ai-novel/video test
```

Expected: the new assertions fail because the current audio-line and timeline types do not carry `type`, the SRT still prefixes every speaker, and the component has no narration branch.

### Task 2: Propagate the structured narration type

**Files:**
- Modify: `server/src/services/drama/video/DramaEpisodeAssemblyService.ts:286-316`
- Modify: `server/src/services/drama/video/DramaRemotionEpisodeAssembler.ts:17-22,94-99,407-423`
- Modify: `server/src/services/drama/video/dramaVideoTimeline.ts:10-15,27-32,65-75`
- Modify: `video/src/types.ts:13-18`

- [ ] **Step 1: Extend the shared assembly/timeline types**

Use the same optional union at each boundary:

```ts
type DramaSubtitleType = "dialogue" | "narration";

// On DramaAssemblyAudioLine, DramaVideoTimelineSubtitle, and DramaVideoSubtitle:
type?: DramaSubtitleType;
```

Keep the field optional at input boundaries so old stored jobs remain readable.

- [ ] **Step 2: Preserve the type when reading saved audio items**

Extend the parsed `dialogueAudioData.items` shape with `type?: DramaSubtitleType`, then pass the type into `audioLines`. For legacy entries, use this deterministic compatibility rule:

```ts
const speaker = item.speaker?.trim() || undefined;
const type = item.type ?? (speaker && speaker !== "旁白" ? "dialogue" : "narration");

audioLines.push({
  text: item.text!,
  speaker,
  type,
  durationSec: Math.round(durationSec * 100) / 100,
  sourcePath: audioPath,
});
```

- [ ] **Step 3: Carry type into aligned subtitles and the Remotion timeline**

When `alignSubtitlesToSceneCursor` creates a subtitle cue, copy `line.type`; when `buildDramaVideoTimeline` maps a subtitle input, copy `subtitle.type` into the returned timeline item. Do not change frame calculations.

- [ ] **Step 4: Run the focused tests**

Run: `pnpm --filter @ai-novel/server build; node --test server/tests/dramaRemotionAssembly.test.js server/tests/dramaRemotionRenderer.test.js`

Expected: timeline type assertions pass, but the SRT and Remotion source test still fail until Task 3 is complete.

### Task 3: Render narration as pure white text

**Files:**
- Modify: `video/src/DramaEpisodeVideo.tsx:70-94`
- Modify: `server/src/services/drama/video/DramaRemotionEpisodeAssembler.ts:446-454`

- [ ] **Step 1: Add the renderer narration branch**

In `SubtitleLayer`, derive the display role from the structured type and the legacy marker:

```tsx
const isNarration = active.type === "narration" || !active.speaker?.trim() || active.speaker.trim() === "旁白";
```

Render the speaker span only for dialogue:

```tsx
{!isNarration && active.speaker ? (
  <span style={{ color: "#ffd580", marginRight: 10 }}>{active.speaker}：</span>
) : null}
{active.text}
```

Keep the existing white text and `0 4px 12px rgba(0,0,0,.9)` shadow styles unchanged.

- [ ] **Step 2: Apply the same rule to SRT**

Add a small local predicate before `buildSrt` or inline the equivalent condition:

```ts
const includeSpeaker = cue.type !== "narration"
  && Boolean(cue.speaker?.trim())
  && cue.speaker?.trim() !== "旁白";
const text = includeSpeaker ? `${cue.speaker}：${cue.text}` : cue.text;
```

Pass `text` to `wrapSubtitleText`. This keeps legacy character subtitles while removing only narrator prefixes.

- [ ] **Step 3: Run the focused tests to verify GREEN**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/dramaRemotionAssembly.test.js server/tests/dramaRemotionRenderer.test.js
pnpm --filter @ai-novel/video test
```

Expected: all selected server and video tests pass with zero failures.

### Task 4: Verify the real artifact and integrate safely

**Files:**
- No additional source files.
- Do not edit or resolve the existing dirty/conflicted main-worktree files.

- [ ] **Step 1: Run static video verification**

Run: `pnpm --filter @ai-novel/video typecheck; pnpm --filter @ai-novel/video compositions`

Expected: typecheck exits 0 and composition remains `DramaEpisodeVideo 24 1280x720 240 (10.00 sec)`.

- [ ] **Step 2: Rebuild and run the real episode assembly from the isolated worktree**

Use the fixed project API port only after ensuring the current project server is not mid-task; assemble project `cmt5tfmcf0000rcb52n3aup7l`, episode `1`, with subtitles enabled. Confirm `assembled.status === "done"`, `activeJob === null`, and the new SRT has no `旁白：` for narration.

- [ ] **Step 3: Compare old and new artifacts in the in-app browser**

Keep the previous subtitle-shadow artifact open and open the new artifact in another tab. Confirm narration is one uninterrupted white text line while a dialogue line still shows the colored character label.

- [ ] **Step 4: Commit only the owned files**

Run `git diff --check`, stage only the source/tests/docs owned by this branch, and commit with `git commit -s -m "fix: render narration subtitles without speaker label"`. Do not stage files from the main worktree.

- [ ] **Step 5: Integrate only when main is clean**

If `D:\Github\AI-Novel-Writing-Assistant` still has the concurrent `UU`/staged changes, leave this branch committed and report that integration is waiting on that existing merge. Do not resolve or overwrite those changes. If main becomes clean, merge with `--no-ff`, run final tests, and push `origin main` explicitly.
