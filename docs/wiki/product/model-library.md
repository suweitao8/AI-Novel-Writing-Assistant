# 模型库（/models）

## 背景

漫剧生产需要常用三维资产（道具、布景件）作为素材底座。模型库把外部来源（当前为 Cine57 UE 示例包）的模型统一收口为静态目录 + 前端 3D 编辑器，让初学者不需要理解模型格式、单位、坐标约定，就能浏览、预览并调整模型。

## 决策

- **静态目录，不做服务端 CRUD**：模型清单是 `client/src/config/modelLibrary.ts` 里的纯数据数组（510 个模型、12 类）；模型文件放 `client/public/models/` 由前端静态服务（约 170MB GLB + 22MB 贴图）。模型库目前是"策展型"资产（由开发流程提取入库），不是用户上传型资产。将来若需要用户上传，再引入服务端存储与接口，不要提前给目录加运行时探测。
- **入口挂在漫剧主链路旁**：顶部导航「漫剧 / 模型 / 系统」三项（`dramaFocusNav.ts`）；模型库不是通用素材管理后台，只为「查看 → 打开 3D 编辑」这一条主路径服务。
- **3D 编辑器独立于漫剧场景编辑器**：`pages/models/modelLibrary3d/modelViewerApp.ts` 是单模型查看/变换编辑器，复用 blocking3d 的 gizmo、资源加载与数学原语（通过 `blocking3d/index.ts` 门面导出），但不承载角色、场景标记、镜头等状态。两边共享的是引擎交互方案（Orbit 相机、引擎 gizmo、Inspector 面板），不是数据。
- **模型入库管线**（仓库外脚本，`D:\UnrealWorkspace\`）：
  1. `scan_props.py` 全文件扫描 `/Script/Engine.StaticMesh`，按包聚合、按名字剔除建筑壳体/地形/LOD/碰撞体（源项目共 1.1 万+ 静态网格，前景可用约 3100 个）；
  2. `select_batch3.py` 按包配额 + 网格族（去尾部编号）限量选出目标（本批 466 个）；
  3. `export_cine57_batch3.py` 由 `UnrealEditor-Cmd -run=pythonscript` 无头导出 FBX + 材质贴图 PNG；manifest 用 JSONL 逐条追加（天然断点续跑），贴图按「贴图资产路径 + 桶」去重导出；
  4. `build-library-v2.cjs`（Temp/fbx2gltf-test）FBX2glTF 转换（4 并发）+ ffmpeg 降采样（6 并发）+ 词库自动命名/规则分类 + 再生 `modelLibrary.ts` + 孤儿文件清理。转换后 GLB 的几何单位已是米（FBX2glTF 完成厘米→米换算），`unitScale` 保持 1。
- **自动命名与分类是构建期规则，不是产品 AI 行为**：mesh 名分词后查词库翻译（相邻组合词优先，未知词保留英文原名避免撞名），尾部编号/字母做变体后缀；分类按 token 集合优先级（厨房 > 电器 > 灯具 > 地面 > 植物 > 自然 > 卫浴 > 户外 > 工具 > 背景 > 家具，兜底「装饰」）。展示名重复时追加序号。既有 44 个模型保留人工命名。
- **材质回填（modelMaterials.ts）**：GLB 里只有 FBX 带出的占位材质（白色无贴图）。目录 `materials` 字段按「UE 材质资产名 → 贴图 URL / tint 颜色」声明真实外观，运行时逐 meshInstance 按 `meshInstance.material.name` 匹配（忽略大小写与符号）回填。同款多色变体靠 tint 与贴图相乘区分。
- **回填漫反射 + 法线，不碰 Emissive/Opacity/RMA**：
  - 法线贴图纯收益，全库约 490 个材质带法线，表面起伏细节靠它；
  - Emissive 挂的是烘焙补光层、Opacity 挂的是共享 RMA 占位图（默认填充，非真实启用），套回去会错误亮斑/穿洞；
  - RMA（OcclusionRoughnessMetallic）按体积甄别过真图（砖炉 ORM），实测套上后整块金属化发黑——这套资产的 ORM 通道语义与 glTF metallicRoughness 约定不符。客户端保留了 `rma` 能力（`glossMap`+`glossInvert`+`metalnessMap`），但目录不产出该字段，未来接入校准过的 PBR 资产时再启用。
- **棚拍布光是共享模块**（`studioLighting.ts`）：编辑器与缩略图工坊共用主光/补光/轮廓光三灯 + ACES 色调映射。注意 PlayCanvas 2.21 的 `toneMapping` 挂在 **CameraComponent** 上而非 Scene；`app.scene.exposure` / `ambientLight` 仍在 Scene。
- **贴图降采样**：ffmpeg 把 >1024px 的贴图缩到 1024 JPEG（质量 82）；法线/RMA 桶强制 JPEG；源 PNG 有真实镂空 alpha（`alphaextract,signalstats` 的 YMIN < 254）才保留 PNG（本批全部为不透明，无 opacity 字段属正常）。
- **模型选择**：优先 LP（低模）变体 + 轻量优先；单件超 12MB 的源资产不进库；`HQ_Interior_plants` 的高模植物保留了几件大的（plant_1 16MB 等），页面加载偏重是已知代价。
- **动画库沿用静态目录模式**：动画清单是 `client/src/config/animationLibrary.ts`，GLB 放 `client/public/anims/`。一个 GLB 内含 UAL2 角色与全部动作片段，目录条目用 `clipName` 指向其中的动画；后续批量入库优先往同一个 GLB 追加，而不是一片一段一段文件（模型体积远大于动画体积）。
- **动画预览器独占创建应用**：`modelLibrary3d/animationPreviewApp.ts` 的 `openAnimationPreview` 同步构建 PlayCanvas 应用、异步加载 GLB，返回 `ready`/`cancel` 句柄；调用方（模型库页弹窗）在 effect 清理时必须同步 `cancel()`。
- **动画入库管线（角色动画）**：UE 动画序列 → `AnimSequenceExporterFBX` 导出 FBX → FBX2glTF 转 GLB → 仓库外 `D:\UnrealWorkspace\gltf-tools\final_retarget.py` 按「绑定位姿差」离线重定向到 UAL2 骨架（`W_t(b) := W_t0(b) · inv(W_s0(b)) · W_s(b)`，逐帧解局部四元数，半球连续性防插值过零）→ 链式合并进一个 GLB。UE 内批量重定向（IK Retargeter 批处理）在本机 commandlet/全编辑器下都会崩，离线 GLB 级重定向是现行方案。

## 现行规则

- 缩略图是**运行时生成**的：`thumbnailStudio.ts` 用一个离屏 PlayCanvas 画布顺序加载模型、按包围球取景，抓 288×216 **JPEG**（质量 0.75）dataURL。结果缓存进 localStorage（键 `model-library:thumbnails:v8`，键内含版本号；**改变生成逻辑时必须升版本**）。JPEG 小图是刻意的：数百模型的缓存体量必须压进 localStorage 配额，PNG 会撑爆。
- 缩略图生成是页面级副作用：卡片 `ensureThumbnail` 入队，队列串行；闲置 8 秒自动销毁离线画布，释放 WebGL 上下文。510 个模型全队列约 30 秒生成完，首屏卡片先到先显。
- 模型加载后按「底部中心 = 原点」归一：`model-adjust` 节点承担 unitScale 缩放与偏移，`model-root` 承载用户 transform（gizmo 目标）。面板读数永远是 model-root 的本地值。
- 取景使用**解析式源包围盒**（`computeSourceBounds`）：把每个 mesh 局部 AABB 的 8 个角点按节点世界矩阵变换后求并。禁止用 `meshInstance.aabb` 做导入取景（见失败模式）。
- 页面分类表完全由目录数据驱动（`MODEL_LIBRARY_CATEGORIES` 只保留非空分类）；目录再生成即页面更新，前端无需改代码。

## 失败模式（调试结论）

- **离屏 canvas 被清成 0×0**：`pc.Application` 构造时按填充模式/分辨率模式初始化画布；脱离 DOM 的 canvas `clientWidth` 恒为 0，`setCanvasResolution(RESOLUTION_FIXED)` 不带宽高时会以 `undefined × dpr = NaN` 触发 `canvas.width = NaN → 0`，`toDataURL` 只输出空 `data:,`。必须 `setCanvasResolution(pc.RESOLUTION_FIXED, W, H)` 显式带尺寸；`app.resizeCanvas()` 在 FIXED 模式下只改 CSS 尺寸，救不了绘图缓冲。
- **meshInstance.aabb 不可信**：渲染管线刷新前它可能是未缩放/未偏移的源尺寸，导致取景距离差 100 倍（模型变成远处小点）。导入期一律用解析式包围盒。
- **单位猜错 = 模型 100 倍小/大**：判断 GLB 实际单位别猜，直接解析 GLB JSON chunk 的 POSITION accessor min/max。Cine57 这批实际是米。
- **localStorage 脏缓存**：缩略图缓存键必须带版本；生成结果写入前校验 `data:image/` 前缀，空产物拒绝入缓存。
- **PlayCanvas 2.21 API 命名陷阱**：粗糙度体系叫 **gloss**（`glossMap`/`gloss`/`glossInvert`，G 通道存粗糙度值、`glossInvert=true` 表示存的是 roughness），没有 `roughnessMap`；金属度走 `metalnessMap`（B 通道）+ `useMetalness`。glTF 加载器对 metallicRoughness 的处理就是 `glossMap = metalnessMap = 同一张图` + `glossInvert = true`。色调映射常量 `TONEMAP_ACES` 存在，但设置入口是 `camera.toneMapping`。
- **UE 5.7 Python API 坑**（导出管线）：StaticMesh 没有 `get_material_slots()`，材质槽在 `get_editor_property("static_materials")`，元素字段是 `material_interface` / `material_slot_name`；贴图参数枚举用 `MaterialEditingLibrary.get_texture_parameter_names(mi)`，取值必须用实例方法 `mi.get_texture_parameter_value(纯字符串参数名)`——传 `MaterialParameterInfo` 会触发 K2 转换失败；参数值在 `texture_parameter_values[i].parameter_info / parameter_value`。
- **LightForge 必须在 UE 启动前从外部禁用**：项目 `Plugins/` 目录下的插件即使不在 .uproject 列表也会加载，并让 commandlet 崩在 Slate 断言；崩溃发生在 pythonscript 执行之前，所以「脚本里先 disable 再导出」来不及——必须由调用方（bash）先备份 .uproject、写入 `{"Name": "LightForge", "Enabled": false}`、跑完还原。还要注意脚本内部 restore 会用「已禁用版」覆盖回去，还原后要再检查一次并清掉禁用项。
- **并行任务的 supervisor 复活**：主站 dev 组被整树杀掉后，supervisor 的退避重启可能立刻把 5174 抢回去；置换端口前要先确认 supervisor 根进程（`dev-service-supervisor` / `pnpm dev` 链）一并终止，再核对 `netstat` 无监听。
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
