# 漫剧 3D 左侧控制栏与视口布局设计

## Background

当前场景 3D 编辑和分镜 3D 草图共用一个右侧对象/属性栏。对象卡顶部又显示“场景对象”和图标，而列表第一行也叫“场景对象”；属性卡顶部的“属性面板”标题同样占用可用于字段的空间。角色选中时，视口还会在脚下绘制旧的圆盘式定位标记。用户需要把编辑器控制内容集中到左侧，让右侧成为完整的场景编辑视口。

## Goals

- 桌面端将返回入口、当前上下文名称、对象选择和属性内容放在左侧固定栏，右侧视口占据剩余全部宽度和高度。
- 左侧对象选择区域保留对象图标、对象名称、选中状态和键盘焦点，但不再显示对象卡标题或额外图标；对象数量过多时只在对象列表内部滚动。
- 左侧属性区域不再显示“属性面板”可见标题或标题图标，直接从属性字段开始；属性较多时只在属性区域内部滚动。
- 顶部导航只保留返回按钮和当前页面的主名称。场景资产页显示场景名称，分镜 3D 页显示当前镜头名称；保存/加载语义继续通过既有按钮禁用、ARIA 状态、Toast 和页面内容承载。
- 移除角色脚下的圆盘/圆环运行时实体；保留角色选中外轮廓、空间标记线框和其他非脚下选择反馈。
- 不修改数据库、API、`layout3d`、PNG 导出或保存时机。

## Design

### Shared shell

`Drama3DEditorShell` 继续是两个页面唯一的布局边界，但把主 grid 改为左侧控制栏 + 右侧视口：桌面宽度使用 `xl:grid-cols-[22rem_minmax(0,1fr)]`，左栏由 `header` 和下方两个内部滚动区组成，视口 section 放在右侧并填满剩余空间。窄屏退化为左栏在上、视口在下，外层允许滚动，保持现有可操作性。

左栏的 header 只负责渲染页面传入的返回按钮和主名称；对象和属性 section 使用 `aria-label` 保留语义，但不额外渲染可见标题。对象卡和属性卡继续填满各自 grid track，`min-h-0` 与 `overflow-y-auto` 保证长列表/长属性不会撑开整个页面。

### Object and property surfaces

`Drama3DObjectPanel` 删除 `CardHeader`、`Box` 图标和“场景对象”标题，保留 Card 容器和可滚动 `CardContent`。对象数组中的根场景项仍然可以叫“场景对象”，因为它是实际可选择对象；每个行按钮继续使用 `aria-pressed`、`data-object-selected` 和可见 focus ring。

两个页面的属性 Card 删除 `CardHeader/CardTitle` 和类型 Badge，让 `CardContent` 直接承载当前对象的字段、控制按钮、加载/空/错误状态。现有属性字段和操作顺序不改变，避免布局整理影响场景环境调节、空间标记聚焦、角色摆位和退出保存。

### Selection feedback

`blocking3dViewerApp` 删除脚下 selection ring 的材质、几何、实体、更新和销毁逻辑，同时删除不再使用的 ring 常量/import。角色选中仍通过 `drawEntitySelectionOutline` 绘制模型世界包围盒外轮廓；空间标记继续使用 marker 模块自己的线框和选中透明度。外轮廓仍是运行时反馈，不进入任何持久化数据或导出参考图。

## Data and interaction

对象选择仍由原有页面 state、viewer selection listener 和 marker listener 驱动；只是把相同节点放到左栏。返回按钮仍等待现有保存 Promise，保存期间继续 disabled。对象按钮保持原生 button、Enter/Space、Tab 焦点和选中反馈，不引入新的拖拽或快捷键状态。

## Verification

- 契约测试锁定左侧 shell 顺序、右侧视口、对象/属性标题删除、内部滚动和顶部标题最小化。
- 契约测试锁定 viewer 不再创建或更新脚下 selection ring，且角色外轮廓调用继续存在。
- 运行相关 Node 契约测试、`pnpm typecheck`、客户端生产构建和 `pnpm check:docs-manifest`。
- 浏览器视觉验收由用户在现有 3D 场景页和分镜 3D 草图页完成；代码验证不替代真实视口尺寸和滚动体验检查。
