# 角色资产默认初始状态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让所有角色资产创建入口都自动产生一个有内容、可直接生成图片和音色的初始状态。

**Architecture:** 在共享状态契约层增加角色专用默认状态工厂；服务端的角色创建、AI 批量落库、旧数据归一化和状态资产服务都通过它获得权威首状态。客户端只负责预填同一套默认值，保存后以服务端返回值为准；后续状态继续沿用现有手动创建和继承规则。

**Tech Stack:** TypeScript、React 19、Vite、Prisma/SQLite、Node test、pnpm workspace、Tailwind 语义 token。

---

### Task 1: 增加角色默认初始状态工厂并锁定共享契约

**Files:**
- Modify: `shared/types/novelReferenceExtraction.ts`
- Test: `server/tests/storyCharacterStateAssets.test.js`

- [ ] **Step 1: Write the failing test**

在现有角色状态测试中增加两个行为测试：

```js
test("手动角色没有外貌字段时也会生成有内容的初始状态", () => {
  const state = createStoryCharacterInitialState({ name: "叶晨", gender: "male" });
  assert.equal(state.id, "initial");
  assert.equal(state.label, "初始状态");
  assert.equal(state.ageGroup, "youth");
  assert.match(state.description, /叶晨/);
  assert.match(state.description, /青年/);
  assert.match(state.description, /男性/);
  assert.ok(state.imagePrompt.trim());
  assert.ok(state.voicePrompt?.trim());
  assert.equal(state.referenceStateId, null);
});

test("角色已有外貌和音色时默认初始状态优先保留用户字段", () => {
  const state = createStoryCharacterInitialState({
    name: "叶晨",
    gender: "male",
    ageGroup: "middle",
    appearance: "黑色短发，左眉有疤",
    facePrompt: "清瘦脸型",
    voiceTexture: "低沉清晰的男声",
  });
  assert.equal(state.ageGroup, "middle");
  assert.match(state.description, /黑色短发/);
  assert.match(state.imagePrompt, /清瘦脸型/);
  assert.equal(state.voicePrompt, "低沉清晰的男声");
});
```

测试顶部从 `shared/types/novelReferenceExtraction.ts` 引入 `createStoryCharacterInitialState`。

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test server/tests/storyCharacterStateAssets.test.js
```

Expected: FAIL because `createStoryCharacterInitialState` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

在 `StoryCharacterLegacyFields` 增加可选 `name`，并新增：

```ts
export function createStoryCharacterInitialState(
  input: StoryCharacterLegacyFields = {},
): StoryAssetState {
  const ageGroup = normalizeStoryAssetAgeGroup(input.ageGroup) ?? "youth";
  const ageLabel = STORY_ASSET_AGE_LABELS[ageGroup];
  const identity = compactText(input.name, genderLabel(input.gender), ageLabel);
  const appearance = legacyAppearance(input);
  const description = input.appearance?.trim()
    || (identity ? `${identity}的常态外观` : appearance);
  const imagePrompt = compactText(input.facePrompt, identity, description) || description;
  const voicePrompt = input.voiceTexture?.trim()
    || compactText(genderLabel(input.gender), ageLabel, "自然清晰的说话声音")
    || "自然清晰的说话声音";
  return createStoryAssetInitialState({
    id: "initial",
    label: "初始状态",
    description,
    imagePrompt,
    ageGroup,
    voicePrompt,
  });
}
```

把 `normalizeStoryCharacterStates` 没有状态时的匿名对象替换为该工厂调用；有状态但首状态字段为空时，继续使用同一工厂生成缺省基线并保留已有图片/音色。

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pnpm --filter @ai-novel/shared build
node --test server/tests/storyCharacterStateAssets.test.js
```

Expected: shared build succeeds and the focused test file passes。

- [ ] **Step 5: Commit**

```powershell
git add shared/types/novelReferenceExtraction.ts server/tests/storyCharacterStateAssets.test.js
git commit -s -m "feat: add default character initial state"
```

### Task 2: 让服务端所有角色持久化入口使用默认状态工厂

**Files:**
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsStatePolicy.ts`
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsService.ts`
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsBundlePersistence.ts`
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsProjection.ts`
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetStateVoiceService.ts`
- Test: `server/tests/storySettingsCharacterStateRoute.test.js`
- Test: `server/tests/storyCharacterStateAssets.test.js`

- [ ] **Step 1: Write the failing test**

在 `storySettingsCharacterStateRoute.test.js` 增加源码契约断言，要求角色创建和批量落库把角色姓名传入统一归一化；在 `storyCharacterStateAssets.test.js` 增加 `normalizeStoryCharacterStates([], { name: "叶晨", gender: "female" })` 的非空描述断言。

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test server/tests/storySettingsCharacterStateRoute.test.js server/tests/storyCharacterStateAssets.test.js
```

Expected: the new source-contract assertion fails because current service call sites do not pass `name` into the shared character legacy input。

- [ ] **Step 3: Write minimal implementation**

按以下规则改造：

1. `StorySettingsStatePolicy.normalizeCharacterStates` 继续只做服务端门面，但向 `normalizeStoryCharacterStates` 传入包含 `name` 的 legacy 对象。
2. `StorySettingsService.createCharacter` 的 legacy 增加 `name: input.name`；`updateCharacter` 使用 `input.name ?? row.name`；列表归一化直接使用包含 `name` 的 `row`。
3. `StorySettingsBundlePersistence` 的 AI 角色落库输入增加 `name: character.name`。
4. `StorySettingsProjection`、角色生图和角色生音色使用包含 `name` 的数据库选择结果作为默认状态输入，避免旧角色首次生成资产时仍得到空白描述。
5. 保留现有 statesJson 的 CAS、运行时图片/音色保留和异常数据不自动改写规则；只替换“无状态/空字段”的默认来源。

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test server/tests/storySettingsCharacterStateRoute.test.js server/tests/storyCharacterStateAssets.test.js server/tests/storyAssetStateCas.test.js server/tests/storyAssetStateImage.test.js server/tests/storyAssetStateVoice.test.js
```

Expected: all focused server tests pass。

- [ ] **Step 5: Commit**

```powershell
git add server/src/modules/novel/story-settings server/tests/storySettingsCharacterStateRoute.test.js server/tests/storyCharacterStateAssets.test.js
git commit -s -m "fix: persist character initial state defaults"
```

### Task 3: 让前端创建入口直接显示完整初始状态

**Files:**
- Modify: `client/src/pages/novels/components/storySettings/assetForms.tsx`
- Modify: `client/src/pages/novels/components/storySettings/SettingsCharactersTab.tsx`
- Modify: `client/src/pages/drama/comicDrama/components/ExtractApplyDialog.tsx`
- Modify: `client/src/pages/drama/comicDrama/components/OutlineSettingsAside.tsx`
- Test: `client/tests/storyCharacterStateEditor.test.js`

- [ ] **Step 1: Write the failing test**

在客户端契约测试中增加断言：

```js
test("三个角色创建入口都预填非空初始状态", () => {
  assert.match(formSource, /createStoryCharacterInitialState/);
  assert.match(charactersSource, /createInitialCharacterState\(\{[^}]*gender/s);
  assert.match(extractSource, /createInitialCharacterState\(\{/);
  assert.match(outlineSource, /createInitialCharacterState\(\{/);
});
```

测试同时读取 `assetForms.tsx`、`SettingsCharactersTab.tsx`、`ExtractApplyDialog.tsx` 和 `OutlineSettingsAside.tsx`。

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test client/tests/storyCharacterStateEditor.test.js
```

Expected: FAIL because `assetForms.tsx` 当前本地构造函数对手动创建返回空描述和空图片提示词。

- [ ] **Step 3: Write minimal implementation**

在 `assetForms.tsx` 引入共享 `createStoryCharacterInitialState`，让 `createInitialCharacterState` 用姓名、性别和可选旧字段构造非空状态，同时保留调用方传入的图片/音色 runtime 字段。四个入口统一把已知的 `name`、`gender`、`ageGroup`、外观和音色传入；名称尚未填写时使用“青年角色的常态外观”这类稳定模板，输入姓名后由服务端按真实姓名再次归一化。

不改变状态编辑器的交互：初始状态仍禁删，新增状态仍默认引用上一状态，生成图/音色仍要求先保存资产。

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test client/tests/storyCharacterStateEditor.test.js
pnpm --filter @ai-novel/client exec tsc --noEmit
```

Expected: focused client test and client typecheck pass。

- [ ] **Step 5: Commit**

```powershell
git add client/src/pages/novels/components/storySettings/assetForms.tsx client/src/pages/novels/components/storySettings/SettingsCharactersTab.tsx client/src/pages/drama/comicDrama/components/ExtractApplyDialog.tsx client/src/pages/drama/comicDrama/components/OutlineSettingsAside.tsx client/tests/storyCharacterStateEditor.test.js
git commit -s -m "feat: prefill character initial state"
```

### Task 4: 更新长期文档并完成整体验证

**Files:**
- Modify: `docs/wiki/architecture/story-settings-hub.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Update durable documentation**

在 story settings wiki 的状态迁移规则中补充：角色默认初始状态由共享工厂生成，姓名/性别/年龄与已有旧字段只用于生成缺省内容，客户端不是权威来源。

- [ ] **Step 2: Update user-facing release notes**

在 `2026-08-21` 日期块追加面向用户的说明：新建角色会自动获得可编辑的初始状态，后续变化可以继续新增状态。

- [ ] **Step 3: Run focused verification**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
pnpm --filter @ai-novel/client exec tsc --noEmit
node --test server/tests/storyCharacterStateAssets.test.js server/tests/storySettingsCharacterStateRoute.test.js server/tests/storyAssetStateCas.test.js server/tests/storyAssetStateImage.test.js server/tests/storyAssetStateVoice.test.js client/tests/storyCharacterStateEditor.test.js
git diff --check
```

Expected: every command exits 0; existing client build warnings are informational only。

- [ ] **Step 4: Commit**

```powershell
git add README.md docs/wiki/architecture/story-settings-hub.md docs/releases/release-notes.md
git commit -s -m "docs: record default character initial state"
```

