# 模型预览 HDR 环境预设与固定投影设计

## Background

模型 3D 编辑器和漫剧场景 3D 编辑器都使用 PlayCanvas 的等距柱状全景图投影，但当前两条链路的环境生命周期不一致。漫剧场景把可见 HDRI 穹顶固定在世界原点；模型预览的 `studioBackdrop` 却在每一帧把穹顶移动到摄像机的 X/Z 位置，并按摄像机距离动态放大。模型页采用轨道摄像机，右键环绕会持续改变摄像机位置，因此同一张全景图的投影中心和尺度也随视角变化，表现为 HDR 背景到处移动、房间边界漂移。

模型库还只有一张室内棚拍全景，没有可复用的室内、室外和自然环境资源。用户要求三种环境，并明确要求用户调节的是“半球直径”，统一范围为 5–30 米；默认预设分别使用室内 10 米、中央广场 20 米、草地自然 30 米。

## Decision

### 1. 使用共享环境预设目录

在模型 3D 功能目录内建立类型安全的环境预设目录。预设 ID 与场景类型保持同名，但模型选择只影响当前模型页，不写入模型资产或数据库：

| 预设 | 内容 | 默认半球直径 |
| --- | --- | ---: |
| `interior` | 三室一厅的室内客厅建筑背景，保留墙体、天花、门窗和地面，不绘制可摆放的前景家具 | 10 m |
| `exterior` | 空旷的室外中央广场，远处只保留建筑和天际线 | 20 m |
| `nature` | 连续草地自然场景，近景不放置石块、灌木或其他会被拉伸的物体 | 30 m |

每个资源都是 2:1 等距柱状 HDRI 源图，显示背景和 `scene.envAtlas` 环境光使用同一张源图。预设和控件使用 `diameterMeters` 表达半球直径，并通过统一的 5–30 米归一化器；运行时按 `radius = diameterMeters / 2` 得到相机边界所需的真实半径，再把直径交给基础半径为 0.5 的 PlayCanvas 穹顶几何。

模型编辑器默认使用 `interior`，并提供一个紧凑的环境预设选择控件和 5–30 米半球直径滑块；选择或调节只改变环境，不重置模型变换和相机视角。模型库卡片缩略图固定使用 `interior`，这样同一批资产的预览基准稳定且可比较。动画缩略图继续使用室内默认环境，必要时仅通过显式的 `diameterMeters` 覆盖取景范围。

### 2. 可见 HDRI 穹顶必须固定在世界原点

`attachStudioBackdrop` 与漫剧场景环境使用相同的固定空间语义：

- 穹顶实体始终位于 `(0, 0, 0)`，Y 轴不随相机变化；
- 穹顶的几何半径只由当前预设决定，加载完成后不随相机距离重新缩放；
- 删除相机参数和 `app.on("update")` 跟随回调，右键环绕、中键平移和滚轮缩放只改变摄像机；
- 模型相机的最大取景距离不超过当前环境半径的安全范围，避免常规查看时跑到有限穹顶外；
- 纹理投影中心、地平线和贴图方向在同一预设生命周期内保持不变。

这样相机环绕时，背景只会按照固定世界环境产生正常的视角变化，不会因穹顶重新定位或缩放而改变房间的空间尺度。

### 3. 共享资源加载与切换生命周期

新增模型环境运行时门面，同时加载：

1. 选中预设的等距柱状源图，生成环境光 `envAtlas`；
2. 同一源图重投影出的可见 cubemap 和固定穹顶。

切换预设时先完成新资源加载，再释放旧的 atlas、cubemap、材质、网格和资源句柄。连续切换或页面卸载期间，过期请求生成的资源必须立即释放，不能覆盖当前选择。资源缺失时保留程序化棚拍环境并给出明确的状态错误；旧的 `studio_small_03_1k.hdr` 仍作为光照兜底，既有 `studio_panorama.png` 不被静默删除。

### 4. 系统设置资产预设表

系统设置保留原有旁白音色 API 和数据存储，但页面入口改为“资产预设”。页面用两张表展示：第一张表提供唯一的系统旁白音色描述、试听、保存和重新生成；第二张表展示三套模型/动画 HDRI 预设及其半球直径滑块。直径偏好按预设 ID 存在浏览器本机，模型编辑器、模型缩略图和动画缩略图读取同一份偏好，不把预览参数写入模型资产或漫剧场景数据。

### 5. 历史漫剧场景兼容边界

漫剧场景已有的 `NovelScene.scene3dEnvironmentJson` 和状态图优先级不改；已有状态图仍是场景环境的权威来源，不能被模型预设替换。漫剧运行时继续使用现有固定原点的环境实现。

历史场景字段 `domeRadius` 的产品语义仍是“半球直径”，基础几何半径仍为 0.5；本设计不直接把它重解释为真实半径，也不做数据库迁移。模型预设使用新的显式 `diameterMeters`，内部相机边界需要时才换算成 `diameterMeters / 2`，避免历史快照整体放大或缩小一倍。

## Data flow

```text
model editor / model thumbnail
          │
          ▼
studioEnvironmentPresets (id, sourceUrl, diameterMeters, projection settings)
          │
          ├── same equirectangular source -> EnvLighting -> scene.envAtlas
          └── same source -> cubemap -> fixed origin EnviroDome
                                      │
                                      └── camera orbit changes view only
```

## Components

- `client/src/pages/models/modelLibrary3d/studioEnvironmentPresets.ts`
  - Owns the three preset IDs, labels, source URLs, default diameters, projection defaults and the shared 5–30 meter clamp.
  - Exposes the internal diameter-to-radius conversion and browser-local diameter preferences without leaking legacy scene field names into the UI.
- `client/src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts`
  - Owns atomic loading, stale-request disposal and cleanup of lighting/background resources.
- `client/src/pages/models/modelLibrary3d/studioBackdrop.ts`
  - Loads the selected source and creates a fixed-origin visible dome; it no longer accepts or follows a camera entity.
- `client/src/pages/models/modelLibrary3d/studioLighting.ts`
  - Builds the selected preset's environment atlas and keeps the existing procedural/HDR fallback chain.
- `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`
  - Exposes asynchronous environment selection while preserving model transform/camera state and constraining normal orbit distance to the selected radius.
- `client/src/pages/models/ModelEditorPage.tsx`
  - Adds the environment selector and half-sphere diameter slider using the existing common controls; UI copy uses the 5–30 meter diameter contract.
- `client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx`
  - Presents the narrator voice and three HDRI presets in compact tables; the HDRI rows edit the shared local diameter preferences.
- `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts` and `client/src/pages/animations/animationThumbnailStudio.ts`
  - Consume the same runtime with a deterministic indoor default and invalidate model thumbnail cache after the rendering contract changes.
- `client/public/models/env/`
  - Stores the three 2:1 equirectangular HDRI resources and retains the existing fallback resources.

## Failure modes and compatibility

- A missing selected HDRI must not leave a half-loaded environment. The failed resource is cleaned up and the viewer remains usable with the previous environment or procedural fallback.
- A late environment request must never replace a newer selection or resurrect a destroyed PlayCanvas application.
- Every diameter input is normalized to 5–30 meters before geometry, camera limits or localStorage writes; values from older local preferences are clipped on read.
- The model page does not persist the selector or modify model records; the settings table persists only the preview diameter in browser-local storage, so no database migration or new server API is required.
- Scene-generated panorama URLs, scene environment JSON, scene marker snapshots and the current `domeRadius` range remain backward compatible.
- The model thumbnail cache key is incremented so existing localStorage thumbnails cannot conceal the new environment or stale projection behavior.

## Verification

### Code and contract checks

- Unit/contract tests assert all three IDs, URLs, default diameters (10/20/30), the 5–30 clamp, the diameter-to-radius conversion, and the fixed-origin/no-camera-follow invariant.
- Focused tests cover stale environment switching cleanup and the thumbnail default/cache version.
- Existing blocking 3D projection/geometry, model viewer, and scene environment tests continue to pass.
- Client typecheck/build passes for the changed UI and PlayCanvas modules.

### Browser smoke test

In an isolated browser session against `http://127.0.0.1:5174`:

1. Open `/models/<id>` and verify the model, indoor HDRI and environment selector render without console errors or failed requests.
2. Select the outdoor and nature presets; verify the displayed diameter is 20 m and 30 m, move the slider to both 5 m and 30 m, and confirm the model remains loaded.
3. Right-drag around the model for a large azimuth change and capture before/after frames; the environment must remain anchored to one world center and its boundary/scale must not jump.
4. Return to `/models` and verify thumbnails regenerate with the deterministic indoor environment.

5. Open `/settings/narrator-voice`; verify the narrator voice and three HDRI rows render, and changing a diameter updates the displayed value.

No database rows are created or modified by this smoke test.
