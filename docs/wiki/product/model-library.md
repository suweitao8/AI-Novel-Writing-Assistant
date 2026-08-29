# 模型库（/models）

## 背景

漫剧生产需要常用三维资产（道具、布景件）作为素材底座。模型库把外部来源（当前为 Cine57 UE 示例包）的模型统一收口为静态目录 + 前端 3D 编辑器，让初学者不需要理解模型格式、单位、坐标约定，就能浏览、预览并调整模型。

## 决策

- **静态目录，不做服务端 CRUD**：模型清单是 `client/src/config/modelLibrary.ts` 里的纯数据数组（当前 44 个精选模型、8 类）；模型文件放 `client/public/models/` 由前端静态服务（GLB 15MB + 贴图 4.4MB）。模型库是"策展型"资产（由开发流程提取入库），不是用户上传型资产。将来若需要用户上传，再引入服务端存储与接口，不要提前给目录加运行时探测。
- **数量决策（2026-08-29 用户拍板）**：曾一次性扩到 509 个，因质量参差回退到人工精选的 44 个；batch3 的 466 个产物保留在 `D:\UnrealWorkspace\Cine57-exported3\`，目录管线支持随时按包扩量（build 脚本把 manifest3 加回 entries 即可）。格式确认用 **GLB**（浏览器通用标准；FBX 浏览器不能直接加载，管线本来就 UE→FBX→GLB）。
- **入口挂在漫剧主链路旁**：顶部导航「漫剧 / 模型 / 系统」三项（`dramaFocusNav.ts`）；模型库不是通用素材管理后台，只为「查看 → 打开 3D 编辑」这一条主路径服务。
- **3D 编辑器独立于漫剧场景编辑器**：`pages/models/modelLibrary3d/modelViewerApp.ts` 是单模型查看/变换编辑器，复用 blocking3d 的 gizmo、资源加载与数学原语（通过 `blocking3d/index.ts` 门面导出），但不承载角色、场景标记、镜头等状态。两边共享的是引擎交互方案（Orbit 相机、引擎 gizmo、Inspector 面板），不是数据。
- **模型入库管线**（仓库外脚本，`D:\UnrealWorkspace\`）：
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
- **棚拍布光是共享模块**：三灯 + 环境反射（真 HDR）+ ACES 色调映射，编辑器与缩略图工坊共用。真环境走 `upgradeStudioEnvironment()`，环境源按优先级回退：① `client/public/models/env/studio_panorama.png`——**场景全景图管线产出的摄影棚全景**（复用 `buildScenePanoramaPrompt` 契约 + `generateImagesByProvider` + `IMAGE_SPECS.scenePanorama`（2048x1024），一次性生成脚本落在生成时的 server 目录下，产物入库）；② 内置 HDRI（Poly Haven `studio_small_03_1k`，CC0）；③ 程序化渐变。LDR 等距柱状图与 HDR 同一条 `EnvLighting.generateLightingSource` → `generateAtlas` → `scene.envAtlas` 管线；三灯强度按真环境调低（1.2/0.35/0.55）。接了真环境也不要把 `ambientLight` 拉高——atlas 已接管环境光贡献。
  **可视背景用半圆球穹顶**（`studioBackdrop.ts` 的 `attachStudioBackdrop`）：全景图重投影成 cubemap 贴到半圆球内壁（几何/材质复用 blocking3d 的 `createBackdropGeometry`/`createProjectedHdriMaterial`，几何 0.5 单位半径 + 实体按 domeRadius 缩放），与漫剧场景同款；编辑器 radius 30、panoramaHorizonV 0.56（对齐生成全景的地平线位置）。env atlas 只管光照，穹顶只管可见背景，二者并存。**必须把 `LAYERID_SKYBOX` 从相机层移除**（`camera.layers.filter(id => id !== pc.LAYERID_SKYBOX)`）：PlayCanvas 会拿 scene.envAtlas 当内建无限天空球渲染，不移除的话背景就是整球包裹的全景（用户要的是有限半圆穹顶），漫剧 blocking3dViewerApp 也是这么做的。注意 PlayCanvas 2.21 的 `toneMapping` 挂在 **CameraComponent** 上而非 Scene；粗糙度体系叫 **gloss**（`glossMap`/`glossInvert`，G 通道），没有 `roughnessMap`。
- **贴图降采样**：baseColor 桶按 2048 上限 JPEG（质量 82）——3D 编辑器支持近距离观察，1024 会顶到明显的马赛克像素；法线/RMA 桶 1024 强制 JPEG；源 PNG 有真实镂空 alpha（YMIN < 254）才保留 PNG。本机新版 ffmpeg 单图输出必须加 `-update 1`（放在输出文件前），否则报「does not contain an image sequence pattern」。
- **模型选择**：优先 LP 变体 + 轻量优先；单件超 12MB 的源资产不进库。
- **动画库沿用静态目录模式**：动画清单是 `client/src/config/animationLibrary.ts`，GLB 放 `client/public/anims/`。一个 GLB 内含 UAL2 角色与全部动作片段，目录条目用 `clipName` 指向其中的动画；后续批量入库优先往同一个 GLB 追加，而不是一片一段一段文件（模型体积远大于动画体积）。
- **动画预览器独占创建应用**：`modelLibrary3d/animationPreviewApp.ts` 的 `openAnimationPreview` 同步构建 PlayCanvas 应用、异步加载 GLB，返回 `ready`/`cancel` 句柄；调用方（模型库页弹窗）在 effect 清理时必须同步 `cancel()`。
- **动画入库管线（角色动画）**：UE 动画序列 → `AnimSequenceExporterFBX` 导出 FBX → FBX2glTF 转 GLB → 仓库外 `gltf-tools/final_retarget.py` 按「绑定位姿差」离线重定向到 UAL2 骨架（`W_t(b) := W_t0(b) · inv(W_s0(b)) · W_s(b)`，逐帧解局部四元数，半球连续性防插值过零）→ 链式合并进一个 GLB。UE 内批量重定向（IK Retargeter 批处理）在本机 commandlet/全编辑器下都会崩，离线 GLB 级重定向是现行方案。

## 现行规则

- 缩略图运行时生成：`thumbnailStudio.ts` 离屏画布逐个渲染，抓 288×216 JPEG（质量 0.75）存 localStorage（键 `model-library:thumbnails:v11`，**改生成逻辑必须升版本**）。
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
- **当前入库的 3 条 UE 动画贴绑定位姿（已知内容问题）**：`A_INP_Idle`、`A_INP_WalkFwd_Loop` 全程与源骨架绑定位姿的旋转偏差极小（手臂 ≤13°，疑似加法动画或 FBX 导出丢失姿态），重定向后接近 T-pose；`A_chair_loop01` 腿部有真实动作。后续扩库选片时需在 UE 侧确认 `AdditiveAnimType` 或导出前烘焙，再用解析 GLB 的方式抽查源动画与绑定位姿的偏差。

## 相关模块

- `pages/drama/comicDrama/components/blocking3d/`：gizmo、资源加载、相机数学的门面提供方（`index.ts`）。
- `pages/drama/comicDrama/components/editor3d/`：Inspector 面板与变换工具条（`index.ts`）。
- `config/modelLibrary.ts`：模型目录数据（构建产物，勿手改）；`config/animationLibrary.ts`：动画目录数据；`config/dramaFocusNav.ts`：顶部导航入口。
- `pages/models/modelLibrary3d/animationPreviewApp.ts`：动画循环播放预览器。
