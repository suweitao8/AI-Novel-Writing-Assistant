# visual 画面风格组件

`VisualStylePicker`：画面风格选择器（内置预设 + 自定义风格 + 管理入口），用于封面、角色立绘、拆书人设等图片生成入口；选中后把 `styleKey` 传给后端，由 visual-style 模块统一解析注入。

`VisualStyleManageDialog`：自定义画面风格的创建/编辑/删除，支持上传参考图由 AI 分析生成风格草稿。

约定：
- 风格只描述画面媒介与质感，不携带年代/题材内容（服务端会拒绝含年代词的 styleTag）。
- 选择器的空值语义由使用方通过 `emptyLabel` 定义（例如「不使用预设（用下方风格描述）」）。
