# 角色推断身高与分镜比例基准 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为小说角色和独立短剧角色建立持久化的 AI 近似身高档案，并让 3D 分镜自动构图、PlayCanvas viewer 和已保存布局使用稳定的相对比例。

**Architecture:** 在 `server/src/services/drama/visual/CharacterHeightProfileService.ts` 中集中负责身高档案的输入指纹、Prompt 调用、并发合并、条件写入和 fallback；小说 `Character` 与短剧 `DramaCharacter` 只保存版本化 JSON。blocking editor context 向客户端携带 `heightMeters`，自动构图把 AI 返回的局部比例乘到角色基础比例上，viewer 在导入旧布局时保留旧绝对缩放、对带身高元数据的新布局按当前身高等比迁移。

**Tech Stack:** Prisma 双 schema/migrations、Node/TypeScript、Zod + Prompt Registry、React 19、PlayCanvas、Node `node:test` 契约测试、Vite client typecheck。

---

### Task 1: 添加角色比例档案契约与数据库字段

**Files:**
- Modify: `server/src/prisma/schema.prisma`（`Character`、`DramaCharacter`）
- Modify: `server/src/prisma/schema.sqlite.prisma`（`Character`、`DramaCharacter`）
- Create: `server/src/prisma/migrations/20260826100000_character_height_profile/migration.sql`
- Create: `server/src/prisma/migrations.sqlite/20260826100000_character_height_profile/migration.sql`
- Create: `server/tests/characterHeightProfile.contract.test.js`

- [ ] **Step 1: Write the failing contract test**

在测试中读取两份 schema、两份 migration 和后续服务导出的常量，先断言角色表包含 `heightProfileJson`，新迁移同时为 `Character` 与 `DramaCharacter` 添加可空文本列，并断言有效身高边界为 0.7–2.4 米、默认兼容高度为 1.8 米。测试使用 `node:fs`，不触碰开发数据库。

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("双 Prisma schema 为两类角色保留身高档案字段", () => {
  for (const file of ["src/prisma/schema.prisma", "src/prisma/schema.sqlite.prisma"]) {
    const source = read(path.join("server", file));
    assert.match(source, /model Character[\s\S]*heightProfileJson\s+String\?/);
    assert.match(source, /model DramaCharacter[\s\S]*heightProfileJson\s+String\?/);
  }
});

test("身高档案迁移只新增两列", () => {
  for (const file of [
    "server/src/prisma/migrations/20260826100000_character_height_profile/migration.sql",
    "server/src/prisma/migrations.sqlite/20260826100000_character_height_profile/migration.sql",
  ]) {
    const source = read(file);
    assert.match(source, /ADD COLUMN ["`]?heightProfileJson["`]? TEXT/i);
    assert.equal((source.match(/ADD COLUMN/gi) ?? []).length, 2);
  }
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `node --test server/tests/characterHeightProfile.contract.test.js`

Expected: FAIL because the schema fields and migration files do not exist yet.

- [ ] **Step 3: Add the nullable fields and non-destructive migrations**

在两份 `Character` 与 `DramaCharacter` 模型中靠近角色描述字段加入 `heightProfileJson String?`。两份 migration 使用以下仅增列 SQL：

```sql
ALTER TABLE "Character" ADD COLUMN "heightProfileJson" TEXT;
ALTER TABLE "DramaCharacter" ADD COLUMN "heightProfileJson" TEXT;
```

迁移不删除列、不重建表、不改写已有数据。

- [ ] **Step 4: Run the contract test and Prisma schema generation**

Run: `node --test server/tests/characterHeightProfile.contract.test.js`

Expected: PASS.

Run: `pnpm --filter @ai-novel/server prisma:generate`

Expected: Prisma client generation succeeds for the selected development schema without applying a reset.

- [ ] **Step 5: Commit the data contract unit**

```bash
git add server/src/prisma server/tests/characterHeightProfile.contract.test.js
git commit -s -m "feat: add character height profile storage"
```

### Task 2: 创建注册 Prompt 和身高档案应用服务

**Files:**
- Create: `server/src/prompting/prompts/novel/characterHeightEstimate.prompts.ts`
- Modify: `server/src/prompting/registry/promptAssetLoaderEntries.ts`
- Create: `server/src/services/drama/visual/CharacterHeightProfileService.ts`
- Modify: `server/tests/characterHeightProfile.contract.test.js`

- [ ] **Step 1: Extend tests for schema parsing, fingerprint reuse rules, bounds, and proxy scale**

在测试中从编译后的服务导入 `parseCharacterHeightProfile`、`buildCharacterHeightInputFingerprint`、`createFallbackCharacterHeightProfile` 和 `heightToProxyScale`，覆盖：

```js
const service = require("../dist/services/drama/visual/CharacterHeightProfileService.js");

test("身高档案接受边界值并拒绝越界值", () => {
  assert.equal(service.parseCharacterHeightProfile(JSON.stringify({
    schemaVersion: 1, heightMeters: 0.7, confidence: 0, rationale: "边界", source: "ai",
    inputFingerprint: "sha256:a", generatedAt: "2026-08-26T00:00:00.000Z",
  })).heightMeters, 0.7);
  assert.equal(service.parseCharacterHeightProfile(JSON.stringify({
    schemaVersion: 1, heightMeters: 2.4, confidence: 1, rationale: "边界", source: "ai",
    inputFingerprint: "sha256:b", generatedAt: "2026-08-26T00:00:00.000Z",
  })).heightMeters, 2.4);
  assert.equal(service.parseCharacterHeightProfile(JSON.stringify({ heightMeters: 2.41 })), null);
  assert.equal(service.parseCharacterHeightProfile("not-json"), null);
});

test("同一角色输入产生稳定指纹，代理模型按 1.8287 米原生高度换算", () => {
  const input = { name: "小满", role: "学生", gender: "female", ageGroup: "child", physique: "娇小", appearance: "" };
  assert.equal(service.buildCharacterHeightInputFingerprint(input), service.buildCharacterHeightInputFingerprint({ ...input }));
  assert.equal(service.heightToProxyScale(1.8287), 1);
  assert.ok(service.heightToProxyScale(0.7) < service.heightToProxyScale(1.8));
});

test("fallback 档案明确标记来源且固定兼容高度", () => {
  const profile = service.createFallbackCharacterHeightProfile("sha256:f");
  assert.equal(profile.source, "fallback");
  assert.equal(profile.heightMeters, 1.8);
});
```

- [ ] **Step 2: Run the service test before implementation**

Run: `pnpm --filter @ai-novel/server build; node --test server/tests/characterHeightProfile.contract.test.js`

Expected: FAIL because the new module and registered prompt exports do not exist.

- [ ] **Step 3: Implement the structured PromptAsset**

在 `characterHeightEstimate.prompts.ts` 定义：

```ts
const outputSchema = z.object({
  heightMeters: z.number().min(0.7).max(2.4),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(240),
});
```

Prompt id 使用 `novel.character.heightEstimate`、版本 `v1`，系统消息要求根据年龄段、体型、外貌、背景和角色定位推断 3D 相对比例，禁止姓名/刻板印象单独决定结果，并要求只输出 JSON。Prompt 输入类型为 `characterJson: string`。

- [ ] **Step 4: Register the PromptAsset**

在 `promptAssetLoaderEntries` 的 novel prompt 区域加入 key `novel.character.heightEstimate@v1`，加载 `characterHeightEstimatePrompt`，确保 `listRegisteredPromptAssets()` 能发现该资产。

- [ ] **Step 5: Implement the profile service**

服务导出以下稳定纯函数与类型：

```ts
export const CHARACTER_HEIGHT_DEFAULT_METERS = 1.8;
export const CHARACTER_HEIGHT_MIN_METERS = 0.7;
export const CHARACTER_HEIGHT_MAX_METERS = 2.4;
export const CHARACTER_PROXY_NATIVE_HEIGHT_METERS = 1.8287;

export function buildCharacterHeightInputFingerprint(input: CharacterHeightInput): string;
export function parseCharacterHeightProfile(raw: string | null | undefined): CharacterHeightProfile | null;
export function createFallbackCharacterHeightProfile(inputFingerprint: string): CharacterHeightProfile;
export function heightToProxyScale(heightMeters: number): number;
```

服务方法读取小说 `Character` 或短剧 `DramaCharacter`，将参与推断字段规范化后计算 SHA-256 指纹；已有档案指纹相同则直接复用。缺失/过期时调用 `runStructuredPrompt`，把输出边界化后写入 JSON。用 `Map<string, Promise<...>>` 合并进程内同角色并发，用 `updateMany` 的 `id + updatedAt + heightProfileJson` 条件避免慢请求覆盖新编辑；条件失败时重新读取并优先返回新档案。模型异常时保存 `fallback` 档案并返回，不把关键词推断作为替代逻辑。

导出：

```ts
export async function ensureNovelCharacterHeightProfiles(novelId: string, names: string[]): Promise<Map<string, CharacterHeightProfile>>;
export async function ensureDramaCharacterHeightProfiles(projectId: string, ids: string[]): Promise<Map<string, CharacterHeightProfile>>;
```

- [ ] **Step 6: Run the tests and typecheck the server**

Run: `pnpm --filter @ai-novel/server build; node --test server/tests/characterHeightProfile.contract.test.js`

Expected: PASS.

Run: `pnpm --filter @ai-novel/server typecheck`

Expected: PASS with the prompt asset and Prisma field types generated.

- [ ] **Step 7: Commit the prompt/service unit**

```bash
git add server/src/prompting server/src/services/drama/visual/CharacterHeightProfileService.ts server/tests/characterHeightProfile.contract.test.js
git commit -s -m "feat: infer and cache character height profiles"
```

### Task 3: 把身高档案接入 blocking 上下文和自动构图

**Files:**
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- Modify: `server/src/prompting/prompts/drama/shotBlockingAutoPlan.prompts.ts`
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`
- Modify: `client/src/api/media/drama.ts`
- Modify: `server/tests/dramaShotBlockingAutoPlanService.test.js`
- Modify: `server/tests/characterHeightProfile.contract.test.js`

- [ ] **Step 1: Add failing context/auto-plan assertions**

扩展服务源代码契约测试，断言 editor actor 暴露 `heightMeters`/`heightSource`，自动构图 Prompt 文本包含“相对身高/比例”约束，并断言布局 actor 保存 `heightMeters`。增加一个直接调用 `buildDramaShotBlockingAutoPlanLayout` 的 case：输入 1.8 米角色和 0.9 米角色，AI 两者都返回 `[1,1,1]` 的局部 scale，结果中两者的实际三轴 scale 比例仍接近 `2:1`。

- [ ] **Step 2: Run the focused server tests and verify they fail**

Run: `pnpm --filter @ai-novel/server build; node --test server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/characterHeightProfile.contract.test.js`

Expected: FAIL because the actor contract has no height fields and auto-plan still passes AI absolute scales unchanged.

- [ ] **Step 3: Extend the blocking contracts with optional height metadata**

在 server/client `DramaShotBlockingSketch3DActor` 增加 `heightMeters?: number`，在 server `BlockingSketchEditorActor` 增加：

```ts
heightMeters: number;
heightSource: "ai" | "fallback" | "legacy";
heightConfidence?: number;
```

归一化布局时若存在 `heightMeters` 必须通过 0.7–2.4 范围检查；缺失字段继续合法，表示旧布局。

- [ ] **Step 4: Enrich editor actors from canonical source profiles**

在 `DramaShotBlockingSketchService`：

1. 扩展 `CharacterLite` 和 project character select，保留独立短剧角色的推断字段与档案字段。
2. `novel_import` 通过 `ensureNovelCharacterHeightProfiles` 按已引用角色名称读取小说 Character；将档案映射到 editor actors。
3. 独立短剧通过 `ensureDramaCharacterHeightProfiles` 读取项目角色；没有档案时使用 `legacy` 1.8 米。
4. 将高度、来源和置信度写入 `actorsJson`，使自动构图能看到稳定比例。

- [ ] **Step 5: Change the auto-plan Prompt and server normalizer**

Prompt 中明确 `scale` 是局部构图乘数，默认接近 `[1,1,1]`，不要通过 scale 抹平输入角色的身高差。`buildDramaShotBlockingAutoPlanLayout` 使用 `heightToProxyScale(actor.heightMeters ?? 1.8)` 乘以 AI 的三轴局部 scale，并把当前 `heightMeters` 写入布局 actor；旧测试中没有高度字段的 actor 使用 1.8 米兼容值。

- [ ] **Step 6: Run focused tests and server typecheck**

Run: `pnpm --filter @ai-novel/server build; node --test server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/characterHeightProfile.contract.test.js`

Expected: PASS, including the relative scale assertion.

Run: `pnpm --filter @ai-novel/server typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the server blocking integration**

```bash
git add server/src/services/drama/visual/DramaShotBlockingSketchService.ts server/src/prompting/prompts/drama/shotBlockingAutoPlan.prompts.ts server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts client/src/api/media/drama.ts server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/characterHeightProfile.contract.test.js
git commit -s -m "feat: apply character height to blocking plans"
```

### Task 4: 让 PlayCanvas viewer 使用角色基础比例并兼容旧布局

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`
- Create: `client/tests/dramaBlocking3dHeight.contract.test.js`

- [ ] **Step 1: Write failing viewer contract tests**

测试源代码契约先断言 viewer actor 保存 `heightMeters`，`addActor` 接受高度，创建模型时使用 `heightToProxyScale`，导出布局包含高度；再用一个纯测试 helper（从 `blocking3dMath.ts` 导出）验证：

```js
assert.deepEqual(scaleSavedActorForCurrentHeight([1, 1, 1], 1.8, 0.9), [0.5, 0.5, 0.5]);
assert.deepEqual(scaleSavedActorForCurrentHeight([1, 1, 1], undefined, 0.9), [1, 1, 1]);
```

这两条分别覆盖带元数据布局的等比迁移和旧布局原样加载。

- [ ] **Step 2: Run the client contract tests and verify they fail**

Run from `client`: `node --experimental-strip-types --test tests/dramaBlocking3dHeight.contract.test.js tests/dramaBlocking3dPage.contract.test.js`

Expected: FAIL because the viewer has one fixed scale and no height-aware migration helper.

- [ ] **Step 3: Implement height-aware viewer actors**

在 viewer actor runtime 增加 `heightMeters`；`createActor(label, index, heightMeters = 1.8)` 使用 `heightToProxyScale(heightMeters)` 设置三轴 local scale。`addActor` 新增可选第三参数，不破坏场景 3D 页面对旧签名的调用。blocking page 加入角色时传入 `actor.heightMeters`。

- [ ] **Step 4: Implement compatible layout load/export**

导出 actor 写入当前 `heightMeters`。加载 actor 时：

```ts
const heightRatio = saved.heightMeters && actor.heightMeters
  ? actor.heightMeters / saved.heightMeters
  : 1;
actor.entity.setLocalScale(
  saved.scale[0] * heightRatio,
  saved.scale[1] * heightRatio,
  saved.scale[2] * heightRatio,
);
```

缺少 `saved.heightMeters` 时保持 `heightRatio = 1`，从而保留旧布局的实际画面。将通用数值处理放到 blocking3dMath 的纯函数，viewer 只调用该函数。

- [ ] **Step 5: Run client tests and typecheck**

Run from `client`: `node --experimental-strip-types --test tests/dramaBlocking3dHeight.contract.test.js tests/dramaBlocking3dPage.contract.test.js`

Expected: PASS.

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: PASS，且场景 3D 页面仍可用默认 1.8 米参照角色。

- [ ] **Step 6: Commit the viewer unit**

```bash
git add client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx client/src/pages/drama/comicDrama/components/blocking3d/blocking3dMath.ts client/src/api/media/drama.ts client/tests/dramaBlocking3dPage.contract.test.js client/tests/dramaBlocking3dHeight.contract.test.js
git commit -s -m "feat: stabilize blocking actor proportions"
```

### Task 5: 暴露只读比例信息并同步资源投影

**Files:**
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsService.ts`
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsProjection.ts`
- Modify: `client/src/api/story/storySettings.ts`
- Modify: `client/src/components/storyAssets/storyAssetPresentation.ts`
- Modify: `client/src/pages/novels/components/storySettings/StoryAssetEditDialog.tsx`
- Create: `client/tests/storyAssetPresentation.test.js`

- [ ] **Step 1: Add failing DTO/presentation assertions**

测试先断言角色 DTO 声明 `heightProfile`，角色展示投影在档案存在时生成“约 X.XX 米” badge/detail，缺失档案时不生成身高文本。

- [ ] **Step 2: Run the focused client contract test and verify it fails**

Run from `client`: `node --experimental-strip-types --test tests/storyAssetPresentation.test.js`

Expected: FAIL because the API type and presentation have no height profile.

- [ ] **Step 3: Project the stored profile without triggering inference**

在 server `StorySettingsCharacter`、character select、`projectCharacter` 中加入可空的 `heightProfile` 只读摘要（身高、置信度、来源）。列表接口只读取已持久化 JSON，不调用 LLM；创建角色默认返回 null。client API 类型同步该结构。

- [ ] **Step 4: Add the read-only presentation**

在 `storyAssetPresentation.ts` 为已有档案添加 `约 1.72 米` badge 和 `分镜比例基准` detail；不用硬编码颜色。编辑角色弹窗只在已有档案时显示一个使用 `border-border`、`bg-muted`、语义文字 token 的只读信息块，不提供输入控件或重新估算按钮。

- [ ] **Step 5: Run tests and client typecheck**

Run from `client`: `node --experimental-strip-types --test tests/storyAssetPresentation.test.js`

Expected: PASS.

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: PASS，且所有场景/道具资产仍使用原有类型。

- [ ] **Step 6: Commit the read-only projection unit**

```bash
git add server/src/modules/novel/story-settings/application/StorySettingsService.ts server/src/modules/novel/story-settings/application/StorySettingsProjection.ts client/src/api/story/storySettings.ts client/src/components/storyAssets/storyAssetPresentation.ts client/src/pages/novels/components/storySettings/StoryAssetEditDialog.tsx client/tests/storyAssetPresentation.test.js
git commit -s -m "feat: show character proportion baseline"
```

### Task 6: 写入长期 wiki、release note 并完成回归验证

**Files:**
- Create: `docs/wiki/architecture/character-height-proportion.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`（仅在回归断言需要时）

- [ ] **Step 1: Add durable wiki guidance**

记录角色高度档案的归属、Prompt Registry 入口、指纹缓存规则、fallback 语义、旧布局迁移公式以及禁止在每镜头重新随机缩放的维护规则；不写逐文件变更清单。

- [ ] **Step 2: Use the release-note updater rules**

检查本分支相对 main 的 Git scope。因为这会改变用户看到的角色分镜比例和角色详情展示，在 `docs/releases/release-notes.md` 当日标题下合并一条面向用户的更新，并把同一最新日期摘要同步到 `README.md` 的 `## 最新更新`，不写内部文件名、Prompt id 或测试名。

- [ ] **Step 3: Run the full focused verification set**

Run:

```bash
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/characterHeightProfile.contract.test.js server/tests/dramaShotBlockingAutoPlanService.test.js
Push-Location client; node --experimental-strip-types --test tests/dramaBlocking3dHeight.contract.test.js tests/dramaBlocking3dPage.contract.test.js tests/storyAssetPresentation.test.js; Pop-Location
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/server typecheck
git diff --check
```

Expected: all commands exit 0. The direct Node test command keeps this verification focused while using the same test runner as the package scripts.

- [ ] **Step 4: Browser acceptance of relative heights and persistence**

使用本地 `5174` 页面进入一个有至少三名不同年龄/体型角色的 3D blocking 镜头，确认：

1. 角色基础高度体现大高个、普通成年人、儿童/少年差异。
2. AI 自动构图后差异仍存在，局部构图缩放不会把三者归一成相同高度。
3. 保存退出再打开后，位置、姿势、颜色和相对身高保持；旧布局没有高度字段时仍能原样显示。

按仓库 UI 验证规则，浏览器验收只记录真实页面结果，不替代类型与契约测试。

- [ ] **Step 5: Review diff, commit docs, and verify branch status**

```bash
git status --short
git diff --stat main...HEAD
git diff --check main...HEAD
git add docs/wiki/architecture/character-height-proportion.md docs/releases/release-notes.md README.md
git commit -s -m "docs: document character proportion workflow"
git status --short
```

Expected: worktree clean and only the intended feature commits are present.

### Task 7: Integrate and push through the protected workflow

**Files:**
- No new files; operate from the clean main worktree only after Task 6.

- [ ] **Step 1: Verify the implementation worktree and main are clean**

Run in the feature worktree: `git status --short` and `git log --oneline --decorate -8`.

Run in `D:\Github\AI-Novel-Writing-Assistant`: `pnpm check:workspace-integrity` and `git status --short`.

Expected: feature worktree clean, main clean, hooks installed, no unfinished `MERGE_HEAD`.

- [ ] **Step 2: Integrate with the repository entry point**

From main run:

```bash
pnpm workflow:integrate codex/character-height-proportion --verify "pnpm --filter @ai-novel/server build" --push
```

Expected: protected no-fast-forward merge, focused verification succeeds, explicit `git push origin main` completes, and the feature worktree is cleaned by the integration flow if configured.

- [ ] **Step 3: Verify final local/remote state and worktrees**

Run from main:

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main
git worktree list --porcelain
```

Expected: main is clean, `HEAD` equals `origin/main`, and no unfinished feature worktree or unmerged branch remains. Report any UI/browser limitation separately from code verification.
