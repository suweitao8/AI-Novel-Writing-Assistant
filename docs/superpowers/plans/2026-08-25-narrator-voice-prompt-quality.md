# 女性旁白音色提示词优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将系统女性旁白的默认生成描述优化为自然亲和、真实讲故事的成年女中音，并保持无参考音频的 VoxCPM2 Voice Design 链路。

**Architecture:** 只更新现有旁白设置服务的默认描述和设置页占位符；用户已保存的自定义描述不做静默迁移。生成仍从 `GlobalNarratorVoiceSettingsService.design` 进入 `synthesizeAudioSpeech`，不新增关键词路由、不修改参考音频选择逻辑。稳定的提示词原则补充到 VoxCPM2 架构 wiki，用户可见行为记录到 release notes 和 README 最新更新。

**Tech Stack:** TypeScript、React、Node `node:test`、pnpm workspace、VoxCPM2 OpenAI-compatible local bridge。

---

### Task 1: Lock the new prompt contract with failing tests

**Files:**
- Modify: `server/tests/globalNarratorVoiceSettings.test.js:94-97`
- Modify: `client/tests/globalNarratorVoiceSettingsContracts.test.js:19-28`

- [ ] **Step 1: Change the server default expectation first**

Replace the old expected default in `server/tests/globalNarratorVoiceSettings.test.js` with the approved prompt:

```js
assert.deepEqual(await service.get(), {
  description: "成年女性，约30岁，明亮自然的女中音；普通话标准清晰，声音温暖亲和，像真实的人在近距离讲故事；语速中等，停顿自然，句尾平稳但有轻微语气变化；吐字清楚、连贯，有真实呼吸感；不要播音腔、主持腔、新闻腔，不要低沉或男性化。",
});
```

- [ ] **Step 2: Require the settings page to show the same recommendation**

Add this assertion to the existing `旁白音色页面提供保存描述和重新生成试听` test in `client/tests/globalNarratorVoiceSettingsContracts.test.js`:

```js
assert.match(
  page,
  /placeholder="例如：成年女性，约30岁，明亮自然的女中音；普通话标准清晰，声音温暖亲和，像真实的人在近距离讲故事；语速中等，停顿自然，句尾平稳但有轻微语气变化；吐字清楚、连贯，有真实呼吸感；不要播音腔、主持腔、新闻腔，不要低沉或男性化。"/,
);
```

- [ ] **Step 3: Build the current server output and run both contract tests to verify RED**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/globalNarratorVoiceSettings.test.js
node --test client/tests/globalNarratorVoiceSettingsContracts.test.js
```

Expected: the server default assertion fails because production still returns the old description, and the client contract assertion fails because the page still has the old placeholder. Do not modify production code before observing these failures.

### Task 2: Implement the approved prompt in the two user-facing entry points

**Files:**
- Modify: `server/src/services/settings/GlobalNarratorVoiceSettingsService.ts:15-16`
- Modify: `client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx:87`

- [ ] **Step 1: Update the server default constant**

Set `DEFAULT_GLOBAL_NARRATOR_VOICE_DESCRIPTION` to exactly:

```ts
export const DEFAULT_GLOBAL_NARRATOR_VOICE_DESCRIPTION =
  "成年女性，约30岁，明亮自然的女中音；普通话标准清晰，声音温暖亲和，像真实的人在近距离讲故事；语速中等，停顿自然，句尾平稳但有轻微语气变化；吐字清楚、连贯，有真实呼吸感；不要播音腔、主持腔、新闻腔，不要低沉或男性化。";
```

- [ ] **Step 2: Update the settings page placeholder**

Replace the old placeholder with:

```tsx
placeholder="例如：成年女性，约30岁，明亮自然的女中音；普通话标准清晰，声音温暖亲和，像真实的人在近距离讲故事；语速中等，停顿自然，句尾平稳但有轻微语气变化；吐字清楚、连贯，有真实呼吸感；不要播音腔、主持腔、新闻腔，不要低沉或男性化。"
```

- [ ] **Step 3: Run the focused tests to verify GREEN**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/globalNarratorVoiceSettings.test.js
node --test client/tests/globalNarratorVoiceSettingsContracts.test.js
```

Expected: the server settings test and all client contract tests pass with zero failures.

### Task 3: Document the durable prompt rule and user-visible change

**Files:**
- Modify: `docs/wiki/architecture/voxcpm2-audio-provider.md` under “声音设计与数据边界” and “故障模式”
- Modify: `docs/releases/release-notes.md` under `### 2026-08-25`
- Modify: `README.md` under `## 最新更新`

- [ ] **Step 1: Add the durable wiki rule**

Document that the default female narrator description must specify acoustic/prosody characteristics (age range, register, distance, pace, pauses, articulation, and anti-broadcast constraints) instead of only broad emotional adjectives; keep user-authored descriptions untouched.

- [ ] **Step 2: Add a concise user-facing release note**

Record that the system female narrator now starts with a warmer, more natural storytelling voice description, while users can still edit the description and regenerate a different style.

- [ ] **Step 3: Refresh only the latest README update block**

Keep the existing date format and release-notes link; summarize the same user-visible improvement without mentioning file paths, test names, or implementation history.

- [ ] **Step 4: Run `git diff --check` and inspect the full scoped diff**

Run:

```powershell
git diff --check
git status --short
git diff -- server/src/services/settings/GlobalNarratorVoiceSettingsService.ts client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx server/tests/globalNarratorVoiceSettings.test.js client/tests/globalNarratorVoiceSettingsContracts.test.js docs/wiki/architecture/voxcpm2-audio-provider.md docs/releases/release-notes.md README.md
```

Expected: only the approved prompt, its tests, and the related documentation are changed; no generated audio, credentials, database, or unrelated worktree files appear.

### Task 4: Run repository verification and a real VoxCPM2 generation smoke check

**Files:**
- Read-only verification of the running API and local VoxCPM2 bridge; no repository files are added.

- [ ] **Step 1: Run the focused server/client checks and builds**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/globalNarratorVoiceSettings.test.js server/tests/globalNarratorVoiceAudioContract.test.js server/tests/dramaVoiceRouting.test.js
node --test client/tests/globalNarratorVoiceSettingsContracts.test.js
```

Expected: both builds exit 0 and every listed test passes. The full server suite is not a required gate because the repository has unrelated database-dependent tests that need a fully provisioned test database.

- [ ] **Step 2: Generate once through the running local API with the approved prompt**

POST JSON to `http://127.0.0.1:3100/api/settings/narrator-voice/design`:

```json
{
  "description": "成年女性，约30岁，明亮自然的女中音；普通话标准清晰，声音温暖亲和，像真实的人在近距离讲故事；语速中等，停顿自然，句尾平稳但有轻微语气变化；吐字清楚、连贯，有真实呼吸感；不要播音腔、主持腔、新闻腔，不要低沉或男性化。"
}
```

Confirm the response is successful, the returned `description` equals the approved prompt, the returned audio is a non-empty WAV data URL, and `referenceAudioUrl` is absent. Do not send or persist a previous `sampleAudioUrl` as `audio_url`.

- [ ] **Step 3: Inspect final Git state**

Run:

```powershell
git status --short
git log -3 --oneline --decorate
git worktree list --porcelain
```

Expected: the worktree contains only intentional changes, and no unrelated worktree is modified.

### Task 5: Commit, integrate, push, and clean up

**Files:**
- Commit all intentional files from Tasks 1–4 on `codex/narrator-voice-prompt-quality`.

- [ ] **Step 1: Commit the implementation unit**

After the checks pass, run:

```powershell
git add server/src/services/settings/GlobalNarratorVoiceSettingsService.ts client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx server/tests/globalNarratorVoiceSettings.test.js client/tests/globalNarratorVoiceSettingsContracts.test.js docs/wiki/architecture/voxcpm2-audio-provider.md docs/releases/release-notes.md README.md docs/superpowers/plans/2026-08-25-narrator-voice-prompt-quality.md
git commit -s -m "feat: improve female narrator voice prompt"
```

- [ ] **Step 2: Integrate from the clean main workspace**

Because the shared main workspace currently contains another session’s unrelated staged changes, first confirm it is still unchanged and do not integrate into it until the repository integration guard accepts the state. From the main workspace, use:

```powershell
pnpm workflow:integrate codex/narrator-voice-prompt-quality --push --verify "pnpm --filter @ai-novel/shared build; pnpm --filter @ai-novel/server build; node --test server/tests/globalNarratorVoiceSettings.test.js server/tests/globalNarratorVoiceAudioContract.test.js server/tests/dramaVoiceRouting.test.js"
```

If the integration guard rejects the concurrent main workspace, stop and report the exact guard output rather than touching or stashing the other session’s edits.

- [ ] **Step 3: Verify the promoted ref and preserve concurrent work**

Run from main:

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git worktree list --porcelain
```

Confirm `HEAD` equals `origin/main`, the unrelated concurrent changes remain present, and only this task’s worktree/branch is cleaned up after successful promotion.
