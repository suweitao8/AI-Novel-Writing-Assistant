---
name: unreal-model-import
description: 从本机虚幻项目（D:\UnrealWorkspace\Cine57，UE 5.7）无头导出静态网格模型并入库到本项目模型库的完整操作流程。凡涉及从 UE/虚幻导出模型、扫描或筛选 Cine57 资产、扩量模型库、FBX 转 GLB、GLB 清洗（UCX/LOD）、材质贴图回填、以及"模型有白色包裹"类导出质量问题，都必须使用本 skill。
---

# UE → 项目模型库入库管线

把 Cine57（UE 5.7 示例包）里的静态网格，经无头导出 → 转换清洗 → 目录再生，落进项目模型库（`/models` 页）。全部步骤在本机实测跑通，仓库外的脚本与产物路径都是固定事实，不要重新发明。

## 固定路径

| 事物 | 路径 |
|---|---|
| UE 项目 | `D:\UnrealWorkspace\Cine57`（`Cine57.uproject`，UE 5.7） |
| UE 编辑器 | `D:\Epic Games\UE_5.7`（`Engine\Binaries\Win64\UnrealEditor-Cmd.exe`） |
| 扫描/选型/导出脚本 | `D:\UnrealWorkspace\*.py`（`scan_props.py`、`select_batch3.py`、`export_cine57_batch*.py`） |
| UE 导出产物 | `D:\UnrealWorkspace\Cine57-exported*\`（FBX + 贴图 PNG + manifest） |
| FBX→GLB 工具 | `D:\UnrealWorkspace\gltf-tools\`（`node fbx2glb.mjs in.fbx out.glb`，npm fbx2gltf） |
| 目录构建脚本 | `%TEMP%\fbx2gltf-test\build-library-v3.cjs` |
| 项目入库落点 | `client/public/models/cine57/`（`*.glb` + `tex/`）+ `client/src/config/modelLibrary.ts` |
| 设计决策与失败模式全集 | `docs/wiki/product/model-library.md` |

## 管线五步

### 1. 扫描筛选
`scan_props.py` 全文件扫描 `/Script/Engine.StaticMesh`，按名字剔除建筑壳体、地形、LOD、碰撞体。源项目有 1.1 万+ 静态网格，前景可用的约 3100 个——先扫描拿到全名单再谈选哪些。

### 2. 选目标
`select_batch3.py` 按包配额 + 网格族限量选目标。**模型库是策展型资产：人工精选入库，不做全量倾倒**——曾一次性扩到 509 个因质量参差整体回退；batch3 的 466 个产物保留在 `D:\UnrealWorkspace\Cine57-exported3\`，随时可按包重新精选（构建脚本把 manifest 加回 entries 即可）。

### 3. UE 无头导出
命令模板（背景运行，每轮约 90 秒编辑器启动成本）：

```
"D:\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" ^
  "D:\UnrealWorkspace\Cine57\Cine57.uproject" ^
  -run=pythonscript -script="D:/UnrealWorkspace/<script>.py" ^
  -nullrhi -unattended -nosplash -nosound -stdout -fullstdlogwrite
```

导出脚本模式参考 `export_cine57_batch3.py`：产出 FBX + 材质贴图 PNG；manifest 用 JSONL 逐条追加（断点续跑）；贴图按「贴图资产路径 + 桶」去重，避免同贴图落多份。

### 4. 材质补数据（introspection）
FBX 只带占位材质，真实外观要回 UE 里 introspect：
- `export_cine57_batch4b.py`：贴图参数扫描 + 全量按资产 RMA 扫描 → `_rma_overrides.json`；
- `export_cine57_batch4e.py`：MaterialInstance 的标量/向量参数 + 父材质混合模式 → `_mi_params.json`（纯材质的 tint/metallic/roughness/opacity/emissive 从这里合并）。

### 5. 构建入库
`%TEMP%\fbx2gltf-test\build-library-v3.cjs` 一次完成：FBX2glTF（4 并发）→ GLB 清洗 → ffmpeg 贴图降采样（6 并发）→ 词库自动命名 + 规则分类 → 再生 `modelLibrary.ts` → 孤儿文件清理。
**运行前必须改脚本头部的 `PUBLIC` / `TEX_OUT` / `CATALOG_TS`：里面硬编码的是历史 worktree 路径，要指向当前 worktree 的对应目录。**

完成后走标准验证：`pnpm --filter @ai-novel/client typecheck` + 浏览器 smoke（`/models` 页渲染、3D 编辑器打开新模型、无白色包裹、console 无错），按 AGENTS.md 的 codex/* worktree 流程提交集成。

## 硬规则（每条都对应一次返工教训）

1. **UCX 碰撞体 + LOD1+ 必须剔除**。UE 导出的 FBX 默认带碰撞壳（`UCX_*`，无贴图凸包），网页端不剔除就是用户看到的"白色包裹"。构建脚本在转换后直接改写 GLB JSON chunk 剔除（BIN 不动）。
2. **tint 只属于无贴图槽位**。UE 清单里的 `slot.tint` 是母材质向量参数默认值，不是漫反射；槽位已有 baseColor 贴图时全局乘 tint 会把整件模型染成参数默认色（曾把办公桌染蓝、宫灯染绿、床品染到近黑）。
3. **RMA 只用 G 通道粗糙度**（`glossMap` + `glossMapChannel:"g"` + `glossInvert`）。这包资产的 ORM 的 B（约定金属度）/R（约定 AO）通道经逐张审计语义错误（地毯金属度 0.98、砖炉金属板 0.01），**禁开 `metalnessMap`/`aoMap`**，除非接入了校准过的 PBR 数据。PlayCanvas 手动接贴图必须显式写死通道：引擎默认通道与 glTF 约定不一致。
4. **贴图桶**：baseColor ≤2048 JPEG（质量 82，编辑器支持近距离观察，1024 有明显像素）；normal/RMA ≤1024 JPEG；源 PNG 有真实镂空 alpha（YMIN < 254）才保留 PNG。本机新版 ffmpeg 单图输出必须加 `-update 1` 且放在输出文件名之前。
5. **`unitScale` 保持 1**：Cine57 几何单位是米（拿 POSITION accessor min/max 实测确认，别猜）。单件源资产超 12MB 不入库。
6. **`modelLibrary.ts` 是构建产物，勿手改**；条目的 `materials` 映射按「UE 材质资产名 → 贴图/标量」由构建脚本再生。

## UE 侧坑（全部实测踩过）

- **LightForge 插件会让 commandlet 启动即崩**（`CurrentBaseApplication.IsValid()` 断言）。必须在 UE 启动前从外部禁用：**改 `.uplugin` 文件名本身**——往 `.uproject` 写 `Enabled:false` 会被运行时剥掉，改 Plugins 目录名也没用（会递归扫 `.uplugin`）。用完恢复。
- **UE 5.7 Python 导出 API 大改**：`EditorAssetLibrary.export_assets` 已删除；`InterchangeManager` 对 StaticMesh 返回 False 且无路径参数；`AssetExportTask` 的资产属性叫 **`object`**（不是 asset）。最终可用入口：`unreal.StaticMeshExporterFBX()` + AssetExportTask（`object` / `filename` 用正斜杠绝对路径 / `automated=True`）→ `run_asset_export_task(task)`。
- **材质 introspection 的属性名**：材质槽在 `get_editor_property("static_materials")`（无 `get_material_slots()`）；贴图参数取值用实例方法 `mi.get_texture_parameter_value(纯字符串名)`（传 `MaterialParameterInfo` 会 K2 转换失败）；枚举名带下划线（`MP_BASE_COLOR`）；`get_texture_parameter_names` 返回 Name 对象，过正则前必须 `str()`。
- **迭代方法论**：每轮 90 秒启动成本，把 `obj.__doc__`、`dir(obj)` 通过 `unreal.log_warning` 打回日志做自省，一轮拿到尽可能多的信息。
- **角色动画是另一条线**：UE 内 IK Retargeter 批量烘焙在 commandlet/全编辑器下都崩，离线 GLB 层重定向（`gltf-tools/final_retarget.py`，绑定位姿差法）是唯一可行路径。做动画入库前先读 `docs/wiki/product/model-library.md` 的「动画入库管线」与失败模式。
