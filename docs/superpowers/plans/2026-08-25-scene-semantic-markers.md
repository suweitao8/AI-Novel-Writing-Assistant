# 场景状态 3D 空间语义标记实施计划

> 本计划在设计文档 `docs/superpowers/specs/2026-08-25-scene-semantic-markers-design.md` 已提交后直接执行。

## 目标

把场景状态全景图中的床、桌、椅等固定空间物体转换为可持久化的 3D 半透明长方体标记，并让场景 3D 编辑器、分镜 3D 编辑器和自动构图 Prompt 使用同一份状态级标记数据。

## 任务 1：共享状态契约与状态 JSON 保护

文件：

- 修改 `shared/types/comicDrama.ts`
- 修改 `shared/types/novelReferenceExtraction.ts`
- 修改 `server/src/modules/novel/story-settings/http/storySettingsRoutes.ts`
- 修改 `server/src/modules/novel/story-settings/application/StorySettingsStatePolicy.ts`
- 测试 `server/tests/sceneSemanticMarkers.test.js`

先写失败测试，覆盖：

- 标记集合的版本、类别、锚点、位置、尺寸、置信度和图像区域；
- 地面标记中心高度归一为半高；
- 超出半球范围、尺寸为零、非法置信度被拒绝或裁剪；
- 没有标记的旧状态保持可读；
- 资产表单状态归一化和运行时资产保护不清除已有标记。

实现共享类型、规范化函数、状态输入 schema，并让 `StoryAssetState` 保留 `scene3dMarkers`。状态图片重新生成的清除边界留给任务 3，但先把状态字段接入现有状态 JSON 合同。

## 任务 2：注册多模态场景标记 Prompt 与服务端分析服务

文件：

- 新建 `server/src/prompting/prompts/drama/sceneState3dMarkers.prompts.ts`
- 修改 `server/src/prompting/registry/promptAssetLoaderEntries.ts`
- 新建 `server/src/modules/novel/story-settings/application/StoryScene3dMarkerService.ts`
- 修改 `server/src/modules/novel/story-settings/http/storySettingsRoutes.ts`
- 修改 `client/src/api/story/storySettings.ts`
- 测试 `server/tests/sceneState3dMarkersPrompt.test.js`
- 测试 `server/tests/sceneState3dMarkerService.test.js`
- 测试 `server/tests/storySettingsScene3dMarkerRoutes.test.js`

先写 Prompt 注册/消息和服务失败测试：无图片拒绝、AI 输出非法不写入、图片读取失败保留旧标记、成功结果通过 CAS 写回当前状态。

使用现有状态图片制品解析器读取当前 state 的真实文件，转成多模态 Prompt 所需的 data URL；不在业务代码内内联 prompt。服务端只做结构校验、位置/尺寸范围归一化、稳定 id 和 CAS 写入。新增场景状态级分析接口，返回更新后的场景 DTO；客户端增加 `analyzeStoryScene3dMarkers`。

## 任务 3：图片换代时清理旧空间标记

文件：

- 修改 `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`
- 修改 `shared/types/novelReferenceExtraction.ts`（如需补充运行时类型）
- 测试 `server/tests/sceneStateImageMarkerInvalidation.test.js`

先写并运行失败测试，证明成功提交新的场景状态图片时清除旧标记，而生成中、失败、取消不会清除仍可读取的旧图片/标记。沿用现有不可变制品提交分支和状态 CAS，不改动资产图片指针安全边界。

## 任务 4：PlayCanvas 透明标记渲染与选择/聚焦

文件：

- 新建 `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dSceneMarkers.ts`
- 修改 `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- 修改 `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`
- 修改 `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`
- 修改 `client/src/api/media/drama.ts`
- 修改 `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- 修改 `server/src/prompting/prompts/drama/shotBlockingAutoPlan.prompts.ts`
- 测试 `client/tests/dramaSceneSemanticMarkers.contract.test.js`
- 测试 `client/tests/dramaBlocking3dSceneMarkers.test.js`
- 更新 `server/tests/dramaShotBlockingAutoPlanPrompt.test.js`

先写客户端契约测试，要求 viewer 接收状态标记、绘制半透明 box 和轮廓、支持 marker 选择/聚焦并不把 marker 写入镜头 `layout3d`。

把 marker 的实体创建、轮廓绘制、射线拾取和销毁放进有明确职责的 `blocking3dSceneMarkers.ts`，避免继续膨胀已有 viewer 文件。viewer 新增设置/选择/聚焦 API；左键点击 marker 只选择，不破坏原有角色拖动和相机交互。

场景页增加 AI 识别按钮、状态反馈、标记列表和聚焦操作；分镜页显示同一状态的标记列表和聚焦操作。服务端上下文把状态标记传给分镜页，自动构图 Prompt 明确使用这些坐标关系。

## 任务 5：文档、发布说明与验证

文件：

- 更新 `docs/wiki/workflows/drama-blocking-3d.md`，记录状态级标记边界和失效规则
- 按 `readme-release-updater` 检查 `docs/releases/release-notes.md` 与 `README.md`
- 如存在用户可见变化，更新发布说明；纯内部文档变化不重复写发布说明

运行：

- shared build；服务端定向测试/build/typecheck；客户端定向测试/typecheck/build；
- `git diff --check`、`pnpm check:workspace-integrity`；
- 在独立分支提交后用 `pnpm workflow:integrate codex/scene-semantic-markers --push` 集成，确认 `main` 与 `origin/main` 同步，并清理已合并工作树。
