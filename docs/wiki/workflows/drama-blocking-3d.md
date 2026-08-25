# 漫剧分镜 3D 草图工作流

## Background

分镜生成需要先确定镜头中的角色相对位置、视角和静态姿势。3D 草图承担的是“生成分镜前的构图预演”，不是最终角色资产或成片渲染器。角色动画库只用来采样可复现的关键帧，视口本身不播放动作。

## Decision

- 用户从每一镜唯一的「3D 草图」入口进入独立路由 `/drama/projects/:id/shots/:shotId/blocking-3d`；服务端继续保留 `blockingSketchData` 和旧 PNG 接口，保证已有项目可读取。
- 视口使用 PlayCanvas WebGL。通用 Quaternius UAL 角色模型只作为低成本摆位代理，保存的 PNG 仍是分镜首帧生成可以消费的构图参考图。
- 场景状态图作为半球 HDRI 环境贴图，角色代理放在半球底部的弧形地面上；环境固定在世界坐标，避免把场景图铺成后置平面或在相机旋转时搬动地面。相机、角色位置、朝向、缩放和静态姿势一起保存为 `layout3d` 快照；场景环境参数则属于场景资产，不属于镜头快照。
- 姿势先从 UAL 动画剪辑采样一个稳定时间点，再暂停动画并渲染该帧；保存的 `actionPlaying` 仅为旧数据兼容字段，规范化后始终为 `false`。
- 3D 草图使用“快照 JSON → 1280×720 PNG → 自动确认”的自动保存链路。确认后的 PNG 仍按旧规则成为分镜画面的首位锁定参考图，未确认的草图不能进入分镜生成链；页面不再提供手动保存或确认按钮。
- 新镜头首次进入且没有 `layout3d` 时，服务端把镜头动作、景别、运镜、场景和全部出场角色交给注册的结构化 AI Prompt，返回角色位置、姿势、相机和景深布局；前端应用后自动保存。已有 `layout3d` 不会被首次进入流程覆盖，用户可以显式重新自动构图。
- 旧数据没有 `layout3d` 时，前端只建立临时代理角色和默认相机供 AI 规划，不把固定坐标当成自动构图结果；旧的二维 JSON/PNG 只作为数据兼容，不再提供用户侧 2D 编辑入口。
- 场景资产从设定中心或资产编辑弹窗进入独立的「3D 场景编辑」页。该页加载场景默认状态图和约 1.8 米的代理角色，用户用代理角色校准投射中心高度与半球直径；代理角色是比例参照，不是场景资产或分镜角色数据。

## Current Rule

### 视口交互

- 左键拖动角色调整地面位置，右键拖动旋转相机，中键拖动平移相机，滚轮调整距离。
- 中键平移使用相机的屏幕右轴和屏幕上轴计算位移，场景跟随鼠标拖动；不能把平移绑定到固定世界 X/Z 轴，否则相机换角度后拖拽方向会反转。
- 右侧控制面板提供选中角色的前后左右、上下、旋转、缩放和落地操作；相机支持适配和重置。
- 角色列表负责加入、选择和移除本镜角色。保存前页面会监听视口直接拖动和相机变化，避免用户操作后仍被误认为未修改。
- AI 自动构图完成后，右侧相机面板展示 FOV、景深开关、焦点距离、清晰范围和模糊半径；这些值由镜头上下文规划并进入 PlayCanvas `CameraFrame.dof`，不是只写入数据库的装饰字段。
- 任意角色、姿势、视角或空间操作会在短暂防抖后自动保存；离开页面时会等待同一条保存 Promise，保存失败则留在当前页面以便重试。

### 静态姿势与关键帧

姿势使用稳定的业务枚举保存，不把具体 GLB 动画剪辑名暴露给 API。当前支持站立、交谈、抱臂、坐着、蹲下、跪下、躺着、趴着、走路、跑步、指向、持物、互动、战斗和持剑。用户选择姿势后，运行时只截取对应关键帧，不提供播放动作入口。

UAL 代理资源没有专用“趴着”剪辑时，运行时使用最接近的贴地/躺卧剪辑作为视觉近似；业务快照仍保存 `prone`，以后替换代理资源不需要迁移数据库数据。代理姿势只服务摆位，不替代角色真实设计稿。

### 数据与下游

`layout3d` 使用版本化结构保存：

- `schemaVersion` 固定为 `1`，并声明 `engine: "playcanvas"`。
- `camera` 保存方位角、俯仰角、距离、观察焦点、FOV、近远裁剪面和景深参数（开关、焦点距离、清晰范围、模糊半径）。
- `actors` 保存角色名、三维位置、绕 Y 轴朝向、缩放、姿势和兼容字段 `actionPlaying`；该字段必须是 `false`。
- 服务端只做结构校验、范围归一化和兼容旧数据；自动构图由注册 Prompt 负责，不根据角色名或文本关键词猜测摆位。AI 返回的角色集合必须与当前镜头出场角色逐一一致，缺失、重复或新增角色会拒绝应用。
- 下游分镜生成优先消费已确认的 PNG；`layout3d` 负责恢复和继续编辑 3D 摆位，不能绕过确认状态直接成为生成参考图。
- 3D 视口可以随工作区自适应，但摆位 PNG 始终按开发基准 1280×720（严格 16:9）捕获，避免浏览器窗口尺寸改变分镜参考图契约。
- 自动保存流程会在写入快照、捕获 PNG 和上传确认期间锁住视口及控制面板；保存结束后再恢复编辑，确保 JSON 空间状态和 PNG 构图来自同一次摆位。自动构图只在布局成功校验后应用，失败时保留原有布局。
- 从应用内返回分镜时，退出动作必须先等待快照、PNG 和确认状态保存成功，再刷新分镜项目查询；因此保存后的 3D 图会立即成为分镜列表的最新预览。分镜列表给 3D 图地址附带生成版本，避免稳定的图片接口被浏览器缓存成旧草图。
- 分镜预览的「3D 草图」和「AI 图」是两个独立来源：AI 图缺失或加载失败时只显示不可用状态和重新生成入口，不得用场景状态图冒充 AI 首帧。AI 首帧生成结果如果与任一参考图逐字节相同，统一运行时会把任务写为失败，历史上已经落盘的同类文件则由图片路由隐藏。

## Failure Modes

- 不能把通用代理模型当成最终角色渲染结果，否则会把低模、临时材质和动画库限制带进成片。
- 不能只保存 PNG 而丢失 `layout3d`，否则用户无法继续调整空间关系和姿势。
- 不能把 3D 草图确认前的图片注入分镜生成或批量任务；确认状态仍是参考图锁定的闸门。
- 不能把 AI 自动构图结果直接落库后再校验；必须先校验角色集合、相机范围和 3D 快照，再由前端加载并通过统一自动保存链路确认。
- 不能删除旧二维数据或要求已有项目重新摆位；缺少 3D 快照时必须能够从旧二维布局恢复一个可编辑的默认 3D 场景，但前端只暴露 3D 草图入口。
- 姿势枚举是业务契约，代理 GLB 的剪辑名可以变化。若某个代理缺少剪辑，应明确报出资源能力问题或采用已定义的近似剪辑，不得静默把用户选择改成站立。

### HDRI 环境

场景状态图加载到内侧剔除的 EnviroDome 式环境网格中。接近 2:1 的等距 HDRI 由完整半球承担天空和弧面地面；普通 16:9 场景图则由上半球显示天空/远景，并用同一贴图的下半球网格承接下半幅图像，地面仍然是带贴图的弧面而不是后置平面。加载成功后隐藏仅用于无环境时兜底的纯色地面平面，定位网格仍作为辅助线绘制在地面上。环境实体固定在世界坐标，Y 轴固定在世界地面；相机旋转或移动只改变视点，不搬动环境地面。没有状态图或环境加载失败时恢复纯色地面。

场景状态图和真正的等距 HDRI 不能共用同一种地面采样：2:1 素材保留标准等距半球 UV；其他比例（当前产品默认是 1280×720 场景图）把上半球限制在源图上半幅，并让独立的下半球网格采样源图下半幅，保持 EnviroDome 的圆球投影形状。环境纹理使用线性采样、关闭 mipmap、各向异性过滤和边缘寻址；环境材质用自发光强度显示贴图，不让场景灯光压糊地面细节。

`NovelScene.scene3dEnvironmentJson` 是场景资产的唯一 3D 环境参数源，保存投射中心高度和半球直径；其默认值为高度 `3`、直径 `20`，范围分别为 `1–10` 与 `10–50`。`yawDeg` 与 `intensity` 只保留在共享运行时合同中，始终归一化为 `0` 与 `1`，不提供编辑控件。数据字段仍使用 `domeRadius` 以兼容旧快照，但由于基础半球网格半径为 `0.5`，其用户可见语义是半球直径。投射中心严格位于世界 X/Z 原点，只有世界 Y 高度可调。旧版本曾允许保存的高度 `0.6–1` 和直径 `50–100` 会在读取时裁剪到新范围，不会让整张 3D 摆位失效。

场景 3D 编辑器的高度和半球直径滑块也使用防抖自动保存。退出场景编辑时先清除待执行的定时器，再等待进行中的同一条保存 Promise；接口失败时不导航离开，也不通过浏览器确认框丢弃用户状态。

`layout3d.environment` 只作为旧镜头快照的兼容字段读取，不能覆盖场景资产参数。分镜 3D 页面每次从服务端上下文读取匹配场景的 `scene3dEnvironmentJson`，把它覆盖到 viewer；保存分镜时从导出布局剥离环境字段，避免新的镜头继续产生独立 HDRI 覆盖。这样同一场景的不同分镜会使用同一份高度和直径，已有快照也能继续打开。

普通场景图的下半球使用连续浅碗形曲面，边缘高度随投射中心和实际半球尺寸计算并保持在投射中心下方；投影 UV 按实际半球世界坐标从投射中心计算，并把地面边缘的投影角归一到上半球的 `v=0.5` 接缝，不通过中心圆形硬阈值、UV repeat 或把一圈点截断到同一高度制造密度变化。旧快照中的 `groundTextureScale` 作为未知字段被忽略，新的导出数据不会再写回。普通场景图加载完成后，viewer 会读取上方区域的高亮像素并估算主光方向与颜色，只用于角色代理的基础方向光，不写入场景参数。

普通场景图加载完成后，viewer 会把图像缩略到小画布，读取上方区域的高亮像素并估算主光方向与颜色。估算方向只用于角色代理的基础方向光，不写入 `layout3d`，避免把依赖具体图片的派生值变成用户状态；像素读取失败或图像没有有效亮部时使用稳定的斜上方暖色后备光。场景图仍以自发光材质显示，方向光只负责让角色轮廓和体积可读。

## Related Modules

- `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`
- `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentMath.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dMath.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.ts`
- `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`
- `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- `server/src/modules/novel/story-settings/application/StoryScene3dEnvironment.ts`
- `server/src/modules/novel/story-settings/application/StorySettingsService.ts`
- `server/src/modules/drama/http/dramaRoutes.ts`
- `docs/wiki/workflows/short-drama-workspace.md`

## Source Documents

- `docs/superpowers/specs/2026-08-24-drama-blocking-3d-design.md`
- `docs/superpowers/plans/2026-08-24-drama-blocking-3d.md`
- `docs/superpowers/specs/2026-08-24-drama-blocking-3d-static-hdri-design.md`
- `docs/superpowers/plans/2026-08-24-drama-blocking-3d-static-hdri.md`
- `docs/superpowers/specs/2026-08-24-drama-hdri-backdrop-clarity-design.md`
- `docs/superpowers/plans/2026-08-24-drama-hdri-backdrop-clarity.md`
- `docs/superpowers/specs/2026-08-25-drama-auto-composition.md`
- `docs/superpowers/plans/2026-08-25-drama-auto-composition.md`
- MyDrama viewer-kit 的 PlayCanvas 3D Director 参考实现
