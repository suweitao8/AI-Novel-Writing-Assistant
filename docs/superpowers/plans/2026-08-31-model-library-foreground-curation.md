# 模型库前景资产策展与 GLB 清洗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Cine57 模型库收敛为 36 个可用于前景交互的资产，移除背景板、场景级巨石和无效建筑碎片，并用 GLB 内容门禁阻止同类资源再次进入目录。

**Architecture:** 保留现有静态目录与外部 Cine57 导出管线，在仓库内增加独立的 GLB 清洗器、模型库质量策略和一次性策展命令。策展命令只改当前 worktree 的静态产物；质量策略读取真实 GLB、节点变换和 POSITION 包围盒，作为可重复的客户端模型库检查。

**Tech Stack:** Node.js ESM、Node built-in test runner、GLB 2.0 JSON/BIN chunk、现有 TypeScript 静态目录、pnpm、内置浏览器。

---

### Task 1: 建立旧状态会失败的模型库门禁测试

**Files:**
- Create: `scripts/models/model-library-quality.test.mjs`
- Modify: `package.json`（添加 `test:model-library` 脚本）

- [ ] **Step 1: 写失败测试**

测试先从现有 `client/src/config/modelLibrary.ts` 读取目录，固定本次审计结论：8 个移出 ID 不得出现，目录必须有 36 项；逐项读取真实 GLB，检查节点/mesh 不得有 `UCX_*` 或高阶 `LOD` 名称，并检查目录引用的文件存在。测试使用 `node:assert/strict`，不 mock 文件系统。

```js
const REMOVED_IDS = new Set([
  "z-backdrop-01a", "big-rock-01", "flat-rock-01",
  "brick-stove-1", "brick-stove-2", "brick-stove-3",
  "decorative-1", "decorative-2",
]);

test("Cine57 目录只发布前景交互资产", () => {
  assert.equal(MODEL_LIBRARY.length, 36);
  assert.deepEqual(
    MODEL_LIBRARY.filter((entry) => REMOVED_IDS.has(entry.id)).map((entry) => entry.id),
    [],
  );
});
```

- [ ] **Step 2: 运行测试确认它因旧目录失败**

Run: `node --experimental-strip-types --test scripts/models/model-library-quality.test.mjs`

Expected: FAIL，断言显示当前目录仍为 44 项，而不是 36 项；不能把模块找不到或语法错误当作 RED 结果。

- [ ] **Step 3: 添加根脚本入口**

在 `package.json` 增加：

```json
"test:model-library": "node --experimental-strip-types --test scripts/models/model-library-quality.test.mjs"
```

- [ ] **Step 4: 保持失败测试可重复**

Run: `pnpm test:model-library`

Expected: 仍因当前 44 条目失败，证明 pnpm 入口实际覆盖了本次问题。

### Task 2: 实现 GLB 节点清洗和模型库质量策略

**Files:**
- Create: `scripts/models/glbSanitizer.mjs`
- Create: `scripts/models/modelLibraryQuality.mjs`
- Modify: `scripts/models/model-library-quality.test.mjs`

- [ ] **Step 1: 先增加针对现有坏产物的行为测试**

在测试中直接读取当前 `SM_Table.glb` 和 `SM_Coffee_table.glb` 的 JSON chunk，断言所有 node/mesh 名称都不包含碰撞体或高阶 LOD。该测试在当前代码上必须因 `UCX_SM_Table`、`UCX_SM_Coffee_table` 孤立节点失败，证明问题不是目录数量单一断言。随后补充一个只包含 JSON/BIN 的 GLB fixture 描述清洗器契约：一个可视节点引用 `SM_Table` mesh，一个无 mesh 的 `UCX_SM_Table` 节点，一个 `SM_Table_LOD1` mesh；清洗后的断言要求可视节点和 BIN 保留、碰撞/高阶 LOD 名称消失、所有保留 node 的 mesh 引用仍在范围内。

- [ ] **Step 2: 运行测试确认它因现有 GLB 的坏节点失败**

Run: `node --experimental-strip-types --test scripts/models/model-library-quality.test.mjs`

Expected: FAIL，失败信息指出真实 GLB 中存在 `UCX_*` 节点；如果出现模块找不到、JSON 解析错误或 fixture 格式错误，先修正测试，不能把环境错误当作 RED 结果。

- [ ] **Step 3: 实现 `glbSanitizer.mjs`**

导出 `readGlb(buffer)`、`stripUnsupportedGlb(buffer)` 和 `cleanGlbFile(filePath)`。实现必须：

1. 读取 JSON chunk 的长度和 BIN chunk 的真实偏移，不把 BIN 数据起点误算为 JSON 偏移。
2. 按 node 名和 mesh 名双层识别 `UCX`/`UBX` 等碰撞前缀以及 `LOD1+`；无 mesh 的碰撞 node 也必须删除。
3. 重映射 meshes、nodes、children、scene 根节点和存在时的 skin/animation 节点引用。
4. 保留原始 BIN 字节，只重写 JSON chunk，并按 4 字节补齐 JSON/BIN chunk。
5. 对没有需要清洗内容的 GLB 返回原始 buffer，避免无意义重写。

- [ ] **Step 4: 实现 `modelLibraryQuality.mjs`**

导出以下稳定接口与策略：

```js
export const CINE57_REMOVED_MODEL_IDS = Object.freeze([...]);
export const MAX_FOREGROUND_MODEL_DIMENSION_METERS = 5;
export function inspectGlb(buffer) { return { names, bounds, dimensions }; }
export function validateModelLibrary({ library, modelsDir }) { return errors; }
```

`inspectGlb` 使用 POSITION accessor 的 min/max（必要时从 BIN 解码）并应用 node 的 matrix 或 TRS 层级变换，返回世界空间包围盒和最大轴尺寸。`validateModelLibrary` 检查目录数量、移出 ID、GLB 文件引用、碰撞/LOD 名称、最大尺寸和悬空引用，返回可读错误而不是吞掉错误。

- [ ] **Step 5: 将测试切换到真实策略接口并运行单元测试**

测试导入上述接口，覆盖：移出 ID、孤立 node 清洗、BIN 保留、`big-rock-01` 的超尺寸诊断、最终目录中每个 GLB 的引用完整性。

Run: `pnpm test:model-library`

Expected: 清洗器 fixture 测试 PASS；现有目录门禁仍因 44 项、移出资源和超尺寸模型 FAIL，直到 Task 3 完成。

### Task 3: 执行当前 Cine57 产物策展

**Files:**
- Create: `scripts/models/curate-cine57-library.mjs`
- Modify: `client/src/config/modelLibrary.ts`（由策展命令再生）
- Delete: `client/public/models/cine57/SM_ZBackdrop_01a.glb`
- Delete: `client/public/models/cine57/SM_Big_rock_01.glb`
- Delete: `client/public/models/cine57/SM_flat_rock_01.glb`
- Delete: `client/public/models/cine57/SM_brick_stove_1.glb`
- Delete: `client/public/models/cine57/SM_brick_stove_2.glb`
- Delete: `client/public/models/cine57/SM_brick_stove_3.glb`
- Delete: `client/public/models/cine57/SM_decorative_elements_1.glb`
- Delete: `client/public/models/cine57/SM_decorative_elements_2.glb`
- Modify/Delete: `client/public/models/cine57/tex/*`（只清除不再被 36 个目录条目引用的贴图）

- [ ] **Step 1: 备份并验证原始应用产物**

在 worktree 外建立带日期的临时备份目录，复制整个 `client/public/models/cine57`，再输出 GLB 数量、贴图数量、字节总数和备份文件存在/大小检查。备份通过后才运行会删除产物的策展命令；不备份 Unreal 源目录，因为本次不改源目录。

- [ ] **Step 2: 实现策展命令**

`curate-cine57-library.mjs` 默认定位当前仓库，读取生成式目录的单行条目，使用 `CINE57_REMOVED_MODEL_IDS` 移除 8 项，按剩余条目重写分类数组；对保留 GLB 调用 `cleanGlbFile`，删除明确移出 GLB，按更新后的材质引用清理孤儿贴图，并在写入后调用 `validateModelLibrary`。遇到未知 GLB、缺失引用或门禁错误时退出非零，不静默删除。

- [ ] **Step 3: 运行策展命令**

Run: `node scripts/models/curate-cine57-library.mjs`

Expected: 输出 44 → 36 条目、8 个 GLB 被移出、保留 GLB 的孤立 `UCX_*` 节点清零；命令末尾质量校验 PASS。

- [ ] **Step 4: 检查生成差异和资源清单**

Run: `git diff --stat; git diff -- client/src/config/modelLibrary.ts; git status --short`

Expected: 目录只移除 8 个明确条目；保留目录的材质映射未被无关重写；不存在源目录或数据库改动。

### Task 4: 接入可重复门禁并修正文档契约

**Files:**
- Modify: `package.json`
- Modify: `docs/wiki/product/model-library.md`
- Modify: `scripts/models/model-library-quality.test.mjs`

- [ ] **Step 1: 接入门禁命令**

增加：

```json
"check:model-library": "node --experimental-strip-types scripts/models/curate-cine57-library.mjs --check"
```

`--check` 模式只读取目录和 GLB，不写文件；客户端测试调用 `validateModelLibrary`，从而让目录再生或新增资源在提交前暴露违规。

- [ ] **Step 2: 更新模型库 wiki**

把当前数量从 44 改为 36，记录模型库只承载前景交互道具、HDR 全景承担背景、5 米最大前景尺寸、小碎石/地毯/箱类的保留边界，以及 node/mesh 双层 GLB 清洗规则和失败诊断路径。内容写成稳定规则，不写成当前提交的文件清单。

- [ ] **Step 3: 运行门禁和测试**

Run: `pnpm check:model-library; pnpm test:model-library`

Expected: 两条命令均 PASS；门禁报告 36 个条目、0 个违规 node/mesh、最大尺寸不超过 5 米、所有目录文件存在。

### Task 5: 客户端静态检查与内置浏览器验收

**Files:**
- No additional source files; verify generated catalog and `/models` runtime.

- [ ] **Step 1: 运行代码级验证**

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: PASS，目录类型和引用没有破坏客户端编译。

- [ ] **Step 2: 使用内置浏览器走模型库主路径**

在 `http://127.0.0.1:5174/models` 检查总数为 36、分类统计无“背景”；打开并确认床、餐桌、食材/箱组合、书本、植物、小碎石仍能预览；直接访问 `/models/z-backdrop-01a`、`/models/big-rock-01`、`/models/flat-rock-01` 应显示模型不存在/回退状态而不是加载资产。记录页面截图、console 和 network 状态，不使用外部 Chrome。

- [ ] **Step 3: 处理运行环境限制**

若本地服务没有运行，只启动固定端口的既有开发服务或报告具体端口/进程阻塞；不更换端口、不重置数据库、不使用破坏性恢复参数。

### Task 6: 自测、发布说明、签名提交与集成

**Files:**
- Modify: `docs/releases/release-notes.md`（用户可见模型库变化）
- Modify: `README.md`（最新更新摘要）

- [ ] **Step 1: 按 Git 范围判断并更新用户可见说明**

使用 readme-release-updater 流程检查完整 diff。由于模型页可见资源减少且前景选择更准确，合并到当前日期的 release notes，并把 README 的“最新更新”只保留最新日期块和历史链接；不写文件路径、测试名或内部实现细节。

- [ ] **Step 2: 完成提交前自测门禁**

Run: `git diff --check; pnpm check:model-library; pnpm test:model-library; pnpm --filter @ai-novel/client typecheck`

Expected: 全部 PASS；逐项对照原始目标确认背景板、场景级巨石和建筑碎片不再进入应用模型库，箱子/书本/植物/家具仍可用，源目录与数据库未改动。

- [ ] **Step 3: 签名提交 worktree**

```bash
git add scripts/models package.json client/src/config/modelLibrary.ts client/public/models/cine57 docs/wiki/product/model-library.md docs/releases/release-notes.md README.md
git commit -s -m "fix: curate foreground model library assets"
```

- [ ] **Step 4: 从干净 main 集成、推送并复核**

在主工作区运行：

```bash
pnpm workflow:integrate codex/model-library-curation --push --verify "pnpm check:model-library && pnpm test:model-library"
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git worktree list --porcelain
```

Expected: 集成命令重新执行门禁并推送 `origin/main`；最终 `HEAD` 与 `origin/main` 相同；只清理本次创建的 worktree 和已合并分支，保留其他并行 worktree。
