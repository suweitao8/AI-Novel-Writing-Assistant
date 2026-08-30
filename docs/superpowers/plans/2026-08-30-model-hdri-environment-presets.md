# 模型预览 HDR 环境预设 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为模型编辑器和缩略图提供三种固定中心的 HDRI 环境，并消除模型页旋转摄像机时 HDR 穹顶跟随、放大导致的背景漂移。

**Architecture:** 在 `client/src/pages/models/modelLibrary3d/` 建立环境预设目录与加载门面。预设用 `radiusMeters` 表达中心到边界的真实水平半径，固定为 10/20/50；只有交给基础半径为 0.5 的 blocking3d 穹顶几何时才换算为 `radiusMeters * 2` 的实体缩放。可见穹顶固定在世界原点，环境切换采用新资源加载完成后替换旧资源的生命周期。系统设置用资产预设表展示旁白音色与三套固定 HDRI 半径；漫剧场景同样使用真实 `radiusMeters` 语义，历史 `domeRadius` 仅在兼容读取时按旧直径转换，不做数据库迁移或改变存量场景的物理尺度。

**Tech Stack:** React 19、TypeScript、Vite、PlayCanvas 2.21、Node.js `node:test`、现有 `SelectControl`、独立 Playwright CLI 浏览器。

---

## 文件责任地图

- Create: `client/src/pages/models/modelLibrary3d/studioEnvironmentPresets.ts` — 三个预设的 ID、显示名、源图、固定中心到边界半径和投影中心。
- Create: `client/src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts` — 同一源图的环境光/可见背景原子加载、过期请求丢弃和释放。
- Create: `client/tests/modelStudioEnvironment.contract.test.js` — 预设数值、资源路径、静态穹顶和缓存契约。
- Modify: `client/src/pages/models/modelLibrary3d/studioBackdrop.ts` — 使用预设源图，固定原点和固定几何尺寸，移除相机跟随。
- Modify: `client/src/pages/models/modelLibrary3d/studioLighting.ts` — 按预设生成 `envAtlas`，保留程序化与旧 HDRI 回退。
- Modify: `client/src/pages/models/modelLibrary3d/modelViewerApp.ts` — 接入环境运行时、异步切换、取景距离限制和销毁竞态处理。
- Modify: `client/src/pages/models/ModelEditorPage.tsx` — 添加环境预设选择控件和切换状态，选项展示固定半径。
- Modify: `client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx` — 用两张资产表展示旁白音色与三套固定 HDRI 预设。
- Modify: `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts` — 固定使用室内预设并提升缩略图缓存版本。
- Modify: `client/src/pages/animations/animationThumbnailStudio.ts` — 使用共享环境运行时和明确的固定半径参数。
- Create: `client/public/models/env/model-indoor-living-room.hdr` — 室内客厅 2:1 等距柱状 HDRI，中心到边界半径 10 m。
- Create: `client/public/models/env/model-outdoor-central-plaza.hdr` — 中央广场 2:1 等距柱状 HDRI，中心到边界半径 20 m。
- Create: `client/public/models/env/model-nature-grassland.hdr` — 草地自然场景 2:1 等距柱状 HDRI，中心到边界半径 50 m。
- Modify: `docs/wiki/product/model-library.md` — 记录环境预设、静态投影和资源失败模式。
- Modify: `docs/releases/release-notes.md` — 记录用户可见的环境选择和旋转稳定性。
- Modify: `README.md` — 刷新「最新更新」到最新日期块。

## Task 1: 先写预设与静态投影的失败测试

**Files:**
- Create: `client/tests/modelStudioEnvironment.contract.test.js`
- Test: `client/src/pages/models/modelLibrary3d/studioEnvironmentPresets.ts`
- Test: `client/src/pages/models/modelLibrary3d/studioBackdrop.ts`
- Test: `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`

- [ ] **Step 1: 写入红灯合同测试**

测试读取源码并断言以下合同：

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const presetSource = read("../src/pages/models/modelLibrary3d/studioEnvironmentPresets.ts");
const backdropSource = read("../src/pages/models/modelLibrary3d/studioBackdrop.ts");
const thumbnailSource = read("../src/pages/models/modelLibrary3d/thumbnailStudio.ts");

test("模型环境预设使用固定 10、20、50 米真实半径", () => {
  assert.match(presetSource, /interior/);
  assert.match(presetSource, /exterior/);
  assert.match(presetSource, /nature/);
  assert.match(presetSource, /radiusMeters:\s*10/);
  assert.match(presetSource, /radiusMeters:\s*20/);
  assert.match(presetSource, /radiusMeters:\s*50/);
  assert.match(presetSource, /getStudioEnvironmentDomeDiameterMeters/);
  assert.match(presetSource, /normalizeStudioEnvironmentRadiusMeters\(radiusMeters\)\s*\*\s*2/);
});

test("模型可见穹顶不接收相机且固定在原点", () => {
  assert.doesNotMatch(backdropSource, /camera\??\s*:/);
  assert.doesNotMatch(backdropSource, /app\.on\(["']update/);
  assert.doesNotMatch(backdropSource, /getPosition\(\)/);
  assert.match(backdropSource, /setPosition\(0,\s*0,\s*0\)/);
});

test("卡片缩略图使用共享室内默认值并刷新缓存版本", () => {
  assert.match(thumbnailSource, /DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID/);
  assert.match(thumbnailSource, /model-library:thumbnails:v16/);
});
```

- [x] **Step 2: 运行红灯测试并确认失败原因**

Run: `pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/modelStudioEnvironment.contract.test.js`

Expected: FAIL，因为固定半径预设、共享运行时和静态穹顶契约尚未实现。

- [ ] **Step 3: 提交测试基线**

Run: `git diff --check`

确认只有新合同测试被修改后提交：

```bash
git add client/tests/modelStudioEnvironment.contract.test.js
git commit -s -m "test: define model HDR environment contracts"
```

## Task 2: 建立预设目录和三张 HDRI 资源

**Files:**
- Create: `client/src/pages/models/modelLibrary3d/studioEnvironmentPresets.ts`
- Create: `client/public/models/env/model-indoor-living-room.hdr`
- Create: `client/public/models/env/model-outdoor-central-plaza.hdr`
- Create: `client/public/models/env/model-nature-grassland.hdr`
- Test: `client/tests/modelStudioEnvironment.contract.test.js`

- [ ] **Step 1: 添加纯数据预设目录**

使用以下接口和常量，产品界面直接展示中心到边界的真实半径；只有几何模块需要直径缩放值：

```ts
export const STUDIO_ENVIRONMENT_PRESET_IDS = ["interior", "exterior", "nature"] as const;
export type StudioEnvironmentPresetId = typeof STUDIO_ENVIRONMENT_PRESET_IDS[number];

export interface StudioEnvironmentPreset {
  id: StudioEnvironmentPresetId;
  label: string;
  sourceUrl: string;
  radiusMeters: number;
  projectionCenterHeightMeters: number;
  panoramaHorizonV: number;
}

export const DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID: StudioEnvironmentPresetId = "interior";

export const STUDIO_ENVIRONMENT_DIAMETER_LIMITS = { min: 5, max: 30 } as const;

export const STUDIO_ENVIRONMENT_PRESETS: Readonly<Record<StudioEnvironmentPresetId, StudioEnvironmentPreset>> = {
  interior: {
    id: "interior",
    label: "室内客厅",
    sourceUrl: "/models/env/model-indoor-living-room.hdr",
    radiusMeters: 10,
    projectionCenterHeightMeters: 1.7,
    panoramaHorizonV: 0.5,
  },
  exterior: {
    id: "exterior",
    label: "中央广场",
    sourceUrl: "/models/env/model-outdoor-central-plaza.hdr",
    radiusMeters: 20,
    projectionCenterHeightMeters: 1.7,
    panoramaHorizonV: 0.5,
  },
  nature: {
    id: "nature",
    label: "草地自然",
    sourceUrl: "/models/env/model-nature-grassland.hdr",
    radiusMeters: 50,
    projectionCenterHeightMeters: 1.7,
    panoramaHorizonV: 0.5,
  },
};

export function getStudioEnvironmentPreset(id: StudioEnvironmentPresetId): StudioEnvironmentPreset {
  return STUDIO_ENVIRONMENT_PRESETS[id] ?? STUDIO_ENVIRONMENT_PRESETS[DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID];
}

export function getStudioEnvironmentDomeDiameterMeters(radiusMeters: number): number {
  return normalizeStudioEnvironmentRadiusMeters(radiusMeters) * 2;
}
```

保留所有预设为 2:1 等距柱状、中心地平线 `v=0.5` 的契约；图片中只画固定建筑/远景/地面，不放会被模型库 3D 资产重复摆放的前景物体。

- [ ] **Step 2: 用 ImageGen 生成三张源图**

使用 `imagegen` skill，分别生成以下 2:1 equirectangular HDRI 内容：

1. “seamless 2:1 equirectangular 360-degree HDRI environment map, empty three-bedroom-one-living-room apartment living room shell, fixed walls, ceiling, windows and clean floor, no movable furniture, no people, no text, centered horizon at vertical 50%, no foreground objects crossing the horizon, photorealistic neutral daylight, clean panorama seam, high dynamic range lighting.”
2. “seamless 2:1 equirectangular 360-degree HDRI environment map, empty outdoor central plaza, open paved circular square with distant architecture and clean skyline, no people, no vehicles, no foreground props, centered horizon at vertical 50%, no text, photorealistic daylight, clean panorama seam, high dynamic range lighting.”
3. “seamless 2:1 equirectangular 360-degree HDRI environment map, wide natural grass meadow, continuous clean grass ground with distant tree line only, no rocks, shrubs, people, animals or foreground objects, centered horizon at vertical 50%, no text, photorealistic soft daylight, clean panorama seam, high dynamic range lighting.”

保存到上面三个精确路径；如果生成器输出普通 RGB 图，使用现有 Node/sharp 依赖将最终像素转换为 Radiance RGBE `.hdr`，不改变 2:1 画幅和内容；源图必须能被 PlayCanvas `loadAsset(..., "texture")` 加载。

- [ ] **Step 3: 校验资源格式、比例和路径**

Run:

```powershell
node -e "const sharp=require('./server/node_modules/sharp'); Promise.all(['client/public/models/env/model-indoor-living-room.hdr','client/public/models/env/model-outdoor-central-plaza.hdr','client/public/models/env/model-nature-grassland.hdr'].map(async p => console.log(p, await sharp(p).metadata())))"
```

Expected: 三个文件存在，宽高比为 `2:1`，格式为 HDR/RGBE 或运行时可读的等距柱状纹理；随后运行 Task 1 合同测试，预设数字和路径全部通过。

- [ ] **Step 4: 提交预设与资源**

```bash
git add client/src/pages/models/modelLibrary3d/studioEnvironmentPresets.ts client/public/models/env/model-indoor-living-room.hdr client/public/models/env/model-outdoor-central-plaza.hdr client/public/models/env/model-nature-grassland.hdr client/tests/modelStudioEnvironment.contract.test.js
git commit -s -m "feat: add model HDR environment presets"
```

## Task 3: 把环境光与可见穹顶收口到共享运行时

**Files:**
- Create: `client/src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts`
- Modify: `client/src/pages/models/modelLibrary3d/studioBackdrop.ts`
- Modify: `client/src/pages/models/modelLibrary3d/studioLighting.ts`
- Test: `client/tests/modelStudioEnvironment.contract.test.js`

- [ ] **Step 1: 先定义运行时门面**

新增 `loadStudioEnvironment(app, presetId)`，返回 `{ presetId, radiusMeters, destroy }`。它并发调用 `upgradeStudioEnvironment(app, presetId)` 和 `attachStudioBackdrop(app, { presetId, radiusMeters })`；任一请求过期、应用已销毁或新选择已经接管时，立刻销毁新返回的两套资源，不得替换当前句柄。

- [ ] **Step 2: 修改 `studioBackdrop` 的几何和锚点**

移除 `camera` 选项和 `app.on("update")` 回调，按下式建立一次性几何：

```ts
const preset = getStudioEnvironmentPreset(options.presetId ?? DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID);
const radiusMeters = normalizeStudioEnvironmentRadiusMeters(
  options.radiusMeters ?? preset.radiusMeters,
  preset.radiusMeters,
);
const domeDiameterMeters = getStudioEnvironmentDomeDiameterMeters(radiusMeters);
const centerHeight = options.projectionCenterHeightMeters ?? preset.projectionCenterHeightMeters;
const mesh = pc.Mesh.fromGeometry(
  app.graphicsDevice,
  createBackdropGeometry(centerHeight, domeDiameterMeters),
);
dome.setLocalScale(domeDiameterMeters, domeDiameterMeters, domeDiameterMeters);
dome.setPosition(0, 0, 0);
```

保持 `configureEnvironmentTexture`、cubemap 重投影和投影材质不变；`destroy()` 只释放实体、网格、材质、cubemap 和资产。

- [ ] **Step 3: 修改 `studioLighting` 按预设加载**

把 `upgradeStudioEnvironment(app)` 改为 `upgradeStudioEnvironment(app, presetId = DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID)`，优先加载预设 `sourceUrl`，失败时回退 `studio_small_03_1k.hdr`，并保留程序化 atlas。旧 `STUDIO_PANORAMA_URL` 作为兼容导出保留但不再作为新预设的首选源。

- [ ] **Step 4: 运行静态合同与已有 HDRI 测试**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/modelStudioEnvironment.contract.test.js tests/dramaBlocking3dStaticHdri.contract.test.js
```

Expected: PASS；合同必须证明模型侧无相机跟随、无 per-frame 缩放，并且漫剧现有静态环境合同仍通过。

- [ ] **Step 5: 提交环境运行时**

```bash
git add client/src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts client/src/pages/models/modelLibrary3d/studioBackdrop.ts client/src/pages/models/modelLibrary3d/studioLighting.ts client/tests/modelStudioEnvironment.contract.test.js
git commit -s -m "fix: anchor model HDR environment to world origin"
```

## Task 4: 接入模型编辑器并保留相机/模型状态

**Files:**
- Modify: `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`
- Modify: `client/src/pages/models/ModelEditorPage.tsx`
- Test: `client/tests/modelStudioEnvironment.contract.test.js`

- [ ] **Step 1: 写入切换和距离边界合同**

增加源码合同，断言 `ModelViewer` 暴露异步 `setEnvironmentPreset`，初始值为室内，环境切换不会调用 `fitView`/重置 transform，并且正常轨道距离由当前固定预设半径限制。

- [ ] **Step 2: 在 `modelViewerApp` 接入运行时**

初始化 `environmentRequestId`、`currentStudioEnvironment` 和 `destroyed`；新请求完成后才释放旧句柄。销毁时递增 request id 并释放当前句柄。环境切换只调用运行时门面和 `syncCamera()`，不触碰 `modelRoot`、`cameraState.azim/elev/focalPoint` 或 transform。

`syncCamera` 的 distance 上限用 `Math.max(0.35, radiusMeters * 0.85)`；滚轮、`fitCameraTo` 和切换预设都使用同一上限，保证常规相机不会越过有限穹顶边界。模型编辑器只切换固定预设，不提供环境动态缩放。

- [ ] **Step 3: 在模型页添加可访问选择控件**

使用 `@/components/common/SelectControl`，环境项显示中心到边界的固定半径：

```tsx
<label className="block space-y-1.5 text-xs text-muted-foreground">
  <span>预览环境</span>
  <SelectControl
    aria-label="预览环境"
    value={environmentPresetId}
    disabled={!viewer || environmentSwitching}
    onChange={(event) => void handleEnvironmentChange(event.target.value as StudioEnvironmentPresetId)}
  >
    {STUDIO_ENVIRONMENT_PRESET_IDS.map((id) => {
      const preset = getStudioEnvironmentPreset(id);
      return <option key={id} value={id}>{preset.label}（半径 {preset.radiusMeters} 米）</option>;
    })}
  </SelectControl>
</label>
```

切换期间显示现有 spinner/status，失败时 toast 并恢复上一次 ID；不添加解释性长段落，不修改任何模型资产数据。

- [ ] **Step 4: 运行客户端 typecheck 和模型合同**

Run: `pnpm --filter @ai-novel/client typecheck`

Run: `pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/modelStudioEnvironment.contract.test.js`

Expected: 两项 PASS。

- [ ] **Step 5: 提交模型编辑器接入**

```bash
git add client/src/pages/models/modelLibrary3d/modelViewerApp.ts client/src/pages/models/ModelEditorPage.tsx client/tests/modelStudioEnvironment.contract.test.js
git commit -s -m "feat: let model previews choose HDR environments"
```

## Task 5: 统一缩略图和动画缩略图调用方

**Files:**
- Modify: `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`
- Modify: `client/src/pages/animations/animationThumbnailStudio.ts`
- Test: `client/tests/modelStudioEnvironment.contract.test.js`

- [ ] **Step 1: 固定卡片缩略图环境并刷新缓存**

把 `STORAGE_KEY` 从 `model-library:thumbnails:v15` 升为 `v16`，使用 `loadStudioEnvironment(app, DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID)`；不再传入 camera。卡片队列仍串行、仍输出 288×216 JPEG。

- [ ] **Step 2: 更新动画缩略图**

使用共享运行时的室内默认值；动画缩略图需要扩大取景时显式传入固定的 `radiusMeters: 30`，保留原有取景尺寸而不让它回到相机跟随。

- [ ] **Step 3: 运行缩略图合同与完整客户端测试**

Run: `pnpm --filter @ai-novel/client test -- client/tests/modelStudioEnvironment.contract.test.js`

Run: `pnpm --filter @ai-novel/client test`

Expected: 新合同和现有客户端测试全部 PASS；浏览器 localStorage 使用新版本键，不会读取旧环境生成的卡片图。

- [ ] **Step 4: 提交缩略图接入**

```bash
git add client/src/pages/models/modelLibrary3d/thumbnailStudio.ts client/src/pages/animations/animationThumbnailStudio.ts client/tests/modelStudioEnvironment.contract.test.js
git commit -s -m "fix: stabilize model and animation thumbnails"
```

## Task 6: 更新长期文档与用户可见发布记录

**Files:**
- Modify: `docs/wiki/product/model-library.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 更新模型库 wiki**

在“环境反射”后加入稳定知识：三种预设的固定中心到边界半径 10/20/50、2:1 等距源图、几何装配时的半径到直径缩放、固定世界原点、模型页和资产预设表共享固定预设、卡片室内默认值、过期加载必须释放，以及 `domeRadius` 仍是漫剧历史直径字段。按 `Background / Decision / Current Rule / Failure Modes / Related Modules` 结构写，不写逐提交文件清单。

- [ ] **Step 2: 使用 readme-release-updater skill 检查 Git 范围**

确认此次有用户可见变化，更新 `docs/releases/release-notes.md` 当前日期块，描述“模型预览可切换室内客厅、中央广场、草地自然三种环境，中心到边界半径固定为 10/20/50 米；资产预设表统一展示旁白音色与 HDRI；环绕查看时环境中心和尺度保持稳定”。同步更新 `README.md` 的 `## 最新更新`，只保留最新日期块并链接完整发布记录。

- [ ] **Step 3: 文档一致性检查并提交**

Run: `git diff --check`

Run: `pnpm check:docs-manifest`

确认文档没有“我们改了什么”的开发叙述，且不把漫剧现有 `domeRadius` 错写成真实半径；然后：

```bash
git add docs/wiki/product/model-library.md docs/releases/release-notes.md README.md
git commit -s -m "docs: document model HDR environment workflow"
```

## Task 7: 完整自测与隔离浏览器验收

**Files:**
- Test: all changed client modules and contracts
- Artifact: temporary screenshots outside repository or `output/playwright/` removed before integration

- [ ] **Step 1: 运行代码级自测**

Run:

```powershell
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client test
pnpm --filter @ai-novel/client build
```

Expected: typecheck、客户端测试和 Vite build 全部成功。

- [ ] **Step 2: 检查固定端口并启动/复用服务**

Run from the main workspace only for diagnostics:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3100,5174
Invoke-WebRequest http://127.0.0.1:3100/api/health
```

使用现有 `5174` 服务时确认它已包含当前工作区代码；若需启动，只使用仓库固定的 `pnpm dev:raw`，不换端口、不触碰数据库。

- [ ] **Step 3: 用独立 Playwright 会话完成浏览器烟测**

使用 `$PWCLI` 的独立 session 打开 `http://127.0.0.1:5174/models/bed-12a`：

1. 等待模型、室内客厅 HDRI 和“预览环境”选择控件出现；检查 console 关键错误为 0、三张资源请求为 200。
2. 选择“中央广场（半径 20 米）”和“草地自然（半径 50 米）”，确认模型不消失、模型变换不被重置。
3. 记录右键环绕前截图，进行大幅水平旋转，再截图；确认墙面/地面边界只发生正常视角变化，没有因穹顶重定位或缩放产生跳变。
4. 回到 `/models`，确认卡片仍显示图像，并且模型缩略图使用固定室内环境。

截图保存到 `C:\Users\su\AppData\Local\Temp\ai-novel-hdr-qa-20260830`，不要将 Playwright 输出留在主工作区。

- [ ] **Step 4: 运行最终工作区审计**

Run in the feature worktree:

```powershell
git diff --check
git status --short
git worktree list --porcelain
```

Expected: 本工作区干净，所有变更已提交；其他并行 worktree 不被修改。

## Task 8: 集成主分支、推送和清理

- [ ] **Step 1: 重新读取主分支工作流并确认 feature 分支干净**

Run from `D:\Github\AI-Novel-Writing-Assistant`:

```powershell
rg -n -A 55 '^## Development Workflow' AGENTS.md
git status --short
git branch --show-current
```

主分支必须仍为 `main` 且干净；不能在主分支直接 commit、rebase、cherry-pick 或 push feature 分支。

- [ ] **Step 2: 用集成入口复跑 focused verification 并推送**

```powershell
pnpm workflow:integrate codex/hdri-environment-presets --push --verify "pnpm --filter @ai-novel/client typecheck && pnpm --filter @ai-novel/client test"
```

Expected: 集成脚本以非快进 merge commit 合并到 `main`，复跑验证后显式推送 `origin/main`；冲突或验证失败时脚本自动中止并保持主分支原状。

- [ ] **Step 3: 验证远端和清理本次 worktree**

```powershell
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
git status --short
git worktree list --porcelain
pnpm workflow:cleanup codex/hdri-environment-presets
git worktree prune
```

Expected: `HEAD` 与 `origin/main` 相同，主工作区干净；只清理本次已合并的 `AI-Novel-Writing-Assistant-hdri-environment-presets` 和本地 `codex/hdri-environment-presets` 分支，保留其他并行 worktree。
