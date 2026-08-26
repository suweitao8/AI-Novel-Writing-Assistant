# 漫剧 3D 对象面板与选中反馈设计

## Background

场景 3D 编辑和分镜 3D 草图已经共用满高工作台，但对象行仍携带辅助 meta，属性区标题和语义不够明确，角色本体的选中反馈只有地面圆环。用户需要像 Unity/虚化编辑器一样快速识别对象，并在选中可移动角色后直接查看其空间变换。

## Goals

- 对象列表每行只显示对象类型图标和对象名称；对象移除等动作移到属性面板，避免对象树混入操作控件。
- 下方区域统一命名为「属性面板」，保持固定的工作台区域高度，属性过多时只在面板内容区滚动。
- 可移动角色选中后显示位置、旋转、大小，并保留现有姿势、颜色和空间操作。
- 角色和比例参照在 3D 视口中显示高亮外轮廓；空间标记保持现有线框选中反馈并与对象树同步。

## Design

### Object tree

`Drama3DObjectPanel` 只渲染 `Drama3DObjectItem` 的 `kind` 图标、`label` 和选中状态。`meta` 与行内 trailing action 从通用对象项契约中移除，角色删除按钮放入分镜角色的属性面板。

### Property panel

`Drama3DEditorShell` 将右侧划分为固定上限的对象区和剩余空间的属性区；两个 Card 都填满各自 grid track，内容使用 `min-h-0 flex-1 overflow-y-auto`，不会因为属性数量改变工作台高度。两个页面的标题和 aria label 统一为「属性面板」。

### Selection outline

在 blocking viewer 中新增独立的选中外轮廓绘制模块：每帧读取选中角色渲染网格的世界 AABB，按包围盒 12 条边绘制亮色外框。现有地面选中圆环继续保留，作为脚下定位提示；场景比例参照复用同一角色外框。空间标记继续由 marker 模块绘制自身线框，选中时使用更高不透明度。

### Data and persistence

位置、旋转和大小均来自现有 `getSelectedTransform()`，不新增数据库字段；仅补充属性面板显示。外轮廓是运行时视觉反馈，不写入 `layout3d`，不影响 PNG 捕获之外的保存契约。

## Verification

- 契约测试确认对象项不再渲染 meta/trailing、标题为「属性面板」、属性滚动和固定 grid track存在。
- 契约测试确认角色属性显示位置/旋转/大小，viewer 接入 AABB 外轮廓绘制，场景比例参照继续使用同一选择路径。
- 运行客户端聚焦契约、`pnpm typecheck`、客户端生产构建；UI 视觉验收由用户在现有浏览器中完成。
