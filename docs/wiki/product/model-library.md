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
- **环境反射（IBL）是质感前提**：`studioLighting.ts` 运行时生成程序化棚拍环境（竖向渐变等距柱状图 → `EnvLighting.generatePrefilteredAtlas`）挂到 `scene.envAtlas`。没有它：玻璃/金属要么发白发平、要么金属整面发黑。实拍确认烛台"玻璃罩"其实是源资产的不透明磨砂材质，观感成立靠的就是环境反射。
- **RMA 只取粗糙度通道**：按资产 RMA（排除共享 Fill_01 占位）套 `glossMap`+`glossInvert`；金属度通道弃用——场景无真实 HDR 环境，金属面会涂黑。
- **棚拍布光是共享模块**：三灯 + 程序化 IBL + ACES 色调映射，编辑器与缩略图工坊共用。注意 PlayCanvas 2.21 的 `toneMapping` 挂在 **CameraComponent** 上而非 Scene；粗糙度体系叫 **gloss**（`glossMap`/`glossInvert`，G 通道），没有 `roughnessMap`。
- **贴图降采样**：ffmpeg 把 >1024px 的贴图缩到 1024 JPEG（质量 82）；法线/RMA 桶强制 JPEG；源 PNG 有真实镂空 alpha（YMIN < 254）才保留 PNG。
- **模型选择**：优先 LP 变体 + 轻量优先；单件超 12MB 的源资产不进库。

## 现行规则

- 缩略图运行时生成：`thumbnailStudio.ts` 离屏画布逐个渲染，抓 288×216 JPEG（质量 0.75）存 localStorage（键 `model-library:thumbnails:v9`，**改生成逻辑必须升版本**）。
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
- **UE 5.7 Python API 坑**：材质槽在 `get_editor_property("static_materials")`（无 `get_material_slots()`）；贴图参数取值用实例方法 `mi.get_texture_parameter_value(纯字符串名)`；LightForge 插件必须在 UE 启动前从外部禁用（写进脚本里来不及，插件加载先于 pythonscript），跑完还原 .uproject 后要复查是否残留禁用项。
- **并行会话的 dev 组端口战**：主站 supervisor 会在子进程死后 1-2 秒内复活，置换 5174 前先找到 supervisor 根进程（`dev-service-supervisor` 链）整树杀掉；杀完 netstat 复核、验证完恢复主站 `pnpm dev`。
- **IAB 截图陈旧帧**：capture 反复失败或画面与预期不符时，关旧标签页开新页再截（旧页 WebGL 上下文可能已死）。

## 相关模块

- `pages/drama/comicDrama/components/blocking3d/`：gizmo、资源加载、相机数学的门面提供方（`index.ts`）。
- `pages/drama/comicDrama/components/editor3d/`：Inspector 面板与变换工具条（`index.ts`）。
- `config/modelLibrary.ts`：目录数据（构建产物，勿手改）；`config/dramaFocusNav.ts`：顶部导航入口。
