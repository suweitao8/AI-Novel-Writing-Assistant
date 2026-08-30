# 模型预览取景边界

## Background

模型库同时有卡片缩略图和单模型详情页。两处如果各自用固定距离和不同角度，床、树、地毯、烟灰缸等长宽高差异很大的资产会出现主体过小、出框或视角不一致的问题。渲染器提供的单个 `meshInstance.aabb` 也不能代表带节点偏移的完整模型。

## Decision

模型预览取景由 `client/src/pages/models/modelLibrary3d/modelPreviewFraming.ts` 统一负责。调用方先将模型归一化为底部中心落在原点的显示 AABB，并优先读取 GLB 的真实顶点做屏幕空间透视投影；真实顶点不可读时才回退到 AABB 八角点。随后按画布宽高比反求安全相机距离。标准姿态为水平偏航 45°、向下俯视 25°、50° FOV，实际主体投影以画布 80% 为目标，76%–84% 为可接受区间。

## Current Rule

- `thumbnailStudio.ts` 与 `modelViewerApp.ts` 必须使用同一套标准姿态和屏幕空间拟合函数；有真实顶点时以真实顶点投影确定主体占比，AABB 只承担安全边界和无顶点数据时的回退。
- 详情页首次拟合必须优先使用 canvas 父容器的 CSS 布局尺寸，并在 PlayCanvas resize 后重新拟合；不能直接使用初始化阶段的默认绘图缓冲尺寸，后者常见为 300×150，会让宽画布中的主体横向偏小。
- AABB 必须来自带节点世界变换的完整几何边界；不能直接把单个 mesh 的未经验证包围盒当作最终取景依据。
- 缩略图缓存键包含取景合同版本。取景、投影、材质或环境改变时必须递增版本；当前模型缩略图缓存为 `model-library:thumbnails:v22`，避免旧图覆盖新规则。
- 退化或异常几何只能回退到有限安全距离，不能把 `NaN` 或 `Infinity` 传入 PlayCanvas。
- 用户完成环绕、平移或滚轮缩放后保留交互结果；“聚焦/复位”重新使用标准取景。

## Failure Modes

- 用固定半径乘常数会让扁平地毯和高树的主体占比完全不同；先检查投影覆盖率，再调整距离。
- 只使用局部 mesh AABB 会漏掉 GLB 子节点偏移，表现为模型偏移、裁切或中心不稳；必须使用变换后的八角点并集。
- 只用 AABB 角点会对薄片、圆环、空心等模型过度保守：包围盒可能达到 80%，真实网格仍然偏小；应优先用实际顶点投影拟合，顶点不可读时再使用 AABB 回退。
- 只改算法不升级 localStorage 缓存会让用户继续看到旧视角；检查缓存版本和浏览器实际卡片图同时变化。

## Related Modules

- `client/src/pages/models/modelLibrary3d/modelPreviewFraming.ts`
- `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`
- `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`
- `client/src/pages/models/modelLibrary3d/modelGeometryStats.ts`

## Source Documents

- `docs/wiki/product/model-library.md`
- `docs/superpowers/specs/2026-08-31-model-visual-naming-preview-design.md`
