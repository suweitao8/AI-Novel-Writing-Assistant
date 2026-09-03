# 模型预览透明贴图与导入质量门禁

## Background

模型详情页看到黑色三角、整块矩形叶片或深色包裹面时，问题不一定来自灯光或相机。Cine57 的部分静态网格由 FBX2glTF 生成占位材质，GLB 内没有真实 baseColor，网页预览依赖模型目录的材质回填。源贴图如果带有透明像素，而导入阶段把它压成 JPG，透明 atlas 背景就会变成不透明几何。

典型表现包括：

- 植物叶片周围出现黑色三角或矩形面；
- 草、花和灌木的透明背景变成整块颜色；
- GLB 的 alphaMode 仍为 OPAQUE，但源 PNG 实际有透明通道；
- 只有列表缩略图审核通过，详情页仍然出现异常材质。

## Decision

透明语义必须在导入、目录材质和最终详情预览之间保持连续：

1. 导入器先读取源像素格式，再用 alphaextract 与 signalstats 检查 alpha 范围。RGBA 源只要存在透明像素，就输出 PNG；统计缺失或探测失败时也保守保留 PNG。
2. 透明 baseColor 在模型目录中必须绑定同源 PNG opacity。normal 和 RMA 等确认不透明的贴图仍可使用 JPG。
3. 模型库质量门禁同时检查 GLB 结构、目录贴图存在性、导入 alpha 审计和材质映射。不能只根据 GLB alphaMode 判断源贴图是否透明。
4. 每个发布静态模型必须走真实的 /models/<id> 详情页，确认 3D canvas、材质、透明边缘和几何没有异常，并绑定资源 hash。普通缩略图只能作为历史说明，不能代替详情预览。
5. 详情页不添加按模型名称裁黑块、替换材质或隐藏问题的运行时兜底。无法修复的产物必须从发布目录移出并进入仓库外可恢复隔离目录。

## Current Rule

- 源贴图审计脚本位于 scripts/models/modelLibraryImportAudit.mjs，审计结果位于 scripts/models/model-library-import-audit.json。
- 最终材质契约由 scripts/models/modelLibraryTextureAudit.mjs 校验；只要导入审计标记 preserveAlpha，就不能用没有独立 opacity 映射的 JPG baseColor。
- 详情预览证据由 scripts/models/model-library-preview-audit.mjs 合并到审核记录，审核数据位于 scripts/models/model-library-visual-review.json。证据必须包含详情路由、renderer、日期、textureStatus 和最终资源 SHA-256。
- 浏览器审计记录位于 scripts/models/model-library-preview-browser-audit.json。生成审核数据前，所有发布静态条目都必须有 ready=true 和 screenshotCaptured=true。
- 2026-09-03 的全库复核覆盖 484 个模型详情路由，全部渲染出 canvas 和模型信息，控制台错误为 0；其中 55 个贴图记录保留 alpha，最终均使用 PNG，未知探测数为 0。
- 同一批修复产生的 54 个旧有损 baseColor JPG 已移到 D:\UnrealWorkspace\Cine57-model-quality-quarantine-20260902-preview\legacy-lossy-basecolor。逐文件清单和 SHA-256 位于该目录的 legacy-lossy-alpha-outputs.manifest.json。对应 GLB 几何通过详情预览，因此保留并使用修复后的 PNG 材质回填；草丛 B 通过复核，不在隔离范围内。
- 外部 FBX2glTF 构建器的修改前备份位于 C:\Users\su\AppData\Local\Temp\fbx2gltf-test\backups\model-preview-quality-gate-20260902。备份只用于追溯和恢复，不作为发布资源。
- 本次同步修正了该备份目录对应的 batch-a、batch-b、batch-c、expansion、modern-expansion、v2 和 v3 构建器变体；共同规则是解析 execFile 的 stdout，并在 alpha 探测失败时保守保留 PNG。

## Failure Modes

### execFile 返回对象被直接 JSON.parse

Node 的 promisify(execFile) 返回包含 stdout 和 stderr 的对象。若直接对返回对象执行 JSON.parse，会抛出异常；旧构建器吞掉异常后把 alpha 探测当作失败，最终错误选择 JPG。修复必须解析 result.stdout，并保留失败时的 PNG 保守策略。

### YMIN 输出格式差异

FFmpeg 版本可能输出 lavfi.signalstats.YMIN=0，也可能输出 YMIN:0。解析器必须兼容两种格式。若找不到 alpha 统计，不得把贴图判定为全不透明。

### GLB alphaMode 不能替代源贴图审计

占位 GLB 可能声明 OPAQUE，因为真实透明材质只在目录回填时才接入。必须把源贴图审计结果写入独立 manifest，并在目录门禁中按 baseColor URL 消费。

### 普通缩略图掩盖详情页问题

缩略图可能使用旧缓存、不同相机或不同材质链路。审核记录必须绑定最终详情路由和资源 hash；资源、材质映射或渲染器改变后，旧 hash 自动失效。

## Diagnostic Order

1. 确认详情页是否真的渲染了模型，而不是只看到卡片缩略图或加载占位。
2. 从源 PNG 读取像素格式和 alpha 最小值。
3. 检查最终 baseColor 文件格式；有透明像素时必须是 PNG。
4. 检查目录材质是否把同源 PNG 同时绑定到 opacity，或是否存在明确独立 opacity。
5. 检查 GLB 的材质名、alphaMode、内嵌占位图、碰撞体和高阶 LOD。
6. 清理旧缓存并重新打开详情页，确认透明轮廓、颜色、光照和落地阴影。
7. 仍然异常时生成精确隔离清单，先复制并校验 SHA-256，再从发布目录移出；恢复前必须重新导入、重新预览并重新运行质量门禁。

## Related Modules

- scripts/models/textureAlpha.mjs：像素格式、alpha 统计和输出格式纯函数。
- scripts/models/modelLibraryTextureAudit.mjs：目录材质与 GLB 材质契约。
- scripts/models/modelLibraryQuality.mjs：模型库总质量门禁和资源 hash。
- scripts/models/modelLibraryVisualReview.mjs：详情预览证据格式与过期检查。
- client/src/config/modelLibrary.ts：由策展脚本生成的模型目录，不允许手工编辑。
- client/src/pages/models/modelLibrary3d/modelMaterials.ts：详情页材质回填运行时。

## Source Documents

- docs/wiki/product/model-library.md：模型库准入、材质和预览边界。
- docs/superpowers/specs/2026-09-02-model-preview-quality-gate-design.md：本次透明材质与详情预览门禁设计。
- scripts/models/model-library-import-audit.json：当前发布贴图的来源和 alpha 证据。
- scripts/models/model-library-preview-browser-audit.json：当前发布模型的详情页运行时审计。
