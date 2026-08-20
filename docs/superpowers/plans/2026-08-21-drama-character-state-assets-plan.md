# 漫剧角色状态资产实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在漫剧 Studio 的角色编辑入口实现状态级图片/音色资产编辑、生成、复用和下游首帧/配音消费。

**Architecture:** 继续以小说 `Character.statesJson` 作为唯一状态来源，在 shared 契约中增加状态音色和默认引用归一化；服务端在 `story-settings` 模块内提供状态音色生成服务，复用现有图片运行时与音频槽位。漫剧分镜/配音通过 `DramaContextAssembler` 读取同一状态数据，前端把状态编辑器改成左列表右详情布局。

**Tech Stack:** React 19 + Vite + TanStack Query + Tailwind semantic tokens + shadcn/ui；Express 5 + Zod + Prisma JSON 字段；Node `node:test` 契约测试；现有图片运行时、VoxCPM2/HTTP TTS provider。

---

### Task 1: 扩展状态资产契约并锁定默认规则

**Files:**
- Modify: `shared/types/novelReferenceExtraction.ts`
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsService.ts:145-168`
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts:100-180`
- Test: `server/tests/storyAssetStateImage.test.js`
- Create: `server/tests/storyAssetStateVoice.test.js`

- [ ] **Step 1: Write the failing tests**

在 `storyAssetStateImage.test.js` 增加：

```js
test("resolveStateReferenceImageUrl：未指定参考时默认取上一状态，null 才表示明确不参考", () => {
  const states = [
    { id: "s1", label: "初始", description: "", imagePrompt: "", image: { status: "done", url: "/state/s1" } },
    { id: "s2", label: "换装", description: "", imagePrompt: "" },
  ];
  assert.equal(resolveStateReferenceImageUrl(states, states[1]), "/state/s1");
  assert.equal(resolveStateReferenceImageUrl(states, { ...states[1], referenceStateId: null }), null);
});
```

在 `storyAssetStateVoice.test.js` 增加对以下行为的测试：

```js
const { getDefaultStateVoiceMode, resolvePreviousStateVoice, buildStateVoiceSynthesisInput } =
  require("../dist/modules/novel/story-settings/application/StoryAssetStateVoiceService.js");

test("状态音色默认沿用上一状态，首状态默认生成新音色", () => {
  assert.equal(getDefaultStateVoiceMode([], "s1"), "generate_new");
  assert.equal(getDefaultStateVoiceMode([{ id: "s1" }], "s2"), "reuse_previous");
});

test("沿用音色只接受上一状态已完成试听", () => {
  const states = [
    { id: "s1", voice: { status: "done", mode: "generate_new", sampleAudioUrl: "data:audio/s1" } },
    { id: "s2" },
  ];
  assert.deepEqual(resolvePreviousStateVoice(states, "s2"), { stateId: "s1", sampleAudioUrl: "data:audio/s1" });
  assert.equal(resolvePreviousStateVoice([{ id: "s1" }, { id: "s2" }], "s2"), null);
});

test("生成新音色优先使用状态提示词并传递角色名", () => {
  assert.deepEqual(buildStateVoiceSynthesisInput({ name: "林澈", voiceTexture: "基础低沉" }, {
    id: "s2", voicePrompt: "老年沙哑", description: "白发" },
  ), {
    text: "这是当前音色的试听效果，一句话就能听出年龄、语气和节奏。",
    audioType: "dialogue",
    speaker: "林澈",
    emotion: "老年沙哑",
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail for missing behavior**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/storyAssetStateImage.test.js server/tests/storyAssetStateVoice.test.js
```

Expected: the new image assertion fails because an omitted reference currently returns `null`; the voice test fails because the service does not exist. Do not change production code before observing this failure.

- [ ] **Step 3: Implement the contract and normalization**

Add `StoryAssetStateVoiceMode` and `StoryAssetStateVoice` to shared types, add optional `voice` to `StoryAssetState`, and add a shared deterministic normalizer that fills an omitted `referenceStateId` from the previous state while preserving explicit `null`.

Update `StorySettingsService.parseStates` to return normalized states. Update `AssetStatesImageService.resolveStateReferenceImageUrl` to use the previous state only when `referenceStateId === undefined`; keep explicit `null` as no reference. Ensure the state image read-modify-write path preserves `image`, `voice`, and reference fields on every state.

- [ ] **Step 4: Run the focused tests again**

Run the same commands. Expected: all image reference and voice helper tests pass.

- [ ] **Step 5: Commit the contract unit**

```powershell
git add shared/types/novelReferenceExtraction.ts server/src/modules/novel/story-settings/application/StorySettingsService.ts server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts server/tests/storyAssetStateImage.test.js server/tests/storyAssetStateVoice.test.js
git commit -m "feat: define character state asset contract"
```

### Task 2: Implement state voice generation and API

**Files:**
- Create: `server/src/modules/novel/story-settings/application/StoryAssetStateVoiceService.ts`
- Modify: `server/src/modules/novel/story-settings/http/storySettingsRoutes.ts:20-60,480-560`
- Modify: `client/src/api/story/storySettings.ts:380-410`
- Modify: `shared/types/novelReferenceExtraction.ts` only if the Task 1 contract needs a type correction
- Test: `server/tests/storyAssetStateVoice.test.js`
- Test: `server/tests/storySettingsStateVoiceRoute.test.js`

- [ ] **Step 1: Write route and service failure tests**

Add a route contract assertion that the source contains the character state `generate-voice` route, validates `mode` as `reuse_previous | generate_new`, and calls `storyAssetStateVoiceService.generateStateVoice`.

Add service tests with a stubbed Prisma character row and a stubbed speech function (or a small injected speech dependency) proving:

```js
test("reuse_previous 不调用语音服务并复制上一状态试听", async () => {
  // Given s1.voice.status=done and s2 has no voice, generateStateVoice(s2, reuse_previous)
  // returns s2.voice.mode=reuse_previous, sourceStateId=s1, sampleAudioUrl=s1.sampleAudioUrl.
});

test("generate_new 调用音频槽位并只更新目标状态", async () => {
  // Given s2.voicePrompt="老年沙哑"; assert speech input and that s1 remains byte-for-byte unchanged.
});
```

- [ ] **Step 2: Run the new tests and observe the expected RED state**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/storyAssetStateVoice.test.js server/tests/storySettingsStateVoiceRoute.test.js
```

Expected: route/service behavior is missing and the tests fail for the intended reason.

- [ ] **Step 3: Implement `StoryAssetStateVoiceService`**

The service must:

1. Load the character by `id` and verify `novelId` ownership.
2. Normalize the state list and find `stateId` plus its immediate predecessor.
3. Default the mode to `reuse_previous` when a predecessor exists, otherwise `generate_new`.
4. For reuse, require a predecessor voice with `status=done` and a non-empty `sampleAudioUrl`; copy a snapshot and record `sourceStateId` without calling `synthesizeAudioSpeech`.
5. For new generation, use `state.voicePrompt.trim()` or the character `voiceTexture.trim()`, reject an empty prompt with `AppError(400)`, call `synthesizeAudioSpeech` with `DRAMA_VOICE_SAMPLE_TEXT`, `audioType: "dialogue"`, the character name, and the prompt as `emotion`, then persist only the target state voice.
6. On synthesis failure persist a target `voice` error state and rethrow the original readable error.
7. Return the updated character settings DTO through `storySettingsService.listCharacters` so the client can replace its local states with server truth.

- [ ] **Step 4: Add the route and client API function**

Use the existing `validate` convention and route shape:

```ts
router.post(
  "/:id/settings/characters/:characterId/states/:stateId/generate-voice",
  validate({
    params: z.object({
      id: novelParams.shape.id,
      characterId: characterParams.shape.characterId,
      stateId: z.string().trim().min(1),
    }),
    body: z.object({ mode: z.enum(["reuse_previous", "generate_new"]).optional() }),
  }),
  async (req, res, next) => { /* call service and return ApiResponse */ },
);
```

Add `generateStoryCharacterStateVoice(novelId, characterId, stateId, mode?)` to the client API and type its response as `StorySettingsCharacter`.

- [ ] **Step 5: Run focused voice tests and commit**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/storyAssetStateVoice.test.js server/tests/storySettingsStateVoiceRoute.test.js
git add server/src/modules/novel/story-settings/application/StoryAssetStateVoiceService.ts server/src/modules/novel/story-settings/http/storySettingsRoutes.ts client/src/api/story/storySettings.ts server/tests/storyAssetStateVoice.test.js server/tests/storySettingsStateVoiceRoute.test.js
git commit -m "feat: generate voice assets for character states"
```

### Task 3: Make state assets flow into drama TTS and image defaults

**Files:**
- Modify: `server/src/services/drama/DramaContextAssembler.ts`
- Modify: `server/src/services/drama/audio/DramaDialogueAudioService.ts`
- Modify: `server/src/services/drama/audio/DramaAudioSegmentsService.ts`
- Modify: `server/src/services/drama/audio/TTSProviderPort.ts`
- Modify: `server/src/services/drama/audio/VoxCPM2TTSProvider.ts`
- Modify: `server/src/services/drama/production/DramaBatchOrchestrator.ts`
- Modify: `server/src/modules/drama/http/dramaRoutes.ts:765-805`
- Modify: `client/src/api/media/drama.ts:515-540`
- Modify: `client/src/pages/drama/components/DramaVisualPanel.tsx:58-60`
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx:140-190`
- Test: `server/tests/dramaStateVoice.test.js`

- [ ] **Step 1: Write failing downstream tests**

Add tests for exported pure helpers:

```js
test("镜头状态音色覆盖角色基础音色并带参考音频", () => {
  const voice = resolveVoiceForCharacterState(
    { name: "林澈", voiceProfile: JSON.stringify({ voicePrompt: "青年男声" }) },
    [{ id: "s2", label: "老年", voice: { status: "done", mode: "generate_new", sampleAudioUrl: "data:audio/elder", prompt: "老年沙哑" } }],
    "老年",
  );
  assert.equal(voice.emotion, "老年沙哑");
  assert.equal(voice.referenceAudioUrl, "data:audio/elder");
});

test("状态音色纳入 voiceKey，状态更换后旧音频为 stale", () => {
  assert.notEqual(buildDialogueVoiceKey({ voice: { name: "林澈", referenceAudioUrl: "data:audio/a" } }),
    buildDialogueVoiceKey({ voice: { name: "林澈", referenceAudioUrl: "data:audio/b" } }));
});
```

- [ ] **Step 2: Run tests and observe RED**

```powershell
node --test server/tests/dramaStateVoice.test.js
```

Expected: helpers/fields do not exist yet.

- [ ] **Step 3: Implement state voice overlay and reference audio transport**

Extend `CharacterVoice` with `sampleAudioUrl`/`referenceAudioUrl`, add a state overlay helper that matches character name and state label exactly, and use it in both `DramaDialogueAudioService` and `DramaAudioSegmentsService`. Include the resolved sample URL in the voice key.

Extend `TTSGenerationRequest` with `referenceAudioUrl` and pass it through VoxCPM2 to `synthesizeAudioSpeech`; include it in HTTP provider JSON automatically through the existing input body.

Change the keyframe route/service default to `useCharacterRefImages ?? true`, while preserving an explicit `false`. Update client keyframe payload builders to send `false` when the checkbox is intentionally cleared, and make the full visual panel default checkbox checked. The state image service’s explicit `referenceStateId: null` remains the no-reference escape hatch.

Change the batch TTS fallback provider from `mock` to registered `voxcpm2`; explicit `mock` remains available for tests and local link checks.

- [ ] **Step 4: Run downstream focused tests and commit**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaStateVoice.test.js server/tests/dramaForge.test.js server/tests/dramaPipelineContract.test.js
git add server/src/services/drama/DramaContextAssembler.ts server/src/services/drama/audio/DramaDialogueAudioService.ts server/src/services/drama/audio/DramaAudioSegmentsService.ts server/src/services/drama/audio/TTSProviderPort.ts server/src/services/drama/audio/VoxCPM2TTSProvider.ts server/src/services/drama/production/DramaBatchOrchestrator.ts server/src/modules/drama/http/dramaRoutes.ts client/src/api/media/drama.ts client/src/pages/drama/components/DramaVisualPanel.tsx client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx server/tests/dramaStateVoice.test.js
git commit -m "feat: consume character state voices in drama audio"
```

### Task 4: Build the right-side state editor

**Files:**
- Modify: `client/src/pages/novels/components/storySettings/assetForms.tsx`
- Modify: `client/src/pages/novels/components/storySettings/SettingsCharactersTab.tsx`
- Modify: `client/src/api/story/storySettings.ts`
- Test: `client/tests/storyAssetStateEditor.test.js`

- [ ] **Step 1: Write the failing client contract test**

Create a Node static contract test that reads the component source and asserts the character state editor has `grid`, a selected-state detail area, `generateStoryAssetStateImage`, `generateStoryCharacterStateVoice`, `referenceStateId: null` for explicit no-reference, `voiceMode`/`reuse_previous`, `AiButton`, audio playback, and preserves `image`/`voice` when committing a state.

- [ ] **Step 2: Run the test and verify RED**

```powershell
node --test client/tests/storyAssetStateEditor.test.js
```

Expected: the existing inline list has no right detail panel, voice API, or preserved asset fields.

- [ ] **Step 3: Implement the editor behavior**

Refactor `AssetStatesEditor` without changing its public props:

1. Keep state list in the left column and `selectedStateId` in component state. Add selects a new state, defaults `referenceStateId` to the previous state id when one exists, and defaults voice mode to reuse previous except for the first state.
2. Render the selected state’s image preview and basic fields in the right column. Use `Input`, `SelectControl`, `Card`, `Badge`, semantic tokens, and `cn()`.
3. Use `AiButton` for image and voice generation. Disable generation for unsaved draft states, while loading, or when the asset id is absent; show `toast.error` and `toast.success` from the mutation callbacks. On success replace `onChange` with returned `states` and keep the selected state.
4. Image generation calls the existing API and uses the selected `referenceStateId`; “不参考” writes explicit `null`.
5. Voice mode offers “沿用上一状态音色” and “生成新的音色”. The reuse action is disabled with no completed predecessor; new generation uses the state prompt and returns an audio player.
6. Commit a state with `image`, `voice`, `referenceStateId`, and `voicePrompt` intact; removing a state sets dependent references to `null`, not `undefined`.
7. Keep scene/prop editors functional: they use the same layout but hide voice controls and call only image generation.

Expand the character dialog width to `max-w-5xl` and keep a single-column layout below the responsive breakpoint. Replace any newly added raw color classes with semantic tokens; keep existing unrelated legacy classes unchanged unless touched by the refactor.

- [ ] **Step 4: Run client focused checks**

```powershell
node --test client/tests/storyAssetStateEditor.test.js
pnpm --filter @ai-novel/client typecheck
```

- [ ] **Step 5: Commit the UI unit**

```powershell
git add client/src/pages/novels/components/storySettings/assetForms.tsx client/src/pages/novels/components/storySettings/SettingsCharactersTab.tsx client/src/api/story/storySettings.ts client/tests/storyAssetStateEditor.test.js
git commit -m "feat: add character state asset editor"
```

### Task 5: Documentation, full verification, and acceptance

**Files:**
- Modify: `docs/wiki/architecture/story-settings-hub.md`
- Modify: `docs/wiki/workflows/comic-drama-workflow.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md` only if `readme-release-updater` determines the latest update surface needs it

- [ ] **Step 1: Update durable wiki rules**

Document the state voice schema, snapshot reuse semantics, explicit image-reference null, and the shared state→首帧/配音 consumption path. Correct existing wording that currently claims state voice is supported without describing the actual generation and overlay contract.

- [ ] **Step 2: Run the full focused regression set**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server prisma:generate
pnpm --filter @ai-novel/server build
node --test server/tests/storyAssetStateImage.test.js server/tests/storyAssetStateVoice.test.js server/tests/storySettingsStateVoiceRoute.test.js server/tests/dramaStateVoice.test.js server/tests/dramaForge.test.js server/tests/dramaPipelineContract.test.js
node --test client/tests/storyAssetStateEditor.test.js
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
git diff --check
```

- [ ] **Step 3: Run API and browser acceptance on fixed project ports**

Check port owners before starting services; keep API on `3100` and client on `5174`. With a test/demo novel that has two character states:

1. Open Studio → 资产 → 角色 → 编辑角色.
2. Select the second state; verify the right panel shows its description, image, image reference defaulting to the first state, and voice mode defaulting to reuse.
3. Generate its image and verify the server request preview/metadata contains the first state image.
4. Select “不参考”, generate again, and verify the second request has no reference image.
5. Generate a new voice for the first state; then reuse it in the second state and verify no second speech request is made for reuse.
6. Change the second state to “生成新的音色”, generate, play the returned audio, and verify a later drama TTS segment uses the state reference audio and marks old audio stale after the state voice changes.
7. Verify failure states remain visible with retryable buttons and no duplicate concurrent requests.

- [ ] **Step 4: Request code review before merge**

Use the code-review skill with base `52ba2937a3baa8c2a402a03275e36d014013579f` and the final feature commit. Fix all Critical/Important findings, then rerun the affected checks.

- [ ] **Step 5: Commit docs and integrate**

Before the user-visible commit, run `readme-release-updater` against the final Git scope. Commit docs/release notes separately if appropriate, then merge the verified branch into `main`, push explicitly with `git push origin main`, remove this worktree and branch only after the merge, and run `git worktree prune`.

