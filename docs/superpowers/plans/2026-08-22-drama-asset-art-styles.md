# 漫剧三类资产画风管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 将系统级“通用画风”改造成角色、场景、道具三套独立画风，并让资产图、状态图和分镜首帧按资产类型使用正确的提示词与固定视图规范。

**Architecture:** 用 drama.assetArtStyles AppSetting 保存三类自定义正向提示词；dramaVisualStyles.ts 提供类型化默认值、固定视图规格和固定负面约束。解析器一次加载三类风格，资产生成器选择对应类别，分镜首帧根据本镜实际出现的资产类型选择类别。前端保留 /settings/art-style 兼容路径，但页面改为“画风管理”三卡布局，小说侧只显示入口摘要。

**Tech Stack:** TypeScript、Express、Prisma AppSetting、React 19、React Query、Tailwind/shadcn UI、Node test runner、pnpm。

---

## 文件范围

### 创建

- server/src/services/settings/DramaAssetArtStyleSettingsService.ts：保存和读取三类画风自定义提示词。
- server/tests/dramaAssetArtStyleSettings.test.js：设置 payload、类别校验和损坏 JSON 回落契约。

### 修改

- server/src/services/drama/visual/dramaVisualStyles.ts：将通用画风常量改成三类资产风格常量和类别感知的提示词构建器。
- server/src/services/drama/visual/dramaArtStyleResolver.ts：解析三类资产风格，不再返回 universal。
- server/src/modules/settings/http/settingsRoutes.ts：新增三类画风 GET/PUT 路由，移除旧通用画风路由。
- server/src/services/drama/DramaCharacterImageService.ts：使用角色风格和角色四视图固定规格。
- server/src/modules/novel/story-settings/application/StoryAssetImageService.ts：使用场景/道具对应风格。
- server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts：状态图按 kind 使用对应风格和固定规格。
- server/src/services/drama/visual/DramaShotKeyframeService.ts：按镜头实际资产类型注入画风。
- server/tests/dramaArtStyle.test.js：替换通用画风测试，增加三类风格和分镜类别选择测试。
- server/tests/storyAssetStateImage.test.js：锁定状态图按资产类别使用固定格式和画风。
- client/src/api/settings.ts：替换旧通用画风 API 类型和方法。
- client/src/api/queryKeys.ts：替换 React Query key。
- client/src/pages/settings/views/ArtStyleSettingsPage.tsx：实现画风管理三卡页面。
- client/src/pages/settings/components/SettingsShell.tsx：将侧栏标签改为“画风管理”。
- client/src/pages/drama/comicDrama/components/ArtStylePanel.tsx：移除通用画风摘要，改为三类资产规范入口摘要。
- docs/wiki/architecture/visual-style-presets.md：记录三类资产画风边界和固定视图规范。
- docs/wiki/architecture/story-settings-hub.md：更新系统画风管理与小说时代/题材风格边界。
- docs/wiki/workflows/comic-drama-workflow.md：更新资产图、状态图、首帧图的画风接线。
- docs/releases/release-notes.md：加入用户可见的画风管理变化。
- README.md：刷新“最新更新”日期块并链接完整发布记录。

## Task 1: 建立三类画风领域契约

**Files:**
- Modify: server/src/services/drama/visual/dramaVisualStyles.ts
- Test: server/tests/dramaArtStyle.test.js

- [ ] **Step 1: 写三类默认配置和提示词构建器的失败测试**

在 server/tests/dramaArtStyle.test.js 中移除 DEFAULT_UNIVERSAL_ART_STYLE 测试，增加以下行为断言：

~~~js
const {
  DRAMA_ASSET_STYLE_KINDS,
  DEFAULT_DRAMA_ASSET_STYLES,
  buildAssetStylePromptLines,
  buildShotStylePromptLines,
  combineAssetStyleAvoidInstructions,
} = require("../dist/services/drama/visual/dramaVisualStyles.js");

test("三类资产默认风格拥有各自固定规格", () => {
  assert.deepEqual(DRAMA_ASSET_STYLE_KINDS, ["character", "scene", "prop"]);
  assert.match(DEFAULT_DRAMA_ASSET_STYLES.character.formatInstructions, /四个视图|四视图/);
  assert.match(DEFAULT_DRAMA_ASSET_STYLES.scene.formatInstructions, /360/);
  assert.match(DEFAULT_DRAMA_ASSET_STYLES.prop.formatInstructions, /45|三点透视/);
  assert.notEqual(
    DEFAULT_DRAMA_ASSET_STYLES.character.avoidInstructions,
    DEFAULT_DRAMA_ASSET_STYLES.scene.avoidInstructions,
  );
});

test("资产提示词只拼入自己的格式、正向画风和时代层", () => {
  const specific = { label: "现代都市", styleInstructions: "当代城市氛围" };
  const lines = buildAssetStylePromptLines("scene", DEFAULT_DRAMA_ASSET_STYLES.scene, specific);
  assert.match(lines[0], /360/);
  assert.equal(lines[1], DEFAULT_DRAMA_ASSET_STYLES.scene.styleInstructions);
  assert.equal(lines[2], specific.styleInstructions);
  assert.doesNotMatch(lines.join(" "), /四视图|45.*透视/);
});

test("分镜只拼入实际出现的资产类型", () => {
  const lines = buildShotStylePromptLines(
    DEFAULT_DRAMA_ASSET_STYLES,
    ["character", "prop"],
    null,
  );
  assert.match(lines.join(" "), /角色/);
  assert.match(lines.join(" "), /道具/);
  assert.doesNotMatch(lines.join(" "), /360.*全景/);
});

test("固定负面约束与自定义正向提示词分离", () => {
  const customCharacter = { ...DEFAULT_DRAMA_ASSET_STYLES.character, styleInstructions: "自定义角色质感" };
  const lines = buildAssetStylePromptLines("character", customCharacter, null);
  assert.match(lines.join(" "), /四视图/);
  assert.match(combineAssetStyleAvoidInstructions(customCharacter, null), /人体|视图/);
  assert.doesNotMatch(combineAssetStyleAvoidInstructions(DEFAULT_DRAMA_ASSET_STYLES.scene, null), /多肢|人体结构/);
});
~~~

- [ ] **Step 2: 运行测试确认失败原因是新契约不存在**

运行：

~~~powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaArtStyle.test.js
~~~

预期：失败，原因是新导出不存在，而不是语法错误。

- [ ] **Step 3: 实现三类风格常量和纯函数**

在 dramaVisualStyles.ts 中新增：

~~~ts
export const DRAMA_ASSET_STYLE_KINDS = ["character", "scene", "prop"] as const;
export type DramaAssetStyleKind = (typeof DRAMA_ASSET_STYLE_KINDS)[number];

export interface DramaAssetVisualStyle {
  kind: DramaAssetStyleKind;
  label: string;
  summary: string;
  formatInstructions: string;
  styleInstructions: string;
  avoidInstructions: string;
  styleTag: string;
}
~~~

为三个类别提供中文默认配置：角色固定四视图，场景固定 360° 全景，道具固定 45° 三点透视。默认正向提示词只描述相应资产的渲染质感；角色负面约束可包含人体结构，场景和道具负面约束不得包含角色人体词。

实现 buildAssetStylePromptLines(kind, asset, specific)，顺序固定为资产格式、资产标签、资产正向画风、小说时代/题材风格；实现 buildShotStylePromptLines(styles, usedKinds, specific)，只取 styleInstructions 和标签，不把资产参考图格式带进分镜首帧；实现 combineAssetStyleAvoidInstructions(asset, specific)。

- [ ] **Step 4: 运行领域测试确认通过**

~~~powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaArtStyle.test.js
~~~

预期：新增三类风格、分镜类别筛选和负面约束隔离测试全部通过；既有时代风格标记测试继续通过。

- [ ] **Step 5: 提交领域契约**

~~~powershell
git add server/src/services/drama/visual/dramaVisualStyles.ts server/tests/dramaArtStyle.test.js
git commit -s -m "refactor: split drama asset art styles"
~~~

## Task 2: 添加三类画风设置服务和 HTTP API

**Files:**
- Create: server/src/services/settings/DramaAssetArtStyleSettingsService.ts
- Modify: server/src/modules/settings/http/settingsRoutes.ts
- Create: server/tests/dramaAssetArtStyleSettings.test.js

- [ ] **Step 1: 写设置 payload 和回落行为测试**

测试以下纯行为：

~~~js
test("只接受三个资产类别", () => {
  assert.equal(normalizeDramaAssetStyleKind("character"), "character");
  assert.equal(normalizeDramaAssetStyleKind("scene"), "scene");
  assert.equal(normalizeDramaAssetStyleKind("prop"), "prop");
  assert.equal(normalizeDramaAssetStyleKind("universal"), null);
});

test("损坏配置回落为空的三类覆盖", () => {
  assert.deepEqual(parseDramaAssetArtStylePayload("损坏"), {
    characterPrompt: "",
    scenePrompt: "",
    propPrompt: "",
  });
});

test("每类提示词独立限制为 2000 字符", () => {
  assert.equal(normalizeDramaAssetStylePrompt("  角色质感  "), "角色质感");
  assert.equal(normalizeDramaAssetStylePrompt("x".repeat(2100)).length, 2000);
});
~~~

导出这些无副作用的归一函数供测试使用；数据库读写通过现有 Prisma AppSetting 适配器执行。

- [ ] **Step 2: 运行测试确认设置服务尚未存在**

~~~powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaAssetArtStyleSettings.test.js
~~~

预期：失败，原因是新设置服务模块尚未存在。

- [ ] **Step 3: 实现 AppSetting 读写服务**

新增 key drama.assetArtStyles，存储：

~~~ts
interface DramaAssetArtStyleOverrides {
  characterPrompt: string;
  scenePrompt: string;
  propPrompt: string;
}
~~~

getDramaAssetArtStyleOverrides() 在记录不存在或 JSON 损坏时返回三个空字符串；saveDramaAssetArtStyle(kind, prompt) 使用 upsert 读-改-写 JSON，只更新一个类别，避免三张卡互相覆盖；旧 key drama.universalArtStyle 不读取。

- [ ] **Step 4: 添加 GET/PUT 路由**

在 settingsRoutes.ts 注册：

~~~text
GET /drama-asset-styles
PUT /drama-asset-styles/:kind
~~~

GET 将三类 override 与 DEFAULT_DRAMA_ASSET_STYLES 合并，返回当前提示词、默认提示词、规格摘要、固定约束摘要和自定义状态。PUT 使用 Zod 校验 kind 和 { prompt: z.string().max(2000) }，保存后返回对应完整卡片数据。移除旧 /universal-art-style GET/PUT 路由及其旧服务导入。

- [ ] **Step 5: 运行服务端设置测试和类型检查**

~~~powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server typecheck
pnpm --filter @ai-novel/server build
node --test server/tests/dramaAssetArtStyleSettings.test.js
~~~

预期：类型检查成功，设置归一和回落测试通过。

- [ ] **Step 6: 提交设置 API**

~~~powershell
git add server/src/services/settings/DramaAssetArtStyleSettingsService.ts server/src/modules/settings/http/settingsRoutes.ts server/tests/dramaAssetArtStyleSettings.test.js
git commit -s -m "feat: add drama asset art style settings"
~~~

## Task 3: 改造解析器和所有图片生成链

**Files:**
- Modify: server/src/services/drama/visual/dramaArtStyleResolver.ts
- Modify: server/src/services/drama/DramaCharacterImageService.ts
- Modify: server/src/modules/novel/story-settings/application/StoryAssetImageService.ts
- Modify: server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts
- Modify: server/src/services/drama/visual/DramaShotKeyframeService.ts
- Modify: server/tests/dramaArtStyle.test.js
- Modify: server/tests/storyAssetStateImage.test.js

- [ ] **Step 1: 写解析器和调用方的失败契约测试**

增加源代码契约断言：

~~~js
assert.match(characterSource, /assets\.character/);
assert.match(storyAssetSource, /assets\.(scene|prop)/);
assert.match(stateImageSource, /assets\[kind\]/);
assert.match(keyframeSource, /buildShotStylePromptLines/);
assert.doesNotMatch(characterSource, /styleContext\.universal/);
assert.doesNotMatch(keyframeSource, /buildKeyframeStylePromptLines\(styleContext\.universal/);
~~~

增加纯函数测试，确认状态图包含所属类别的固定格式，分镜的 usedKinds 缺少某类时不会出现该类提示词。

- [ ] **Step 2: 运行 focused tests 确认旧调用仍不满足新契约**

~~~powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaArtStyle.test.js server/tests/storyAssetStateImage.test.js
~~~

预期：新增断言失败，指出旧的 universal 调用。

- [ ] **Step 3: 改造解析器返回三类风格**

让 resolveDramaArtStyleContext 返回：

~~~ts
{
  assets: {
    character: DramaAssetVisualStyle,
    scene: DramaAssetVisualStyle,
    prop: DramaAssetVisualStyle,
  },
  specific: DramaSpecificStyle | null,
}
~~~

解析器读取新的设置 override，一次将每类自定义正向提示词覆盖到对应默认值；继续按原有脚本标记、项目风格、小说默认和内置默认顺序解析 specific。配置 JSON 缺失或损坏时只回落三类默认，不改变具体时代风格解析。

- [ ] **Step 4: 改造角色、场景、道具和状态图调用方**

使用以下选择关系：

~~~text
DramaCharacterImageService              -> styleContext.assets.character
StoryAssetImageService scene           -> styleContext.assets.scene
StoryAssetImageService prop            -> styleContext.assets.prop
StoryAssetStateImageService kind       -> styleContext.assets[kind]
~~~

将各自固定 formatInstructions 注入正向提示词，将对应 avoidInstructions 与小说具体风格负面约束合并。状态图继续保留状态描述、参考状态继承和并发安全写回逻辑。

- [ ] **Step 5: 改造分镜首帧的实际资产类别判断**

在 DramaShotKeyframeService 中复用现有引用解析：

- character：selectReferencedCharacters(shot) 非空；
- scene：镜头存在 location；
- prop：matchPropsInShotText(settings.props, shot) 非空。

将这些类别传给 buildShotStylePromptLines，只加入对应的正向画风和负面约束；首帧仍使用自身的竖屏规格，不加入三类资产的参考图格式。现有角色、场景、道具参考图挂载逻辑不变。

- [ ] **Step 6: 运行生成链 focused tests**

~~~powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaArtStyle.test.js server/tests/storyAssetStateImage.test.js server/tests/dramaCharacterStateSource.test.js server/tests/dramaPipelineContract.test.js
~~~

预期：画风类别隔离、状态图格式和分镜管线契约通过。

- [ ] **Step 7: 提交生成链改造**

~~~powershell
git add server/src/services/drama/visual/dramaArtStyleResolver.ts server/src/services/drama/visual/dramaVisualStyles.ts server/src/services/drama/DramaCharacterImageService.ts server/src/modules/novel/story-settings/application/StoryAssetImageService.ts server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts server/src/services/drama/visual/DramaShotKeyframeService.ts server/tests/dramaArtStyle.test.js server/tests/storyAssetStateImage.test.js
git commit -s -m "feat: route drama generation through asset styles"
~~~

## Task 4: 实现画风管理页面和入口

**Files:**
- Modify: client/src/api/settings.ts
- Modify: client/src/api/queryKeys.ts
- Modify: client/src/pages/settings/views/ArtStyleSettingsPage.tsx
- Modify: client/src/pages/settings/components/SettingsShell.tsx
- Modify: client/src/pages/drama/comicDrama/components/ArtStylePanel.tsx

- [ ] **Step 1: 写客户端 API 类型**

在 settings.ts 定义：

~~~ts
export type DramaAssetStyleKind = "character" | "scene" | "prop";

export interface DramaAssetArtStyleSetting {
  kind: DramaAssetStyleKind;
  label: string;
  summary: string;
  prompt: string;
  defaultPrompt: string;
  formatInstructions: string;
  fixedAvoidInstructions: string;
  customized: boolean;
}
~~~

定义 getDramaAssetArtStyles() 和 updateDramaAssetArtStyle(kind, { prompt })，并将 React Query key 改为 settings.dramaAssetArtStyles。

- [ ] **Step 2: 实现三卡页面**

使用现有 SettingsShell、Card、Button、toast、语义化 Tailwind token 和 lucide-react 图标，不引入新依赖。页面将 GET 结果映射成三张卡，桌面端三列、窄屏自动堆叠；每张卡独立维护 draft 和 mutation，保存/恢复默认只影响当前卡。

每张卡的交互状态：

- 首次读取显示加载状态；
- 保存中禁用当前卡按钮并显示“保存中…”；
- 成功 toast 使用“角色画风已保存”等用户视角文案；
- 失败 toast 使用 toast.error 并保留当前草稿；
- GET 失败显示重试按钮；
- textarea 使用 aria-label，错误和保存状态使用可读文本。

页面标题为“画风管理”，不再使用“通用画风”作为用户可见标题、描述或按钮。

- [ ] **Step 3: 更新系统侧栏和小说侧摘要**

把 SettingsShell 中的 通用画风 改成 画风管理，保留 /settings/art-style 路由。ArtStylePanel 不再读取旧 universal API，只展示“角色四视图 · 场景 360° 全景 · 道具 45° 透视”的简短摘要和“修改”链接。

- [ ] **Step 4: 运行客户端检查**

~~~powershell
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
~~~

预期：客户端类型检查和 Vite 构建成功。

- [ ] **Step 5: 提交客户端页面**

~~~powershell
git add client/src/api/settings.ts client/src/api/queryKeys.ts client/src/pages/settings/views/ArtStyleSettingsPage.tsx client/src/pages/settings/components/SettingsShell.tsx client/src/pages/drama/comicDrama/components/ArtStylePanel.tsx
git commit -s -m "feat: add drama asset art style manager"
~~~

## Task 5: 更新长期文档和发布说明

**Files:**
- Modify: docs/wiki/architecture/visual-style-presets.md
- Modify: docs/wiki/architecture/story-settings-hub.md
- Modify: docs/wiki/workflows/comic-drama-workflow.md
- Modify: docs/releases/release-notes.md
- Modify: README.md

- [ ] **Step 1: 更新架构 wiki**

把旧的“两层：通用画风 + 本书画风”改成“三类资产画风 + 本书时代/题材画风”，明确系统三类画风只控制资产类别的渲染质感；固定格式是角色四视图、场景 360° 全景、道具 45° 透视；分镜按实际出现类型选择画风；旧 universal key 保留但不再读取。

- [ ] **Step 2: 按 release-notes skill 更新用户可见说明**

检查当前日期 2026-08-22 的 release notes 和 README 最新更新，只合并到已有日期标题；用用户视角描述“画风管理页”和“三类资产规范”，不写内部 key、服务名、测试名或迁移过程。

- [ ] **Step 3: 检查文档 diff**

~~~powershell
git diff --check
git diff -- docs/wiki docs/releases/release-notes.md README.md
~~~

预期：没有空白错误，文档只描述稳定边界和用户可见能力。

- [ ] **Step 4: 提交文档**

~~~powershell
git add docs/wiki/architecture/visual-style-presets.md docs/wiki/architecture/story-settings-hub.md docs/wiki/workflows/comic-drama-workflow.md docs/releases/release-notes.md README.md
git commit -s -m "docs: document drama asset art style workflow"
~~~

## Task 6: 完整验证和交付前审查

**Files:**
- Verify: all files changed by Tasks 1-5

- [ ] **Step 1: 运行服务端完整 fast suite**

~~~powershell
pnpm --filter @ai-novel/server test
~~~

预期：构建成功，fast suite 0 failures。

- [ ] **Step 2: 运行客户端测试和类型检查**

~~~powershell
pnpm --filter @ai-novel/client test
pnpm --filter @ai-novel/client typecheck
~~~

预期：客户端测试和类型检查成功。

- [ ] **Step 3: 运行根级类型检查**

~~~powershell
pnpm typecheck
~~~

预期：shared、server、client 全部通过。

- [ ] **Step 4: 审查最终需求覆盖**

逐项确认：

1. 页面入口标签是“画风管理”，没有“通用画风”用户文案；
2. 页面为三张卡，角色/场景/道具固定规格分别清楚展示；
3. 每张卡只编辑自己的正向提示词；
4. 角色、场景、道具资产图和状态图不串用提示词；
5. 分镜只注入实际出现的类型；
6. 旧 universal 数据没有被删除，也没有继续进入生成链；
7. 时代/题材层没有被破坏；
8. 主工作区和其他 worktree 没有被修改。

- [ ] **Step 5: 查看最终 Git 状态和提交历史**

~~~powershell
git status --short
git log --oneline --decorate -8
git worktree list --porcelain
~~~

确认当前分支只包含本功能提交后，再进行代码审查和后续合并流程。
