# 角色状态统一入口实施计划

> **执行约束：** 每个实现单元先补失败测试，确认 RED 后再修改生产代码；所有实现、验证和提交都在本 worktree 完成，最后才合并回 `main`。

## Task 1：扩展角色状态契约与旧字段归并

**文件：**

- 修改 `shared/types/novelReferenceExtraction.ts`
- 新增 `server/tests/storyCharacterStateAssets.test.js`
- 修改 `server/tests/storyAssetStateImage.test.js`
- 修改 `server/tests/storyAssetStateVoice.test.js`

**行为：**

- 增加角色状态年龄段字段，性别继续留在角色基础字段。
- 增加纯函数 `normalizeStoryCharacterStates(states, legacy)`：无状态时创建初始状态；已有状态只补缺少的年龄段/图片提示词，不覆盖已有图片、音色和人工提示词。
- 初始状态从旧 `ageGroup/appearance/physique/attireStyle/facePrompt/voiceTexture` 无损生成；没有年龄段时默认青年。
- 后续状态未填写年龄段时继承前一状态；图片参考沿用既有 `referenceStateId` 规则。

**先写测试：**

1. 旧角色无 `statesJson` 时生成“初始状态”、青年年龄段，并把旧外貌和音色放进状态。
2. 已有状态只补缺省字段，已有图片/音色/提示词保持不变。
3. 新状态未写年龄段时继承上一状态，显式 `referenceStateId: null` 仍表示不参考。

**验证：**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/storyCharacterStateAssets.test.js
```

## Task 2：让 Story Settings 创建、读取、保存始终带初始状态

**文件：**

- 修改 `server/src/modules/novel/story-settings/application/StorySettingsService.ts`
- 修改 `server/src/modules/novel/story-settings/http/storySettingsRoutes.ts`
- 修改 `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`
- 修改 `server/src/modules/novel/story-settings/application/StoryAssetStateVoiceService.ts`
- 修改 `server/tests/storySettingsCharacterStateRoute.test.js`

**行为：**

- `listCharacters` 返回归一后的状态，并只在状态缺失/补全时把 JSON 增量写回，不清空旧字段。
- `createCharacter` 没有传状态时也创建初始状态；传入状态时按角色基础字段补全。
- `updateCharacter` 保存状态时以状态为准，旧外貌/音色字段只兼容旧调用，不再成为新 UI 的写入入口。
- 状态 schema 接受 `ageGroup`；图片/音色服务使用归一后的状态，旧角色无需先手动保存即可生成初始资产。
- 状态新音色优先使用当前状态提示词；缺少时回退父状态提示词，再回退旧角色音色字段。

**先写测试：**

1. 创建角色不传状态时返回可生成的初始状态。
2. 列表读取旧角色后会持久化状态 JSON，但不会清空旧列。
3. 旧状态生成图片/音色时能按归并出的状态 id 找到目标状态。

**验证：**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/storyCharacterStateAssets.test.js server/tests/storySettingsCharacterStateRoute.test.js server/tests/storyAssetStateImage.test.js server/tests/storyAssetStateVoice.test.js
```

## Task 3：简化角色状态编辑器与新建流程

**文件：**

- 修改 `client/src/api/story/storySettings.ts`
- 修改 `client/src/pages/novels/components/storySettings/assetForms.tsx`
- 修改 `client/src/pages/novels/components/storySettings/SettingsCharactersTab.tsx`
- 新增 `client/tests/storyCharacterStateEditor.test.js`

**行为：**

- 角色基础表单只保留姓名、性别。
- 新建角色自动带一个“初始状态”，年龄段默认青年；状态编辑器在保存前可编辑，但生成按钮保持禁用。
- 状态编辑只要求状态名、年龄段和一句变化描述；图片提示词/音色提示词折叠到高级区域，空值由提交逻辑从描述生成兼容提示词。
- 添加状态默认继承上一状态的年龄段、图片参考和状态基线；初始状态不能删除。
- 角色卡片展示初始状态和图片/音色产物，不再展示角色级外貌、音色字段。
- AI 角色草稿填入基础姓名/性别和初始状态，不再填角色级外貌、面部、音色字段。
- 继续保留未保存状态不能生成、加载/错误/成功反馈、生成后保留 image/voice 的现有交互。

**先写测试：**

- 静态契约测试确认角色基础字段不再包含外貌/图片/音色输入。
- 确认新建流程有初始状态、默认青年、简化字段、初始状态不可删除和高级提示词入口。
- 确认生成 API 仍只在已有资产 id 且状态保存后调用。

**验证：**

```powershell
node --test client/tests/storyCharacterStateEditor.test.js
pnpm --filter @ai-novel/client typecheck
```

## Task 4：统一漫剧下游读取状态并修正提示词来源

**文件：**

- 修改 `server/src/services/drama/DramaContextAssembler.ts`
- 修改 `server/src/services/drama/visual/DramaShotKeyframeService.ts`
- 修改 `server/src/services/drama/audio/DramaDialogueAudioService.ts`
- 修改 `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`
- 修改/新增 `server/tests/dramaCharacterStateSource.test.js`

**行为：**

- 小说导入漫剧时，状态列表使用同一套角色状态归并逻辑，旧角色也能拥有初始状态。
- 首帧图优先使用镜头当前状态的状态图；状态提示词包含年龄段和状态描述；无状态时回退旧角色设计稿。
- 对白配音优先使用状态音色和状态试听；无状态或未生成时回退旧 Drama 角色音色。
- 不新增第二套 Drama 状态表，保留现有 `DramaCharacter` 字段作为兼容来源。

**先写测试：**

1. 旧角色状态归并后能被 `loadNovelCharacterStatesByName` 读取。
2. 状态图片提示词包含性别/年龄段和状态变化，且仍支持上一状态参考。
3. 镜头状态音色覆盖基础音色，未生成状态仍回退基础音色。

**验证：**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaCharacterStateSource.test.js server/tests/dramaAudioState.test.js server/tests/dramaPipelineContract.test.js
```

## Task 5：文档、完整回归与合并

**文件：**

- 修改 `docs/wiki/architecture/story-settings-hub.md`
- 修改 `docs/wiki/workflows/comic-drama-workflow.md`
- 修改 `docs/releases/release-notes.md`
- 按 `readme-release-updater` 检查是否更新 `README.md`

**验证：**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server prisma:generate
pnpm --filter @ai-novel/server build
node --test server/tests/storyCharacterStateAssets.test.js server/tests/storySettingsCharacterStateRoute.test.js server/tests/storyAssetStateImage.test.js server/tests/storyAssetStateVoice.test.js server/tests/dramaCharacterStateSource.test.js server/tests/dramaAudioState.test.js server/tests/dramaPipelineContract.test.js
node --test client/tests/storyCharacterStateEditor.test.js
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
git diff --check
```

API 与浏览器验收保持固定端口：API `3100`、客户端 `5174`。验证新建角色 → 初始状态 → 生成资产 → 新增受伤状态 → 继承上一状态 → 生成新图/音色 → 漫剧首帧与配音消费状态的完整路径。完成后按项目流程提交、合并 `main`、显式推送 `origin main`，再清理本次创建的 worktree 和分支。

