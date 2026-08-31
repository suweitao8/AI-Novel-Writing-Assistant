# 现代日常前景模型库扩容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用 Cine57 已导出的现代住宅、厨房、办公、电子、卫浴和收纳候选，把模型页从 79 个静态前景模型扩充到约 180–220 个，并用可重复门禁阻止零件、重复变体和非现代场景碎片进入目录。

**Architecture:** `scripts/models/model-library-selection.json` 是新增资产的唯一策展入口；策略模块负责数量、分类、来源和候选禁用规则，历史 Cine57 构建器只转换被选的 manifest 行。转换后的 GLB 和贴图进入当前 worktree，目录通过现有策展器再生，视觉复核与内容门禁共同决定是否发布；模型页继续使用现有 flat category tabs，不新增 UI 状态。

**Tech Stack:** Node.js ESM、Node built-in test runner、Cine57 UE 5.7 manifest、FBX2glTF、FFmpeg、GLB 2.0、TypeScript 静态模型目录、PlayCanvas、pnpm、Codex 内置浏览器。

---

### Task 1: 固化扩容门禁并写出 RED 测试

**Files:**
- Modify: `scripts/models/model-library-selection.json`
- Modify: `scripts/models/modelLibraryPolicy.mjs`
- Modify: `scripts/models/model-library-quality.test.mjs`

- [ ] **Step 1: 写扩容策略测试**

在现有模型库测试中增加以下断言，使用真实 `model-library-selection.json` 和当前目录，不 mock 文件系统：

```js
test("现代日常扩容达到目标规模并覆盖高频分类", () => {
  const newAssets = CINE57_MODEL_LIBRARY_POLICY.newAssets;
  assert.ok(newAssets.length >= CINE57_MINIMUM_NEW_ASSET_COUNT);
  assert.ok(newAssets.length <= CINE57_MAXIMUM_NEW_ASSET_COUNT);
  for (const [category, minimum] of Object.entries(CINE57_MINIMUM_NEW_ASSETS_BY_CATEGORY)) {
    assert.ok(
      newAssets.filter((asset) => asset.category === category).length >= minimum,
      `${category}: expected at least ${minimum} new assets`,
    );
  }
});

test("扩容白名单不包含零件、建筑碎片或重复技术变体", () => {
  for (const asset of CINE57_MODEL_LIBRARY_POLICY.newAssets) {
    assert.equal(isRejectedExpansionMeshName(asset.meshName), false, asset.meshName);
    assert.match(asset.package, /^\/Game\//);
    assert.ok(asset.meshName.startsWith("SM_") || asset.meshName.startsWith("sm_"));
  }
});
```

同时为同一 `familyKey` 的候选增加唯一性测试；若某个候选必须保留第二个版本，选择文件必须给出不同的 `familyKey` 和 `variantReason`。

- [ ] **Step 2: 运行测试确认 RED**

Run:

```text
pnpm test:model-library
```

Expected: 当前 `newAssets` 只有 47 个，测试因扩容数量/分类门槛失败；失败必须来自断言，而不能是模块解析或测试语法错误。

- [ ] **Step 3: 增加策略字段和导出常量**

在 `model-library-selection.json` 增加明确的扩容约束：

```json
"modernExpansion": {
  "minimumNewAssetCount": 148,
  "maximumNewAssetCount": 188,
  "minimumNewAssetsByCategory": {
    "家具": 30,
    "容器与箱子": 10,
    "厨房与餐具": 20,
    "日用小物": 8,
    "书籍与办公": 20,
    "灯具": 8,
    "户外": 5,
    "卫浴": 10
  },
  "rejectedMeshNamePatterns": [
    "(?:^|_)(?:body|door|base|shelf|shelves|drawer|leg|joint|connector|power|part|piece|cover|handle|panel|screen_01_base)(?:_|$)",
    "(?:^|_)NN(?:_|$)",
    "(?:^|_)(?:antique|beerclock|decorative|chinese_lamp|chinese_vase)(?:_|$)"
  ]
}
```

在 `modelLibraryPolicy.mjs` 读取该字段，导出 `CINE57_MODEL_LIBRARY_POLICY`、`CINE57_MINIMUM_NEW_ASSET_COUNT`、`CINE57_MAXIMUM_NEW_ASSET_COUNT`、`CINE57_MINIMUM_NEW_ASSETS_BY_CATEGORY` 和 `isRejectedExpansionMeshName(meshName)`。只把这些规则用于静态资源输入门禁，不在客户端运行时隐藏已发布资源。

- [ ] **Step 4: 运行策略测试确认 GREEN**

Run:

```text
node --experimental-strip-types --test scripts/models/model-library-quality.test.mjs
```

Expected: 新测试在白名单尚未扩充前仍然明确失败；策略 JSON 能成功解析，失败原因只剩实际资产数量/覆盖不足。

### Task 2: 筛选并记录现代日常候选

**Files:**
- Modify: `scripts/models/model-library-selection.json`
- Create: `scripts/models/model-library-expansion-candidates.mjs`
- Test: `scripts/models/model-library-quality.test.mjs`

- [ ] **Step 1: 增加 manifest 选择器的失败测试**

增加纯函数测试，给出包含一个完整候选、一个 `Door` 零件、一个 `NN` 重复候选和一个未知包路径的 fixture，要求选择器只返回完整候选，并为被排除项返回稳定原因：`component`、`technical-variant` 或 `unknown-source`。

- [ ] **Step 2: 运行选择器测试确认 RED**

Run:

```text
node --experimental-strip-types --test scripts/models/model-library-quality.test.mjs
```

Expected: 因选择器接口尚未实现而失败；不能用“当前目录通过”替代这个 RED 结果。

- [ ] **Step 3: 实现候选选择器**

`model-library-expansion-candidates.mjs` 导出：

```js
export function parseJsonlManifest(text) {}
export function classifyExpansionCandidate({ meshName, packagePath }) {}
export function selectExpansionCandidates({ rows, selectedMeshNames, policy }) {}
```

实现只读取 JSONL，不启动 UE、不写模型文件。候选必须来自 `/Game/` 包路径和 `Cine57-exported3` manifest；优先完整对象、现代室内包和 LP 主版本。`selectedMeshNames` 来自策展 JSON，不用模糊词自动发布候选。对于同一系列只选 1–3 个真正用途不同的网格；零件/建筑/古典装饰和 `NN` 技术变体给出可读拒绝原因。

- [ ] **Step 4: 根据 manifest 填充 148–188 条白名单**

从 `D:\UnrealWorkspace\Cine57-exported3\_manifest_batch3.jsonl` 选择并写入 `newAssets`，使总数达到 148–188 条（当前已有 47 条，本轮再增加至少 101 条），每条至少包含：

```json
{
  "meshName": "SM_Freezer_Standing_01a",
  "id": "freezer-standing-01a",
  "name": "立式冰柜",
  "category": "厨房与餐具",
  "source": "manifest3",
  "package": "/Game/_EnvCity/Restaurant/VOL1/Meshes/LP/SM_Freezer_Standing_01a",
  "familyKey": "freezer-standing",
  "priority": "P0",
  "variantReason": "现代厨房完整冰柜"
}
```

优先加入完整的床/沙发/桌椅/柜体/书架、冰柜/咖啡机/榨汁机/微波炉/锅具/餐具/厨房容器、电脑/显示器/键鼠/电视/打印机/白板/办公用品、浴缸/马桶/淋浴/镜子/毛巾/洗衣篮/烘干机、现代台灯/吊灯/壁灯、垃圾桶/篮筐/瓶罐/保温箱，以及少量完整户外用品。不得把 `*_body`、`*_door`、`*_base`、`*_shelf`、`*_drawer`、`*_leg`、`*_joint`、`*_connector` 等组件加入白名单。

展示名和分类必须按标准缩略图/详情页语义确认，不使用英文自动翻译作为最终名称；新候选需要与现有 ID、文件名、familyKey 全局唯一。

- [ ] **Step 5: 运行白名单/分类/族唯一性测试**

Run:

```text
pnpm test:model-library
```

Expected: `newAssets` 总数达到至少 148 个（其中包含当前已发布的 47 个新增候选，即本轮再增加至少 101 个），P0 分类满足配额，没有拒绝模式、重复 ID、重复 mesh 或未解释的同族变体；此时目录文件缺失导致的门禁失败允许存在，直到转换任务完成。

### Task 3: 备份并转换选定 Cine57 资产

**Files:**
- Add: selected GLB files under `client/public/models/cine57/`
- Add: selected texture files under `client/public/models/cine57/tex/`
- Regenerate: `client/src/config/modelLibrary.ts`
- Modify: temporary copy of `build-library-v3.cjs` outside Git-tracked source, with `PUBLIC`, `TEX_OUT`, `CATALOG_TS`, `MANIFEST3` and selected-entry filter pointing to this worktree

- [ ] **Step 1: 建立并验证本地备份**

在 `D:\UnrealWorkspace` 建立带时间戳的备份目录，复制当前 worktree 的 `client/public/models/cine57` 和 `client/src/config/modelLibrary.ts`。输出并保存 GLB 数量、贴图数量、目录文件总数和总字节数；逐项检查备份文件存在且大小大于 0。备份验证失败时停止，不执行任何重写/删除。

- [ ] **Step 2: 生成只转换白名单候选的构建器副本**

复制固定路径 `%TEMP%\fbx2gltf-test\build-library-v3.cjs` 到临时构建目录，修改其路径常量到当前 worktree，并将 manifest 条目筛选为：

```js
const selected = new Set([
  ...existingStaticCatalog.map((entry) => entry.fileName.replace(/\.glb$/i, "")),
  ...policy.newAssets.map((asset) => asset.meshName),
]);
const entries = [...manifest2, ...manifest3, ...manifestExpansion]
  .filter((entry) => selected.has(path.basename(entry.package)))
  .filter((entry) => !EXCLUDE_MESH.has(path.basename(entry.package)));
```

其中 `existingStaticCatalog` 从当前 `modelLibrary.ts` 读取，`manifestExpansion` 是 `_manifest_model_expansion.jsonl`，这样重建时会保留已有的 79 个静态模型而不会丢掉自然资产；非 Cine57 的角色条目由临时合并步骤从原目录保留。保留现有 FBX2glTF、真实材质回填、FFmpeg alpha 保留、JPEG 量化和并发设置；构建器副本只能写入当前 worktree，不修改 `D:\UnrealWorkspace\Cine57` 源工程。

- [ ] **Step 3: 转换并清洗选定候选**

运行临时构建器，输出每个候选的 FBX、GLB、贴图和错误计数；转换完成后运行：

```text
node scripts/models/curate-cine57-library.mjs --apply-review-only
```

Expected: 只生成白名单候选，现有模型不被删除；所有新增 GLB 经过 node/mesh 双层 UCX/UBX/LOD 清洗，透明贴图没有被错误转成 JPG，材质引用指向当前目录。

- [ ] **Step 4: 运行 GLB 和贴图快速门禁**

Run:

```text
pnpm check:model-library
pnpm test:model-library
```

Expected: 如果有失败，错误具体指向某个候选的 GLB 引用、材质、尺寸、透明度或缺少复核记录；不得用删除质量测试或降低 5 米门槛解决。

### Task 4: 应用截图语义和实际预览复核

**Files:**
- Modify: `scripts/models/model-library-visual-review.json`
- Modify: `scripts/models/model-library-visual-review.test.mjs`
- Modify: `scripts/models/modelLibraryVisualReview.mjs` only if a new evidence field is required by an observed failure
- Modify: `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts` only for the required cache-version bump
- Modify: `client/src/pages/animations/animationThumbnailStudio.ts` only for the matching cache-version bump

- [ ] **Step 1: 为每个新增目录条目写截图复核记录**

每条新增模型都写入 `id`、实际 GLB meshName、fileName、中文 name、category、`visualDescription`、`reviewStatus: "approved"` 和 `reviewEvidence: "standard-thumbnail-audit-2026-08-31"`。语义无法从图中确认的候选标记为 rejected 并从发布白名单移除，不把英文名当作通过理由。

- [ ] **Step 2: 为透明/自然模型写真实详情页证据**

对带叶片、布料镂空、玻璃或其他透明材质的新增模型，使用内置浏览器打开 `/models/<id>`，确认模型可见、透明度正确、HDRI 光照和地面投影正常，计算已发布 GLB 与引用贴图的 SHA-256，写入：

```json
"preview": {
  "previewPath": "/models/<id>",
  "assetSha256": "<64 hex chars>",
  "renderer": "model-detail-v1",
  "renderedAt": "2026-08-31",
  "textureStatus": "opaque-or-alpha-verified"
}
```

- [ ] **Step 3: 升级自动缩略图缓存并保持用户关键帧覆盖**

模型/动画生成规则变化时分别递增 `model-library:thumbnails:v27` 和 `animation-library:thumbnails:v13` 的版本；不得删除 `animation-library:keyframes:v3`，因为它是用户主动保存的显式覆盖。

- [ ] **Step 4: 运行视觉复核测试**

Run:

```text
node --experimental-strip-types --test scripts/models/model-library-visual-review.test.mjs
pnpm test:model-library
```

Expected: 每个发布模型都有批准的复核记录，复核记录与 catalog/GLB mesh 绑定一致，实际预览证据的哈希与发布文件一致。

### Task 5: 更新长期文档和用户可见说明

**Files:**
- Modify: `docs/wiki/product/model-library.md`
- Modify: `docs/wiki/architecture/model-categories.md` only if model category ownership needs a cross-module note
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 更新模型库 wiki**

记录稳定规则：现代日常前景优先级、同源 Cine57 的 LP/NN 选择、148–188 条新增白名单范围、最终 180–220 个静态模型、分类配额、零件/古典装饰排除、真实预览证据和备份回滚路径。不要把 wiki 写成当前提交文件清单。

- [ ] **Step 2: 更新 release notes 和 README 最新更新**

按 `readme-release-updater` 流程检查 Git 范围，把用户可见内容写成“模型库新增更多现代家具、家电、办公电子、卫浴和收纳用品，按类别快速查找”，不写内部路径、manifest、测试名或实现过程；同一日期合并到现有日期块。

- [ ] **Step 3: 检查文档一致性**

Run:

```text
rg -n "79|180|220|modernExpansion|现代日常|Cine57" docs/wiki/product/model-library.md docs/releases/release-notes.md README.md
git diff --check
```

Expected: 用户可见说明与 wiki 的最终数量和优先级一致，没有将临时数量、被拒候选或开发过程写给用户。

### Task 6: 代码级验证和内置浏览器回归

**Files:**
- No new files expected; verify the generated catalog and runtime.

- [ ] **Step 1: 运行全套模型库门禁**

Run:

```text
pnpm check:model-library
pnpm test:model-library
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
git diff --check
```

Expected: 门禁报告静态模型数量在 180–220、全部引用文件存在、GLB 结构和材质通过、所有分类有实际条目；客户端 typecheck/build 退出码为 0。

- [ ] **Step 2: 启动固定端口服务并打开模型库**

只使用 `http://127.0.0.1:3100` 和 `http://127.0.0.1:5174`；若端口已有其他任务服务，复用并确认其工作树，不杀进程、不换端口。访问 `/models`，记录总数、全部分类页签计数和卡片截图。

- [ ] **Step 3: 走代表性现代日常模型路径**

在内置浏览器依次打开至少一件家具、一件厨房电器、一件办公/电子、一件卫浴、一件灯具、一件容器和一件户外模型详情页；确认卡片和详情页均能加载 GLB/贴图、光照明暗正常、接触阴影存在，console 无 error，网络无失败请求。对一个被拒的零件或不存在 ID 确认它不会出现在发布目录。

- [ ] **Step 4: 保留并记录浏览器证据**

保存关键页面截图、页面 URL、控制台 error 数量和失败请求数量；如有候选预览失败，从 `newAssets` 移除该候选并重新运行 Task 4–6，不把失败资产留在目录中等待页面隐藏。

### Task 7: 自测、签名提交、集成和收尾

**Files:**
- Stage only the intended policy, tests, generated model assets/catalog, review records and docs.

- [ ] **Step 1: 做提交前范围和自我验收**

Run:

```text
git status --short
git diff --stat
git diff --check
pnpm check:model-library
pnpm test:model-library
pnpm --filter @ai-novel/client typecheck
```

逐项确认：静态模型页确实增加高频现代日常对象；新增不是主要由小摆件/地毯组成；所有新增候选有稳定 ID、材质、使用说明、截图复核；数据库、Cine57 源工程和其他 worktree 没有变化。

- [ ] **Step 2: 签名提交扩容变更**

```text
git add scripts/models package.json client/src/config/modelLibrary.ts client/src/pages/models/modelLibrary3d/thumbnailStudio.ts client/src/pages/animations/animationThumbnailStudio.ts client/public/models/cine57 docs/wiki/product/model-library.md docs/releases/release-notes.md README.md docs/superpowers/specs/2026-08-31-model-library-modern-expansion-design.md docs/superpowers/plans/2026-08-31-model-library-modern-expansion.md
git commit -s -m "feat: expand modern foreground model library"
```

- [ ] **Step 3: 从干净 main 集成并推送**

在主工作区确认没有未提交变更后运行：

```text
pnpm workflow:integrate codex/model-library-modern-expansion --push --verify "pnpm check:model-library && pnpm test:model-library"
```

Expected: 集成脚本重新执行模型门禁、创建非 fast-forward 合并提交，并只推送 `origin/main`。

- [ ] **Step 4: 核对远端和清理本次工作树**

Run:

```text
git status --short
git rev-parse HEAD
git rev-parse origin/main
git merge-base --is-ancestor codex/model-library-modern-expansion main
git worktree list --porcelain
git worktree prune
```

确认 `HEAD == origin/main`、主工作树干净、分支已合入后删除本次 `D:\Github\AI-Novel-Writing-Assistant-model-library-modern-expansion` 工作树和 `codex/model-library-modern-expansion` 分支；保留其他并发工作树及其进程。
