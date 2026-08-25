# 分镜 3D 自动构图与自动保存设计

## 背景

分镜 3D 草图目前已经能够保存 PlayCanvas 的角色位置和轨道相机，但保存、上传 PNG、确认草图仍由用户点击按钮完成；场景资产 3D 编辑器也只在点击“保存场景参数”后写回。摆位数据为 `draft` 时，后续首帧生成会被阻止，因此用户离开编辑器后必须完成一次完整的保存与确认链路。

用户希望把保存变成自动行为，并让 AI 根据当前镜头内容一次性规划角色摆位、相机位置、景别和景深，使 3D 草图打开后就能直接看到可用构图，只有偏差较大时才需要手动调整。

## 目标

1. 分镜 3D 编辑器不再要求用户点击“保存草图”或“确认草图”。编辑停止一小段时间后自动保存；离开页面时等待最后一次保存完成。
2. 自动保存完整执行元数据保存、1280×720 PNG 上传和草图确认，使生成链路可以直接使用草图。
3. 新分镜首次进入且没有既有 3D 布局时自动调用一次 AI 构图；已有布局始终保留，用户可用“重新自动构图”主动覆盖。
4. AI 输出必须包含当前镜头上下文中的全部已识别角色，并同时给出角色位置、朝向、姿势、缩放、相机轨道参数、视野角和景深参数。
5. AI 规划结果立即加载到 PlayCanvas 预览；景深参数通过 PlayCanvas `CameraFrame` 的真实 DOF 管线渲染，而不是只写入 JSON。
6. 场景资产 3D 编辑器移除手动保存入口，在参数改变后自动保存，返回时等待未完成的自动保存。

## 非目标

- 不在场景资产编辑器中规划某个镜头的角色摆位；场景资产只负责环境贴图、投射中心高度和半球直径。
- 不把 AI 构图改成固定关键词、固定角色数量或坐标模板。坐标范围裁剪和角色名称完整性校验属于结构化输出的确定性后处理，构图判断仍由注册的 AI Prompt 完成。
- 不增加新的 3D 角色建模或动画编辑能力；当前静态姿势代理继续沿用。

## 方案

### 自动保存状态机

分镜页面维护 `dirty`、`saving`、`autoSaveState` 和一个共享的保存 Promise。代理、姿势、相机或 AI 布局发生变化后进入 `pending`，短暂防抖后执行一次完整保存：

```text
viewer change / AI layout
        ↓
      dirty + pending
        ↓ 约 1 秒无新变化
saveSketch(JSON draft)
        ↓
capturePng(1280×720) → uploadSketchPng
        ↓
confirmSketch
        ↓
saved + status=confirmed
```

保存过程中禁用 3D 交互和 AI 构图按钮，避免同一镜头出现并发版本。返回按钮复用相同 Promise：如果已有保存正在进行就等待它；如果仍有脏数据就立即触发保存，成功后再返回。失败时停留在编辑器并显示可读错误，下一次变更或返回操作仍可重试。页面头部只显示“自动保存中 / 已自动保存 / 自动保存失败”等状态，不保留手动保存和确认按钮。

由于浏览器关闭不能可靠等待异步请求，防抖自动保存是主要保护机制；返回按钮仍执行有等待保证的最后 flush，不用 `confirm` 阻断用户。

场景资产页面使用同样的防抖 + 返回 flush 模式，但只保存 `scene3dEnvironment`。移除两处手动保存按钮，保留参数滑杆和自动保存状态。

### AI 自动构图链路

新增已注册的结构化 Prompt `drama.shot.blocking.autoPlan@v1`，输入包括：

- 镜头顺序、地点、景别、运镜、动作、台词、视觉提示词和时长；
- 场景名称、场景状态和 HDRI 环境参数；
- 当前镜头 `characterRefs` 解析出的角色名单、状态和可用资产信息；
- 约束：横屏 16:9、每个输入角色都必须出现在输出、角色落地、相机看向主体、景深焦点落在主要角色范围。

输出是结构化 `actors` + `camera`，不输出自然语言坐标指令。服务层确认角色名称与上下文完全一致，再调用现有的 3D 合同归一化；未知角色、缺失角色或越界字段让结构化 Prompt 重试/报错，不悄悄使用固定坐标补齐。

新增 `POST /api/drama/projects/:id/shots/:shotId/blocking-sketch/auto-plan`。该接口只负责规划并返回布局，不直接覆盖数据库。前端把结果加载进当前 viewer，标记为脏数据，随后由统一自动保存链路写入并确认。这样 AI 请求失败时既不会破坏已有草图，也不会产生半保存布局。

页面加载规则：

- `context.sketch.layout3d` 存在：直接加载已有布局，不自动调用 AI；按钮显示“重新自动构图”。
- 没有布局且存在场景、角色：首次进入自动调用一次 AI；按钮在生成完成后显示“重新自动构图”。
- 没有可用场景或角色：不自动调用，保留明确空状态和手动重试入口。
- AI 失败：保留当前 viewer/已有布局，显示错误和“重试自动构图”；不触发自动保存覆盖旧数据。

### 相机与景深数据合同

保持 `schemaVersion: 1`，给旧布局的 camera 增加可选字段并在读取时补默认值，避免旧草图失效。相机保存以下参数：

- 轨道位置：`azim`、`elev`、`distance`、`focalPoint`；
- 镜头：`fovDeg`、`nearClip`、`farClip`；
- 景深：`depthOfFieldEnabled`、`focusDistance`、`focusRange`、`blurRadius`。

所有字段由服务端和客户端共同限制范围。前端 viewer 在 `cameraEntity` 上挂载 PlayCanvas `CameraFrame`，把景深字段同步到 `cameraFrame.dof`；`setCameraState`、`loadLayout`、鼠标相机操作和 `capturePng` 使用同一相机状态，因此预览图与保存数据一致。相机卡片展示 AI 已规划的镜头和景深参数，保留视口拖拽、缩放、聚焦和复位作为必要的少量修正入口。

### 版本与生产链兼容

自动确认保持现有 `confirmed` 语义。因为生产链会拒绝 `draft` 草图，自动保存必须在 PNG 上传成功后确认；若 JSON 保存或 PNG 上传失败，不得标记为已确认。旧布局读入时补相机/DOF 默认值并在下一次自动保存时持久化新字段。

## 代码边界

- `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`：扩展相机合同、默认值和范围归一化。
- `server/src/prompting/prompts/drama/shotBlockingAutoPlan.prompts.ts`：新增结构化 Prompt、输入类型和输出 schema。
- `server/src/prompting/registry/promptAssetLoaderEntries.ts`：注册 Prompt。
- `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`：装配镜头上下文、调用 Prompt、验证角色完整性并返回布局。
- `server/src/modules/drama/http/dramaRoutes.ts`：新增自动构图路由和 Zod 请求/响应边界。
- `client/src/api/media/drama.ts`：扩展相机类型并暴露自动构图 API。
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dMath.ts`：同步默认相机和字段归一化。
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`：同步 FOV、裁剪面、CameraFrame DOF 和布局读写。
- `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`：自动首次规划、重规划、自动保存/确认和少量参数展示。
- `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`：自动保存场景参数并移除手动保存入口。
- `client/tests/`、`server/tests/`：先写失败合同测试，再覆盖 Prompt、路由、旧布局兼容、自动保存入口和 CameraFrame 接线。

## 验收证据

1. 服务端合同测试证明旧 3D 布局能读入并补齐相机/景深默认值，越界字段和角色缺失被拒绝。
2. Prompt/路由测试证明自动构图使用注册 Prompt，输入当前镜头角色，并暴露新 endpoint。
3. 客户端合同测试证明分镜页无手动保存/确认按钮，存在首次自动规划、重规划和自动保存状态；场景页无手动保存按钮并在退出 flush。
4. 客户端 typecheck/build 和服务端目标测试通过。
5. 通过当前运行中的浏览器实际打开分镜 3D 页面：新镜头自动出现角色和相机结果；修改后离开再返回，布局、确认状态、PNG 和 DOF 参数仍在；场景资产滑杆修改后直接返回，重新进入仍保留参数。
