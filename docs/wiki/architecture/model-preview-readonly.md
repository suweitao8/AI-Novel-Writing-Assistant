# 模型详情预览边界

## Background

模型详情页的职责是帮助用户检查模型资源，而不是修改模型或预览环境。若详情页同时暴露 HDRI 参数和模型变换工具，用户容易把一次查看操作误认为资产修改；多个页面各自保存环境参数，也会让同一模型在不同入口出现不同的预览结果。

## Decision

模型详情页采用只读预览契约：页面只读取通用资产系统提供的 HDRI 环境，只允许用户调整相机视角；模型信息和包围盒由加载完成后的实际几何数据计算，不能通过详情页写回资产或改变模型变换。

## Current Rule

- 通用 HDRI 资产 3D 编辑页是环境投射中心、半球直径等环境参数的唯一编辑入口。模型详情页只在创建预览时读取系统偏好，不提供环境选择、半球直径或保存环境设置的控件。
- 模型详情页不创建变换面板、变换工具栏、gizmo，也不暴露模型位置、旋转和缩放 setter。右键旋转、中键平移、滚轮缩放均只改变相机。
- 预览保留聚焦、复位视角和截图能力；这些操作不得修改模型节点的局部变换。
- 3D 画面提供可选的非交互式线框包围盒，默认隐藏；“显示包围盒”只控制绘制状态。包围盒仅用于观察尺寸，不参与拾取、拖拽或编辑。

## Geometry Stats

`modelGeometryStats.ts` 负责把 PlayCanvas 网格实例转换为稳定的模型统计：

- 顶点数量按唯一 `vertexBuffer` 去重，避免同一顶点缓冲被多个 mesh instance 重复计算。
- 包围盒使用网格实例的世界变换矩阵变换 8 个局部 AABB 角点，再合并所有网格实例，确保节点层级变换被计入。
- 展示尺寸使用米制，并约定 `X = 长度`、`Z = 宽度`、`Y = 高度`。源资源的 `unitScale` 同时作用于包围盒和三个尺寸。
- 模型加载后的落地居中使用同一份统计结果：X/Z 居中，Y 轴从最低点落到地面；因此画面中的线框包围盒与信息面板的长宽高保持一致。
- 没有可用网格或包围盒数据时，信息面板显示缺省状态，预览不伪造顶点数或尺寸。

## Failure Modes

- 不得从详情页重新保存 HDRI 直径或环境预设；否则会形成环境设置的第二个写入口。
- 不得把相机缩放误写成模型缩放；相机距离和裁剪面可以按模型包围球自适应，但模型节点变换必须保持只读。
- 不得按 mesh instance 数量直接累加顶点；实例共享顶点缓冲时必须去重。
- 不得只读取未变换的网格 AABB；骨骼/节点层级变换会让显示尺寸和实际模型不一致。
- 包围盒显示状态只属于当前详情页会话，不写入资产或浏览器存储；重新进入详情页必须默认隐藏。
- 包围盒颜色和可见性不得成为模型变换或 HDRI 环境设置的第二个编辑入口。

## Related Modules

- `client/src/pages/models/ModelEditorPage.tsx`：详情页的信息面板、只读操作入口和系统环境初始参数。
- `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`：PlayCanvas 相机、模型加载、系统 HDRI 生命周期和非交互式包围盒绘制。
- `client/src/pages/models/modelLibrary3d/modelGeometryStats.ts`：几何统计、单位换算、落地居中包围盒。
- `client/src/pages/settings/StudioEnvironmentPreviewPage.tsx`：通用 HDRI 环境参数的编辑入口。

## Source Documents

- `docs/superpowers/specs/2026-08-31-model-preview-readonly-design.md`
- `docs/superpowers/plans/2026-08-31-model-preview-readonly-plan.md`
