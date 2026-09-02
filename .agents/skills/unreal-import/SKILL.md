---
name: unreal-import
description: 从本机虚幻项目（D:\UnrealWorkspace\Cine57，UE 5.7）无头导出资产并入库到本项目——覆盖静态网格模型库与角色动画库两条完整管线。凡涉及从 UE/虚幻导出模型或动画、扫描或筛选 Cine57 资产、扩量模型库/动画库、FBX 转 GLB、GLB 清洗（UCX/LOD）、动画离线重定向、材质贴图回填、以及"模型有白色包裹""动画播放成 T-pose"类导入质量问题，都必须使用本 skill。
---

# UE → 项目资产导入管线（模型 + 动画）

把 Cine57（UE 5.7 示例包）里的静态网格与角色动画，经无头导出 → 转换清洗/离线重定向 → 目录再生，落进项目模型库（`/models` 页）与动画库（`/animations` 页）。两条管线共用 UE 无头导出基础设施，之后分叉；全部步骤在本机实测跑通，仓库外的脚本与产物路径都是固定事实，不要重新发明。

## 固定路径

| 事物 | 路径 |
|---|---|
| UE 项目 | `D:\UnrealWorkspace\Cine57`（`Cine57.uproject`，UE 5.7） |
| UE 编辑器 | `D:\Epic Games\UE_5.7`（`Engine\Binaries\Win64\UnrealEditor-Cmd.exe`） |
| 扫描/选型/导出脚本 | `D:\UnrealWorkspace\*.py`（`scan_props.py`、`select_batch3.py`、`export_cine57_batch*.py`） |
| 导出产物 | `D:\UnrealWorkspace\Cine57-exported*\`（模型：FBX + 贴图 PNG + manifest；动画：`Cine57-exported\anims\`） |
| FBX→GLB 工具 | `D:\UnrealWorkspace\gltf-tools\`（`node fbx2glb.mjs in.fbx out.glb`，npm fbx2gltf） |
| 动画重定向脚本 | 项目内 `scripts/animation/retarget_ual2.py`（GLB 层离线重定向）；`D:\UnrealWorkspace\gltf-tools\final_retarget.py` 仅保留为历史参考 |
| 重定向目标骨架 | `client/public/viewer-kit/quaternius/ual2/UAL2_Standard.glb`（项目代理角色） |
| 模型目录构建脚本 | `%TEMP%\fbx2gltf-test\build-library-v3.cjs` |
| 模型入库落点 | `client/public/models/cine57/`（`*.glb` + `tex/`）+ `client/src/config/modelLibrary.ts` |
| 动画入库落点 | `client/public/anims/cine57/UAL2_UE_Anims.glb` + `client/src/config/animationLibrary.ts` |
| 设计决策与失败模式全集 | `docs/wiki/product/model-library.md` |

## 无头导出公共基础（两条管线共用）

命令模板（背景运行，每轮约 90 秒编辑器启动成本）：

```
"D:\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" ^
  "D:\UnrealWorkspace\Cine57\Cine57.uproject" ^
  -run=pythonscript -script="D:/UnrealWorkspace/<script>.py" ^
  -nullrhi -unattended -nosplash -nosound -stdout -fullstdlogwrite
```

- **LightForge 插件会让 commandlet 启动即崩**（`CurrentBaseApplication.IsValid()` 断言）。必须在 UE 启动前从外部禁用：**改 `.uplugin` 文件名本身**——往 `.uproject` 写 `Enabled:false` 会被运行时剥掉，改 Plugins 目录名也没用（会递归扫 `.uplugin`）。用完恢复。
- **UE 5.7 Python 导出 API 大改**：`EditorAssetLibrary.export_assets` 已删除；`InterchangeManager` 对 StaticMesh 走不通；`AssetExportTask` 的资产属性叫 **`object`**（不是 asset）。静态网格入口：`unreal.StaticMeshExporterFBX()` + AssetExportTask（`object` / `filename` 用正斜杠绝对路径 / `automated=True`）→ `run_asset_export_task(task)`；动画序列入口：`unreal.AnimSequenceExporterFBX()`，同一套 AssetExportTask 用法。
- **迭代方法论**：每轮 90 秒启动成本，把 `obj.__doc__`、`dir(obj)` 通过 `unreal.log_warning` 打回日志做自省，一轮拿到尽可能多的信息。
- **材质 introspection 的属性名**：材质槽在 `get_editor_property("static_materials")`（无 `get_material_slots()`）；贴图参数取值用实例方法 `mi.get_texture_parameter_value(纯字符串名)`（传 `MaterialParameterInfo` 会 K2 转换失败）；枚举名带下划线（`MP_BASE_COLOR`）；`get_texture_parameter_names` 返回 Name 对象，过正则前必须 `str()`。

## 模型管线（五步）

### 1. 扫描筛选
`scan_props.py` 全文件扫描 `/Script/Engine.StaticMesh`，按名字剔除建筑壳体、地形、LOD、碰撞体。源项目有 1.1 万+ 静态网格，前景可用的约 3100 个——先扫描拿到全名单再谈选哪些。

### 2. 选目标
`select_batch3.py` 按包配额 + 网格族限量选目标。**模型库是策展型资产：人工精选入库，不做全量倾倒**——曾一次性扩到 509 个因质量参差整体回退；batch3 的 466 个产物保留在 `D:\UnrealWorkspace\Cine57-exported3\`，随时可按包重新精选（构建脚本把 manifest 加回 entries 即可）。

### 3. UE 无头导出
导出脚本模式参考 `export_cine57_batch3.py`：产出 FBX + 材质贴图 PNG；manifest 用 JSONL 逐条追加（断点续跑）；贴图按「贴图资产路径 + 桶」去重，避免同贴图落多份。

### 4. 材质补数据（introspection）
FBX 只带占位材质，真实外观要回 UE 里 introspect：
- `export_cine57_batch4b.py`：贴图参数扫描 + 全量按资产 RMA 扫描 → `_rma_overrides.json`；
- `export_cine57_batch4e.py`：MaterialInstance 的标量/向量参数 + 父材质混合模式 → `_mi_params.json`（纯材质的 tint/metallic/roughness/opacity/emissive 从这里合并）。

### 5. 构建入库
`%TEMP%\fbx2gltf-test\build-library-v3.cjs` 一次完成：FBX2glTF（4 并发）→ GLB 清洗 → ffmpeg 贴图降采样（6 并发）→ 词库生成候选名称 + 规则分类 → 再生 `modelLibrary.ts` → 孤儿文件清理。词库名称不是最终语义来源，不能替代截图复核。
**运行前必须改脚本头部的 `PUBLIC` / `TEX_OUT` / `CATALOG_TS`：里面硬编码的是历史 worktree 路径，要指向当前 worktree 的对应目录。**

构建器生成候选目录后，必须在当前 worktree 执行 `node --experimental-strip-types scripts/models/curate-cine57-library.mjs --apply-review-only`，把 `scripts/models/model-library-visual-review.json` 中已批准的截图语义应用到生成目录；该模式只重写目录名称、分类和尺寸字段，不清理或删除模型资产。随后执行 `pnpm check:model-library`。新增模型如果没有绑定到标准缩略图截图的 `approved` 复核记录，质量门禁必须失败，不能用英文文件名直译或页面隐藏绕过。

自然模型和任何带透明材质的新资产还必须完成真实详情页预览：复核记录使用 `model-preview-audit-YYYY-MM-DD` 证据，并绑定 `/models/<id>` 预览路径、发布 GLB/贴图 SHA-256、渲染器版本、渲染日期和贴图状态。资源或贴图任一字节变化都会使旧哈希失效；先生成并检查预览，再把候选写入发布目录。被拒候选放到外部隔离目录，不能留在 `client/public/models/cine57/` 等待页面过滤。

### 模型硬规则（每条都对应一次返工教训）

1. **UCX 碰撞体 + LOD1+ 必须剔除**。UE 导出的 FBX 默认带碰撞壳（`UCX_*`，无贴图凸包），网页端不剔除就是用户看到的"白色包裹"。构建脚本在转换后直接改写 GLB JSON chunk 剔除（BIN 不动）。
2. **tint 只属于无贴图槽位**。UE 清单里的 `slot.tint` 是母材质向量参数默认值，不是漫反射；槽位已有 baseColor 贴图时全局乘 tint 会把整件模型染成参数默认色（曾把办公桌染蓝、宫灯染绿、床品染到近黑）。
3. **RMA 只用 G 通道粗糙度**（`glossMap` + `glossMapChannel:"g"` + `glossInvert`）。这包资产的 ORM 的 B（约定金属度）/R（约定 AO）通道经逐张审计语义错误（地毯金属度 0.98、砖炉金属板 0.01），**禁开 `metalnessMap`/`aoMap`**，除非接入了校准过的 PBR 数据。PlayCanvas 手动接贴图必须显式写死通道：引擎默认通道与 glTF 约定不一致。
4. **贴图桶与编码质量**：baseColor ≤2048 JPEG，normal/RMA ≤1024 JPEG；FFmpeg 的 `-q:v` 是 JPEG 量化值而不是百分比，统一使用 `-q:v 2`（数值越小质量越高），禁止使用会造成明显马赛克的高量化值。源 PNG 有真实镂空 alpha（YMIN < 254）才保留 PNG。alpha 判断同时读取 `ffprobe` 的像素格式和 FFmpeg 的 `YMIN=...` / `YMIN:...` 输出，必须匹配 `lavfi.signalstats.YMIN` 这类带前缀的日志；声明了 alpha 但统计缺失时保守保留 PNG，绝不能静默转成 JPG。最终 GLB 为 `BLEND`/`MASK` 的材质必须在目录中绑定 `opacity` 贴图或小于 0.98 的 `opacityValue`，并由 `modelLibraryTextureAudit.mjs` 复核。 本机新版 ffmpeg 单图输出必须加 `-update 1` 且放在输出文件名之前；已有输出需要重建时显式设置 `CINE57_REBUILD_TEXTURES=1`，日常增量构建默认跳过已有文件。
5. **`unitScale` 保持 1**：Cine57 几何单位是米（拿 POSITION accessor min/max 实测确认，别猜）。单件源资产超 12MB 不入库。
6. **`modelLibrary.ts` 是构建产物，勿手改**；条目的 `materials` 映射按「UE 材质资产名 → 贴图/标量」由构建脚本再生。

## 动画管线（离线重定向）

### 前提事实

- 源项目约 2.1 万个动画资产（`_AnimDaily`/`_AnimBattle*`/`_AnimDailyInteract`/`_AnimDailyMisc`），约 95% 绑在标准 UE4 Mannequin 骨架上。
- **项目代理角色 Quaternius UAL1/UAL2 的核心骨骼命名沿用 UE4 Mannequin 约定**（`pelvis`/`spine_01-03`/`clavicle_l`/`upperarm_l`/`thigh_l`/`calf_l`…，核心骨骼同名），但绑定姿态的局部轴不保证相同；不能只按名字复制局部旋转，必须走脚本的世界姿态初始传递和逐帧解剖骨段对齐，不需要 UE 内 IK Retargeter。
- **UE 内重定向自动化在本机不可行**（不要尝试）：IK Retargeter 批量烘焙（`IKRetargetBatchOperation.DuplicateAndRetarget`）在 commandlet 下必崩（内部走 ContentBrowser/Slate）；本机全编辑器因项目 OIT 渲染 bug（`r.OIT.SortedPixels`，改 ini 压不住）启动即崩；nullrhi 全编辑器又卡死在隐形模态框。**离线 GLB 层重定向是唯一可行路径。**

### 步骤

1. **源选择与 UE 无头导出动画 FBX**：分镜主库优先选择 UE 路径或资产名明确带 `InPlace`、`IP`、`INP` 的 `AnimSequence`；明确位于 `RootMotion`/`Root` 路径段或资产名带独立 `RM`/`Root` 标记的源不得导入。未标记但被精确策选的源只能作为候选，转换后还要过 GLB 数值门禁。使用 `AnimSequenceExporterFBX` + AssetExportTask（公共基础一节的用法）导出到 `D:\UnrealWorkspace\Cine57-exported\anims\`。源片段必须包含完整绝对骨骼姿态；先在 UE 侧确认 `AdditiveAnimType`，并把 Additive、Layered 或未烘焙控制器轨道烘焙到骨架后再导出。
2. **FBX→GLB 与原地位移审计**：`node fbx2glb.mjs in.fbx out.glb`。转换后运行 `node scripts/animation/filter_animation_catalog_selection.cjs <candidate-selection.json> <glb-dir> <selection.json> [audit.json]`，检查 `root` 节点 translation 的每轴最大范围和首尾净位移是否都 `<= 0.03m`。没有 `root` translation 轨道是合法的原地结果；`pelvis` 局部升降、蹲伏和跳跃不作为全局移动判断。超限资产写入 `droppedClips`/审计报告，保留源 FBX/GLB，不通过改前端或清零骨盆来掩盖。
3. **GLB 层重定向**：`python scripts/animation/retarget_ual2.py <source.glb> <UAL2_Standard.glb> <out.glb> <name>`（参数顺序：源动画、基础角色、输出、名字）。脚本先用绑定位姿差 `W_t := W_s · inv(W_s0) · W_t0`（`W_*0` = 各自绑定世界朝向）建立初始旋转，自顶向下解局部四元数；然后逐帧把躯干、颈部、锁骨、上臂、前臂和腿的源子骨方向对齐到目标同名骨段，不用通用胸腔瞄准补偿缺失的 `spine_04/05/neck_02`。root/pelvis 平移只传递绑定姿态相对增量 `T_t := T_t0 + s · (T_s - T_s0)`，不能按绝对分量比例套用；目标侧只允许 `skins[].joints` 中的节点进入映射；输出四元数需为 VEC4、单位化并半球连续（相邻键 dot<0 取反）。末端 IK 仅在源双手最小间距不超过 `0.15m` 时自动启用，`RETARGET_USE_LIMB_IK=1` 可对接触类特殊动作强制启用，`RETARGET_NO_ARM_IK=1` 始终关闭；接触帧的 reach 门禁比较手腕相对头的方向/高度差与目标可达性，而不是只看欧氏距离。重定向完成后再次检查 root 位移，并复核各身体骨链的有限值、连续长度和方向；不能用运行时补偿修正导出错误。单条片段修正用 `scripts/animation/replace_catalog_animation.py` 保序替换进合并 GLB。
4. **链式合并进同一个 GLB**：动画体积远小于角色网格体积，后续批量入库往 `UAL2_UE_Anims.glb` 追加，不要一片一段一段文件。目录条目用 `clipName` 指向其中的动画（`animationLibrary.ts`）。合并前后都要保持原地清单顺序和动作名。

### 动画硬规则（每条都是实打实的坑）

1. **自写 GLB writer 必须显式传分量数**：曾把拍平的一维数组探测 `len(arr[0])` 恒得标量，所有通道写成 SCALAR——播放时蒙皮矩阵整体错乱（角色不可见/诡异姿势），而内存求解与离线校验全对，极具迷惑性。排查：解析输出 GLB，比对 `accessor.count` vs `sampler.input.count`、`type` 是否 VEC4/VEC3、四元数模长是否恒 1。
2. **骨骼名匹配必须限定目标侧 `skins[].joints`**：UAL2 的网格包装节点叫 `Mannequin`，UE 骨架根骨也叫 `Mannequin`——裸名匹配会把整只模型当骨骼转，写入旋转通道后整只模型被动画带飞。源侧（纯动画导出，可能没有 skins）用全部命名节点。
3. **GLB 结构细节**：JSON chunk 必须空格填充（NUL 会炸 `JSON.parse`）；追加 buffer 后要更新 `buffers[0].byteLength`；手写重写时 BIN chunk 长度在 `binOffset` 处读、数据从 `binOffset + 8` 开始（两处错了都顶点错位且 JSON 校验看不出来）。
4. **`animationLibrary.ts` 是数据目录**：新增动画优先往同一个 GLB 追加 + 加目录条目；缩略图（`animationThumbnailStudio.ts`）进目录即自动生成，无需手工出图，但改缩略图生成逻辑或替换资源必须升 localStorage 缓存版本。
5. **发布前必须过内容门禁**：除了 GLB 可解析、accessor 类型和四元数模长，还要验证每个 Cine57 片段无超限 root 全局位移、通道只驱动 skin joints、手臂骨链没有爆开/断裂，且代表动作满足待机手部低于肩部、行走双脚有明显轨迹、坐姿骨盆没有异常深度位移；不能用不同绑定姿态的源/目标世界四元数直接作相等校验。

## 验证（两条管线通用）

- 仓库自检：`pnpm --filter @ai-novel/client typecheck`；
- GLB 体检：解析 mesh/node 名单确认无 `UCX_*`/LOD 残留（模型）；解析 accessor 比对 count/type/四元数模长（动画）；
- 动画内容门禁：`node scripts/animation/inPlaceAnimationPolicy.test.cjs`、`node scripts/animation/animationCatalogSelection.test.cjs`、`python -m unittest scripts/animation/test_run_forward_retarget.py -v`、`node scripts/animation/verify_animation_catalog.cjs scripts/animation/animationCatalogSelection.json client/public/anims/cine57/UAL2_UE_Anims.glb` 和 `node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs`；
- 浏览器 smoke：模型走 `/models` 页 + 3D 编辑器打开新模型（无白壳、贴图正确）；动画走 `/animations` 页预览弹窗（动作可见、逐帧变化、非 T-pose）；console 无错；
- 产物入库一律走 AGENTS.md 的 codex/* worktree 工作流。

## 深入阅读

`docs/wiki/product/model-library.md` 收录了全部决策背景与失败模式（含缩略图生成、PlayCanvas 通道默认值、预览器并发约束等），写代码前先读它。
