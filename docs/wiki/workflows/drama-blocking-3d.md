# 漫剧分镜 3D 草图工作流

## Background

分镜生成需要先确定镜头中的角色相对位置、视角和静态姿势。3D 草图承担的是“生成分镜前的构图预演”，不是最终角色资产或成片渲染器。角色动画库只用来采样可复现的关键帧，视口本身不播放动作。

## Decision

- 用户从每一镜唯一的「3D 草图」入口进入独立路由 `/drama/projects/:id/shots/:shotId/blocking-3d`；服务端继续保留 `blockingSketchData` 和旧 PNG 接口，保证已有项目可读取。
- 视口使用 PlayCanvas WebGL。通用 Quaternius UAL 角色模型只作为低成本摆位代理，保存的 PNG 仍是分镜首帧生成可以消费的构图参考图。
- 场景状态图作为半球 HDRI 环境贴图，角色代理放在半球底部的弧形地面上；环境固定在世界坐标，避免把场景图铺成后置平面或在相机旋转时搬动地面。相机、角色位置、朝向、缩放和静态姿势一起保存为 `layout3d` 快照；投射中心高度、半球直径和全景地面分界属于场景资产，不属于镜头快照。
- 姿势先从 UAL 动画剪辑采样一个稳定时间点，再暂停动画并渲染该帧；保存的 `actionPlaying` 仅为旧数据兼容字段，规范化后始终为 `false`。姿势枚举是业务语义，若统一动画容器缺少躺/趴专用片段，viewer 使用已声明的贴地代理展示并保留原姿势，不把语义快照静默改成站立。
- 3D 草图使用“快照 JSON → 1280×720 PNG → 自动确认”的退出保存链路。确认后的 PNG 仍按旧规则成为分镜画面的首位锁定参考图，未确认的草图不能进入分镜生成链；页面不再提供手动保存或确认按钮。
- 分镜 AI 自动构图只在 3D 草图编辑器顶部的「AI 自动构图」按钮被点击后运行；打开编辑器只恢复已有 `layout3d`，不会因为缺少布局或历史查询参数自动调用模型。服务端把镜头动作、景别、场景和全部出场角色交给注册的结构化 AI Prompt，返回角色位置、姿势、相机和景深布局；前端应用后只保留为未保存修改，退出 3D 草图时统一保存。
- 旧数据没有 `layout3d` 时，前端只建立临时代理角色和默认相机供 AI 规划，不把固定坐标当成自动构图结果；旧的二维 JSON/PNG 只作为数据兼容，不再提供用户侧 2D 编辑入口。
- 场景资产从设定中心或资产编辑弹窗进入独立的「3D 场景编辑」页。该页加载场景默认状态图和实际校准为约 1.7 米的代理角色，代理角色首次加入时落在世界坐标原点 `[0, 0, 0]`；用户用它校准投射中心高度、半球直径和全景地面分界。代理角色是固定位置的比例参照，不是场景资产或分镜角色数据。
- 场景状态图右下角的「3D编辑」进入独立的「3D 场景编辑」页，路由必须携带 `stateId`，这样编辑器加载的就是当前状态自己的图片；约 1.7 米的代理角色只用于校准投射中心高度、半球直径和全景地面分界，场景编辑时只能选择它，不能拖动改变位置，不是场景资产或分镜角色数据。环境参数仍属于场景资产，因此同一场景的不同状态共享这三项参数。
- 从漫剧工作室「资产 / 场景」进入 3D 场景编辑时，路由必须同时携带 `returnStage=assets` 和 `returnAssetTab=scenes`。编辑器返回时用这两个参数构造工作室的显式目标地址（`stage=assets&assetTab=scenes`），不能依赖历史栈猜测来源；没有来源参数的旧入口才使用浏览器历史后退作为兼容兜底。

## Current Rule

### 全景图驱动的场景环境默认

- **Background：** 2:1 等距柱状全景图的垂直方向同时承载天空、远景和地面；仅凭场景名称或旧的「室内 / 室外 / 自然」分类，无法稳定决定投射中心、半球尺度和地面分界。场景类型因此不再是 3D 环境参数的决策输入。
- **Decision：** 场景状态进入 3D 编辑页且已有状态图时，调用注册的多模态 Prompt `drama.scene.state.3d_environment@v1`，让视觉模型观察全图、50% 参考线和地面向半球边界的延展，并结合门、人物、家具或建筑构件等可见参照估算圆半径、投射中心高度和地平线 V 坐标。当前业务字段 `radiusMeters` 表示投射中心到边界的真实水平圆半径；历史 `domeRadius` 仅在兼容读取入口按直径除以二。
- **Current Rule：** 估算结果与状态图的 `artifactId / generatedAt / url` 指纹一起保存；同一张图直接复用，不重复调用视觉模型。用户在 3D 编辑页保存过的参数带 `customized=true`，自动分析不得覆盖。模型没有可靠尺度或置信度低于 0.45 时使用中性默认：圆半径 7.5 米、投射中心高度 2 米、地平线 50%；圆半径、高度比例和地平线仍经过共享范围归一化，当前比例范围为 10%–40%。
- **Failure Modes：** 不要从场景名称、关键词、旧类型或像素比例硬推绝对米数，也不要把低置信度的模型数字伪装成测量结果。状态图发生变化后必须按新指纹重新分析；分析期间 3D 预览和手动滑块保持可用。视觉通道不可用、图片无法读取或并发更新导致写入冲突时，提示可恢复错误，并保留当前可编辑环境。
- **Related Modules：** `sceneState3dEnvironment.prompts.ts` 负责多模态结构化输出；`StoryScene3dEnvironmentAnalysisService.ts` 负责图片准备、视觉调用、指纹缓存和乐观并发写入；`shared/utils/scene3dEnvironment.ts` 负责默认值、置信度兜底与归一化；`DramaScene3DPage.tsx` 负责进入页面后的自动触发和手动覆盖。
- **Compatibility：** `sceneType` 仍在数据库、API 和状态归一化中保留，用于旧数据读写和兼容保存，但不再在场景状态表单、资产卡片或 3D 默认环境中显示或决策。

### 自适应工作台与对象树

- 场景 3D 编辑和分镜 3D 草图共用满高工作台：页面根容器使用可收缩的 `h-full/min-h-0`，视口不再用固定 16:9 容器占位；已保存的分镜 PNG 仍严格按 1280×720 捕获，浏览器尺寸只影响编辑预览。
- 桌面端左侧固定为控制栏，按顶部导航、场景对象列表和属性内容分层；右侧视口占据剩余空间。长对象列表只在对象区内部滚动，属性内容只在属性区内部滚动，不能让整个编辑器页面被单一长侧栏撑高。
- 对象列表是选择入口，不承担状态摘要或删除按钮：每行只显示对象类型图标和对象名称，不重复显示对象卡标题或标题图标；属性区域直接承载当前对象的全部属性与操作，不再额外渲染「属性面板」标题，内容超出时只在属性区内部滚动。可移动角色至少展示位置、旋转和大小，移除等对象操作也放在属性区域中，避免对象树出现嵌套操作或信息密度失控。
- 桌面端左侧固定为控制栏，按顶部导航、场景对象列表和属性内容分层；右侧视口占据剩余空间。长对象列表只在对象区内部滚动，属性内容只在属性区内部滚动，不能让整个编辑器页面被单一长侧栏撑高。
- 对象列表是选择入口，不承担状态摘要或删除按钮：每行只显示对象类型图标和对象名称，不重复显示对象卡标题或标题图标；属性区域直接承载当前对象的全部属性与操作，不再额外渲染「属性面板」标题，内容超出时只在属性区内部滚动。可移动角色至少展示位置、旋转和大小，移除等对象操作也放在属性区域中，避免对象树出现嵌套操作或信息密度失控。
- 对象树必须包含一个前端语义上的“世界”根节点，并把角色、空间标记、参考角色等对象统一纳入选择状态；根节点用于查看场景级属性，不新增数据库实体。列表选择、视口拾取和属性区域必须同步当前对象。HDRI 世界对象显示为「世界」，固定约 1.7 米的尺度校准人物显示为「参考角色」，当前状态识别出的空间标记直接逐项显示在对象列表中（2026-08-29 起该条目随功能暂关门控隐藏，见「场景状态空间语义标记」节首说明）。
- 场景级环境参数（投射中心高度、半球直径、全景地面分界）继续保存到场景资产，角色摆位、姿势、相机和 PNG 继续遵循退出时一次性保存；工作台布局重构不能改变原有保存边界。

### 视口交互

- 分镜摆位页左键拖动角色调整地面位置；场景资产页的比例参照角色固定在世界原点，左键只负责选中；两种页面都用右键拖动旋转相机、中键拖动平移相机和滚轮调整距离。
- 选中角色、比例参照或空间标记时，视口使用 PlayCanvas `OutlineRenderer` 按各自模型/长方体的真实可见轮廓生成橙色外描边（80% 不透明度）；轮廓采样放在独立临时渲染层，避免主相机重复绘制。角色与空间标记互斥选中，但共用同一条外轮廓反馈通道（`emitSelection` 统一决定描边实体，标记被移除时必须同步摘除描边引用）。标记原有的分类色线框继续保留，外描边只属于运行时选择反馈，不写入 `layout3d` 或导出的 PNG；捕获 PNG 前必须暂时移除并在捕获后恢复。注意：`OutlineRenderer.addEntity` 只消费颜色的 RGB，alpha 会被忽略；描边不透明度由 `blocking3dSelectionOutline.ts` 替换的合成着色器（`uOutlineOpacity`，取自颜色 alpha）实现，不能只改 `pc.Color` 的第四个分量。
- 右键旋转相机的方位角在运行时按 360° 环绕归一化，跨过 `±180°`（即 `0°/360°` 接缝）不能停住；保存和导出的快照仍归一化到 `[-180°, 180°]`，以兼容服务端范围合同。
- 中键平移使用相机的屏幕右轴和屏幕上轴计算位移，场景跟随鼠标拖动；不能把平移绑定到固定世界 X/Z 轴，否则相机换角度后拖拽方向会反转。
- 左侧属性区域提供选中角色的前后左右、上下、旋转、缩放和落地操作；相机支持适配和重置。
- 角色列表负责加入、选择和移除本镜角色。保存前页面会监听视口直接拖动和相机变化，避免用户操作后仍被误认为未修改。
- AI 自动构图完成后，左侧属性区域展示 FOV、景深开关、焦点距离、清晰范围和模糊半径；这些值由镜头上下文规划并进入独立分镜摄像机的 PlayCanvas `CameraFrame.dof`，编辑观察相机始终保持清晰。
- 任意角色、姿势、视角或空间操作只更新当前 3D 草图；离开页面时统一保存一次并等待同一条保存 Promise，保存失败则留在当前页面以便重试。

### 编辑器内 AI 构图

- AI 摆位的唯一入口是每一镜的「编辑3D」页面；分镜列表不再直接发起 AI 摆位请求。
- 桌面端的「AI 构图」操作通过页面导航操作槽位显示在顶部「AI 实况」左侧；移动端在 3D 草图编辑器标题栏保留同一操作，避免把高频构图入口埋在世界属性面板中。
- 打开编辑器只恢复已有布局。用户点击「AI 自动构图」后，模型返回的角色、相机和景深布局立即进入当前镜头预览，但在用户检查前只属于未保存编辑状态。
- AI 返回的 `compositionNote` 与镜头景别、动作和对白在编辑器的「镜头设计」面板中展示，并随草图 JSON 保存；保存仍需同时完成 PNG 上传和确认。漫剧只出静态分镜：镜头设计不展示运镜与时长，分镜产出与编辑链路（`drama.storyboard` schema、手动编辑路由、3D 草图上下文、自动构图 shotJson、导出时间轴）均已不含 `cameraMove`；DB 旧列保留只读兼容，不再写入。
- AI 请求失败时保留当前布局和已有说明，不离开编辑器，不写入半成品。

#### AI 关系构图

- **Background：** 只为每个角色独立规划坐标、姿势和缩放时，模型可能把“承载者”和“位于其上方的主体”反过来；第一个镜头曾因此呈现为叶晨站立、血角兽趴在地面，且血角兽的体量没有保留下来。
- **Decision：** 注册的 `drama.shot.blocking.autoPlan@v12` 先让 AI 输出有向 `relations`，再输出角色坐标、姿势和相机。`subjectCharacterName` / `objectCharacterName` 是有向关系两端；`on_top_of` 固定解释为 subject 在上方、object 是地面承载者；`facing`、`attacking`、`holding`、`following` 的 subject 必须面向 object，`on_top_of`/`under` 的上方主动方也必须面向承载者；服务端按关系端点确定性重算 yaw，`sizeRelation` 表达 subject 相对 object 的 `larger` / `smaller` / `similar` 体量。
- **Current Rule：** 多角色结果必须至少有一条关系，关系两端必须来自本镜角色清单，不能自指或重复。服务端先按角色状态身高合成绝对代理比例，再按关系落实接地姿势、上下位置和相对体量，随后按有向关系确定主体朝向，最后才执行舞台半径与 FOV 兜底；`on_top_of` 的上方 subject 默认落为 `crouching` 或 `kneeling`，动作明确要求贴地伏压时可保留 `prone`，使其成为承载者上方的主动低姿态；`facing`、`attacking`、`holding`、`following` 的 subject，以及上下关系中的主动方，都必须朝向 object。若结构化关系端点与显式的上下姿势相互矛盾，服务端交换关系端点并反转体量关系，再执行同一套几何约束。关系只用于本次自动构图，不写入旧的 `layout3d` 结构。
- **Failure Modes：** 如果模型没有输出关系、关系端点不属于本镜或关系重复，自动构图应触发语义重试或返回错误，并保留当前编辑布局。缺少专用躺/趴片段时，客户端必须通过 `resolveBlocking3dPosePresentation` 使用明确的贴地代理并保留 `lying` / `prone`，不能静默保存为站立；其它缺少片段的非贴地姿势直接报资源能力错误。端点交换和朝向修正只依据结构化关系与结构化姿势，不读取叶晨、血角兽等角色名，也不从 `action`、对白或提示词用关键词猜测关系；需要改变语义时只能扩展 Prompt 的结构化输出合同。

#### AI 相机意图与确定性构图解析（v10）

- **Background：** v8 及之前让模型直接输出轨道相机参数（azim/elev/distance/focalPoint/fov），但相机位置被舞台合同钉在场景投射中心（全景图从该点拍摄，离开会产生视差错位），模型必须自己反解"视线过焦点、距离等于焦点到中心"的轨道几何，经常解错：焦点被服务端重写丢弃、视线偏出主体、FOV 被兜底逻辑放大，成图主体变小、构图失去设计感。
- **Decision：** v9 起 Prompt 只输出构图意图，v10 在意图里补上垂直机位维度：`camera: { focalCharacterName?, compositionBias: left|center|right, cameraAngle: low_angle|eye_level|high_angle, depthOfFieldEnabled }`；相机的方位角、俯仰、距离、焦点、FOV 与景深参数全部由服务端 `resolveAutoPlanCameraFromIntent` 从"角色实际落位 + 镜头景别 + 意图"确定性推导。`layout3d` 持久化合同不变，仍是完整轨道相机。
- **Current Rule：** 焦点取 `focalCharacterName` 指定角色（缺省取 actors 首位，Prompt 已要求首位即叙事主体）；焦点高度按景别落在眼（特写 0.92·身高）到身体中心（全景 0.5），但躺着/趴着按贴地动画的实际高度取焦点，不能把站立角色头顶公式套到卧姿；`compositionBias` 把取景点沿画面右轴平移画面宽度的六分之一，让主体落在三分线；`cameraAngle` 把取景点沿竖直方向平移画面高度的六分之一——`low_angle` 抬高取景点（视线向上、主体落画面下三分、体量放大），`high_angle` 压低取景点（视线向下、主体落画面上三分、显弱势），相机高度仍钉在投射中心不动，偏移量与横向偏移同量级保证主体不脱框、景深焦点仍贴近主体，取景点下限 clamp 到 0.1 米不钻地；fov 按"主体目标尺寸占画面高比例"从实际距离反推并夹取 [30,100]。只有中景、全景、远景才用全部角色做出画兜底；近景/特写保持焦点角色的紧凑景别，不得被陪体强行放宽成总览；景深档位（focusRange/blurRadius）按景别查表，focusDistance 恒等于视线距离。
- **Prompt 配套规则：** 景别决定主体与投射中心的站位距离（特写 1.0–1.8 米、近景 1.8–3、中景 3–5、全景 4.5–7.5、远景 ≥9）；"画面左/右"以"从投射中心望向焦点主体"的左右手侧为准换算成世界坐标；靠近投射中心的对象在画面里更大更近；actors 首位是叙事主体；`cameraAngle` 默认 eye_level，只有镜头动作文本明确出现俯拍/居高临下/上帝视角才选 high_angle、仰拍/低机位/高大压迫才选 low_angle。
- **Failure Modes：** 焦点角色不在本镜名单 → postValidate 报错走语义重试；主体站位距离与景别不符时 fov 会顶到钳制边界，成图比目标景别松——这是站位问题，应回到 Prompt 的距离带规则而不是放宽 fov 上限；`cameraAngle` 是必填枚举，模型漏输出会被 schema 校验拒绝并触发语义重试，服务端不做关键词猜测兜底。
- **相机职责边界：** 编辑浏览相机用于用户在 3D 场景中导航、聚焦和调整视角；独立分镜摄像机 pose 才是镜头取景与 PNG 草图的来源。打开已有 `layout3d` 时必须先恢复其角色与分镜摄像机，不得随后无条件调用编辑器总览 `fitView()` 覆盖景别。景深只写入分镜摄像机；画中画平时不启用整屏 `CameraFrame`，只有导出时把分镜摄像机临时扩展到完整画布，且明确开启景深才启用后处理。导出完成后在 `finally` 中恢复编辑相机、画中画、构图线和辅助图层。
- **Failure Modes（相机）：** 已有布局打开后跳到多角色远景 → 检查页面是否在 `loadLayout()` 后调用无条件 `fitView()`；点击重新构图后编辑器整体模糊 → 检查景深是否误写到编辑观察相机，或画中画 `CameraFrame` 是否常驻；编辑器里主体大小正确但保存草图变成远景 → 检查 `capturePng()` 是否误用了编辑浏览相机；捕获异常后画布比例、辅助线或视角未恢复 → 检查所有临时相机/图层修改是否都位于同一 `try/finally` 边界内。
- **Related Modules：** `shotBlockingAutoPlan.prompts.ts` 负责关系 schema 与方向语义；`DramaShotBlockingSketchService.ts` 负责端点校验、接地/上方几何和身高归一化后的体量约束；`DramaBlocking3DPage.tsx` 负责布局加载与退出保存；`blocking3dViewerApp.ts` 负责编辑相机、独立场景摄像机及草图捕获边界。
- **Source Documents：** `docs/superpowers/specs/2026-08-28-drama-ai-composition-relations-design.md`、`docs/superpowers/plans/2026-08-28-drama-ai-composition-relations.md`。

### 场景状态空间语义标记

> **2026-08-29 起空间标记功能整体暂关**（总开关：`shared/utils/scene3dMarkers.ts` 的 `STORY_SCENE_3D_MARKERS_ENABLED = false`）。产品方向：全景图只做背景，桌椅床、石块草丛等前景道具改为后续在 3D 场景摆放可交互模型，识别自全景图的标记失去价值。关闭后的行为：`normalizeSceneStates`（`shared/utils/storyAssetSceneStates.ts`）在归一化层直接丢弃 `scene3dMarkers`，设定中心与分镜上下文都不再下发标记；共享 viewer 的 `setSceneMarkers` 丢弃全部标记输入；两个 3D 页面的识别入口与对象条目由开关门控隐藏；存量数据用 `server/scripts/cleanup-scene3d-markers.cjs` 清理（默认 dry-run，`--apply --backup <文件>` 才写库）。本节以下内容保留为恢复功能时的合同记录；恢复时把开关改回 `true`、移除 UI 门控，并重新评估识别 Prompt 与存量数据迁移。

- 固定空间物体标记属于场景状态，而不是场景资产顶层或镜头 `layout3d`。不同状态图可能对应不同家具布局，因此 `StoryAssetState.scene3dMarkers` 必须与产生它的状态图片制品绑定。
- 空间识别输入图在送视觉模型前用 sharp 压缩到长边 2048px 的 JPEG（imageRegion 只用归一化坐标，与分辨率无关）；解码失败回退原图。全景状态图通常是数 MB 的 PNG，直接上传会显著拉长识别等待。
- 「识别空间」使用注册的多模态结构化 Prompt `drama.scene.state.3d_markers@v9`，输入当前状态的真实图片制品和场景环境参数，输出床、桌、椅、门窗等固定物体的类别、粗估距离、近似米制位置、长方体尺寸、朝向、置信度和必填图像证据区域。人物、动物和临时物品不进入标记集合；室外/自然场景可以返回空集合。Prompt 要求框完整覆盖物体可见主体（可留约 5% 边距），门框底部贴住落地线、家具框包含腿脚——框决定方位、大小与贴面位置，框不准三者会一起偏移。
- 覆盖与输出预算合同（v9 起）：识别是穷尽式标注——上下半区都要检查，按从左到右分段扫完 360° 视野，画面里每件可用类别物体各一个 marker，同类实例独立 label 区分（椅子1、椅子2），输出前逐类别清点数量。`contextPolicy.maxTokensBudget` 必须给足（当前 8000）：48 个 marker 的结构化清单远超早期 3000 预算，预算不足时响应被截断，表现为"家具覆盖不全"而不是报错。后处理对 `kind:label` 同名实例补序号而不是丢弃。背景：v6 曾把生成图分区规则误写进识别 Prompt 导致下半区系统性漏检（详见 `docs/wiki/debugging/generation-layout-words-in-recognition-prompts.md`）。v11 起（2026-08-28 前景/背景分层）全景图是纯背景：可移动家具通常不在画面里，识别以门窗楼梯等固定结构为主，明确禁止为看不见的家具编造标记；旧全景图里仍画有的家具照常识别。
- 前后保序合同（v9 起）：schema 必填 `approxDistanceMeters`（0.5–20 米），让模型给出到投射中心的粗估水平距离；它只解决同方位物体的前后排序（椅子在书桌前方就必须比书桌小），不是精确测距。投影只对 floor 锚点使用该值：径向半径 = clamp(粗估 − 厚度/2, 下限, 贴面上限)；wall 锚点（门窗）忽略它、始终完全贴面；缺失该字段的旧数据自动回退贴面。字段经 `normalizeMarker` 持久化并在重复归一化中保持不变。教训：不要用像素线索重算这个值——像素测距已被证明不可靠，远近判断只信视觉模型的语义输出。
- 使用高度合同（v10 起）：标记的 `size.y` 语义是"角色可用高度"，不是物体的视觉总高。可坐卧类别在 `STORY_SCENE_3D_MARKER_SIZE_POLICIES` 里用使用面区间钳制——椅子 y ≤ 0.65（座面）、床 y ≤ 0.9（床垫面）、沙发 y ≤ 0.75（座面）、书桌 ≤ 0.95；识别 Prompt 要求模型按座面/床垫面估算高度，靠背、扶手、床头板不计入 size.y。落地盒子的顶面即角色坐/躺的落点平面：后续把角色摆上去时直接取盒顶高度，不需要再判断靠背。`imageRegion` 仍覆盖整个可见物体（含靠背）以保证方位与宽度校准；这是"框管覆盖、y 管落点"的分工。
- 世界坐标合同固定为地面 `y=0`、`+Z` 指向全景水平中心、`+X` 指向右侧；`position` 是长方体中心。模型 `position` 不得把图片像素或固定坐标直接当成世界坐标；服务端以 `imageRegion` 为唯一投影依据。
- 投影合同（2026-08-27 起，半球贴面 dome-snap）：AI 标记不做图像测距。`projectStoryScene3dMarkerFromImageRegion` 只用 `imageRegion` 的两个可靠信息——水平中心确定方位（u=0.5 为正前 +Z），区域中心纬度与半球球面求交确定贴面点（球心在 `[0, projectionCenterHeight, 0]`，世界半径 = 直径字段 / 2）；随后把长方体沿径向内缩 `size.z / 2`，让整个盒子夹在轴心与球面之间：门、窗等 wall 锚点完全贴合球面（back face 触球），落地物体（door 与 floor 锚点）固定 `y=size.y/2` 落地，浮空墙面物（窗）保持交点高度。厚度取类别策略 `z` 下限做面板化；宽度取完整图像跨度、高度取 0.9 跨度并 clamp 到类别范围（v9 起覆盖系数统一放大，保证盒子盖得住物体）。标记朝向统一为径向方位角。手工标记与无 `imageRegion` 的旧 AI 数据保留原坐标；结果只依赖图像区域、环境参数与模型粗估距离，重复归一化幂等。空间标记仍是构图参照，不能当作精确测绘或碰撞几何。
- 历史背景：v6/v7 曾实现"三路深度估计 + 45° 方位墙聚类共享墙距"的测距方案（落地线/顶边高度/垂直跨度取中位、门权重加倍、60° 内墙距封顶）。它依赖生成图符合真实透视的假设，实际摆位经常看起来不对，且对初学者不可解释；2026-08-27 整体移除，改为可预期的"图像在哪、长方体就贴在哪"。墙聚类相关导出常量已随实现删除，新代码不要再引入测距逻辑——若未来确需深度差，先扩展 AI 结构化输出（例如让模型给出相对层级），不要回到像素猜测。
- 可行走地面薄板已整体移除（2026-08-26）：`STORY_SCENE_3D_MARKER_KINDS` 不再包含 `floor`，服务端不再从墙面深度合成 `scene-floor-walkable` 薄板，3D 视图也没有对应参考层。原因：它是叠加在真实全景上的合成参照物，视觉上盖住地面细节且与用户的直觉空间感冲突；角色站位约束已由舞台半径（半球边缘 1 米内缩，见下节）统一保证，薄板没有不可替代的价值。兼容规则：`normalizeMarker` 显式丢弃 `source.kind === "floor"` 的历史持久化行（缺这一步会让旧薄板被 coerce 成 `other` 类别残留），归一化幂等；`StoryScene3DMarkerAnchor` 的 `"floor"` 锚点是落地语义，与已移除的 floor 类别无关，不要混淆。
- 自动构图 Prompt `drama.shot.blocking.autoPlan@v12` 的道具语义（2026-08-28 起）见下节「前景道具与交互构图」：标记不再只是障碍，交互构图是首选；多角色结果仍必须输出有向角色关系，关系由服务端落实为接地/上方位置、相对体量和主动方朝向。
- 每次识别结果都保存 `sourceEnvironment` 快照。新结果缺少快照、标记状态不是 `ready` 或快照与当前环境任一参数不一致时，结果通常视为过期；但旧 AI 结果若每个标记都有 `imageRegion`，服务端会先用图像区域重新投影并绑定当前环境，完成一次兼容迁移。仍缺少图像证据或含手工标记的旧数据会在场景 3D 编辑器清空并提示重新识别，分镜上下文不会把它交给角色自动摆位。用户在未保存参数时点击重新识别，编辑器会先保存当前投射参数，再启动识别。
- 场景资产 3D 编辑器和分镜 3D 草图都渲染同一份半透明 PlayCanvas 长方体。共享 viewer 的场景层级：`app.root` 下有稳定的 `blocking3d-world` 世界节点，HDRI 背景（对象列表里的「世界」）和全部空间标记 cube 都是它的子对象；背景按状态图重建时不会连带销毁或移动标记，`createSceneMarkerRuntime` 通过可选 parent 参数把标记挂到该节点。共享 viewer 额外显示一个位于 `[0, projectionCenterHeight, 0]` 的半透明方形投射中心参考体，以及从地面到参考体中心的高度线；它不进入角色/标记拾取和 `layout3d` 保存，只随环境高度预览实时更新。用户可以从列表或直接点击空间标记选择并聚焦；标记不会写进镜头 `layout3d`，只作为构图参照和自动构图上下文。
- 自动构图 Prompt 接收 `sceneJson.markers`，需要避开固定物体体积，并用相邻位置表达坐、倚靠、经过等空间关系；没有标记时不得自行编造障碍物坐标。空间标记暂关期间 `sceneJson.markers` 恒为空数组，自动构图只依赖站位半径约束。
- 自动构图 Prompt 接收 `sceneJson.markers`；标记语义自 2026-08-28 起由"障碍避让"升级为"前景道具交互"（见下节），只有未被动作引用的道具才按障碍避让；没有标记时不得自行编造障碍物坐标。

### 前景道具与交互构图（暂关期间不生效）

> 本节合同随空间标记功能整体暂关（见节首说明）进入休眠：添加标记入口、标记数据与 `interactionMarkerId` 构图在开关改回 `true` 前不可达。合同文本保留为恢复时的实现依据。

- **Background：** 2026-08-28 用户决定漫剧场景按"背景 + 前景"分层生产——全景图只画固定装修与环境（墙、地面、门窗、天空、远景），桌椅床沙发等可移动家具不再画进全景图，由用户在 3D 场景里以前景道具标记的形式自己摆放；角色摆位要能与前景道具交互（坐在椅子上、躺在床上、倚靠桌柜），而不是只能"在道具旁边"表达关系。
- **Decision：** 三条链路同步改造。① 生成合同：`scenePanoramaLayout.ts` 增加 furniture-free background/backdrop 规则并把家具全量列入负向提示词（场景文案提到家具也不画）；② 前景摆放：`createStoryScene3dMarker`（shared/utils/scene3dMarkers.ts）按类别默认尺寸创建 `source:"manual"` 标记，场景 3D 编辑器「空间标记」区提供类型选择 +「添加标记」，新建标记集合必须带当前 `sourceEnvironment` 快照（否则 `sceneMarkersAreCurrent` 判定不过、标记不渲染）；③ 交互构图：`drama.shot.blocking.autoPlan@v10` 的 actor 增加可选 `interactionMarkerId`。
- **Current Rule：** 自动构图的道具交互规则——动作涉及坐下 → 角色落在椅子/沙发/床沿座位处（`position.y≈0.45` 座面高）、`pose=sitting` 并填 `interactionMarkerId`；躺/睡 → 床面或沙发上（`position.y≈0.5` 床垫面）、`pose=lying`；伏案/倚靠 → 紧贴道具边缘、`pose=sitting/interacting`。`interactionMarkerId` 只能指向 `sceneJson.markers` 里真实存在的标记，`postValidate`（`parseSceneJsonMarkerIds`）校验，指向不存在的 id 属于 AI 幻觉、报错走语义重试，不静默丢弃。未被动作引用的道具与门窗楼梯仍是障碍，角色不得站进其长方体；只有 `interactionMarkerId` 指向的道具才允许身体进入。
- **识别与手动的共存：** 重新空间识别整体替换 AI 标记，但 `mergeStoryScene3dMarkerSets` 会把此前的手动前景道具按原坐标原样带回（同 id 不重复）；环境参数变化仍触发 CAS 报错要求重新识别，手动标记不豁免。
- **下游一致性：** 全景图不含家具后，首帧画面的家具来源=摆位草图 PNG 中的道具长方体 + keyframe 提示词的家具摘要行。`DramaShotKeyframeService.collectForegroundProps` 汇总场景各状态标记的类型（同类合并计数如「椅子×2」，上限 12 类），注入「场景内前景家具（按摆位草图的位置与朝向呈现）」提示词行（`drama.shot.keyframe@v3`）。
- **Failure Modes：** 新建标记集合漏带 `sourceEnvironment` → 标记不显示且分镜上下文拿不到（表现为"添加成功但列表没有"）；识别 Prompt 恢复家具穷举措辞 → 模型在空背景图上编造家具标记；autoPlan 校验跳过 marker id → AI 幻觉 id 落进 layout 且无人发现。不要把交互角色的 y 钳回地面——坐/躺落点依赖 AI 输出的座面/床垫面高度。
- **Related Modules：** `shared/utils/scene3dMarkers.ts`（工厂/默认尺寸/合并）、`DramaScene3DPage.tsx`（添加标记 UI）、`StoryScene3dMarkerService.ts`（识别保留手动）、`shotBlockingAutoPlan.prompts.ts@v8`、`DramaShotBlockingSketchService.ts`（editor context）、`DramaShotKeyframeService.ts` + `shotKeyframe.prompts.ts@v3`（家具摘要）、`scenePanoramaLayout.ts`（纯背景合同）。

### 模型库前景与 HDRI 纯背景分层

- **Background：** 可交互的桌、椅、床、书柜和其他前景道具需要真实模型、真实尺寸和可复用的摆位数据；把它们画进等距柱状 HDRI 会同时失去交互能力，并在地面区域产生拉伸。HDRI 的职责因此收敛为不可交互的空间背景：室内只表现墙、天花板、地板及门窗等固定结构，室外以天空、地形和建筑天际线等远景为主。
- **Decision：** 场景状态新增 `scene3dForegroundModels`，每个实例只引用模型库的稳定 `modelId`，并保存实例 `id`、名称、分类、位置、Y 轴朝向、统一缩放和 `usage` 支撑面/摆放方式；实例渲染挂在独立的前景根节点，不进入 HDRI 世界背景。场景 3D 编辑器负责从可见模型目录选择、添加、选中和调整实例，分镜 3D 草图恢复同一批实例并将它们写入 `layout3d.foregroundModels`。
- **Current Rule：** 场景全景生成提示词必须在场景描述之后追加家具/可移动物负向约束，并按室内/室外约束背景范围；不能因为原文提到书桌、椅子或其他道具就把它们重新画进 HDRI。模型库前景实例必须通过共享归一化器校验安全 ID、位置、朝向和缩放；自动构图 Prompt 只允许用 `interactionModelId` 指向 `sceneJson.foregroundModels` 中已存在的实例，模型不存在时走结构化语义重试，不能凭名称或关键词编造坐标。模型实例作为障碍与交互承载物参与构图，首帧提示词同时接收摆位草图和模型摘要，因此生成画面不会回退到只含场景背景的原图。
- **Compatibility：** 旧 `scene3dMarkers` 和 `interactionMarkerId` 合同仍保留用于存量数据读取，但空间标记总开关关闭时不再生成或下发它们；新功能不重新打开旧的“从 HDRI 识别家具”路径。没有模型库实例的旧场景仍可只使用 HDRI 和角色代理，不会因缺少新字段而失效。
- **Failure Modes：** 只改全景负向提示词而不把模型实例接入场景状态，仍会导致分镜无法摆放家具；只把模型写入场景页而不写入 blocking context，自动构图和首帧提示词会看不到它们；接受 AI 返回的未知模型 ID 会造成模型交互漂移；把模型节点挂进 HDRI 根节点或在截图时把编辑器辅助线一起捕获，会把前景和背景再次混在一起。
- **Related Modules：** `server/src/services/image/panorama/scenePanoramaLayout.ts`（纯背景生成合同）、`shared/utils/scene3dForegroundModels.ts`（实例归一化）、`shared/types/novelReferenceExtraction.ts`（状态字段）、`DramaScene3DPage.tsx` 与 `components/blocking3d/blocking3dForegroundModels.ts`（场景添加/运行时）、`DramaBlocking3DPage.tsx` 与 `blocking3dViewerApp.ts`（分镜恢复/编辑）、`DramaShotBlockingSketchService.ts`（layout/context）、`shotBlockingAutoPlan.prompts.ts` 与 `DramaShotKeyframeService.ts`（交互校验/首帧摘要）。

### 舞台余量与相机锚定合同

- 舞台半径：角色可活动范围是以投射中心为圆心、半球真实半径内缩 1 米的圆（`STORY_SCENE_3D_ACTOR_STAGE_MARGIN_M = 1`），合同实现在 `shared/utils/blockingStage.ts`。当前环境字段 `radiusMeters` 已经是真实圆半径，舞台半径 = `radiusMeters − 1`；旧快照中的 `domeRadius` 仍按历史直径读取为 `domeRadius / 2`。blocking3d 的基础网格半径保持 0.5，只有 PlayCanvas 实体缩放边界换算为 `radiusMeters * 2`。强制点只有两处——AI 自动构图出口的程序化 clamp 与 viewer 交互输入（拖拽/nudge）的实时 clamp；保存路径不做破坏性 clamp，旧布局里越界的角色不会被静默改动。
- 相机锚定：自动构图的拍摄位必须落在投射中心 `[0, projectionCenterHeight, 0]`（全景图的原始取景点）。实现方式是 `anchorBlockingCameraAtProjectionCenter`：保持 LLM 给出的视线方向与拍摄距离不变，仅把 focalPoint 重写为 `投射中心 − D*distance`，因此构图朝向、取景远近和 fov/DOF 全部保留，只有相机位置被归中。fov/裁剪面/景深不参与锚定。
- Prompt 合同：`drama.shot.blocking.autoPlan@v3` 在 system 中声明舞台半径规则与"拍摄位固定在投射中心"，并在 HumanMessage 追加【摆位限制】数值行（可用站位半径 X 米 + 投射中心高度）；服务端程序化合同是兜底而不是唯一约束。
- Viewer 常驻绘制两条参考圈（各 96 段线、随环境参数实时重算）：琥珀色半透明是舞台余量边界，青色半透明是半球自身的地面边界（圆半径处）。调“圆半径”滑块时两圈同时重算，便于对照球边与舞台余量的关系。半球世界半径换算统一走 `resolveStoryScene3DWorldRadius`，视图代码不得自行重复换算。actor 拖拽和 nudge 的落点径向 clamp 到舞台半径并保持方位角。手动相机导航保留自由度——锚定合同只约束自动构图产出；用户若手动挪动相机再保存，属于显式创作调整。
- 场景摄像机实体（Unity 风格，2026-08-27）：viewer 里的摄像机是**独立于编辑视角的场景对象**，由 `blocking3dShotCamera.ts` 的运行时承载（机身实体 `blocking3d-camera-body` + 右下角取景画中画），共用一份独立机位 pose `{ position, yawDeg, pitchDeg }`。编辑视角导航（右键旋转/滚轮/中键/WASD）只改轨道 `cameraState`，不会带动机身——机身不再固定停在屏幕中央挡住布景。机位 pose 的编辑通道：视口拖拽机身（地面平移）、移动/旋转变换手柄、对象列表「摄像机」+ 属性面板（位置 X/Y/Z、旋转 Y、俯仰角、FOV）。它与角色/标记互斥可选中（`selectCamera`/`onCameraSelection`）。旧布局没有机位字段时从轨道相机推导（`deriveShotCameraPoseFromOrbit`），新布局把 pose 持久化到 `layout3d.shotCamera`（服务端 `normalizeBlockingSketch3dLayout` 与 HTTP zod 同步校验，越界拒绝）。取景画中画从机位 pose 渲染「这台摄像机拍到的草图内容」：选中摄像机或打开「镜头取景」开关即显示（Unity camera preview 语义），FOV 与轨道相机共用 `cameraState.fovDeg`。机身与画中画都是编辑器辅助对象：`capturePng` 期间隐藏，导出的摆位草图不包含它们；背景/环境重建不得连带销毁机身。
- 摄像机 gizmo 是白色线框（Unity 风格，2026-08-28）：`drawGizmo` 每帧按机身/镜头实体的世界变换画**白色**盒体线框（机身 + 镜头短筒）+ 从镜头前端展开的 16:9 取景锥线框（`blocking3dCameraGizmo.drawFrustumWireframe`），常驻显示不随「镜头取景」开关；选中摄像机时线框整体切橙色（与选中描边同色）。实体网格 `opacity = 0` 完全透明，只承担拾取命中体（`rayHitsBody` 依赖 mesh AABB）与变换手柄挂载点；改视觉不要恢复实体渲染，改线框颜色常量即可。
- 取景画中画的图层隔离（2026-08-28）：画中画相机显式只挂 `[LAYERID_WORLD, 构图线图层]`，**绝不能用 `= editorCamera.layers` 引用别名**，也绝不能渲染机身——取景相机与机身同点位，一旦渲染机身，预览中央会被机身自发光面糊满（历史上踩过：用户看到"预览中间一块蓝色"）。机身与镜头渲染在 viewer 创建的 `blocking3d-editor-overlay` 辅助图层（编辑相机追加该图层，画中画不挂）；网格、边界圈、投影中心 gizmo、取景锥、标记轮廓都走 IMMEDIATE 线图层，画中画自然不渲染。三分构图线（2 横 2 竖、半透明白）由 `drawCompositionGuides` 每帧画进画中画专属图层 `blocking3d-shot-composition`，纵横比按小窗 rect 换算（不是整个画布），编辑主视口不出现。注意 PlayCanvas `Gizmo` 基类构造时会 `camera.layers = camera.layers.concat(layer.id)`——引用别名会让图层串进两台相机，新增相机图层时必须给每台相机 set 全新数组。
- 场景状态图完成新的不可变制品提交时，旧 `scene3dMarkers` 会被清除，要求重新识别；生成中、失败或取消只更新图片尝试状态，保留最后一张可读图片及其标记。识别写回同时以 `statesJson` 和 `scene3dEnvironmentJson` 做 CAS，并在写入前复核图片制品指纹与环境快照，防止慢分析覆盖新图片或新投射参数。
- 穹顶相机边界（2026-09-02）：场景摄像机实体和最终拍摄机位仍必须落在全景穹顶世界内，避免导出的镜头机位落到 HDRI 壳外。合同实现在 `shared/utils/blockingStage.ts`：`clampBlockingCameraPositionToWorld` 把世界坐标位置收敛进「水平边界圆（真实半径 × `STORY_SCENE_3D_CAMERA_BOUND_RATIO` = 0.95）+ 地面最低 0.1 米 + 上半球壳（高于投射中心的部分落在以投射中心为球心的球内）」三重边界；`clampBlockingCameraOrbitToWorld` 默认仍保持方位角/俯仰角与视线方向不变，并把轨道相机距离收进壳内。编辑轨道相机调用它时传入 `{ constrainDistance: false }`，只收敛焦点，不再受穹顶半径或旧的 100 米上限截断；滚轮距离由 `normalizeBlocking3dCameraDistance` 保持不低于 0.25 米并处于 JSON/浮点安全范围，`syncCamera` 再用 `resolveBlocking3dEditorFarClip` 按距离扩大远裁剪面。这样用户可以从远处查看完整场景，而 `setShotCameraPose` 和保存的独立拍摄机位仍走正式世界边界；旧布局载入时也不会把编辑视角的远距离误写成拍摄机位。

### 静态姿势与关键帧

姿势使用稳定的业务枚举保存，不把具体 GLB 动画剪辑名暴露给 API。当前支持站立、交谈、抱臂、坐着、蹲下、跪下、躺着、趴着、走路、跑步、指向、持物、互动、战斗和持剑。用户选择姿势后，运行时只截取对应关键帧，不提供播放动作入口。`resolveBlocking3dPosePresentation` 先选择姿势专用片段；统一动画容器缺少 `lying` / `prone` 专用片段时，显式使用实际可见的 `Slide_Loop` 低姿态片段作为贴地代理，`actor.pose` 仍保存用户或 AI 请求的业务姿势。非贴地姿势不允许使用这种代理，缺少安全贴地片段必须报错，避免动作错误被伪装成站立或把模型旋转出取景范围。

角色代理模型的颜色属于角色级 3D 摆位状态。右侧“模型外观”控件只作用于当前选中的角色，运行时立即更新 PlayCanvas 材质，导出 `layout3d` 时保存为 0–1 范围的 RGB 三元组；旧快照缺少颜色字段时继续使用默认调色板。颜色只改变 3D 草图代理模型，不会修改角色资产原图或最终角色设计稿。

统一 UAL2 代理资源缺少稳定的专用“趴着”剪辑时，运行时使用实际可见的 `Slide_Loop` 低姿态片段作为显式贴地代理；业务快照仍保存 `prone`，以后替换代理资源不需要迁移数据库数据。代理不旋转根节点，姿势只服务摆位，不替代角色真实设计稿。

### 数据与下游

`layout3d` 使用版本化结构保存：

- `schemaVersion` 固定为 `1`，并声明 `engine: "playcanvas"`。
- `camera` 保存方位角、俯仰角、距离、观察焦点、FOV、近远裁剪面和景深参数（开关、焦点距离、清晰范围、模糊半径）。
- `actors` 保存角色名、三维位置、绕 Y 轴朝向、缩放、姿势、可选的 0–1 RGB 颜色和兼容字段 `actionPlaying`；该字段必须是 `false`。颜色缺失时按代理角色加入顺序使用默认调色板，颜色存在时必须通过服务端范围校验。
- 服务端只做结构校验、范围归一化和结构化关系的几何落实；自动构图由注册 Prompt 负责，不根据角色名或文本关键词猜测摆位。AI 返回的角色集合必须与当前镜头出场角色逐一一致，缺失、重复或新增角色会拒绝应用；多角色结果缺少关系、关系端点未知或关系重复时也拒绝应用。
- 下游分镜生成优先消费已确认的 PNG；`layout3d` 负责恢复和继续编辑 3D 摆位，不能绕过确认状态直接成为生成参考图。
- 场景图版本标记（2026-09-02）：场景状态图按稳定路径覆盖存储，重新生成后 URL 不变而内容已换，只对比 URL 发现不了「草图背景用的是上一版全景」。3D 草图保存时在 `blockingSketchData.scene.imageUpdatedAt` 记录当时状态图的 `image.generatedAt`（每次保存都从编辑器上下文刷新身份与标记，编辑器渲染的就是当前场景图）；项目载荷附带 `sceneImageVersions`（sceneId → 当前 `generatedAt`，`DramaProjectService.getProject` 组装），分镜列表用 `isBlockingSketchSceneImageStale` 两级判定后显示「场景图已更新」徽标。两级判定：新草图带标记时标记与当前版本不同即过期；上线前的旧草图没有标记，用 `generatedAt` 截图时间兜底——当前场景图生成时间晚于截图时间即过期（这正是第 3 镜类历史残留的形态，光靠标记永远漏掉）。两个刻意的不判定：当前场景图缺版本标记不判过期、两级证据都无法解析时不判过期（避免整体误报）；过期不阻塞 AI 图生成，只是可见的状态反馈与重截引导。
- 3D 视口可以随工作区自适应，但摆位 PNG 始终按开发基准 1280×720（严格 16:9）捕获，避免浏览器窗口尺寸改变分镜参考图契约。
- 退出保存流程会在写入快照、捕获 PNG 和上传确认期间锁住视口及控制面板；保存结束后再返回分镜，确保 JSON 空间状态和 PNG 构图来自同一次摆位。自动构图只在布局成功校验后应用，失败时保留原有布局。
- 从应用内返回分镜时，退出动作必须先等待快照、PNG 和确认状态保存成功，再刷新分镜项目查询；因此保存后的 3D 图会立即成为分镜列表的最新预览。分镜列表给 3D 图地址附带生成版本，避免稳定的图片接口被浏览器缓存成旧草图。
- 分镜预览的「3D 草图」和「AI 图」是两个独立来源：当 AI 图尚未生成或加载失败而存在已保存的 3D 草图时，必须优先显示 3D 草图；AI 图标签保持禁用，避免分镜落入空白预览。AI 构图只从 3D 草图编辑器内显式触发，复用结构化自动构图并在退出时统一保存 JSON、PNG 和确认状态。只有两种图片都不可用时才显示 AI 图空状态和重新生成入口，不能用场景状态图冒充 AI 首帧。AI 首帧生成结果如果与任一参考图逐字节相同，统一运行时会把任务写为失败，历史上已经落盘的同类文件则由图片路由隐藏。


- `drama.shot.blocking.autoPlan@v12` 承载导演工艺基线：景别→主体距离、三分法与 headroom/lead room、双人对话 180° 轴线、机位俯仰语义，以及先识别有向角色关系再规划坐标。结构化 `relations` 明确 `on_top_of` 的上下方向、`sizeRelation` 的体量方向和主动方朝向；上方 subject 默认使用 `crouching` 或 `kneeling`，动作明确要求贴地伏压时可使用 `prone`，下方承载者使用 `lying` 或 `prone`。这些语义由 Prompt 判断，服务端将关系端点确定性落实为位置、体量和 yaw，不从动作文本增加关键词分支，`compositionNote` 继续让模型自述构图依据。
- 构图的几何正确性由服务端确定性兜底：`fitAutoPlanCameraFovToActors` 用与前端一致的 orbit 公式和 16:9 对角半角覆盖判定每个角色的脚点/头顶是否在取景锥内，出界时只放宽 fovDeg（上限 schema 的 100°），绝不改动方向、距离、焦点与景深等创意参数——这是「AI 决策 + 确定性后处理」边界的范例。
- 编辑器镜头取景辅助由两部分组成：场景摄像机的白色线框 gizmo（常驻，见上）+ 第二台 PlayCanvas 相机以 viewport rect 渲染右下角画中画（从独立机位 pose 渲染，无 CameraFrame 后效，画面上叠加三分构图线）。画中画由 `setShotCameraHelpersVisible` 开关控制，选中摄像机或打开「镜头取景」时显示，AI 构图应用后自动打开；`capturePng` 导出前必须先冲掉上一帧排队的参考线并隐藏画中画与机身，保证摆位草图 PNG 只有布景与角色。
## Failure Modes

- 不能把通用代理模型当成最终角色渲染结果，否则会把低模、临时材质和动画库限制带进成片。
- 空间标记不是精确测绘数据，不能把低置信度长方体当成碰撞检测或最终布景；它只用于快速判断角色与固定物体的相对关系。
- 不能把标记存到场景顶层或镜头快照，否则切换状态图后会继续显示旧家具，或者同一场景的镜头之间出现不可解释的状态漂移。
- 图片制品变更后如果仍存在旧标记，说明图片提交路径绕过了场景状态失效策略；应先检查最终制品提交分支和 `statesJson` CAS，不要在前端单独清空来掩盖数据竞态。若图像区域与世界方向不一致，应先检查多模态桥是否把真实图片传给了模型，再检查全景 `u` 到 X/Z 的投影合同。
- 家具被整体推到场景边缘时，先检查其 `imageRegion` 底部是否明显高于真实落地线：框底每抬高一点，落地线深度就会放大，新的三路估计（落地线/顶边/跨度）取中位数能缓解单边误差，但框整体太松仍会把家具推远。门窗悬空或穿墙时，先检查门框底部是否贴住地面接触线、窗框是否把整段墙面框了进去；孤立窗只靠类别典型高度反算，同面墙有门时以门的落地证据为准。家具越过墙面说明该方位 60° 内没有可用墙簇，或墙簇本身的门证据失效。
- 不能只保存 PNG 而丢失 `layout3d`，否则用户无法继续调整空间关系和姿势。
- 不能把 3D 草图确认前的图片注入分镜生成或批量任务；确认状态仍是参考图锁定的闸门。
- 不能把 AI 自动构图结果直接落库后再校验；必须先校验角色集合、相机范围和 3D 快照，再由前端加载并在退出保存链路中统一确认。
- 不能删除旧二维数据或要求已有项目重新摆位；缺少 3D 快照时必须能够从旧二维布局恢复一个可编辑的默认 3D 场景，但前端只暴露 3D 草图入口。
- 姿势枚举是业务契约，代理 GLB 的剪辑名可以变化。若某个代理缺少剪辑，应明确报出资源能力问题或采用已定义的近似剪辑，不得静默把用户选择改成站立。
- viewer 的销毁重建只能由环境图变化触发。任何从环境参数派生的状态（例如空间标记的“当前有效”判定）不得进入 viewer 创建 effect 的依赖数组：拖动环境滑块会持续翻转该判定，导致 viewer 连续整体重建（HDRI 重载 + EnvAtlas + 半球网格/投影材质初始化），页面卡死且视口黑屏。标记显隐必须走 `viewer.setSceneMarkers` 增量更新。同理（2026-09-02 修复），编辑器页的 viewer 创建 effect 不得以 `context` 对象为依赖：保存成功后的失效刷新会让 context 换对象身份，effect 重跑即销毁正在编辑的视口并用旧快照重建，未保存的 AI 构图/手动摆位被静默丢弃（实测症状：AI 构图提示成功，返回分镜保存的却是默认站位）。正确写法是依赖场景环境图 URL 原始值（`sceneEnvironmentUrl`），其余 context 数据经 `contextRef` 读取最新值。

### HDRI 环境

场景状态图加载到内侧剔除的 EnviroDome 式环境网格中。所有状态图都使用一份连续的上下表面：生成源图默认以 `v=0.5` 作为安全地平线，3D 投影地平线由场景的 `panoramaHorizonV` 参数决定；其上方用于天空/远景和环境物体，下方用于弧形地面。上下表面必须共享唯一的地平线顶点圈，并由同一个 `MeshInstance` 和材质一次绘制，不能用两个独立网格在同一位置叠边，否则光栅化会留下细缝。交界圈的世界高度必须与投射中心高度一致，使其投影方向落在当前全景地面分界；2:1 等距柱状图也必须走这条带投射中心的 EnviroDome 路径，不能因为画幅接近 2:1 而改用不受投射中心高度影响的完整穹顶；否则直径或高度修改只会保存成功、视口却没有视觉变化。地面仍然是带贴图的弧面而不是后置平面。半球生成器必须把 `sin(0)`/`sin(π)` 的浮点残差归零；极点的空间坐标要精确收敛，投影材质在水平分量接近零时必须直接使用固定经度，不能先执行未定义的 `atan(0,0)`。加载成功后隐藏仅用于无环境时兜底的纯色地面平面，定位网格仍作为辅助线绘制在地面上。环境实体固定在世界坐标，Y 轴固定在世界地面；相机旋转或移动只改变视点，不搬动环境地面。没有状态图或环境加载失败时恢复纯色地面。

地面全景贴图不能把 `atan2` 得出的经度直接写入地面顶点 UV。中心平底的三角扇会对角度 UV 做线性插值，产生环状漩涡；首尾经度还会在纹理边界形成可见拼接线。当前 EnviroDome 材质从世界空间投射中心指向当前片元、归一化为连续方向后，在片元阶段直接采样原始 2:1 等距柱状源图；经度循环、纬度夹取和极点固定经度都在着色器里处理，不把中心扇区的角度写入顶点 UV。这样避免先压缩到固定尺寸立方体后再从 nadir 取样造成的额外清晰度损失与地面放射状拉伸；`.hdr` 的 RGBE 源仍按 RGBE 解码，普通图片源沿用 gamma 解码，源图同时继续作为环境光照 atlas 的输入。地面几何只保留常量占位 UV 以满足 PlayCanvas 顶点流要求，不得把它重新当作全景投影 UV。CPU 投影数学仍保留用于兼容数据和回归测试。地面几何只负责平底与外圈弧面的连续拓扑，不能重新恢复地面顶点 UV 投影。

投射中心的南极奇点由共享投影材质单独处理：地面内侧按半径比例建立 8%–28% 的有限稳定投影环，中心固定经度，外圈的经纬度重新对齐原始等距投影，再以 `smoothstep` 连续退出。该稳定环是渲染时的内部保护，不写入场景环境参数、不绘制可见分界线，也不能通过重新引入立方体重投影来替代。

场景状态图、旧版场景全景图和漫画场景全景图的生成提示词必须与这套映射保持同一空间契约（统一在 `server/src/services/image/panorama/scenePanoramaLayout.ts`，2026-08-26 起为三区构图，2026-08-29 起升级为纯背景构图）：生成图固定以 `v=0.5`（底部 50%）为地平线、`v=0.3`（底部 70%）为天空分界，分界常量为 `shared/types/comicDrama.ts` 的 `STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V` / `STORY_SCENE_3D_PANORAMA_SKY_V`，提示词措辞与常量必须同步修改；下区 `v=0.52–1` 只保留一整片连续、干净的地面/地板/地形和少量低矮细节，任何物体、家具腿或物体碎片都不能跨越中心安全带 `v=0.48–0.52`；中区 `v=0.3–0.5` 是远景带，只保留远山、天际线、远景树木与室内远墙门窗等纯背景（完整位于 `v=0.3–0.48` 并留安全边距）；2026-08-29 起任何区域都不得出现可摆放前景道具——室内家具（床、桌、椅、沙发、柜体等）与室外近景石块、草丛、灌木一律不入图，它们改为后续摆放 3D 模型，全景只承担背景职责；上区 `v=0–0.3` 只保留干净天空/天花板、云与光照，远景物体和建筑顶部不得越过天空分界。通用行同时要求下半区按「俯视纯地板材质」渲染而不是房间透视视图，给模型一个可达成的目标来对抗写实透视先验。带参考图重新生成场景状态图时必须显式声明「参考图只锁材质、光照与场景身份，家具位置、物体大小与垂直构图一律随分区规则」——旧图本身往往越线，不堵住这条泄漏，越线构图会随参考图代代相传。室内是越线重灾区：真实等距柱状摄影里墙脚线与近处家具必然落在视线以下，契约与物理透视先天冲突，模型会在两者间摇摆。因此 `sceneType=interior` 的生成通过 `scenePanoramaLayoutLinesFor` 放弃真实透视框架，改用物理自洽的舞台布景式双层构图——上半层是正面平视的房间背景板（2026-08-29 起只画门窗与固定装修的裸建筑，家具一律不画），下半层是独立的地板材质样片且完全留空；残余结构大到会越过中线时整体画小画远，通用行同时给出「物体最低点以 v=0.5 为硬顶」的可执行逃逸规则；墙面装饰默认只出海报/画作/挂钟/镜子等装饰品；照片是条件项——场景描述明确提到（如老照片）才允许上墙，且必须带相框、未写数量时最多一张、不得额外铺成照片墙（提示词没提照片时一张都不出，否则主角空间挂陌生人照片出戏；海报上的明星/动漫角色属于装饰媒体，不受此限）。场景描述和 bible 内容只作为背景上下文，各入口必须在这些语境之后追加共享分层规则，确保「允许的背景」与「禁止的前景」最终生效；三个生成入口（状态图、旧场景全景、漫画场景全景）都按 sceneType 走同一辅助函数，新增入口不得内联复制布局行。大型物体不得深入下半部或延伸到天底附近，因为等距柱状投影会在那里产生明显拉伸；不能用均匀铺满地面的物体和细节替代自然地面材质。这里的分区是纹理坐标约束，不是让模型绘制分割线或拼贴图；中心安全带内出现被切开的物体时，空间标记识别也应跳过该物体。3D 场景编辑器的 `panoramaHorizonV` 是可保存的投影参数（界面名「分界线」），默认 `0.5`、可调范围为 `0.45–0.55`，只改变源图到空间地平线的映射，不修改源图内容或绘制可见分割线，也不反馈进生成提示词。

资产状态编辑器只负责查看和生成这张 2:1 状态图，不承载可拖拽的全景空间预览；场景状态的平面图预览叠加两条构图参考线（50% 地平线与底部 70% 天空分界，读共享分界常量），用于对照生成结果是否符合三区构图。需要相机、投射中心或角色摆位时，必须从状态图下方的「3D编辑」进入独立的场景 3D 编辑器。这个操作栏必须紧跟在图片容器之后，不覆盖图片内容，也不能被 `LightboxImage` 的交互层遮住。这样状态信息编辑与空间构图编辑保持单一职责，生成的等距柱状源图仍完整保留给 3D 环境加载链路。

3D 编辑器加载当前状态的图片地址作为 HDRI 环境；只要存在可读取的 `state.image.url` 就应尝试加载，不应额外依赖历史数据中的 `status` 已同步为 `done`。状态标记延迟不能让已有场景图退化成无背景的纯色地面。

源环境纹理使用线性采样、关闭 mipmap 和各向异性过滤，经度方向循环寻址、纬度方向边缘夹取；可见 EnviroDome 与环境光照 atlas 共用原始环境纹理，投影材质在片元阶段按世界方向直接采样，`.hdr` 与普通图片分别走 RGBE/gamma 解码。连续 EnviroDome 共用一套按世界坐标投影的材质：上半部采样天空/远景，下半部采样地面，投射中心水平面保持同一方向连续采样。自定义着色器必须沿用 PlayCanvas 标准材质的 sRGB 解码、tone mapping 和 gamma 输出，否则环境图会绕过标准颜色空间流程而明显变亮。天空和地面必须属于同一份连续几何和同一个 `MeshInstance`，不能用两套显示材质或重复边界制造亮度、颜色或光栅断层。两种显示区域都不应依赖场景直射光来保持环境细节。状态图 URL 返回 404 时属于资产文件缺失，不是环境参数保存失败；编辑器应保留明确的加载失败提示，修复方式是重新生成当前状态图。

`NovelScene.scene3dEnvironmentJson` 是场景资产的唯一 3D 环境参数源，保存投射中心高度、`projectionCenterHeightRatio`、真实圆半径 `radiusMeters` 和 `panoramaHorizonV`。未定制时统一使用中性默认：圆半径 `7.5` 米、投射中心高度 `2` 米、比例 `4/15`、分界 `0.5`；环境默认不再按场景类型分叉。同一场景的环境参数只有一份，切换状态或进行空间标记分析时都复用它。当前圆半径范围为 `2.5–15` 米，比例范围为 `10%–40%`，投射中心高度范围为 `0.25–6` 米，世界高度始终由“圆半径 × 比例”派生，拖动圆半径时投射中心等比跟随；`panoramaHorizonV` 的范围为 `0.45–0.55`。旧快照中的 `domeRadius` 仍按历史直径兼容读取并除以二，旧直径 `5–30` 映射为当前半径 `2.5–15`；旧快照有显式高度比例时按旧直径比例换算，新字段输出只写 `radiusMeters`。用户明确保存过的自定义参数不因类型或图片分析变化而重置；状态图片变化后，未定制环境才按图片指纹重新分析。投射中心严格位于世界 X/Z 原点，只有世界 Y 高度可调。

场景 3D 编辑器对用户展示的是「半球直径」，范围固定为 `5–30` 米；交互值进入保存合同前除以二，内部 `radiusMeters` 仍表示投射中心到边界的水平半径。这样界面语义与半球几何一致，同时保持历史环境参数和服务端输入兼容。

场景 3D 编辑器的高度、圆半径和全景地面分界滑块只更新本地预览状态，不启动防抖保存；退出场景编辑时才提交一次最新环境参数，并等待同一条保存 Promise。分镜 3D 草图的角色、姿势、相机和空间操作遵循同一条退出保存规则。接口失败时不导航离开，也不通过浏览器确认框丢弃用户状态。

`layout3d.environment` 只作为旧镜头快照的兼容字段读取，不能覆盖场景资产参数。分镜 3D 页面每次从服务端上下文读取匹配场景的 `scene3dEnvironmentJson`，把它覆盖到 viewer；保存分镜时从导出布局剥离环境字段，避免新的镜头继续产生独立 HDRI 覆盖。这样同一场景的不同分镜会使用同一份高度、圆半径和全景地面分界，已有快照缺少分界字段时仍按 50% 打开。

普通场景图的下半球在投射中心附近使用有限平底，半径 `0.95` 以内保持可用地面，最外侧弧面连续过渡到随投射中心和实际半球尺寸计算的地平线高度；弧面的外缘切线应接近垂直地接入上半球，内缘切线应水平落到平底，不能用固定斜率的窄带直接切断半球。当前弧面使用足够的径向细分，并把这两个切线条件作为几何回归约束。这是网格形状约束，不是纹理 UV 的硬裁切。平底中心只保留一个几何顶点，不能继续用下半球极点复制一整圈经度，否则地面三角扇会把纹理压成尖刺。地面顶点只使用常量占位 UV，投影材质在片元阶段按实际世界坐标、投射中心和半球尺寸计算 `u/v`，避免中心三角扇插值角度 UV 形成圆形漩涡；经度采样使用循环寻址，不能把贴图重复铺成普通地面纹理。旧快照中的 `groundTextureScale` 作为未知字段被忽略，新的导出数据不会再写回。

HDRI 纹理加载后必须标记为等距柱状投影，并由 PlayCanvas `EnvLighting.generateLightingSource` 和 `EnvLighting.generateAtlas` 生成 `Scene.envAtlas`。该 atlas 负责角色代理的环境反射、环境漫反射和整体明暗底色；半球自发光材质只负责显示原始场景图。由于 EnvAtlas 的漫反射是低频环境光，它不会自动把窗户、太阳等高亮区域变成明显的直射光，因此 viewer 还要从 HDRI 上半部的高亮像素估算方向、颜色和受限强度，更新一盏只存在于 viewer 生命周期的 `directional` key light。它与 EnvAtlas 叠加，用来让角色呈现与窗户/太阳方向一致的受光面；不增加固定补光，也不把估算结果写入 `layout3d` 或场景环境参数。像素读取失败时使用稳定的斜上方后备主光，不能让一次 canvas/CORS 读取失败阻断 HDRI 半球和 EnvAtlas。

PlayCanvas 的 `.hdr` 资源不是浏览器图片，而是 `TEXTURETYPE_RGBE` 的 RGBA8 字节缓冲：前三个通道是共享指数编码的颜色，Alpha 通道是指数。方向光估算必须优先读取 `Texture.getSource()` 的 RGBE 缓冲并按同一套 RGBE 解码恢复亮度，再把最亮区域映射回与可见 HDRI 相同的等距投影方向；只有普通图片源才走 canvas 读取。这样不能把“无法 `drawImage`”误判成没有直射光，也不会让方向光与全景高亮位置错位。

HDRI 下方地面上的角色阴影不能直接由可见投影材质承担：可见半球是按世界坐标采样原始环境纹理的自定义 shader，不包含 PlayCanvas 标准材质的阴影片元块。正确边界是保留可见 HDRI 网格，再用同一套下半部地面/弧面几何创建独立的 `StandardMaterial.shadowCatcher` 网格：材质使用 `BLEND_MULTIPLICATIVE`、关闭 skybox 与深度写入，只把方向光阴影乘到下半部，不给天空加黑影；由于下半部拓扑沿用内侧投影的绕序，接收层使用双面剔除。HDRI 派生方向光、代理角色和场景阴影开关必须同时启用，接收层设为 `castShadow=false`、`receiveShadow=true`，并用透明通道的 `drawBucket=250` 让它在可见背景之后叠加。投射中心高度或圆半径变化时必须同时重建可见网格和 shadow catcher，切换环境、加载失败和 viewer 销毁时同时释放 catcher 的实体、网格和材质。该能力只属于 PlayCanvas 分镜/场景 3D 预览；Remotion 最终视频仍使用自己的 2D 合成链路。

由于 PlayCanvas 在没有显式 skybox 时会把 `envAtlas` 作为无限天空盒的回退纹理，3D blocking camera 必须排除 `LAYERID_SKYBOX`，有限 HDRI 半球和地面改放在 `LAYERID_WORLD`；不能为了保留环境光照而让引擎内置无限天空盒覆盖半球直径设置。没有可用 HDRI 时关闭派生方向光，并使用低强度中性 `Scene.ambientLight` 兜底。lighting source、envAtlas 和 HDRI 派生方向光都只存在于 viewer 生命周期，切换、加载失败和销毁时必须释放或关闭。

场景 3D 编辑页的 viewer 生命周期只跟随环境图地址（`environmentUrl`）与场景数据重建；空间标记列表通过创建时的 ref 快照注入初始状态，之后一律由专用同步 effect 调 `viewer.setSceneMarkers` 增量更新。环境滑块（投射中心高度、圆半径、分界线）拖动时只调用 `viewer.setEnvironmentSettings`：分界线是纯着色器 uniform，不触发网格重建；只有投射中心高度或圆半径变化才重建背景网格。重建 viewer 是昂贵操作（HDRI 纹理重载、`EnvLighting` 生成、半球网格和投影材质初始化），且每次重建都会新建 PlayCanvas Application，绝不能被高频用户输入触发。同理，`viewer.loadLayout`（AI 自动构图结果落地）也只在投射中心高度或圆半径真正变化时才重建背景网格——构图通常沿用当前环境，无条件重建会在结果落地那一帧同步上传穹顶顶点缓冲造成整页卡顿（2026-08-27 修复）。2026-08-26 的卡死黑屏事故即因 viewer 创建 effect 依赖了从环境参数派生的标记可见性引用：拖动分界线让“标记当前有效”翻转 → viewer 销毁重建 → 重建完成时 `fitView()` 触发 onChange 把环境状态重置回服务端保存值 → 判定再翻转 → 再次重建，形成重建风暴。用户侧界面中该参数的显示名为「分界线」（数据字段仍为 `panoramaHorizonV`）。

## Related Modules

- `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`
- `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dMath.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.ts`
- `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`
- `server/src/services/drama/visual/dramaVisualStyles.ts`
- `server/src/modules/novel/story-settings/application/StoryAssetImageService.ts`
- `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`
- `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- `server/src/modules/novel/story-settings/application/StoryScene3dEnvironment.ts`
- `server/src/modules/novel/story-settings/application/StoryScene3dMarkers.ts`
- `server/src/modules/novel/story-settings/application/StoryScene3dMarkerService.ts`
- `shared/utils/scene3dProjection.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dProjectionCenterGizmo.ts`
- `server/src/prompting/prompts/drama/sceneState3dMarkers.prompts.ts`
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
