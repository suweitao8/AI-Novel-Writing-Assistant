# 角色资产身高档案自动补齐实施计划

**Goal:** 让提取应用、角色资产卡片和 3D 分镜共享一份由角色资料推断并持久化的近似身高档案。

**Architecture:** 保留 `CharacterHeightProfileService` 作为唯一身高推断入口；小说角色的默认状态作为新资产模型的主要输入，角色级旧字段作为兼容优先输入。设定中心角色列表、创建和更新在投影前调用现有幂等 ensure 服务。

## Task 1: 写失败测试

- Modify: `server/tests/characterHeightAssetReadiness.contract.test.js`

测试读取源码并加载构建后的服务，覆盖：

1. 身高服务查询 `statesJson`，并从默认状态回退年龄、外貌和图片提示词。
2. 身高输入指纹包含合并后的默认状态资料。
3. 角色设定服务的列表、创建、更新路径都调用身高档案 ensure 服务。
4. 提取应用仍把 `ageGroup`、`appearance`、`imagePrompt` 写入默认状态，且不新增手工身高字段。

Expected: FAIL，因为当前身高服务没有读取 `statesJson`，设定服务也没有在资产边界补齐档案。

## Task 2: 修复身高推断输入

- Modify: `server/src/services/drama/visual/CharacterHeightProfileService.ts`

读取小说角色的 `statesJson`，解析默认状态并构造合并后的高度输入；保持角色级值优先、默认状态值回退。将合并结果用于 Prompt 和输入指纹，保留原有条件写入、并发合并和 fallback。

## Task 3: 让资产边界自动补齐

- Modify: `server/src/modules/novel/story-settings/application/StorySettingsService.ts`

在 `listCharacters` 投影前补齐全书角色档案；在 `createCharacter` 和 `updateCharacter` 返回前补齐当前角色档案，并将 ensure 结果投影到响应。不要引入第二套身高推断逻辑，也不要修改状态图片/音色运行时资产。

## Task 4: 更新长期文档与产品说明

- Modify: `docs/wiki/architecture/character-height-proportion.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

记录默认状态是身高推断输入、资产列表自动补齐和提取字段边界；按项目规则刷新用户可见更新说明。

## Task 5: 验证与交付

运行：

```text
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server prisma:generate
pnpm --filter @ai-novel/server build
pnpm --filter @ai-novel/client typecheck
node --test server/tests/characterHeightAssetReadiness.contract.test.js server/tests/characterHeightProfile.contract.test.js server/tests/dramaShotBlockingAutoPlanService.test.js
node --experimental-strip-types --test client/tests/storyAssetPresentationHeight.contract.test.js client/tests/referenceExtractPreviewContracts.test.js
```

确认工作树只包含本任务改动后，使用签名提交；从干净 `main` 通过 `pnpm workflow:integrate codex/character-height-extraction --verify "..." --push` 合并并推送，最后清理 worktree、检查本地与远端 SHA 一致。

