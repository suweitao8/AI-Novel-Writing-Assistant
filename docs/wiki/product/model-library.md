# 模型库（/models）

## 背景

漫剧生产需要常用三维资产（道具、布景件）作为素材底座。模型库把外部来源（当前为 Cine57 UE 示例包）的模型统一收口为静态目录 + 前端 3D 编辑器，让初学者不需要理解模型格式、单位、坐标约定，就能浏览、预览并调整模型。

## 决策

- **静态目录 + 可见性覆盖，不做用户资产 CRUD**：模型清单是 `client/src/config/modelLibrary.ts` 里的纯数据数组（当前 485 个条目：484 个精选静态模型与 1 个角色模型、18 类）；模型文件放 `client/public/models/` 由前端静态服务。模型库是"策展型"资产（由开发流程提取入库），不是用户上传型资产。用户在详情页执行的删除只写入按模型 ID 独立保存的隐藏状态，目录读取服务端可见性覆盖后再展示；模型文件、材质、缩略图和已有分镜引用都不删除。若将来需要用户上传，再单独引入服务端资产存储与生命周期接口，不把用户操作混入静态目录生成流程。
- **数量决策（2026-08-29、2026-08-31、2026-09-01 批A）**：曾一次性扩到 509 个，因质量参差先回退到 44 个，再按前景交互边界收敛；当前按可追踪白名单发布 484 个静态前景模型（批A 53 + 批B 138 + 批C 95，材质门禁隔离 10 个无法可靠回填的候选），另有非静态角色资源供动画/分镜使用但不计入模型页展示。batch3 池子的可策展净余已全部消化——重跑选择脚本只能得到零件/灰模/超尺寸/重复变体，后续扩量必须回到 UE 做定向导出（建筑构件、门窗、窗帘等缺口）。格式确认用 **GLB**（浏览器通用标准；FBX 浏览器不能直接加载，管线本来就 UE→FBX→GLB）。
- **现代日常扩容规则（2026-09-01）**：新增资产优先覆盖家具、容器、厨房餐具、电器/办公、卫浴和灯具，再补少量户外与日用小物；现代住宅、办公和商业空间共用 Cine57 来源，统一按真实比例、同一中央广场 HDRI 和同一 PlayCanvas 材质/阴影链路呈现。每个候选必须是可独立摆放的完整对象，拒绝 UCX/LOD、NN 技术变体、零件、建筑碎片和过时装饰堆叠；扩容策略固定记录 `familyKey`、优先级、变体理由与使用说明，禁止仅凭文件名把整包资源倾倒进页面。
- **资产准入契约与可恢复隐藏**：静态模型发布契约固定为 Cine57 来源、现代语境、写实方向和已完成视觉审核。原始 manifest/FBX 只产生候选，必须经过显式 mesh 选择、转换、GLB 清洗、材质与纹理检查、缩略图复核和质量门禁后才进入目录；质量门禁拒绝来源、视觉方向或时代标签不符合契约的条目。用户删除模型时只通过 `/api/model-library/visibility` 记录隐藏 ID，每个 ID 使用独立 `AppSetting` 键，避免整份列表并发覆盖；恢复只删除该隐藏键，不能删除资产文件或业务引用。模型库页面在可见性读取失败时 fail closed，并在搜索、分类计数和分页之前排除隐藏模型。
- **前景资产边界**：模型库只承载能被角色摆放、接触或交互的前景道具。HDR 全景图承担环境背景，不再收录纯色背景板；场景级巨石、地形板、建筑装饰条和无法组成完整道具的模块碎片不进入库。桌椅床、书本、箱/食材组合、植物、灯具、地毯和可控尺寸的小型自然物可以进入库；单个模型按节点变换后的最大包围盒尺寸不得超过 5 米。
- **入口挂在漫剧主链路旁**：顶部导航「漫剧 / 模型 / 系统」三项（`dramaFocusNav.ts`）；模型库不是通用素材管理后台，只为「查看 → 打开 3D 编辑」这一条主路径服务。页面只展示可直接摆放和交互的静态前景模型，底层保留的非静态角色资源不在模型页提供预览。
- **入口筛选栏布局统一**：模型库与动画库遵循同一视觉顺序，桌面端左侧承载分类筛选（动画页同时保留用途范围），右侧靠边放置搜索框和搜索按钮；窄屏时搜索栏独占下一行。搜索输入只在点击搜索或按回车后成为已应用查询，避免输入过程持续重排卡片。
- **模型库与动画库固定网格分页**：搜索和分类筛选完成后，只把当前页卡片挂载到 DOM；模型与动画入口统一固定为每行 10 个、每页 5 行（50 条），窗口宽度只改变卡片宽度，不改变列数、行数或分页合同。筛选结果变化回到第一页，分页仍与 320px 视口门控一起限制缩略图生成压力；最后一页允许不足 50 条。
- **模型详情与 HDRI 环境预览分工**：`pages/models/modelLibrary3d/modelViewerApp.ts` 是单模型只读查看器，复用 blocking3d 的资源加载与数学原语，不承载漫剧角色、场景标记和镜头状态，也不提供模型变换写入口；通用资产的 HDRI 3D 预览则直接复用漫剧场景的 `createBlocking3dViewer`，以 `loadProxyActor: false` 只显示环境。这样模型详情页只负责检查模型，HDRI 环境编辑只维护一套场景相机、投影网格和生命周期。
- **模型入库管线**（仓库外脚本，`D:\UnrealWorkspace\`；操作手册已封装为项目 skill `.agents/skills/unreal-import/`，UE 项目地址见 AGENTS.md 的 Unreal Asset Pipeline 一节，本页保留决策与失败模式）：
  1. `scan_props.py` 全文件扫描 `/Script/Engine.StaticMesh`，按名字剔除建筑壳体/地形/LOD/碰撞体。**注意扫描范围偏差（2026-09-02 普查修正）**：该脚本只扫了 19 个前景道具白名单包（`TARGET_PACKS`），不是全项目；全项目普查（`census_meshes.py` → `cine57_mesh_census.json`）确认源项目共 67,550 个 uasset、11,391 个 StaticMesh（SM_* 命名 9,801），白名单内仅 3,933 个，**白名单外尚有约 5,900 个 SM 网格从未探索**——大户：Abandoned_Hong-Kong 834、Abandoned_house 431、Trash/VOL1 373、SuburbsCityPack 360、PostSovietWorld 306、UltimateFarming 305、Sewers 255、SCHOOL 221、VOL5_Doors 183、Roadside 175、Warehouse 164、ASIAN_Village 137、商业门 125、医院 226、窗 81 等（Paris 873 / Venice 473 个非 SM 命名网格另计）；
  2. `select_batch3.py` 按包配额 + 网格族限量选目标；
  3. `export_cine57_batch3.py` 由 `UnrealEditor-Cmd -run=pythonscript` 无头导出 FBX + 材质贴图 PNG；manifest 用 JSONL 逐条追加（断点续跑），贴图按「贴图资产路径 + 桶」去重；
  4. `export_cine57_batch4b.py` 对无贴图参数的纯材质做 introspection（输入节点常量/标量/直连贴图）+ 全量按资产 RMA 扫描；
  5. `build-library-v3.cjs`（Temp/fbx2gltf-test）FBX2glTF 转换（4 并发）+ **GLB 清洗（剔除 UCX 碰撞体与 LOD1+）** + ffmpeg 降采样（6 并发）+ 命名/分类 + 再生 `modelLibrary.ts` + 孤儿清理；随后运行仓库内 `scripts/models/curate-cine57-library.mjs` 做前景策展和最终门禁。GLB 几何单位已是米，`unitScale` 保持 1。
- **扩库策略是单一事实源**：`scripts/models/model-library-selection.json` 记录现有保留 ID、新增源网格、展示名、分类顺序和淘汰 ID；`modelLibraryPolicy.mjs` 向质量门禁和策展脚本提供同一组白名单。生成器可以先产生候选目录，但最终只允许白名单条目进入 `modelLibrary.ts`，禁止通过页面筛选隐藏未审核资产。
- **目录展示顺序由策展分类统一控制**：模型页「全部」视图必须按 `CINE57_CATEGORY_ORDER` 让静态模型分类连续排列，同一分类保留策展输入顺序；非静态兼容资源（例如动画角色 GLB）置于静态条目之后。分类顺序只影响目录展示，不改变模型 ID、文件路径、材质或其他业务引用。
- **视觉语义审核是发布前硬门禁**：`scripts/models/model-library-visual-review.json` 按稳定 ID 绑定 GLB 文件名、实际 mesh 名、截图确认的中文名称和分类。英文文件名、mesh 名和自动翻译只能提供候选，不能直接成为用户看到的名称；`scripts/models/modelLibraryVisualReview.mjs` 会拒绝缺失、重复、未批准或绑定不一致的记录。导入构建完成后先用 `curate-cine57-library.mjs --apply-review-only` 应用审核语义，再运行 `check:model-library`；没有截图复核记录的新增模型必须停留在待复核状态，不能靠页面过滤隐藏未审核的静态资产；模型页对非静态角色资源的排除是产品展示边界，不替代质量门禁。
- **真实三维预览证据是发布前硬门禁**：新增或替换的资产必须先在产品模型详情页按统一环境和相机生成预览，再进入发布目录。复核记录使用 `model-preview-audit-YYYY-MM-DD`，绑定 `/models/<id>`、GLB 与所有目录贴图的 SHA-256、渲染器标识、日期和 `textureStatus`；`modelLibraryVisualReview.mjs` 会拒绝缺失/伪造/过期证据，资源哈希变化后不能复用旧截图。草、灌木、花、树等透明材质资产还必须确认叶片边缘和透明背景没有不透明大块。
- **透明贴图必须保持通道语义**：UE 导出的 RGBA PNG 不能仅凭文件名或一次失败的 FFmpeg 统计转为 JPG。`ffprobe` 先确认像素格式，FFmpeg 日志要兼容 `lavfi.signalstats.YMIN=0` 与 `YMIN:0`；只要 alpha 非全不透明，baseColor 与 opacity 都保留 PNG，统计缺失也采用保守保留。GLB 声明 `BLEND`/`MASK` 时目录材质必须有 opacity 映射或透明标量，`modelLibraryTextureAudit.mjs` 在目录门禁中阻断遗漏。
- **分类与容器配额**：页面继续使用平面分类页签；自然资产固定细分为「石头 / 灌木 / 树木 / 草 / 花 / 盆栽」，小摆件、雕像、奖杯和花瓶归入「玩具/装饰品」，箱子、纸盒、木桶和篮筐归入「容器与箱子」。食材/纸箱同族最多发布两个代表模型，当前保留一组食材纸箱和一个纸盒；后续扩容必须先更新策略并通过质量门禁。
- **UCX 碰撞体剔除是硬规则**：UE 静态网格导出 FBX 会带上碰撞壳（`UCX_*`，无贴图的凸包）与 LOD1-3。UE 引擎从不渲染碰撞壳，网页端不剔除就会看到一个包住模型的白色占位壳（用户报告的"白色包裹"元凶）。必须同时检查 `json.nodes[].name` 和 `json.meshes[].name`：碰撞节点可能没有 mesh，不能只依赖 mesh 名过滤。清洗器改写 GLB JSON chunk，BIN 数据保持不变。
- **材质回填（modelMaterials.ts）**：目录 `materials` 字段按「UE 材质资产名 → 贴图/颜色/标量」声明真实外观，运行时按材质名匹配（忽略大小写与符号）回填。带贴图参数的槽位回填 baseColor/normal/rma；**纯材质图槽位**（UE 里无贴图参数的玻璃/铬金属/墙漆，共 106 个槽）从 introspection 合并出 tint/metallic/roughness/opacityValue/emissive，复合材质图不可解时兜底中性灰。`MESH_OPACITY` 表可按 mesh 名强制半透明（当前为空：白壳是碰撞体，不是玻璃）。
- **GLB 材质绑定与占位图是同一条发布门禁**：只要 GLB 材质声明 `baseColorTexture`，就必须在目录 `materials` 中按规范化材质名提供回填；内嵌 1×1 图片按导出占位图处理，不能把“文件可加载”当成“材质可用”。解析结果没有真实贴图/颜色且无法补回填的候选，必须记录到 `quarantinedAssets` 精确清单并从发布目录剔除；隔离文件保留以便补齐材质后恢复。模型详情预览只消费通过该门禁的目录条目，视觉审核不能替代材质检查。
- **角色资源与模型展示边界**：模型目录可以保留动画库已有的 UAL2 角色 GLB 作为内部资源，但它不是 Cine57 静态道具入库清单的一部分，也不在模型库页面提供角色卡片或 3D 预览；分镜、动画预览和动画缩略图继续复用同一套蓝色代理材质，并以主体色 + 同色系浅色关节和下颚线区分动作结构。正式角色纹理必须换成带有效 UV 的角色资产，再接入真实纹理生成/保存链路。
- **UAL2 角色材质分区与脖子环带**（2026-08-31）：动画资源与标准角色资源必须同时保持 Mannequin 的 M_Main、M_Joints、M_Neck 三个材质边界。M_Neck 是从外层脖子绑定姿态几何中拆出的独立 primitive，默认按 UAL2 外层颈部实际包络（约 `Y=1.45..1.63`、径向范围 `0.22` 米）选面，不能只取内侧窄带；M_Neck 的基础材质契约与 M_Main 完全一致，但运行时必须与 M_Joints 共同映射到同一个同色系淡蓝色高亮材质，以标出下巴下缘和外层颈部边界，避免下颚线与脖子融入主体蓝色。资源修复脚本除检查环向覆盖、上下边界和细分面片密度外，还要校验角色 POSITION、M_Main 和 M_Neck 的固定几何指纹、完整蒙皮属性映射，以及 M_Neck 与 M_Main 的材质契约；发现旧窄环、躯干分区、坐标、材质或蒙皮映射被改写时必须拒绝幂等复用，并要求从原始 UAL2 资源重新生成。动画预览、动画缩略图和分镜 3D 预览继续通过 blocking3d 的共享材质门面应用这套规则，旧资源没有 M_Neck 时仍回退为主体色 + M_Joints。
- **tint 只属于无贴图槽位（硬规则）**：UE 清单里的 `slot.tint` 是母材质向量参数的默认值/实例值，**不是**漫反射——当槽位已有 baseColor 贴图时全局乘 tint 会把整件模型染成参数默认色（曾把办公桌染蓝、宫灯染绿、床品染到近黑）。构建规则：有 baseColor 贴图的槽位一律丢弃 tint；tint 只作为纯材质槽（无任何贴图）的主色（床品深红、婴儿床蓝等这类外观是合法用途）。
- **环境反射（IBL）是质感前提**：模型、动画和漫剧都通过 `blocking3dEnvironmentRuntime.ts` 从同一张 HDR 资源生成可见投影与 `scene.envAtlas`。`envAtlas` 只负责环境光照，有限半圆穹顶负责可见背景；没有这套真实 HDR 环境，玻璃/金属容易发白发平或整面发黑。
- **HDRI 穹顶只接收阴影，不得投射阴影**：可视半圆穹顶和地面阴影接收器的 `render` 组件必须在创建时同时设置 `castShadows: false`、`receiveShadows: true`。PlayCanvas 的 `RenderComponent` 默认会把 `castShadows` 写回它接管的 `MeshInstance`，只在 `addComponent` 前设置 `meshInstance.castShadow = false` 会被覆盖，导致穹顶把主光挡到地面上形成整片黑块；角色仍通过独立阴影接收器保留落地阴影。
- **RMA 只取 G 通道粗糙度（全库审计后的硬规则）**：按资产 RMA（排除共享 Fill_01 占位）套 `glossMap`+`glossMapChannel:"g"`+`glossInvert`。**B/R 通道经逐张贴图审计确认不可用**（2026-08-29）：这包 Cine57 资产的 ORM 语义与 glTF 约定不符——地毯/岩石/布艺等纯电介质的 B（按约定=金属度）高达 0.66-0.98，砖炉金属板反而 0.01；R（按约定=AO）在平整表面也压到 0.36，当 AO 会把物件整体压暗。金属观感由真 HDR 环境 + 漫反射色承担；接入校准过的 PBR 数据前不要开 `metalnessMap`/`aoMap`。
- **引擎贴图通道默认值坑**：PlayCanvas StandardMaterial 的 `metalnessMap`/`glossMap` 默认采样通道与 glTF 约定不一致（glTF 加载器是自己显式设 `metalnessMapChannel="b"`、`glossMapChannel="g"` 的）。手动接 ORM/未校准贴图必须把 `glossMapChannel`/`metalnessMapChannel`/`aoMapChannel` 全部显式写死，否则金属度读错通道会把非金属整块渲染成镜面金属。
- **棚拍布光是共享模块**：HDR 环境反射 + 环境补光 + 可投影方向光，模型编辑器、模型缩略图、动画预览和动画缩略图共用 `model-preview` profile；离屏相机与实时详情页使用默认 Linear 色调映射。环境 atlas 通过 `EnvLighting.generateLightingSource` → `generateAtlas` → `scene.envAtlas` 建立；模型预览主光只做 180° 水平偏转，保持 HDR 背景和反射方向不变。
- **模型/动画预览统一使用中央广场 HDRI 预设**（2026-08-30 用户决定：不再按室内/城市/自然区分预览环境）：`studioEnvironmentPresets.ts` 只保留 `exterior`（中央广场）一个预设；默认半球直径 15m、投射中心高度为半球圆半径的 10%（15m 直径对应 0.75m），直径可在 5–30m 范围调节，静态 `.hdr` 放在 `client/public/models/env/`。模型详情页和 HDRI 预览页不再提供环境选择器（曾出现的室内客厅/草地自然已下线，静态资产与旧 `/hdri/interior|nature` 路由请求统一回落中央广场）；本机直径偏好键只按 exterior 读写，旧 localStorage 键值自动忽略。
- **通用环境资产状态化：生成的全景优先于静态 HDR**（2026-08-30）：HDRI 环境复用场景资产的"状态 + 提示词 + 生成图"逻辑。宿主是 AppSetting 单 key `studio.environmentAssets`（契约在 `shared/types/studioEnvironmentAssets.ts`，**环境状态类型就是 `StoryAssetState`**，服务端只保留环境相关字段白名单），环境有状态列表。**环境内部没有"当前全景"切换**（移除 activeStateId 与设为当前全景按钮），生效状态恒为默认状态（缺失时第一个状态，`resolveEffectiveStudioEnvironmentState`）。生成完全走 `services/image/runtime` 的固定路径 adapter（模板 = `generateSceneImage`，sceneType 恒为 exterior），prompt 复用下沉到 `services/image/storyStateImagePrompt.ts` 的场景全景契约，文件落 `generated-images/studio-environments/{envId}/{stateId}`，URL 为 `/api/settings/environment-assets/{envId}/states/{stateId}/image`。运行时侧 `studioEnvironmentRuntime.loadStudioEnvironment` 组装资源链前经 `studioEnvironmentAssetSource` 解析生效状态全景（30s memo；解析失败必须静默回落静态 `.hdr`，设置接口故障不得阻塞任何 3D 预览）；模型预览、动画预览、两类缩略图因此自动生效。参考图只允许指向同环境内已有 done 图的状态（`refImagePaths` 直用本地文件）。环境是全局设置域，禁止为了复用把宿主挂进小说域的 `NovelScene.statesJson`。
- **环境编辑 UI 是 AssetStatesEditor 的 ops 注入使用方**（2026-08-30 用户要求：不要为环境另造简化编辑器）：`assetForms.tsx` 的 `AssetStatesEditor` 增加可选 `ops?: AssetStatesEditorOps`（generate/cancel/dismiss/tweak + serverStates 同步 + renderExtraImageAction），不传 ops 时小说角色/场景/道具行为与历史版本完全一致（契约测试钉住源码形态）；通用资产页传环境 ops（含 stateImageFallbackUrl：状态未生成图时编辑器大图与首个状态缩略图回落内置环境全景，与卡片/3D 预览的实际生效画面一致，避免编辑器里出现空占位）。提示词微调服务同样下沉（`services/image/StoryStateImagePromptService.ts`，novelId 可选），环境微调路由 `/api/settings/environment-assets/:id/tweak-prompt` 与小说共用 `novel.state_image_prompt.tweak` 契约。教训：复用既有编辑器时优先做依赖注入分支，而不是平行实现一份"简化版"。
- **环境列表与编辑完全照抄场景资产交互**（2026-08-30 用户要求：不要表格 + 双按钮的自造布局）：通用资产页的 HDRI 环境用与场景资产同一张 `StoryAssetCard`（`buildEnvironmentAssetPresentation` 构建展示，卡片预览 = 生效状态全景优先、未生成回落内置 `previewImageUrl`）卡片展示，点卡片直接打开编辑弹窗；弹窗与 `StoryAssetEditDialog` 同构（`AppDialogContent` max-w-6xl + 环境描述字段 + `AssetStatesEditor` + 取消/保存脚注），不设独立的「编辑环境」「3D 预览」按钮。状态图生成后编辑器内出现与场景一致的「3D编辑」按钮，跳整页 HDRI 预览；半球直径只在通用 HDRI 资产 3D 编辑页调节，模型详情页和动画预览页只读取系统环境参数，列表页不放直径滑杆。`dismiss-image-error` 与小说资产同契约：body 传 `error`/`attemptId` 做乐观校验（`canDismissStudioEnvironmentImageError` 守卫），只清除用户看到的那次失败，避免悄悄关掉没见过的新错误。教训：列表/入口层也要照抄既有交互，"表格 + 多按钮"式的自造入口会被用户当作另一套产品。
- **HDRI 预览交互边界**：通用 HDRI 预览页复用漫剧场景的 `Drama3DEditorShell`、`createBlocking3dViewer` 和 blocking3d 环境生命周期，通过环境专用模式跳过代理角色和场景摄像机辅助线，但保留同一套场景相机导航、投影中心参考和环境网格。左键拖动旋转、中键平移、滚轮缩放，复位只恢复相机视角；拖动 5–30 米半球直径只重建环境网格，不重复创建 PlayCanvas Application。
- **实时与离屏预览统一为 PlayCanvas 默认 Linear**（2026-08-30）：模型查看器、动画预览、模型缩略图和动画缩略图都不要单独设置 `TONEMAP_ACES`；ACES 会对高饱和环境整体去饱和提亮，使同一张 HDR 在卡片和详情页呈现两种颜色。
- **模型可视穹顶固定在世界原点**：`loadStudioEnvironment` 通过 blocking3d 运行时加载当前预设并投射到有限半圆球内壁，实体位置固定为 `(0, 0, 0)`，不随相机每帧移动，也不按相机距离动态放大；旋转相机只改变观察方向，不改变 HDRI 的世界空间位置。模型查看器的缩放距离不使用环境半径作为边界，而是按当前模型显示包围球动态适配；相机近/远裁剪面也随模型和相机距离更新，避免 HDRI 尺寸限制大模型取景；`LAYERID_SKYBOX` 仍必须从相机层移除。
- **环境与缩略图规则**：模型编辑器、HDRI 预览、模型缩略图和动画缩略图都通过统一运行时创建可见穹顶与 `scene.envAtlas`；模型和动画详情、卡片都使用中央广场 `model-preview` 光照，模型/动画缩略图实例必须开启 `castShadows`，运行时默认创建 shadow catcher。卡片最终图只保留 HDRI、模型/角色和真实投影阴影，不绘制编辑器网格；详情编辑器仍可显示网格辅助线。模型缩略图缓存键为 `model-library:thumbnails:v28`，动画缩略图键为 `animation-library:thumbnails:v20`，改动环境、投影、材质或动画资源逻辑必须升版本；模型取景优先按 GLB 实际顶点的屏幕投影拟合并回正投影中心，AABB 仅作为安全回退；动画缩略图工作室在队列开始时加载一次统一 GLB，逐条实例化角色，不能为每张卡片重复解析同一文件。
- **贴图降采样与编码质量**：baseColor 桶按 2048 上限 JPEG，normal/RMA 桶按 1024 上限 JPEG；FFmpeg 的 `-q:v` 是 JPEG 量化值而不是百分比，统一使用 `-q:v 2`（数值越小质量越高），不能使用会造成严重马赛克的高数值。源 PNG 有真实镂空 alpha（YMIN < 254）才保留 PNG。本机新版 ffmpeg 单图输出必须加 `-update 1`（放在输出文件前），否则报「does not contain an image sequence pattern」。
- **模型选择**：优先 LP 变体 + 轻量优先；单件超 12MB 的源资产不进库。
- **模型库内容门禁**：`scripts/models/modelLibraryQuality.mjs` 读取真实 GLB 的 POSITION 包围盒和节点引用；`check:model-library` 要求目录覆盖当前 261 个白名单前景条目、无碰撞/高阶 LOD、无孤儿 GLB、分类完整、食材/纸箱族不超过两个，且最大模型尺寸不超过 5 米。来自动画库的角色入口可以复用 UAL2 资源，不参与 Cine57 静态 GLB 清单和尺寸统计。门禁失败时应修正源策展或 GLB 清洗，不通过页面隐藏或分类过滤掩盖违规资源。
- **模型使用说明是摆放契约**：每个 `ModelLibraryEntry` 都必须带 `usage`，由 `config/modelLibraryUsage.ts` 按模型 ID 提供 `supportSurface`、`placementMode`、`anchor`、`orientation`、`requiresFacingDirection` 和 `instruction`。墙挂模型必须声明墙面/背面/正面朝向，吊顶模型必须声明天花板/顶部/主体朝下，落地模型必须声明地面/底部；后续分镜摆放只读取这些结构化字段，不解析中文说明或模型名称。
- **使用说明按实际接触面分类**：家具、容器、自然物和地面物件通常落地；书堆、餐食、摆件、办公小物等使用水平支撑面；时钟是墙面挂装，宫灯是天花板悬挂，双筒望远镜是需要目标方向的水平支撑物。说明中的 `anchor` 用于将模型的底部、背面、顶部或支撑中心对齐到对应表面。
- **使用说明完整性是发布门禁**：`attachModelUsageInstructions` 会拒绝目录漏配或出现孤立 ID，`modelLibraryQuality.mjs` 会拒绝非法枚举、空文案和墙挂/吊顶字段组合矛盾。新增或重新策展模型时，必须同步补充使用 profile 和代表性测试；不能用落地默认值静默掩盖未知安装方式。
- **动画库是独立一级页面（/animations），不寄生在模型页里**：顶部导航在「模型」与「系统」之间提供「动画」入口；入口页保留模型库同构的分类页签 + 卡片网格，点击卡片进入 `/animations/:animationId` 完整 3D 预览页，不在入口页打开弹窗。动画清单是 `client/src/config/animationLibrary.ts`，GLB 放 `client/public/anims/`。一个 GLB 内含 UAL2 角色与全部动作片段，目录条目用 `clipName` 指向其中的动画；入口页搜索匹配动画名称、片段名、套装、动作类型和目录标识，并与来源组、套装、动作类型筛选取交集；后续批量入库优先往同一个 GLB 追加，而不是一片一段一段文件（模型体积远大于动画体积）。
- **动画预览器独占创建应用**：`pages/animations/animationPreviewApp.ts` 的 `openAnimationPreview` 同步构建 PlayCanvas 应用、异步加载统一 GLB，返回 `ready`/`cancel` 句柄，并提供播放/暂停、按整数帧定位、聚焦/复位视角和当前帧截图；运行时优先从 `AnimTrack.inputs` 的采样间隔推断真实帧率，目录帧率只作回退，详情页通过 `setFrame/getFrame/getFrameCount/getFrameRate` 与 `onFrameChange` 工作。帧号从 0 开始，最后一帧为 `round(durationSeconds * frameRate)`，默认打开位置为最后一帧的 50% 且暂停；恢复默认/已保存帧时必须按“激活动作 → 暂停动画层 → 写入帧 → 首次渲染”的顺序，让 PlayCanvas 在首帧同步求出骨骼姿态而不是显示 T-pose；调用方（完整预览页）在 effect 清理时必须同步 `cancel()`，避免同一 canvas 上并发两个 WebGL 应用。
- **分镜姿势必须以实际 UAL2 片段为准**：分镜运行时从统一 GLB 的 `resource.animations` 计算可用姿势，姿势选择器不展示没有对应片段的旧选项；历史布局若保存了 UAL2 未提供的蹲伏、跪姿、趴姿或奔跑等姿势，加载时统一安全回退到站立，不得把不同语义的动作冒充成目标姿势。
- **动画缩略图与模型库同一套离屏生成方案**：`pages/animations/animationThumbnailStudio.ts` 复用模型缩略图的「离屏画布 + localStorage 缓存（`animation-library:thumbnails:v20`）+ 队列闲置销毁」结构，创建工作室时先启动并初始化 PlayCanvas、再加载一次统一 GLB 与 HDRI，之后逐个把 `clipName` 装配到开启投影阴影的独立角色实例，读取轨道真实帧率并将 `activeStateCurrentTime` 定位到最后一帧的 50% 后暂停抓 JPEG——卡片的预览图反映动作中点姿态，且与详情页默认帧、光照 profile 一致。卡片最终图只保留 HDRI、角色和 shadow catcher 的真实投影阴影，不绘制编辑器网格；详情页仍可显示网格辅助线。动画预览和分镜草图共用同一个蓝色代理材质，主体与 `M_Joints` 关节槽使用同色系浅色区分动作结构；动作评估依赖应用帧循环，所以画布必须 `app.start()`（`autoRender=false` 只关自动出图，离屏 RAF 随后取消、抓图前用 update 手动推进）；新增动画无需手工出图，进目录即自动生成缩略图；资源、材质或生成逻辑变化时必须升缓存版本。
- **用户关键帧覆盖使用版本化浏览器存储**：完整预览页将当前整数帧渲染为 JPEG，通过 `animation-library:keyframes:v3` 按动画 ID 保存 `frame` 与 `frameRate`；动画入口卡片优先显示该截图，没有手动关键帧时使用自动生成的 50% 帧。读取只保存 `timeSeconds` 的 v2 记录时，按当前条目的真实帧率懒迁移为整数帧，避免用户已保存的卡片预览无故消失。光照、材质或自动缩略图规则变化只刷新自动缩略图，不替换用户主动保存的关键帧；需要回到当前光照生成的默认画面时，在动画预览页点击“恢复默认预览图”。清除后回到自动生成缩略图，localStorage 不可用或配额不足时保留当前会话内存状态，不阻塞预览。关键帧属于本机浏览器偏好，不写入内置静态目录或服务端数据库。
- **动画入库管线（角色动画）**：UE 动画序列 → `AnimSequenceExporterFBX` 导出 FBX → FBX2glTF 转 GLB → `scripts/animation/retarget_ual2.py` 离线重定向到 UAL2 骨架 → 链式合并进一个 GLB。源片段必须是绝对姿态；加法层、分层轨道和未烘焙的控制器结果要在 UE 导出前烘焙。
  - 重定向先把源动画相对源绑定姿态的世界旋转增量应用到 UAL2 `Idle_No_Loop` 的固定 40% 站立基准：`W_t(b) := W_s(b) · inv(W_s0(b)) · W_t_standing_base(b)`，再按目标父节点解局部四元数；由于跨骨架绑定姿态的局部骨骼轴可能不同，随后必须逐帧将躯干、颈部、锁骨、上臂、前臂和腿的源子骨方向对齐到目标同名骨段。不要用通用胸腔瞄准补偿缺失的 `spine_04/05/neck_02`，也不要对移动动作无条件套末端 IK。根/骨盆平移使用目标站立基准加源绑定姿态相对增量 `T_t := T_t_standing_base + s · (T_s - T_s0)`；目标侧只从 `skins[].joints` 建立骨骼映射，避免把 `Mannequin` 网格包装节点当作骨骼。
  - 末端 IK 默认只在源双手互相接近（最小腕间距不超过 `0.15m`）时两侧同时启用，或在单侧手腕接近头部（距离不超过 `0.20m`）时只启用接触侧，用于鼓掌、合十、抱臂、持物等真实接触动作；普通移动帧保持骨段对齐，手部接触不会顺带开启腿 IK。`RETARGET_USE_LIMB_IK=1` 可显式强制全帧双臂与双腿，`RETARGET_NO_ARM_IK=1` 始终关闭。接触动作的质量门禁要比较手腕相对头部的方向/高度差和目标可达距离，不能只看欧氏距离。UAL1 是另一套骨架，不能把它的动画直接追加到 UAL2 角色；UE 内批量重定向（IK Retargeter 批处理）在本机 commandlet/全编辑器下都会崩，离线 GLB 级重定向是现行方案。
  - 单条片段修正用 `scripts/animation/replace_catalog_animation.py` 做保序外科替换（其余片段与其 buffer 不动，旧 accessor 保留为合法孤儿，配 `test_replace_catalog_animation.py`）。UAL2 无掌骨且是低模手，手指（thumb/index/middle/ring/pinky 的 01-03 节）相对站立基准的旋转增量默认按 `RETARGET_FINGER_SCALE=0.6` 阻尼；批量重发布已发布片段用 `scripts/animation/republish_animation_clips.py --glb-dir <in-place目录>`，单条失败保留旧数据并汇总报告。
  - 源骨架命名差异在重定向脚本加载期归一：3ds Max Biped（`Bip001 *`，女性动捕套装）按别名表改写成 UE Mann 骨名；不归一时 Biped 源零骨名匹配、输出会静默退化为站立基准静态片段。全库质量巡检用 `scripts/animation/quality_sweep.py` 对各自解剖基座下的端点轨迹做中心化运动误差、源双手间距和手-躯干穿模检查；替换片段资源后必须升动画缩略图 localStorage 缓存版本。操作手册与模型管线同在项目 skill `.agents/skills/unreal-import/`。

## 动画目录策展与分类

- **策展剪枝用 published 标记而不是删清单（2026-09-01）**：导入动画曾一次性上架 277 条，出现明显穿模（如向后慢跑），按用户决策先只发布「运动（移动）」与「生活表演」两类跑通质量。做法：selection 清单全部保留，下架片段标 `published: false`，生成器只把 `published !== false` 的片段写进 `animationCatalogEntries.ts`；GLB 与 GLB 门禁（要求 GLB 片段集合与清单严格一致）保持不变。恢复上架 = 把标记改回 true 重新生成目录，不需要重新导出 UE 资产或重建 GLB。直接删 selection 片段是错误路径——那会破坏 GLB 一致性门禁并要求全量重建 GLB。


### Background

动画库同时服务旧网页目录和从 Cine57 导入的 UE 动作。只按一个“动画”页签展示会让分镜草图使用者无法判断来源，也无法在多个 UE 动画包之间快速找到适合的日常、拳击或剑术动作。

### Decision

前端目录先按来源大类提供“全部 / 虚幻动画 / 网站内置动画”三个入口，默认显示全部来源；用途“分镜可用 / 兼容动画 / 全部”作为独立筛选保留，再按来源大类、规范化细分类筛选，套装、动作类型、姿态和武器作为二级精确筛选。旧目录单独归入 `legacy`；UE 资产按五个扫描源组归入日常动作、日常互动、生活与表演、徒手战斗、武器战斗。策选结果由 `scripts/animation/animationCatalogSelection.json` 固化，前端生成 `animationCatalogEntries.ts`，不在运行时根据文件名猜分类。

### Current Rule

- **动画目录首行统一承载来源与提交式搜索**：来源提供“全部 / 虚幻动画 / 网站内置动画”三个入口，桌面端来源在左、搜索靠右；用途和动作分类置于下一行，窄屏或宽度不足时筛选控件自动换行。输入内容只在点击“搜索”或按回车后更新已应用查询，来源、用途、动作、套装、姿态和武器筛选仍即时生效。搜索框旁不显示独立的结果数量标签，分页区域继续提供当前结果总数。
- **动画入口卡片只承载可用于查找和预览的信息**：卡片显示动作缩略图、动作名称、套装/细分类/姿态与帧数，整张卡片是进入独立 3D 预览页的链接，不再叠加与入口行为重复的播放图标或“分镜可用/兼容动画”徽标；“用途”筛选仍作为列表筛选保留，详情页继续展示播放控制和用途资料。

- 每个 UE 套装有独立 `packId` 和中文名称，卡片显示套装；每个片段还必须固化 `classificationId`、`actorKind`、`posture` 和 `weaponType`。武器至少区分剑、武士刀、刺剑、长枪与戟、双刃、弓箭、手枪、重锤、镰刀、匕首和法师武器；徒手和生物动作按流派、怪物类型、地面/爬行姿态继续细分。
- 动画入口默认用途范围为“全部”，首次同时展示当前 277 条虚幻分镜动作和 46 条网站内置旧片段；用户可以切换到“分镜可用”或“兼容动画”查看对应使用边界。Cine57 条目必须来自 In Place 源，或通过转换后 `root` 全局位移不超过 0.03 米的数值审计；明确 Root Motion 源不进入主库。用途范围切换时保留来源选择，只把动作分类恢复为“全部”，让来源和用途可以继续组合筛选。
- 分镜动作解析按策选目录 ID 维护原地片段映射，先尝试真实 C57 片段名，再回退到旧 UAL2 名称；不得通过猜测字符串生成别名。稳定的条目 ID、GLB 片段名和旧回退顺序必须保留，以兼容已有分镜布局。
- `actorKind` 明确区分普通人形、可复用人形骨骼的怪物/生物和配对角色；扫描清单中没有真实狼人资源时不得仅凭名称创建狼人分类。`posture` 单独记录站立、蹲伏、坐姿、跪姿、躺卧、爬行、空中或综合姿态，使“生物地面动作”和“躺卧”可以同时表达。
- 入口页分页默认每页 24 条，分页切片发生在卡片挂载前；用途、来源、套装、动作、姿态、武器、细分类变化或搜索提交时回到第一页。来源入口在宽度不足时允许换行，四个精确筛选使用统一下拉控件，避免一次挂载全目录缩略图。
- 同一套装的非 Idle 动作使用 `dedupeKey` 只保留一个代表片段；Idle 变体允许并存，便于分镜草图保持自然变化。
- 策选阶段只接受真实 Asset Registry 路径、`AnimSequence` 和可匹配的 Mannequin 骨架；机器人骨架、GhostSamurai 专用骨架和无法加载的资产不混入标准 UAL2 目录。
- 所有条目仍合并进 `/anims/cine57/UAL2_UE_Anims.glb`，重定向后使用同一个蓝色 UAL2 代理角色，分镜草图和动画预览共享这套角色与动作文件。

### Failure Modes

- 把源包名称或动作名称写错会造成导出阶段才发现缺片段；先运行 `build_animation_catalog_selection.cjs` 对扫描清单做精确存在性校验。
- 只看文件名批量去重会误删 Idle 变体，或把不同武器动作合并；去重键必须由策选清单显式声明并在测试中按套装校验。
- 把不同骨架的同名动作放入同一个链路会产生 T 姿、扭曲或播放错乱；策选必须保留源骨架证据，最终 GLB 还要检查通道只驱动目标 `skins[].joints`。

### Related Modules

- `scripts/animation/scan_cine57_animations.py`：生成 Asset Registry 证据清单。
- `scripts/animation/build_animation_catalog_selection.cjs`：按源组、套装和动作语义生成策选清单。
- `scripts/animation/export_cine57_animation_catalog.py`：按清单从 UE 导出 FBX。
- `scripts/animation/assemble_animation_catalog.py`：FBX → GLB → UAL2 重定向并校验统一文件。
- `client/src/config/animationLibrary.ts`、`client/src/pages/animations/AnimationLibraryPage.tsx`：目录元数据、分镜/兼容范围、搜索、来源/细分类/套装/动作/姿态/武器筛选和分页 UI。
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.ts`：分镜静态姿势的原地目录片段映射与旧布局兼容回退；目录缺少某个可选片段时安全回退，不凭文件名制造动作。

## 动画导出边界

### Background

源骨架和 UAL2 的绑定姿态、局部轴方向与根/骨盆平移基准并不相同。直接把源动画局部四元数写入目标骨架，或把源的绝对平移按分量比例套到目标骨架，会把本来正确的动作变成 T 姿、扭曲姿态或异常深度位移。

### Decision

动画导出工具先读取源动画与源绑定姿态，再把源动画相对源绑定姿态的世界旋转增量应用到目标绑定姿态；根/骨盆只传递相对绑定姿态的平移增量。GLB 写入器显式声明旋转和平移 accessor 的分量数，并在发布前用公开 GLB 数据做内容门禁。

### Current Rule

- 源动画必须在导出时包含完整绝对姿态；如果源是加法动画或带未烘焙分层轨道，先在 UE 中烘焙，再进入 FBX → GLB → 重定向链路。
- 重定向旋转遵循 `W_s · inv(W_s0) · W_t_standing_base`，目标站立基准默认取 UAL2 `Idle_No_Loop` 的 40% 固定帧；平移遵循目标基准加 rest-relative delta；不能用不同绑定姿态之间的世界四元数直接作相等校验。
- 发布门禁同时检查动作语义（待机手臂下垂、行走双脚有轨迹、代表慢跑的手臂可达、坐姿骨盆不跳离角色）与 GLB 结构（旋转为 VEC4 单位四元数、平移为 VEC3、通道目标属于 skin joints）。Cine57 片段还必须通过 root 全局位移范围和首尾净位移 `<= 0.03m` 的门禁；没有 root 平移轨道是合法的原地结果，骨盆局部运动要保留。
- 修改重定向、骨架别名、IK 或导出/合并逻辑后，必须先备份当前统一 GLB，再对 `animationCatalogSelection.json` 的全部片段执行 `python scripts/animation/republish_animation_clips.py --glb-dir <in-place目录> --include-unpublished`；默认命令只刷新 `published !== false` 的条目，会让未发布片段继续保留旧重定向数据。全量回填后用 GLB 门禁确认 277 条选定 Cine57 片段与 46 条基础动作都在最终 323 条动画中，并重新检查 root 位移与肢体可达性。

### Failure Modes

- 用户看到 T 姿、手部异常或坐姿深度异常时，先解析源动画相对源绑定姿态的实际变化，再检查重定向乘法方向、根/骨盆平移公式、手臂骨链可达性，最后检查 accessor 分量数与目标骨骼映射；不要只看“脚本运行成功”或旧的 SVG/dot 校验。

## 现行规则

- 缩略图运行时生成：模型库与动画库分别使用离屏画布逐个渲染并存入 localStorage；模型卡片抓取 256×192 JPEG（质量 0.75），最长边与卡片最大显示宽度一致，缓存键为 `model-library:thumbnails:v28`；动画卡片仍抓取 288×216 JPEG，缓存键为 `animation-library:thumbnails:v20`，**改生成逻辑必须升版本**。模型和动画详情/缩略图固定使用中央广场 HDRI 与 `model-preview` 光照；角色实例必须投射阴影，默认 shadow catcher 负责接收落地投影，主光只水平偏转 180°，可见 HDRI 方向不变；卡片出图只调用 PlayCanvas 渲染，不叠加编辑器网格，详情页交互式编辑器的网格不受影响；模型卡片图片使用原生懒加载和异步解码，并且只有进入视口前后 320px 预加载范围的卡片才允许触发 3D 缩略图生成；浏览器图片懒加载不能替代 3D 生成门控；离屏应用必须在异步加载环境前完成 `app.start()` 初始化并取消持续 RAF，模型/动画出图前显式 `app.update()`；动画缩略图工作室复用一次统一 GLB 资源，按实际动作轨道帧率定位到 50% 默认帧后再截图；环境、生成逻辑或代理角色材质变更必须同步刷新动画缩略图与关键帧缓存版本，保证三个预览入口使用同一套材质规则。
- 缩略图运行时生成：模型库与动画库分别使用离屏画布逐个渲染并存入 localStorage；模型卡片抓取 256×192 JPEG（质量 0.75），最长边与卡片最大显示宽度一致，缓存键为 `model-library:thumbnails:v28`；动画卡片仍抓取 288×216 JPEG，缓存键为 `animation-library:thumbnails:v20`，**改生成逻辑必须升版本**。模型和动画详情/缩略图固定使用中央广场 HDRI 与 `model-preview` 光照；角色实例必须投射阴影，默认 shadow catcher 负责接收落地投影，主光只水平偏转 180°，可见 HDRI 方向不变；卡片出图只调用 PlayCanvas 渲染，不叠加编辑器网格，详情页交互式编辑器的网格不受影响；模型卡片图片使用原生懒加载和异步解码，并且只有进入视口前后 320px 预加载范围的卡片才允许触发 3D 缩略图生成；浏览器图片懒加载不能替代 3D 生成门控；离屏应用必须在异步加载环境前完成 `app.start()` 初始化并取消持续 RAF，模型/动画出图前显式 `app.update()`；动画缩略图工作室复用一次统一 GLB 资源，按实际动作轨道帧率定位到 50% 默认帧后再截图；环境、生成逻辑或代理角色材质变更必须同步刷新动画缩略图与关键帧缓存版本，保证三个预览入口使用同一套材质规则。
- 缩略图队列串行、闲置 8 秒销毁离屏画布；模型库先完成分类与搜索，再按当前可用空间计算整行页大小挂载卡片，测量不可用时回退 24 条，当前页仍须经过 320px 视口门控，翻页或筛选卸载时释放未开始的排队项。分页只控制浏览器展示和缩略图生成压力，不改变静态目录或模型详情页；远离视口的模型必须等用户进入当前页并滚动到附近再生成。角色缩略图不属于模型库入口，动画缩略图单独复用统一角色动画工作室。
- 模型加载后按「底部中心 = 原点」归一（`model-adjust` 承担缩放偏移，`model-root` 承载用户 transform）。
- 取景用解析式源包围盒（`computeSourceBounds`），再交给 `modelPreviewFraming.ts` 用 AABB 八角点做透视投影，禁止 `meshInstance.aabb`（见失败模式）。模型缩略图和详情页初始/复位视角统一为水平 45°、向下 25°、50° FOV，主体投影覆盖率目标 80%（允许 76%–84%）。
- 页面分类表完全由目录数据驱动；目录再生成即页面更新，前端无需改代码。
- 模型卡片只显示支撑面/摆放方式的紧凑标签，详情页显示完整使用说明；两处都直接读取 `entry.usage`。说明是静态策展数据，页面只读，不写入服务端或用户资产。

## 失败模式（调试结论）

- **白色包裹 = UCX 碰撞体**（2026-08-29 用户报告，排查了一整圈玻璃材质后才发现）：UE 导出 FBX 默认带碰撞壳，FBX2glTF 原样转进 GLB，运行时把它渲染成白色占位凸包。判断特征：壳是模型轮廓的凸包、纯白无贴图、材质名 `DefaultMaterial`。**先查 GLB 的 mesh/node 名单再怀疑材质。**
- **透明贴图被误转 JPG 会产生大面积三角色块**（2026-08-31）：`grass-01-1` 的 UE Base Color 实际是带 alpha 的 RGBA PNG，约 37.6% 像素透明；旧构建器只匹配 `YMIN:`，而 FFmpeg 输出为 `lavfi.signalstats.YMIN=0`，于是误判为不透明并丢弃 alpha。没有 opacity 映射时，透明 atlas 背景就会作为棕绿不透明面渲染。诊断顺序是：检查源像素格式与 alpha 范围 → 检查最终贴图 `pix_fmt` → 解析 GLB `alphaMode` 与目录 opacity → 打开产品真实详情页确认；质量不足就隔离候选，不能用卡片占位图掩盖。
- **孤立 UCX 节点也必须剔除**（2026-08-31）：部分导出 GLB 的 `UCX_*` 只存在于 `nodes[].name`，没有绑定 mesh；只按 `meshes[].name` 清洗会让坏节点继续进入产物。诊断必须同时列出 node 与 mesh 名称，清洗后再解析一次确认没有碰撞或高阶 LOD 名称。
- **场景级几何不能当作前景道具**（2026-08-31）：背景板、接近 10 米的巨石/地形板和建筑模块条带即使能成功加载，也会破坏前景构图和角色交互尺度。按世界空间 POSITION 包围盒计算尺寸，并结合道具完整性做策展；小型碎石、地毯等有明确前景用途的较大薄片仍可保留。
- **手写 GLB 重写的两个坑**：① BIN chunk 长度在 `binOffset` 处读，不是偏移 20（那是 JSON 数据）；② BIN 数据从 `binOffset + 8` 开始（跳过 chunk 头）。两处错了都会顶点错位、模型碎裂，且 JSON 结构校验完全看不出来。
- **UE MaterialProperty 枚举名带下划线**：`MP_BASE_COLOR` 不是 `MP_BASECOLOR`，getattr 拿 None 会被静默跳过，导致某属性永远采不到。另外 `get_texture_parameter_names` 返回的是 Name 对象，过正则前必须 `str()`。
- **离屏 canvas 0×0**：`setCanvasResolution(RESOLUTION_FIXED)` 必须显式带宽高；`app.resizeCanvas()` 在 FIXED 模式救不了绘图缓冲。
- **UE 贴图导出的两类断言/静默失败（2026-09-02 批B）**：① TextureExporterPNG 对 HDR 浮点源贴图会 check(SupportsTexture) 直接崩掉 commandlet——Python 读不到受保护的 source 属性，无法预判；但 HDR 源贴图的 compression_settings 恒为 TC_DEFAULT（浮点不能 DXT），introspection 里按 `compression_settings == TC_DEFAULT` 跳过导出即可。② `get_editor_property("source")` 受保护永远抛异常，不能当守卫。跑 introspection 每轮 ~90 秒启动，崩溃排查先看 Saved/Logs/Cine57.log 的 appError 行。
- **缩略图队列「安静自旋」= rAF 停摆 + 队列无看门狗（2026-09-01）**：模型库扩到 208 个后用户报告预览图全部转圈。实测链路：环境/HDR/GLB/贴图全部 200 加载成功，队列却卡在 `render()` 里 `await nextFrame()` 的 `requestAnimationFrame` 上——窗口被遮挡/后台标签时 rAF 无限停摆（`visibilityState` 仍是 "visible"，实测 2 秒 0 次触发），render Promise 永不结清，`processing` 永久为 true，per-item catch 把一切吞成无报错的自旋。诊断手段：页面内 `new Function("u","return import(u)")` 动态 import 真实模块手动驱动 `ensureThumbnail`，配合放大 `performance.setResourceTimingBufferSize` 观测请求（Vite dev 模块请求会撑爆默认 resource buffer，别信第一次的"没有网络请求"）。修复规则：① 取帧等待必须 rAF + 定时器兜底双通道；② 初始化与单模型渲染必须有看门狗，把挂起降级为单步失败；③ 失败路径的半成品实体在 finally 销毁，防止重试累积占显存。生成内容没变时不升缓存版本（v28 保留），避免全库无效重生成。
- **meshInstance.aabb 不可信**：导入取景一律用解析式包围盒（8 角点 × 世界矩阵）。
- **单位**：GLB 实际单位直接解析 POSITION accessor min/max，别猜。Cine57 是米。
- **localStorage 脏缓存**：缩略图缓存键必须带版本；写入前校验 `data:image/` 前缀。
- **UE 5.7 Python API 坑**：材质槽在 `get_editor_property("static_materials")`（无 `get_material_slots()`）；贴图参数取值用实例方法 `mi.get_texture_parameter_value(纯字符串名)`（传 `MaterialParameterInfo` 会触发 K2 转换失败）；LightForge 插件必须在 UE 启动前从外部禁用（写进脚本里来不及，插件加载先于 pythonscript），跑完还原 .uproject 后要复查是否残留禁用项。
- **并行会话的 dev 组端口战**：主站 supervisor 会在子进程死后 1-2 秒内复活，置换 5174 前先找到 supervisor 根进程（`dev-service-supervisor` 链）整树杀掉；杀完 netstat 复核、验证完恢复主站 `pnpm dev`。**过期 worktree 持有 5174 会把旧资产直接端给用户**（用户按 5174 访问，不知道背后是谁的服务）——用户报告「修复后又出现」时，第一步先确认 5174 由哪个目录的进程服务、其检出是否包含修复提交，再怀疑资产本身。
- **IAB 截图陈旧帧**：capture 反复失败或画面与预期不符时，关旧标签页开新页再截（旧页 WebGL 上下文可能已死）。
- **自写 GLB writer 必须显式传分量数**：`final_retarget.py` 曾把拍平后的一维浮点数组交给 `push_accessor` 再探测 `len(arr[0])`，恒等于标量，所有动画通道都被写成 SCALAR（每键 1 float）——播放时蒙皮矩阵整体错乱，表现为角色不可见或诡异姿势；而内存中的求解结果是正确的，离线校验（dot、SVG 火柴人）全部通过，极具迷惑性。排查手段：解析输出 GLB，比对 `accessor.count` 与 `sampler.input.count`、`type` 是否为 VEC4/VEC3、按 16 字节步长读四元数模长是否恒为 1。
- **骨骼名匹配必须限定目标骨架 joints**：UAL2 的网格包装节点叫 `Mannequin`，UE 导出骨架的根骨也叫 `Mannequin`；按名字裸匹配会给网格包装节点写入旋转通道，整只模型被动画带飞。目标侧只允许 `skins[].joints` 内的节点参与匹配，源侧（纯动画导出，可能没有 skins）用全部命名节点。
- **跨骨架重定向必须按解剖骨段对齐**（2026-09-02 向前奔跑案例）：源 UE Mannequin 与 UAL2 的核心骨骼名称和父子层级可以相同，但绑定姿态的局部骨骼轴不同；只套 `W_source_animation * inverse(W_source_bind) * W_target_standing_base`，再叠加通用胸腔瞄准或无条件末端 IK，会让 `spine_03→neck_01`、颈部、肩链和腿链逐渐偏离源动作，表现为低头、肩膀不对称和脚步变形。重定向器先用世界空间姿态差建立初始旋转，再逐帧把躯干、颈部、锁骨、上臂、前臂和腿的源子骨方向对齐到目标同名骨段；不为缺失的 `spine_04/05` 增加特例。末端 IK 只在源双手互相接近（最小腕间距不超过 `0.15m`）时两侧同时启用，或在单侧手腕接近头部（距离不超过 `0.20m`）时只启用接触侧，普通移动帧和腿链不受手部接触影响；`RETARGET_USE_LIMB_IK=1` 可对特殊动作显式强制全帧双臂与双腿，`RETARGET_NO_ARM_IK=1` 可关闭。
- **同一 canvas 上并发两个 PlayCanvas Application 会互相摧毁**：React StrictMode 下 effect 双执行很容易造出这种局面——两个应用共享同一个 WebGL 上下文，先销毁的一方会破坏存活方的渲染循环（`app.frame` 恒 0、画面永远停在某一帧）。预览器因此提供同步 `cancel()`；页面 effect 清理同步取消，保证任一时刻只有一个应用。
- **Radix Dialog 里拿不到 canvas ref**：`useRef` + `useEffect` 在弹窗首次打开时 `canvasRef.current` 可能为 null（effect 先于 ref 就绪执行），创建逻辑会被静默跳过且不再重试。用回调 ref 写入 state、把画布元素作为 effect 依赖来触发创建。
- **动画内容门禁必须覆盖源姿态与目标语义**：源 FBX/GLB 可能已经包含真实的绝对姿态；如果目标仍呈 T 姿，先检查源绑定姿态与 UAL2 站立基准是否明确，再检查世界空间重定向乘法方向，不能把运行时首帧补偿当成导出修复。坐姿则要单独检查骨盆的目标基准加 rest-relative 平移，逐分量绝对比例会把源坐标写成目标深度偏移。扩库仍需在 UE 侧确认加法层已烘焙，并按公开 GLB 数据抽查源动画偏差、目标动作语义和 accessor 结构。

## 相关模块

- `pages/drama/comicDrama/components/blocking3d/`：gizmo、资源加载、相机数学的门面提供方（`index.ts`）。
- `pages/drama/comicDrama/components/editor3d/`：Inspector 面板与变换工具条（`index.ts`）。
- `config/modelLibrary.ts`：模型目录数据（构建产物，勿手改）；`config/animationLibrary.ts`：动画目录数据；`config/dramaFocusNav.ts`：顶部导航入口。
- `pages/animations/`：动画库独立页与循环播放预览器（`animationPreviewApp.ts`）。
