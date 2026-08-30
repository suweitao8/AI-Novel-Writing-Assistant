# 模型库（/models）

## 背景

漫剧生产需要常用三维资产（道具、布景件）作为素材底座。模型库把外部来源（当前为 Cine57 UE 示例包）的模型统一收口为静态目录 + 前端 3D 编辑器，让初学者不需要理解模型格式、单位、坐标约定，就能浏览、预览并调整模型。

## 决策

- **静态目录，不做服务端 CRUD**：模型清单是 `client/src/config/modelLibrary.ts` 里的纯数据数组（当前 44 个精选模型、8 类）；模型文件放 `client/public/models/` 由前端静态服务（GLB 15MB + 贴图 4.4MB）。模型库是"策展型"资产（由开发流程提取入库），不是用户上传型资产。将来若需要用户上传，再引入服务端存储与接口，不要提前给目录加运行时探测。
- **数量决策（2026-08-29 用户拍板）**：曾一次性扩到 509 个，因质量参差回退到人工精选的 44 个；batch3 的 466 个产物保留在 `D:\UnrealWorkspace\Cine57-exported3\`，目录管线支持随时按包扩量（build 脚本把 manifest3 加回 entries 即可）。格式确认用 **GLB**（浏览器通用标准；FBX 浏览器不能直接加载，管线本来就 UE→FBX→GLB）。
- **入口挂在漫剧主链路旁**：顶部导航「漫剧 / 模型 / 系统」三项（`dramaFocusNav.ts`）；模型库不是通用素材管理后台，只为「查看 → 打开 3D 编辑」这一条主路径服务。
- **模型编辑与 HDRI 环境预览分工**：`pages/models/modelLibrary3d/modelViewerApp.ts` 仍是单模型查看/变换编辑器，复用 blocking3d 的资源加载与数学原语，不承载漫剧角色、场景标记和镜头状态；通用资产的 HDRI 3D 预览则直接复用漫剧场景的 `createBlocking3dViewer`，以 `loadProxyActor: false` 只显示环境。这样模型编辑器可以保留模型专属变换交互，HDRI 环境编辑只维护一套场景相机、投影网格和生命周期。
- **模型入库管线**（仓库外脚本，`D:\UnrealWorkspace\`；操作手册已封装为项目 skill `.agents/skills/unreal-import/`，UE 项目地址见 AGENTS.md 的 Unreal Asset Pipeline 一节，本页保留决策与失败模式）：
  1. `scan_props.py` 全文件扫描 `/Script/Engine.StaticMesh`，按名字剔除建筑壳体/地形/LOD/碰撞体（源项目 1.1 万+ 静态网格，前景可用约 3100 个）；
  2. `select_batch3.py` 按包配额 + 网格族限量选目标；
  3. `export_cine57_batch3.py` 由 `UnrealEditor-Cmd -run=pythonscript` 无头导出 FBX + 材质贴图 PNG；manifest 用 JSONL 逐条追加（断点续跑），贴图按「贴图资产路径 + 桶」去重；
  4. `export_cine57_batch4b.py` 对无贴图参数的纯材质做 introspection（输入节点常量/标量/直连贴图）+ 全量按资产 RMA 扫描；
  5. `build-library-v3.cjs`（Temp/fbx2gltf-test）FBX2glTF 转换（4 并发）+ **GLB 清洗（剔除 UCX 碰撞体与 LOD1+）** + ffmpeg 降采样（6 并发）+ 命名/分类 + 再生 `modelLibrary.ts` + 孤儿清理。GLB 几何单位已是米，`unitScale` 保持 1。
- **UCX 碰撞体剔除是硬规则**：UE 静态网格导出 FBX 会带上碰撞壳（`UCX_*`，无贴图的凸包）与 LOD1-3。UE 引擎从不渲染碰撞壳，网页端不剔除就会看到一个包住模型的白色占位壳（用户报告的"白色包裹"元凶，44 个模型里 41 个命中）。构建脚本在转换后直接改写 GLB JSON chunk 剔除（BIN 不动）。
- **材质回填（modelMaterials.ts）**：目录 `materials` 字段按「UE 材质资产名 → 贴图/颜色/标量」声明真实外观，运行时按材质名匹配（忽略大小写与符号）回填。带贴图参数的槽位回填 baseColor/normal/rma；**纯材质图槽位**（UE 里无贴图参数的玻璃/铬金属/墙漆，共 106 个槽）从 introspection 合并出 tint/metallic/roughness/opacityValue/emissive，复合材质图不可解时兜底中性灰。`MESH_OPACITY` 表可按 mesh 名强制半透明（当前为空：白壳是碰撞体，不是玻璃）。
- **tint 只属于无贴图槽位（硬规则）**：UE 清单里的 `slot.tint` 是母材质向量参数的默认值/实例值，**不是**漫反射——当槽位已有 baseColor 贴图时全局乘 tint 会把整件模型染成参数默认色（曾把办公桌染蓝、宫灯染绿、床品染到近黑）。构建规则：有 baseColor 贴图的槽位一律丢弃 tint；tint 只作为纯材质槽（无任何贴图）的主色（床品深红、婴儿床蓝等这类外观是合法用途）。
- **环境反射（IBL）是质感前提**：`studioLighting.ts` 运行时生成程序化棚拍环境（竖向渐变等距柱状图 → `EnvLighting.generatePrefilteredAtlas`）挂到 `scene.envAtlas`。没有它：玻璃/金属要么发白发平、要么金属整面发黑。实拍确认烛台"玻璃罩"其实是源资产的不透明磨砂材质，观感成立靠的就是环境反射。
- **RMA 只取 G 通道粗糙度（全库审计后的硬规则）**：按资产 RMA（排除共享 Fill_01 占位）套 `glossMap`+`glossMapChannel:"g"`+`glossInvert`。**B/R 通道经逐张贴图审计确认不可用**（2026-08-29）：这包 Cine57 资产的 ORM 语义与 glTF 约定不符——地毯/岩石/布艺等纯电介质的 B（按约定=金属度）高达 0.66-0.98，砖炉金属板反而 0.01；R（按约定=AO）在平整表面也压到 0.36，当 AO 会把物件整体压暗。金属观感由真 HDR 环境 + 漫反射色承担；接入校准过的 PBR 数据前不要开 `metalnessMap`/`aoMap`。
- **引擎贴图通道默认值坑**：PlayCanvas StandardMaterial 的 `metalnessMap`/`glossMap` 默认采样通道与 glTF 约定不一致（glTF 加载器是自己显式设 `metalnessMapChannel="b"`、`glossMapChannel="g"` 的）。手动接 ORM/未校准贴图必须把 `glossMapChannel`/`metalnessMapChannel`/`aoMapChannel` 全部显式写死，否则金属度读错通道会把非金属整块渲染成镜面金属。
- **棚拍布光是共享模块**：三灯 + 环境反射（真 HDR）+ ACES 色调映射，模型编辑器、模型缩略图和动画缩略图共用。环境 atlas 通过 `EnvLighting.generateLightingSource` → `generateAtlas` → `scene.envAtlas` 建立；三灯强度为 1.2/0.35/0.55，接入真环境后不再额外提高 `ambientLight`。
- **模型预览使用独立 HDRI 预设目录**：`studioEnvironmentPresets.ts` 固定提供室内客厅、中央广场、草地自然三套环境，默认半球直径为 10m、20m、30m，用户可在 5–30m 范围内调节；对应 `.hdr` 资源放在 `client/public/models/env/`。产品字段使用 `diameterMeters`，只有相机边界等内部计算才换算为真实半径 `diameterMeters / 2`，避免把“半径”和“直径”混用。
- **通用资产是统一入口**：系统设置的「通用资产」页用表格展示唯一的系统旁白音色和三套模型/动画 HDRI。旁白描述、试听和重新生成沿用全局旁白 API；每套 HDRI 同时提供仓库内可直接显示的 2D 平面全景预览和「3D 预览」入口，表格不展示内部 `.hdr` 资源路径。HDRI 半球直径偏好按预设 ID 保存在浏览器本机，统一限制为 5–30 米，模型编辑器、模型缩略图、动画缩略图和 HDRI 预览读取同一份偏好，不写入模型资产或漫剧场景数据。
- **HDRI 预览交互边界**：通用 HDRI 预览页复用漫剧场景的 `Drama3DEditorShell`、`createBlocking3dViewer` 和 blocking3d 环境生命周期；通过环境专用模式跳过代理角色和场景摄像机辅助线，但保留同一套场景相机导航、投影中心参考和环境网格。左键拖动旋转、中键平移、滚轮缩放，复位只恢复相机视角，不改变环境预设或直径。切换环境才异步加载新 HDRI；拖动 5–30 米半球直径只调用 `setEnvironmentSettings` 重建环境网格，不重复创建 PlayCanvas Application。
- **模型可视穹顶固定在世界原点**：`attachStudioBackdrop` 从当前预设加载全景并投射到有限半圆球内壁，实体位置固定为 `(0, 0, 0)`，不随相机每帧移动，也不按相机距离动态放大；旋转相机只改变观察方向，不改变 HDRI 的世界空间位置。模型查看器把可用取景距离限制在当前预设半径的 85% 内，防止相机越过环境边界；`LAYERID_SKYBOX` 仍必须从相机层移除。
- **环境切换与缩略图规则**：模型编辑器的“预览环境”选择器异步同时加载可见穹顶和环境光，完整加载后才替换当前环境；切换失败保留原环境。模型卡片与动画卡片固定使用室内默认预设，动画离屏取景固定使用 30m 半径，模型缩略图缓存键为 `model-library:thumbnails:v16`，改动环境或投影逻辑必须升版本，避免旧截图继续冒充新环境。
- **贴图降采样**：baseColor 桶按 2048 上限 JPEG（质量 82）——3D 编辑器支持近距离观察，1024 会顶到明显的马赛克像素；法线/RMA 桶 1024 强制 JPEG；源 PNG 有真实镂空 alpha（YMIN < 254）才保留 PNG。本机新版 ffmpeg 单图输出必须加 `-update 1`（放在输出文件前），否则报「does not contain an image sequence pattern」。
- **模型选择**：优先 LP 变体 + 轻量优先；单件超 12MB 的源资产不进库。
- **动画库是独立一级页面（/animations），不寄生在模型页里**：顶部导航在「模型」与「系统」之间提供「动画」入口；入口页保留模型库同构的分类页签 + 卡片网格，点击卡片进入 `/animations/:animationId` 完整 3D 预览页，不在入口页打开弹窗。动画清单是 `client/src/config/animationLibrary.ts`，GLB 放 `client/public/anims/`。一个 GLB 内含 UAL2 角色与全部动作片段，目录条目用 `clipName` 指向其中的动画；后续批量入库优先往同一个 GLB 追加，而不是一片一段一段文件（模型体积远大于动画体积）。
- **动画预览器独占创建应用**：`pages/animations/animationPreviewApp.ts` 的 `openAnimationPreview` 同步构建 PlayCanvas 应用、异步加载统一 GLB，返回 `ready`/`cancel` 句柄，并提供播放/暂停、`activeStateCurrentTime` 时间定位、聚焦/复位视角和当前帧截图；调用方（完整预览页）在 effect 清理时必须同步 `cancel()`，避免同一 canvas 上并发两个 WebGL 应用。
- **分镜姿势必须以实际 UAL2 片段为准**：分镜运行时从统一 GLB 的 `resource.animations` 计算可用姿势，姿势选择器不展示没有对应片段的旧选项；历史布局若保存了 UAL2 未提供的蹲伏、跪姿、趴姿或奔跑等姿势，加载时统一安全回退到站立，不得把不同语义的动作冒充成目标姿势。
- **动画缩略图与模型库同一套离屏生成方案**：`pages/animations/animationThumbnailStudio.ts` 复用模型缩略图的「离屏画布 + localStorage 缓存（`animation-library:thumbnails:v4`）+ 队列闲置销毁」结构，差别是先把 `clipName` 装配到 anim 组件、把 `activeStateCurrentTime` 定位到片段约 40% 处的代表帧再抓 JPEG——卡片的预览图反映动作姿态而不是绑定位姿。动画预览和分镜草图共用同一个蓝色代理材质；动作评估依赖应用帧循环，所以画布必须 `app.start()`（`autoRender=false` 只关自动出图，update 照常触发）；新增动画无需手工出图，进目录即自动生成缩略图；资源、材质或生成逻辑变化时必须升缓存版本。
- **用户关键帧覆盖使用版本化浏览器存储**：完整预览页将当前时间轴帧渲染为 JPEG，通过 `animation-library:keyframes:v2` 按动画 ID 保存截图和秒数；动画入口卡片优先显示该截图。预览材质变化时通过版本号丢弃旧颜色截图，避免黄色旧图继续覆盖新的蓝色渲染结果。清除后回到自动生成缩略图，localStorage 不可用或配额不足时保留当前会话内存状态，不阻塞预览。关键帧属于本机浏览器偏好，不写入内置静态目录或服务端数据库。
- **动画入库管线（角色动画）**：UE 动画序列 → `AnimSequenceExporterFBX` 导出 FBX → FBX2glTF 转 GLB → `scripts/animation/retarget_ual2.py` 按「绑定位姿差」离线重定向到 UAL2 骨架 → 链式合并进一个 GLB。源片段必须是绝对姿态；加法层、分层轨道和未烘焙的控制器结果要在 UE 导出前烘焙。世界旋转使用 `W_t(b) := W_s(b) · inv(W_s0(b)) · W_t0(b)`，再按目标父节点解局部四元数；根/骨盆平移使用绑定姿态相对增量 `T_t := T_t0 + s · (T_s - T_s0)`。目标侧只从 `skins[].joints` 建立骨骼映射，避免把 `Mannequin` 网格包装节点当作骨骼。UE 内批量重定向（IK Retargeter 批处理）在本机 commandlet/全编辑器下都会崩，离线 GLB 级重定向是现行方案。操作手册与模型管线同在项目 skill `.agents/skills/unreal-import/`。

## 动画导出边界

### Background

源骨架和 UAL2 的绑定姿态、局部轴方向与根/骨盆平移基准并不相同。直接把源动画局部四元数写入目标骨架，或把源的绝对平移按分量比例套到目标骨架，会把本来正确的动作变成 T 姿、扭曲姿态或异常深度位移。

### Decision

动画导出工具先读取源动画与源绑定姿态，再把源动画相对源绑定姿态的世界旋转增量应用到目标绑定姿态；根/骨盆只传递相对绑定姿态的平移增量。GLB 写入器显式声明旋转和平移 accessor 的分量数，并在发布前用公开 GLB 数据做内容门禁。

### Current Rule

- 源动画必须在导出时包含完整绝对姿态；如果源是加法动画或带未烘焙分层轨道，先在 UE 中烘焙，再进入 FBX → GLB → 重定向链路。
- 重定向旋转遵循 `W_s · inv(W_s0) · W_t0`，平移遵循 rest-relative delta；不能用不同绑定姿态之间的世界四元数直接作相等校验。
- 发布门禁同时检查动作语义（待机手臂下垂、行走双脚有轨迹、坐姿骨盆不跳离角色）与 GLB 结构（旋转为 VEC4 单位四元数、平移为 VEC3、通道目标属于 skin joints）。

### Failure Modes

- 用户看到 T 姿或坐姿深度异常时，先解析源动画相对源绑定姿态的实际变化，再检查重定向乘法方向和根/骨盆平移公式，最后检查 accessor 分量数与目标骨骼映射；不要只看“脚本运行成功”或旧的 SVG/dot 校验。

## 现行规则

- 缩略图运行时生成：`thumbnailStudio.ts` 离屏画布逐个渲染，抓 288×216 JPEG（质量 0.75）存 localStorage（键 `model-library:thumbnails:v16`，**改生成逻辑必须升版本**）。模型和动画缩略图都使用室内默认 HDRI，环境半径取固定预设或明确的动画取景覆盖值；生成逻辑与环境预设变更必须同步刷新缓存版本。
- 缩略图队列串行、闲置 8 秒销毁离线画布；44 个模型全队列约 3 秒。
- 模型加载后按「底部中心 = 原点」归一（`model-adjust` 承担缩放偏移，`model-root` 承载用户 transform）。
- 取景用解析式源包围盒（`computeSourceBounds`），禁止 `meshInstance.aabb`（见失败模式）。
- 页面分类表完全由目录数据驱动；目录再生成即页面更新，前端无需改代码。

## 失败模式（调试结论）

- **白色包裹 = UCX 碰撞体**（2026-08-29 用户报告，排查了一整圈玻璃材质后才发现）：UE 导出 FBX 默认带碰撞壳，FBX2glTF 原样转进 GLB，运行时把它渲染成白色占位凸包。判断特征：壳是模型轮廓的凸包、纯白无贴图、材质名 `DefaultMaterial`。**先查 GLB 的 mesh/node 名单再怀疑材质。**
- **手写 GLB 重写的两个坑**：① BIN chunk 长度在 `binOffset` 处读，不是偏移 20（那是 JSON 数据）；② BIN 数据从 `binOffset + 8` 开始（跳过 chunk 头）。两处错了都会顶点错位、模型碎裂，且 JSON 结构校验完全看不出来。
- **UE MaterialProperty 枚举名带下划线**：`MP_BASE_COLOR` 不是 `MP_BASECOLOR`，getattr 拿 None 会被静默跳过，导致某属性永远采不到。另外 `get_texture_parameter_names` 返回的是 Name 对象，过正则前必须 `str()`。
- **离屏 canvas 0×0**：`setCanvasResolution(RESOLUTION_FIXED)` 必须显式带宽高；`app.resizeCanvas()` 在 FIXED 模式救不了绘图缓冲。
- **meshInstance.aabb 不可信**：导入取景一律用解析式包围盒（8 角点 × 世界矩阵）。
- **单位**：GLB 实际单位直接解析 POSITION accessor min/max，别猜。Cine57 是米。
- **localStorage 脏缓存**：缩略图缓存键必须带版本；写入前校验 `data:image/` 前缀。
- **UE 5.7 Python API 坑**：材质槽在 `get_editor_property("static_materials")`（无 `get_material_slots()`）；贴图参数取值用实例方法 `mi.get_texture_parameter_value(纯字符串名)`（传 `MaterialParameterInfo` 会触发 K2 转换失败）；LightForge 插件必须在 UE 启动前从外部禁用（写进脚本里来不及，插件加载先于 pythonscript），跑完还原 .uproject 后要复查是否残留禁用项。
- **并行会话的 dev 组端口战**：主站 supervisor 会在子进程死后 1-2 秒内复活，置换 5174 前先找到 supervisor 根进程（`dev-service-supervisor` 链）整树杀掉；杀完 netstat 复核、验证完恢复主站 `pnpm dev`。**过期 worktree 持有 5174 会把旧资产直接端给用户**（用户按 5174 访问，不知道背后是谁的服务）——用户报告「修复后又出现」时，第一步先确认 5174 由哪个目录的进程服务、其检出是否包含修复提交，再怀疑资产本身。
- **IAB 截图陈旧帧**：capture 反复失败或画面与预期不符时，关旧标签页开新页再截（旧页 WebGL 上下文可能已死）。
- **自写 GLB writer 必须显式传分量数**：`final_retarget.py` 曾把拍平后的一维浮点数组交给 `push_accessor` 再探测 `len(arr[0])`，恒等于标量，所有动画通道都被写成 SCALAR（每键 1 float）——播放时蒙皮矩阵整体错乱，表现为角色不可见或诡异姿势；而内存中的求解结果是正确的，离线校验（dot、SVG 火柴人）全部通过，极具迷惑性。排查手段：解析输出 GLB，比对 `accessor.count` 与 `sampler.input.count`、`type` 是否为 VEC4/VEC3、按 16 字节步长读四元数模长是否恒为 1。
- **骨骼名匹配必须限定目标骨架 joints**：UAL2 的网格包装节点叫 `Mannequin`，UE 导出骨架的根骨也叫 `Mannequin`；按名字裸匹配会给网格包装节点写入旋转通道，整只模型被动画带飞。目标侧只允许 `skins[].joints` 内的节点参与匹配，源侧（纯动画导出，可能没有 skins）用全部命名节点。
- **同一 canvas 上并发两个 PlayCanvas Application 会互相摧毁**：React StrictMode 下 effect 双执行很容易造出这种局面——两个应用共享同一个 WebGL 上下文，先销毁的一方会破坏存活方的渲染循环（`app.frame` 恒 0、画面永远停在某一帧）。预览器因此提供同步 `cancel()`；页面 effect 清理同步取消，保证任一时刻只有一个应用。
- **Radix Dialog 里拿不到 canvas ref**：`useRef` + `useEffect` 在弹窗首次打开时 `canvasRef.current` 可能为 null（effect 先于 ref 就绪执行），创建逻辑会被静默跳过且不再重试。用回调 ref 写入 state、把画布元素作为 effect 依赖来触发创建。
- **动画内容门禁必须覆盖源姿态与目标语义**：源 FBX/GLB 可能已经包含真实的绝对姿态；如果目标仍呈 T 姿，优先检查世界空间重定向乘法方向，不能先假定源片段是加法动画。坐姿则要单独检查骨盆的 rest-relative 平移，逐分量绝对比例会把源坐标写成目标深度偏移。扩库仍需在 UE 侧确认加法层已烘焙，并按公开 GLB 数据抽查源动画偏差、目标动作语义和 accessor 结构。

## 相关模块

- `pages/drama/comicDrama/components/blocking3d/`：gizmo、资源加载、相机数学的门面提供方（`index.ts`）。
- `pages/drama/comicDrama/components/editor3d/`：Inspector 面板与变换工具条（`index.ts`）。
- `config/modelLibrary.ts`：模型目录数据（构建产物，勿手改）；`config/animationLibrary.ts`：动画目录数据；`config/dramaFocusNav.ts`：顶部导航入口。
- `pages/animations/`：动画库独立页与循环播放预览器（`animationPreviewApp.ts`）。
