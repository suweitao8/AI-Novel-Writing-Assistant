# 模型库（/models）

## 背景

漫剧生产需要常用三维资产（道具、布景件）作为素材底座。模型库把外部来源（当前为 Cine57 UE 示例包）的模型统一收口为静态目录 + 前端 3D 编辑器，让初学者不需要理解模型格式、单位、坐标约定，就能浏览、预览并调整模型。

## 决策

- **静态目录，不做服务端 CRUD**：模型清单是 `client/src/config/modelLibrary.ts` 里的纯数据数组；模型文件放 `client/public/models/` 由前端静态服务。模型库目前是"策展型"资产（由开发流程提取入库），不是用户上传型资产。将来若需要用户上传，再引入服务端存储与接口，不要提前给目录加运行时探测。
- **入口挂在漫剧主链路旁**：顶部导航「漫剧 / 模型 / 系统」三项（`dramaFocusNav.ts`）；模型库不是通用素材管理后台，只为「查看 → 打开 3D 编辑」这一条主路径服务。
- **3D 编辑器独立于漫剧场景编辑器**：`pages/models/modelLibrary3d/modelViewerApp.ts` 是单模型查看/变换编辑器，复用 blocking3d 的 gizmo、资源加载与数学原语（通过 `blocking3d/index.ts` 门面导出），但不承载角色、场景标记、镜头等状态。两边共享的是引擎交互方案（Orbit 相机、引擎 gizmo、Inspector 面板），不是数据。
- **模型入库管线**：UE 源 → `UnrealEditor-Cmd -run=pythonscript`（`D:\UnrealWorkspace\export_cine57_batch2.py`，仓库外，同时导出 FBX + 材质贴图 PNG + `_manifest.json`）→ FBX2glTF → GLB → `client/public/models/cine57/` + 目录登记。转换后 GLB 的几何单位已是米（FBX2glTF 完成厘米→米换算），目录里的 `unitScale` 保持 1，仅作为未来非米来源的换算位。
- **材质回填（modelMaterials.ts）**：GLB 里只有 FBX 带出的占位材质（白色无贴图）。目录 `materials` 字段按「UE 材质资产名 → 贴图 URL / tint 颜色」声明真实外观，运行时逐 meshInstance 按 `meshInstance.material.name` 匹配（忽略大小写与符号）回填漫反射贴图。同款多色变体靠 tint 与贴图相乘区分（PlayCanvas 的 diffuse 与 diffuseMap 是相乘关系）。
- **只回填漫反射，不碰 Emissive/Opacity**：这批 UE 主材质把烘焙补光层挂在 Emissive 参数、把共享 RMA 占位图挂在 Opacity 参数上（默认填充，并非真实启用），套回去会让家具出现错误亮斑、镂空穿洞。植物叶片贴图集本身带白色背景（alpha 全不透明），叶片边缘因此有轻微白边，属已知限制。
- **贴图降采样**：构建脚本用 ffmpeg 把 >1024px 的贴图缩到 1024 并转 JPEG（质量 82）；源 PNG 若有真实镂空 alpha（`alphaextract,signalstats` 的 YMIN < 254）则保留 PNG。
- **模型选择**：优先 LP（低模）变体；`HQ_Interior_plants` 里 plant_3（6MB）、plant_7（35MB）这类高模不进库。
- **动画库沿用静态目录模式**：动画清单是 `client/src/config/animationLibrary.ts`，GLB 放 `client/public/anims/`。一个 GLB 内含 UAL2 角色与全部动作片段，目录条目用 `clipName` 指向其中的动画；后续批量入库优先往同一个 GLB 追加，而不是一片一段一段文件（模型体积远大于动画体积）。
- **动画预览器独占创建应用**：`modelLibrary3d/animationPreviewApp.ts` 的 `openAnimationPreview` 同步构建 PlayCanvas 应用、异步加载 GLB，返回 `ready`/`cancel` 句柄；调用方（模型库页弹窗）在 effect 清理时必须同步 `cancel()`。
- **动画入库管线（角色动画）**：UE 动画序列 → `AnimSequenceExporterFBX` 导出 FBX → FBX2glTF 转 GLB → 仓库外 `D:\UnrealWorkspace\gltf-tools\final_retarget.py` 按「绑定位姿差」离线重定向到 UAL2 骨架（`W_t(b) := W_t0(b) · inv(W_s0(b)) · W_s(b)`，逐帧解局部四元数，半球连续性防插值过零）→ 链式合并进一个 GLB。UE 内批量重定向（IK Retargeter 批处理）在本机 commandlet/全编辑器下都会崩，离线 GLB 级重定向是现行方案。

## 现行规则

- 缩略图是**运行时生成**的：`thumbnailStudio.ts` 用一个离屏 PlayCanvas 画布顺序加载模型、按包围球取景、抓一帧 PNG dataURL。结果缓存进 localStorage（键 `model-library:thumbnails:v7`，键内含版本号；**改变生成逻辑时必须升版本**，否则旧脏图永久复用）。
- 缩略图生成是页面级副作用：卡片 `ensureThumbnail` 入队，队列串行；闲置 8 秒自动销毁离线画布，释放 WebGL 上下文。改队列逻辑时保持"处理中"互斥，避免重复创建画布泄漏上下文。
- 模型加载后按「底部中心 = 原点」归一：`model-adjust` 节点承担 unitScale 缩放与偏移，`model-root` 承载用户 transform（gizmo 目标）。面板读数永远是 model-root 的本地值。
- 取景使用**解析式源包围盒**（`computeSourceBounds`）：把每个 mesh 局部 AABB 的 8 个角点按节点世界矩阵变换后求并。禁止用 `meshInstance.aabb` 做导入取景（见失败模式）。

## 失败模式（调试结论）

- **离屏 canvas 被清成 0×0**：`pc.Application` 构造时按填充模式/分辨率模式初始化画布；脱离 DOM 的 canvas `clientWidth` 恒为 0，`setCanvasResolution(RESOLUTION_FIXED)` 不带宽高时会以 `undefined × dpr = NaN` 触发 `canvas.width = NaN → 0`，`toDataURL` 只输出空 `data:,`。必须 `setCanvasResolution(pc.RESOLUTION_FIXED, W, H)` 显式带尺寸；`app.resizeCanvas()` 在 FIXED 模式下只改 CSS 尺寸，救不了绘图缓冲。
- **meshInstance.aabb 不可信**：渲染管线刷新前它可能是未缩放/未偏移的源尺寸，导致取景距离差 100 倍（模型变成远处小点）。导入期一律用解析式包围盒。
- **单位猜错 = 模型 100 倍小/大**：判断 GLB 实际单位别猜，直接解析 GLB JSON chunk 的 POSITION accessor min/max（Node 脚本几行即可）。Cine57 这批实际是米，不是 UE 编辑器里看到的厘米。
- **localStorage 脏缓存**：缩略图缓存键必须带版本；生成结果写入前校验 `data:image/png` 前缀，`data:,` 这类空产物拒绝入缓存。
- **UE 5.7 Python API 坑**（导出管线）：StaticMesh 没有 `get_material_slots()`，材质槽在 `get_editor_property("static_materials")`，元素字段是 `material_interface` / `material_slot_name`；贴图参数枚举用 `MaterialEditingLibrary.get_texture_parameter_names(mi)`，取值必须用实例方法 `mi.get_texture_parameter_value(纯字符串参数名)`——传 `MaterialParameterInfo` 会触发 K2 转换失败；参数值在 `texture_parameter_values[i].parameter_info / parameter_value`。LightForge 插件会让 commandlet 崩在 Slate 断言：项目 `Plugins/` 目录下的插件即使不在 .uproject 列表也会加载，必须向 .uproject 写入 `{"Name": "LightForge", "Enabled": false}` 再跑、跑完还原。
- **自写 GLB writer 必须显式传分量数**：`final_retarget.py` 曾把拍平后的一维浮点数组交给 `push_accessor` 再探测 `len(arr[0])`，恒等于标量，所有动画通道都被写成 SCALAR（每键 1 float）——播放时蒙皮矩阵整体错乱，表现为角色不可见或诡异姿势；而内存中的求解结果是正确的，离线校验（dot、SVG 火柴人）全部通过，极具迷惑性。排查手段：解析输出 GLB，比对 `accessor.count` 与 `sampler.input.count`、`type` 是否为 VEC4/VEC3、按 16 字节步长读四元数模长是否恒为 1。
- **骨骼名匹配必须限定目标骨架 joints**：UAL2 的网格包装节点叫 `Mannequin`，UE 导出骨架的根骨也叫 `Mannequin`；按名字裸匹配会给网格包装节点写入旋转通道，整只模型被动画带飞。目标侧只允许 `skins[].joints` 内的节点参与匹配，源侧（纯动画导出，可能没有 skins）用全部命名节点。
- **同一 canvas 上并发两个 PlayCanvas Application 会互相摧毁**：React StrictMode 下 effect 双执行很容易造出这种局面——两个应用共享同一个 WebGL 上下文，先销毁的一方会破坏存活方的渲染循环（`app.frame` 恒 0、画面永远停在某一帧）。预览器因此提供同步 `cancel()`；页面 effect 清理同步取消，保证任一时刻只有一个应用。
- **Radix Dialog 里拿不到 canvas ref**：`useRef` + `useEffect` 在弹窗首次打开时 `canvasRef.current` 可能为 null（effect 先于 ref 就绪执行），创建逻辑会被静默跳过且不再重试。用回调 ref 写入 state、把画布元素作为 effect 依赖来触发创建。
- **当前入库的 3 条 UE 动画贴绑定位姿（已知内容问题）**：`A_INP_Idle`、`A_INP_WalkFwd_Loop` 全程与源骨架绑定位姿的旋转偏差极小（手臂 ≤13°，疑似加法动画或 FBX 导出丢失姿态），重定向后接近 T-pose；`A_chair_loop01` 腿部有真实动作。后续扩库选片时需在 UE 侧确认 `AdditiveAnimType` 或导出前烘焙，再用解析 GLB 的方式抽查源动画与绑定位姿的偏差。

## 相关模块

- `pages/drama/comicDrama/components/blocking3d/`：gizmo、资源加载、相机数学的门面提供方（`index.ts`）。
- `pages/drama/comicDrama/components/editor3d/`：Inspector 面板与变换工具条（`index.ts`）。
- `config/modelLibrary.ts` / `config/animationLibrary.ts`：模型与动画目录数据；`config/dramaFocusNav.ts`：顶部导航入口。
- `pages/models/modelLibrary3d/animationPreviewApp.ts`：动画循环播放预览器。
