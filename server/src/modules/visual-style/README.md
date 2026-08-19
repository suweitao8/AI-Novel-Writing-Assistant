# visual-style 模块（画面风格）

## 职责

- 路由入口：`http/visualStyleRoutes.ts`（`/api/visual-styles`）。
- 业务实现：`services/visualStyle/VisualStyleService.ts`（内置预设解析 + 自定义风格 CRUD + 参考图分析）。
- 内置画面风格预设的单一来源（定义在 `shared/types/visualStyle.ts` 的 `VISUAL_STYLE_PRESETS`，只读，不入库）。
- 自定义画面风格的 CRUD（Prisma `VisualStyle` 表；key 与内置预设同名时覆盖预设，语义搬自 mydrama 的 custom-shadows-preset）。
- 参考图风格分析（`visual_style.analyze@v1` PromptAsset，视觉模型生成风格草稿，确认后落库）。
- 统一的 prompt 注入片段：`buildVisualStylePromptText` / `resolveStylePromptText`。

## 设计红线（搬自 mydrama STYLE_DESIGN.md，必须长期保持）

1. 风格预设只描述「媒介 + 渲染质感 + 镜头感 + 调色」，不描述故事内容。
2. 年代、地点、服装、建筑、道具、人物长相一律来自角色/场景/分镜描述；风格预设不得覆盖。
3. `styleTag` 拼在每张图 prompt 附近，只允许媒介/质感词；`VISUAL_STYLE_TAG_FORBIDDEN_WORDS` 里的年代/内容词在服务端校验拒绝。

## 消费方

- `services/image/ImageGenerationService.ts`：通用图片管线（角色立绘/封面/拆书人设）按 `styleKey` 解析注入。
- `services/comic/comicStylePrompt.ts`：漫画项目 `stylePreset.visualStyleKey` 解析注入。
- 后续书级默认画面风格也应通过本模块解析，不得复制预设内容。

## 边界

- 不负责图片任务队列、provider 调用（归 `services/image/`）。
- 不负责文字风格（归 `styleEngine` / `prompts/style`）。
