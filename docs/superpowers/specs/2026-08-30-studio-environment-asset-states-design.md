# 通用环境资产状态化设计（Studio Environment Asset States）

日期：2026-08-30
状态：已批准（本文件提交后按自主执行规则直接进入实现）

## 背景

通用资产页（系统 → 通用资产）当前的三套 HDRI 环境（室内客厅 / 中央广场 / 草地自然）是客户端静态常量：固定 `.hdr` 文件 + 静态预览 PNG，用户不能改内容，也没有提示词。漫剧场景资产已经有一套"状态 + 提示词 + 描述 + 生成图片"的逻辑，生成出来的 2:1 等距柱状全景直接作为 3D 环境源（DramaScene3DPage）。

用户要求：HDR 环境完全复用场景资产的这套逻辑——有自己的状态、提示词、描述，可以在状态里生成图片，生成的图片作为模型库与动画库预览使用的 HDR 全景图。

## 决策

### 1. 宿主：AppSetting 单 key JSON（全局域），不动小说域链路

场景状态生图宿主是 `NovelScene.statesJson`（小说域），环境资产是全局域，不挂小说。存储套用 `GlobalNarratorVoiceSettingsService` 的模式：

- Prisma `AppSetting`，key = `studio.environmentAssets`，value = JSON 文档。
- 文档结构（shared 契约 `shared/types/studioEnvironmentAssets.ts`）：
  - `StudioEnvironmentAssetStateImage { status: idle|generating|done|error; url?; generatedAt?; error? }`（与 `GeneratedImageState` 兼容，runner 直接读写）
  - `StudioEnvironmentAssetState { id; label; description?; imagePrompt?; image? }`
  - `StudioEnvironmentAsset { id; label; description?; activeStateId; states[] }`
  - `StudioEnvironmentAssetDocument { environments: Record<interior|exterior|nature, StudioEnvironmentAsset> }`
- id 与 label 常量移入 shared，客户端 `studioEnvironmentPresets.ts` 从 shared 导入（sourceUrl/previewImageUrl/diameter 默认值仍留在客户端）。
- `get()` 时对缺失/半缺的环境做默认值合并：每个环境自带一个 `default` 状态（label「默认」），`activeStateId` 缺省指向第一个状态。

### 2. 生图：复用 `runImageGeneration` + 自定义 Adapter（模板 = 旧版 generateSceneImage）

`StoryAssetImageService.generateSceneImage` 的固定路径 Adapter 模式是最小可靠模板：

- `loadState/saveState` 读写 AppSetting JSON 里对应环境的对应状态；
- `diskPath(ext)` = `generated-images/studio-environments/{envId}/{stateId}.{ext}`；
- `publicUrl()` = `/api/settings/environment-assets/{envId}/states/{stateId}/image`；
- provider 走 `resolveAssetImageProvider({ kind: "scene", hasReference })`，`size = IMAGE_SPECS.scenePanorama`（2:1），negative = `SCENE_PANORAMA_LAYOUT_NEGATIVE_PROMPT + ROOM_ARCHITECTURE_NEGATIVE_PROMPT`；
- 提示词复用 `buildStateImagePrompt`（kind="scene" 分支：360° 等距柱状契约 + 分区布局行 + 建筑合理性行 + 禁活物行）。该纯函数从小说模块下沉到 `server/src/services/image/storyStateImagePrompt.ts`，原位置 re-export 保持兼容——避免 settings（低层）反向 import modules/novel（高层）。
- 生成中用内存 in-flight 表 + AbortController 支持终止（cancel/dismiss 与场景状态接口同构）。
- 参考图：支持同环境其它状态的已生成图作为参考（`refImagePaths` 指向兄弟状态的本地文件），UI 上与场景资产一致的"参考状态下拉"。
- 画风：v1 不引入 per-state 时代风格，styleLines 用默认风格行（`buildAssetStylePromptLines` + `DEFAULT_DRAMA_VISUAL_STYLE_ID`），负向词拼 `combineAssetStyleAvoidInstructions`。

### 3. 运行时：环境源解析优先状态图

- 客户端新增 `studioEnvironmentAssetSource.ts`：拉取（30s 内存 memo）`GET /api/settings/environment-assets`，提供 `resolveStudioEnvironmentSourceUrl(presetId, doc)` —— 活跃状态 `image.status === "done"` 时返回 `buildStateImageSrc(url, generatedAt)`，否则回落 `preset.sourceUrl`。
- `studioEnvironmentRuntime.loadStudioEnvironment` 在组装 urls 链前先解析覆盖源（生成的状态图排最前，`.hdr` 退居兜底）——模型预览、动画预览、两个缩略图工厂自动生效，无需各自改动。
- `StudioEnvironmentPreviewPage` 初始化与切换环境时同样经解析器取 URL。

### 4. UI：通用资产页内编辑，交互对齐场景资产

- HDRI 表格行变为：当前全景缩略图（活跃状态图，无则静态预览图）、半球直径滑杆（保留）、操作（编辑环境 / 3D 预览）。
- 「编辑环境」打开 Dialog，结构对齐 `AssetStatesEditor`：左列状态列表（缩略图、添加/删除、默认状态不可删、活跃状态标记），右侧表单（状态名 / 描述 / 图片提示词 + 参考状态下拉 + 生成按钮含计秒/终止/失败关闭 + 全景预览叠加 `ScenePanoramaGuides`）+ 「设为当前全景」。
- 资料编辑用显式「保存」按钮（设置页无自动保存防抖基建）；生成前先强制保存未保存的提示词（对齐 AssetStatesEditor 的 flushLocalEdits 行为）。
- 生成/终止/失败关闭/设为当前四类操作即时 invalidate `queryKeys.settings.environmentAssets`。

### 5. 路由（挂在 /api/settings 下，复用 authMiddleware）

- `GET /environment-assets`
- `PUT /environment-assets/:environmentId`（description/states 元数据，zod 校验）
- `POST /environment-assets/:environmentId/active-state`
- `POST /environment-assets/:environmentId/states/:stateId/generate-image` / `cancel-image` / `dismiss-image-error`
- `GET /environment-assets/:environmentId/states/:stateId/image`（流式返回，Cache-Control 与小说状态图一致）

独立文件 `server/src/modules/settings/http/environmentAssetRoutes.ts`（自带 `router.use(authMiddleware)`），`app.ts` 挂载。

## v1 明确不做（后续版本）

- AI 提示词微调（`state-image-prompt/tweak` 的全局化）。
- 生成图自动估算 panoramaHorizonV / 投射中心（场景侧的 3d-environment analyze 全局化）。
- per-state 时代风格选择。

## 影响面

- 模型库/动画库预览与缩略图：环境源解析变化（有状态图用状态图，无则完全维持现状）。
- 通用资产页 HDRI 区块 UI 重构。
- 小说域场景状态生图链路仅做 `buildStateImagePrompt` 下沉 + re-export，行为零变化。

## 验收

1. 服务端测试：settings 服务默认合并/读写回环/activeState 校验；prompt 下沉后原契约测试仍绿。
2. 客户端契约测试：运行时优先状态图、预览页经解析器取源、通用资产页接线（生成/终止/设为当前/保存）。
3. IAB 冒烟：通用资产页编辑环境 → 生成（或至少发起生成请求的完整交互）→ 状态图就绪后模型预览环境变为生成图；3D 预览页正常。
4. typecheck 通过；release notes 与 wiki 更新。
