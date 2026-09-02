# 模型导入与详情页预览质量门禁

## Background

Cine57 导出的 Base Color 可能是带透明通道的 RGBA PNG。草、叶片、花和灌木通常把镂空信息放在这个通道里；如果转换阶段把它压成 JPG，或者目录材质没有绑定 opacity，透明图集的背景就会作为不透明平面显示。仅检查 GLB 能否加载、或仅检查卡片缩略图，无法证明详情页里的真实材质是正确的。

## Decision

模型进入可用目录前必须同时通过三层证据：

1. 源贴图探测确认像素格式和 alpha 范围；无法完成探测时采用保守结果，保留透明通道并阻止不可验证的发布。
2. 最终目录材质必须保留源 alpha 的语义：带有效 alpha 的 Base Color 输出为 PNG，并绑定独立 opacity 映射或透明标量；法线和粗糙度等不含 alpha 的贴图可以继续使用 JPG。
3. 在产品真实模型详情页完成三维画布预览，记录当前 GLB、目录贴图和预览截图的 SHA-256。截图必须是方形，且画布已经完成几何加载，没有控制台错误或失败请求。

视觉审核记录只能描述名称、分类和画面结果，不能用标准缩略图或占位图替代真实详情页证据。资源哈希变化后必须重新预览，旧证据不能继续授权发布。

## Current Rule

- `scripts/models/modelLibraryImportAudit.mjs` 负责源 alpha 探测、透明贴图的 PNG 修复、目录映射更新和导入审计证据。
- `scripts/models/modelLibraryTextureAudit.mjs` 校验最终贴图存在、输出格式、GLB 透明模式以及 Base Color 到 opacity 的绑定。
- `scripts/models/model-library-preview-audit.mjs` 校验详情页路由、渲染器、画布几何状态、方形截图、资源指纹和浏览器错误；`modelLibraryQuality.mjs` 把导入审计与预览审计作为发布硬门禁。
- 修复流程只生成新的透明输出并更新目录映射，不删除原始 JPG、源导出、GLB 或隔离记录；无法修复的候选留在可恢复的隔离范围，不进入可用目录。

## Diagnosis Order

遇到草、叶片或图集背景变成整块颜色时，按以下顺序排查：

1. 用 `ffprobe`/`ffmpeg` 确认源文件是否为 RGBA，以及 alpha 最小值是否小于全不透明值。
2. 检查最终 Base Color 的像素格式和实际 alpha，不要只看扩展名。
3. 检查 `modelLibrary.ts` 的材质声明是否指向修复后的 PNG，并且有 opacity 映射或透明标量。
4. 解析 GLB 的材质 `alphaMode`、节点和材质绑定，排除材质模式或碰撞节点造成的假象。
5. 打开 `/models/<id>` 详情页，确认真实 PlayCanvas 画布的几何、透明边缘和透明背景。
6. 比对导入审计与预览审计中的 SHA-256；任何指纹不一致都按未审核资产重新处理。

## Failure Modes

- **透明图集变成三角色板**：源 PNG 被转为 JPG，或 Base Color 的 alpha 没有映射到 opacity。
- **探测结果为空仍然发布**：脚本把“无法确认”当成“不含 alpha”；正确行为是保守保留并阻止未验证结果。
- **卡片看起来正常但详情页异常**：卡片占位图或旧缓存掩盖了真实材质；必须以详情页三维预览为准。
- **截图通过但资源已经变化**：截图绑定的是旧 SHA-256；哈希校验必须失败并触发重新审核。
- **首次打开偶发无画面**：WebGL 或浏览器自动化初始化竞争属于运行时瞬态；应重新加载并确认几何状态，不能把一次基础设施超时直接判成模型损坏。

## Related Modules

- [模型库（/models）](../product/model-library.md)：模型目录、材质回填、前景范围和详情页边界。
- `scripts/models/modelLibraryImportAudit.mjs`：导入透明通道审计与修复。
- `scripts/models/modelLibraryTextureAudit.mjs`：贴图、材质和 GLB 合同校验。
- `scripts/models/model-library-preview-audit.mjs`：真实详情页预览证据合同。
- `scripts/models/modelLibraryQuality.mjs`：模型库发布总门禁。

## Source Documents

- [模型导入预览质量门禁设计](../../superpowers/specs/2026-08-31-model-import-preview-quality-gate-design.md)
- [模型导入预览质量门禁实施计划](../../superpowers/plans/2026-09-03-model-import-visual-quality-gate.md)
