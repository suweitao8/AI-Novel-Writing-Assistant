# 模型导入透明材质与真实预览质量门禁设计

## 背景

模型详情页已经暴露出两类同源问题：`SM_Plants_Plastic_Set_01a.glb` 的叶片出现黑色三角缺面，`SM_Grass_a.glb` 出现整块矩形叶片和深色边缘。产品当前不是没有光照，而是透明贴图的 alpha 语义在导入阶段丢失后，被最终预览按不透明几何渲染。

本次只读复核得到以下证据：

- 两个异常模型的 GLB 都是 FBX2glTF 生成的占位材质，GLB 本身没有内嵌 baseColor 纹理；真实外观由目录材质回填。
- 两个模型的 Cine57 源 baseColor 都是 RGBA PNG，`ffmpeg alphaextract + signalstats` 输出 `YMIN=0`，说明存在透明像素；当前发布目录却把它们写成了 JPG，alpha 已经不可恢复。
- `%TEMP%/fbx2gltf-test/build-library-v3.cjs` 的 `probeAlpha` 对 `execFile` 返回的 `{ stdout, stderr }` 直接执行 `JSON.parse(out)`。异常被本地 `catch` 吞掉后，所有 alpha 探测失败并回退成“不保留 alpha”。
- 仓库的材质门禁只检查 GLB 的 `BLEND`/`MASK` 和目录声明。上述 GLB 的 alphaMode 是 `OPAQUE`，所以它无法知道源 PNG 的透明语义已经在转换时丢失。
- 484 个静态模型中只有 1 个有真实模型详情页预览证据，其余 483 个使用 `standard-thumbnail-audit`，因此普通缩略图审核没有覆盖最终详情页材质链路。

## 目标

1. 修复并测试源 RGBA 贴图探测；只要源贴图存在透明像素，就保留 PNG，并让该 PNG 的 alpha 作为目录材质的 opacity 映射。
2. 将真实模型详情页预览设为所有静态模型的发布前必需证据，不再允许普通缩略图审核替代最终预览。
3. 对当前发布目录执行全量预览复核；异常模型从发布目录移出，并移动到仓库外带清单和 SHA-256 的可恢复隔离目录，不删除源文件。
4. 使材质文件、GLB、目录映射和预览证据之间的关系可被质量门禁重复验证；资源或映射变化后旧证据自动失效。
5. 保留当前正常的 `SM_grass_02_A_1.glb`，不因“自然资产”类别本身进行宽泛过滤。

## 非目标

- 不在 PlayCanvas 运行时增加“自动裁黑块”或按模型名称猜测材质的兜底逻辑。
- 不改变模型库分页、缩略图尺寸、HDRI 光照或详情页交互。
- 不删除 Cine57 源 FBX、源 PNG 或现有 GLB；隔离动作仅针对已确认不应发布的产物和目录条目。

## 方案

### 1. 导入层：保留源 alpha 并建立可测试的探测契约

- 将 `execFile` 的解析改为解析 `result.stdout`，而不是结果对象本身。
- 继续先用 `ffprobe` 的 `pix_fmt` 判断是否具备 alpha，再用 `alphaextract,signalstats,metadata=print` 读取 alpha 最小值；兼容 `YMIN=...` 和 `YMIN:...` 两种 FFmpeg 输出。
- alpha 统计缺失或探测失败时保守保留 PNG；只有确认没有 alpha 或明确属于 normal/RMA 等强制不透明桶时才输出 JPG。
- 复用仓库中的 `scripts/models/textureAlpha.mjs` 纯函数和测试，并在实际外部构建器中修正 `stdout` 读取。构建器仍然写入当前工作区，但关键规则由仓库测试和文档固定下来。
- baseColor 生成结果为 PNG 时，目录材质必须同时声明相同路径的 opacity；源材质已有独立 opacity 时，保留独立映射并在审核中确认其通道语义。

### 2. 发布层：真实详情页预览成为硬门禁

- `modelLibraryVisualReview.mjs` 不再根据 `reviewEvidence` 前缀决定是否需要 `preview`；所有发布的 Cine57 静态模型都必须有完整的详情页预览记录。
- 预览记录至少绑定：`/models/<id>`、GLB 与所有目录贴图的 SHA-256、统一详情页渲染器标识、复核日期、材质/透明状态，以及审核结论。
- 资产哈希、材质映射、GLB 或预览渲染器变化后，旧记录不能继续通过；普通 `standard-thumbnail-audit` 只能作为历史说明，不能作为发布证据。
- 质量门禁继续同时检查 GLB 结构、材质映射、贴图文件存在性、透明契约、尺寸、使用说明和视觉证据；视觉证据不能替代结构门禁。

### 3. 全量复核与隔离

- 使用产品真实详情页统一环境和相机逐个检查当前 484 个静态模型，重点观察：黑色/深色矩形或三角块、叶片/花瓣边缘、透明背景、缺贴图、白色碰撞壳、模型破碎和明显错误的材质颜色。
- 发现问题时先生成隔离清单，保存原路径、文件名、模型 ID、原因、证据日期、GLB/贴图 SHA-256；再把发布产物移至 `D:\UnrealWorkspace\Cine57-model-quality-quarantine-<date>-preview` 这类仓库外目录。移动前检查备份存在且 SHA-256 一致，移动后再次校验。
- 当前两个已确认异常模型先隔离旧 JPG 产物；修正导入流程后只允许通过真实详情页预览和全部门禁的重建产物重新进入目录。仍然异常的模型保持隔离，不能靠页面过滤隐藏。
- 复核通过的模型才写入/更新视觉复核记录；目录再生成后重新运行完整质量检查，避免目录引用与文件状态分离。

## 数据流

```text
UE manifest / RGBA source textures
              │
              ├─ ffprobe + alphaextract/signalstats
              ├─ PNG/JPG output decision (fail-safe)
              └─ baseColor/opacity mapping
              ▼
       FBX → GLB → generated catalog
              │
              ├─ structure/material/texture gate
              ├─ real /models/<id> detail preview
              └─ preview hash + renderer evidence
              ▼
       publish or external recoverable quarantine
```

## 验收标准

- 单元测试覆盖 `execFile` 的 stdout JSON 解析、两种 YMIN 格式、alpha 缺失保守保留，以及 normal/RMA 强制 JPG。
- 透明源贴图重新构建后仍为 PNG；`SM_Plants_Plastic_Set_01a` 和 `SM_Grass_a` 的详情页不再显示黑色三角或不透明矩形背景。
- 模型视觉审核测试拒绝缺少真实详情页预览、哈希不匹配、资源变化后复用旧证据的条目；历史普通缩略图记录不能单独通过。
- 全量复核结果有明确的通过/隔离清单；发布目录不包含已隔离模型，隔离目录中的原始文件可按清单恢复。
- `pnpm test:model-library`、`pnpm check:model-library`、客户端类型检查和模型页浏览器烟测通过；浏览器控制台无新增错误。

## 相关文件

- `scripts/models/textureAlpha.mjs`：alpha 像素格式和 FFmpeg 统计规则。
- `scripts/models/modelLibraryTextureAudit.mjs`：目录材质与 GLB 材质契约。
- `scripts/models/modelLibraryVisualReview.mjs`：详情页视觉证据契约。
- `scripts/models/modelLibraryQuality.mjs`：模型库总质量门禁。
- `scripts/models/model-library-selection.json`：发布白名单与精确隔离清单。
- `scripts/models/model-library-visual-review.json`：名称、分类、mesh 和预览证据。
- `client/src/pages/models/modelLibrary3d/modelMaterials.ts`：详情页运行时材质回填。
- `C:\Users\su\AppData\Local\Temp\fbx2gltf-test\build-library-v3.cjs`：当前外部 FBX→GLB/贴图构建器，需要同步修正并保留备份。
