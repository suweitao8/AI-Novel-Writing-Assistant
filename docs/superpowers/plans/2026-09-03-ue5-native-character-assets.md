# UE5 原生 Manny/Quinn 角色与动画资源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task with review checkpoints.

**Goal:** 将动画库和分镜 3D 草图切换到 UE5 `SK_Mannequin` 原生动画，并按结构化角色资料在 Manny、Quinn 两个默认模型之间稳定选择。

**Architecture:** 资产层在 `Cine57-exported/runs/<run-id>` 中完成 UE FBX 导出、FBX2glTF 转换和同骨架双角色 GLB 组装；应用层用共享的 `CharacterModelProfile` 合同解析角色模型档案，分镜布局持久化显式覆盖；展示层让动画详情和分镜分别加载对应的 native bundle。旧 UAL2 数据仅作为兼容读取，不再作为活动 UE 动画源。

**Tech Stack:** TypeScript、React、PlayCanvas、Express/Prisma、Zod PromptAsset、UE 5.7 Python commandlet、FBX2glTF、Node `node:test`、Python `unittest`。

---

### Task 1: 建立共享角色模型档案合同

**Files:**
- Create: `shared/types/characterModelProfile.ts`
- Modify: `shared/index.ts`
- Modify: `shared/types/novelCharacter.ts`
- Test: `client/src/config/characterModelProfile.test.mjs`

- [ ] **Step 1: Write the failing test**

测试 `resolveCharacterModelProfile`：显式 `manny/quinn` 覆盖优先；`female` 选择
`quinn`；`male` 选择 `manny`；非人/怪物的 `broad` 选择 `manny`、`slender`
选择 `quinn`；`unknown` 选择 `manny`；自由文本 `physique` 不参与判断。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test client/src/config/characterModelProfile.test.mjs`

Expected: FAIL because the shared profile module and resolver do not exist.

- [ ] **Step 3: Write minimal implementation**

定义 `CharacterModelProfileId = "manny" | "quinn"`、`CharacterBodyBuild =
"slender" | "standard" | "broad" | "unknown"`、`CharacterModelProfileOverride =
"auto" | CharacterModelProfileId`，并实现只读取结构化枚举的 resolver。将 `bodyBuild`
作为 `Character` 的可选字段，旧记录缺失时为 `unknown`。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test client/src/config/characterModelProfile.test.mjs`

Expected: PASS with all routing cases.

- [ ] **Step 5: Commit**

提交共享合同和单元测试，提交前确认没有把 `physique` 文本解析成关键词。

### Task 2: 把结构化体型接入 AI 与角色持久化

**Files:**
- Modify: `server/src/prisma/schema.prisma`
- Modify: `server/src/prisma/schema.sqlite.prisma`
- Create: `server/src/prisma/migrations/20260903090000_character_body_build/migration.sql`
- Create: `server/src/prisma/migrations.sqlite/20260903090000_character_body_build/migration.sql`
- Modify: `server/src/prompting/prompts/novel/character/characterPreparation.promptSchemas.ts`
- Modify: `server/src/prompting/prompts/novel/character/characterPreparation.prompts.ts`
- Modify: `server/src/prompting/prompts/novel/storySettings.prompts.ts`
- Modify: `server/src/modules/novel/story-settings/http/storySettingsRoutes.ts`
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsService.ts`
- Modify: `server/src/services/novel/characterPrep/CharacterPreparationService.ts`
- Modify: `server/src/services/novel/characterPrep/characterPreparationSupplemental.ts`
- Modify: `server/src/services/novel/characterPrep/characterCastGeneration.ts`
- Modify: `shared/types/novelCharacter.ts`
- Test: `server/tests/characterModelProfile.test.js`

- [ ] **Step 1: Write the failing test**

给角色创建/更新 DTO 和角色候选 schema 加入 `bodyBuild`，测试结构化值能落到 Character
输入、缺失值保持 `unknown`，并断言 `physique: "魁梧"` 不会在服务端触发额外的字符串路由。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ai-novel/server exec node --test tests/characterModelProfile.test.js`

Expected: FAIL because the schema、Prisma field and service mapping are absent.

- [ ] **Step 3: Write minimal implementation**

在角色资料生成/候选/实体草稿的结构化输出里声明 `bodyBuild` 枚举，并在提示中要求 AI
根据角色外形和非人种类输出；把该枚举写入 `Character.bodyBuild`。新增字段使用 nullable 或
默认 `unknown` 的安全迁移，既不删除已有数据，也不从自由文本反推。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ai-novel/server exec node --test tests/characterModelProfile.test.js`

Expected: PASS; then run `pnpm --filter @ai-novel/server prisma:generate`.

- [ ] **Step 5: Commit**

提交 AI schema、服务映射、Prisma schema/migrations 和测试；确认迁移只新增字段。

### Task 3: 实现 UE5 原生双档案导入管线

**Files:**
- Create: `scripts/animation/nativeCharacterImportLayout.cjs`
- Create: `scripts/animation/export_ue5_native_character_assets.py`
- Create: `scripts/animation/assemble_ue5_native_character_assets.py`
- Create: `scripts/animation/run_ue5_native_character_import.cjs`
- Create: `scripts/animation/nativeCharacterImportLayout.test.cjs`
- Create: `scripts/animation/test_assemble_ue5_native_character_assets.py`
- Modify: `scripts/animation/animationCatalogSelection.json`
- Modify: `scripts/animation/README.md`

- [ ] **Step 1: Write the failing tests**

测试 run layout 只允许 `D:/UnrealWorkspace/Cine57-exported/runs/<run-id>` 下的 `fbx`、
`glb`、`final`、`logs`、`backups` 和 manifest；测试组装器拒绝不一致的源骨架、缺少模型
skin 或动画名称重复，并能在 fixture 中把一个模型 GLB 和多个 native animation GLB
合并成 Manny/Quinn 两个输出包。

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/animation/nativeCharacterImportLayout.test.cjs`

Run: `python -m unittest scripts/animation/test_assemble_ue5_native_character_assets.py -v`

Expected: FAIL because the native layout and assembler do not exist.

- [ ] **Step 3: Write minimal implementation**

UE Python 仅按清单导出 `SKM_Manny_Simple`、`SKM_Quinn_Simple` 和四条
`/Game/Characters/Mannequins/Anims/Unarmed/Attack` `AnimSequence`；Node 入口先检查
`Anim57` 是否被编辑器占用，所有中间文件进入同一 run 目录。转换后校验每条 GLB 的
`SK_Mannequin`/skin joint 集合，再以模型 GLB 为基底合并动作轨道，不调用
`retarget_ual2.py`。最终输出为：

```text
client/public/anims/ue5/UE5_Manny_Animations.glb
client/public/anims/ue5/UE5_Quinn_Animations.glb
```

失败只保留 run 目录和备份，不触碰 UE 工程目录。

- [ ] **Step 4: Run tests to verify they pass**

Run both focused tests above, then run the commandlet only after `Anim57` 编辑器关闭：
`node scripts/animation/run_ue5_native_character_import.cjs --run-id <new-run-id>`。

Expected: 四条攻击全部导出、两个 GLB 的 skin/animation skeleton evidence 一致，发布门禁
通过；若编辑器仍打开，命令必须清晰退出且不修改工程。

- [ ] **Step 5: Commit**

提交管线脚本、清单和文档；真实 GLB 只在 commandlet 成功且门禁通过后纳入同一提交。

### Task 4: 让动画目录和预览消费 native bundle

**Files:**
- Create: `client/src/config/characterModelProfiles.ts`
- Modify: `client/src/config/animationLibrary.ts`
- Modify: `client/src/config/animationCatalogEntries.ts`
- Modify: `client/src/pages/animations/AnimationPreviewPage.tsx`
- Modify: `client/src/pages/animations/animationPreviewApp.ts`
- Modify: `client/src/pages/animations/animationThumbnailStudio.ts`
- Test: `client/src/config/characterModelProfiles.test.mjs`
- Test: `client/src/pages/animations/animationPreviewApp.test.mjs`

- [ ] **Step 1: Write the failing tests**

测试两个档案 URL、共同 UE skeleton 标识、native source 标识，以及动画条目默认选 Manny
但可按 `modelProfile` 选择 Quinn；测试 preview options 将实际 profile bundle URL 传给
加载器。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test client/src/config/characterModelProfiles.test.mjs client/src/pages/animations/animationPreviewApp.test.mjs`

Expected: FAIL because profile registry and native URL selection are absent.

- [ ] **Step 3: Write minimal implementation**

建立 `manny/quinn` profile registry，动画库把活动 UE 条目指向 native URL，并让缩略图工作室
按 profile 缓存/实例化。保留 legacy 条目用于旧内容，但不再把活动 UE 条目指向
`UAL2_UE_Anims.glb`；详情页提供一个简短的角色模型选择控件，默认 Manny。

- [ ] **Step 4: Run test to verify it passes**

Run focused tests, then `pnpm --filter @ai-novel/client typecheck`。

- [ ] **Step 5: Commit**

提交配置、预览和缩略图逻辑，升级动画缩略图缓存版本。

### Task 5: 把模型档案接入分镜 3D 草图

**Files:**
- Modify: `client/src/api/media/drama.ts`
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- Modify: `server/src/prompting/prompts/drama/shotBlockingAutoPlan.prompts.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`
- Test: `server/tests/dramaShotBlockingSketchContracts.test.js`
- Test: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerProfile.test.mjs`

- [ ] **Step 1: Write the failing tests**

测试编辑器上下文包含角色的 `gender/bodyBuild/modelProfileOverride`；旧 layout 缺失档案时
安全解析为 Manny；保存/加载保留 Quinn 覆盖；viewer 为不同 profile 实例化对应 GLB，
不会用一个 UAL2 asset 给所有演员。

- [ ] **Step 2: Run test to verify it fails**

Run focused server/client tests above。

Expected: FAIL because contract and viewer only知道 `actorAsset`/UAL2。

- [ ] **Step 3: Write minimal implementation**

服务端从角色记录返回结构化资料，自动构图输出沿用上下文确定的档案；layout actor 增加
可选 `modelProfileOverride` 和 `modelProfile`，规范化时只接受枚举。viewer 按 profile
加载并缓存两个 native containers，为每个 actor 使用 `resolveCharacterModelProfile` 的结果，
保持蓝色材质、HDRI、姿势帧和现有静态 `actionPlaying=false` 合同。Inspector 增加“角色模型”
下拉（自动/Manny/Quinn），修改时立即重建该演员实例并标记布局 dirty，保存后回载一致。

- [ ] **Step 4: Run test to verify it passes**

Run focused tests and `pnpm --filter @ai-novel/client typecheck`、
`pnpm --filter @ai-novel/server typecheck`。

- [ ] **Step 5: Commit**

提交分镜数据合同、服务端上下文、viewer profile routing 和 Inspector 交互。

### Task 6: 文档、浏览器 smoke 和真实 UE 资产验收

**Files:**
- Modify: `docs/wiki/product/model-library.md`
- Modify: `docs/wiki/debugging/` relevant native-animation page
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Update durable documentation**

把模型/动画 wiki 从“UAL2 离线重定向”更新为 UE5 native bundle + profile routing，并记录
旧布局兼容、统一 run 目录和 UE editor-open failure mode；用户可见变化同步 release notes
和 README 最新更新。

- [ ] **Step 2: Run code-level verification**

Run the focused tests from Tasks 1–5, `pnpm typecheck`, and the relevant client/server tests.

- [ ] **Step 3: Run built-in browser smoke**

使用 ZCode 内置浏览器访问 worktree lane `http://127.0.0.1:5241/animations` 和一个详情
页，再进入实际分镜草图页；确认 Manny/Quinn 选择、首帧姿势、HDRI、蓝色材质、保存回载和
控制台/网络无错误。不得切换到外部 Chrome；若 GLB 尚未因 UE 编辑器占用生成，明确记录
这个外部阻塞，不伪造通过结果。

- [ ] **Step 4: Run real UE acceptance**

关闭 `Anim57` 编辑器后运行 native import smoke，核对 run manifest、sha256、两份 GLB 的
动画数/骨骼数/片段名和四条攻击的非 T-pose 帧，再重复浏览器 smoke。

- [ ] **Step 5: Commit, integrate, push and clean**

提交前运行 release-note updater 和 self-test；在干净 main 上用
`pnpm workflow:integrate codex/ue5-native-character-assets --push --verify "<focused command>"`，
确认 `HEAD == origin/main`、主工作区干净、worktree 已清理。若真实 UE 验收因编辑器仍打开，
保持分支未完成，不声称交付完成。

