# 画面风格（Visual Style Preset）系统

## 背景

项目此前的图片生成各入口各自为政：漫画有 6 个硬编码画风关键词（`ComicProjectPage STYLE_OPTIONS`），角色立绘/封面/拆书人设用一句自由文本 `stylePreset`（默认「写实人设」「电影感插画」等），彼此不共享。多图一致性只能靠用户手写描述。

旧项目 mydrama（D:\Github\mydrama，小说转短剧产品）沉淀了一套成熟的 visual style preset 体系，2026-08-19 整体搬移到本项目。

## 决策

1. **单一来源**：`shared/types/visualStyle.ts` 是内置预设的唯一来源（6 个预设忠实搬自 mydrama `src/novelvideo/styles/presets/*.json`：guoman_fantasy / anime / realistic / chinese_period_drama / republican_era_drama / post_apocalyptic）。内置预设只读、不入库；自定义风格存 Prisma `VisualStyle` 表，**key 与内置预设同名时覆盖预设**（搬自 mydrama 的 custom-shadows-preset 语义）。
2. **风格只管媒介与质感**：预设只描述渲染媒介（真人实拍/2D/3D）、线条、上色、光影、镜头感、调色；年代、地点、服装、建筑、道具、人物长相一律来自角色/场景/分镜描述，预设不得覆盖。这是 mydrama 用失败换来的教训：把年代词放进每张图都注入的锚点，会静默覆盖正文设定（回忆录里的手机、穿越前的现代场景等被"古装化"）。
3. **styleTag 禁词校验**：`VISUAL_STYLE_TAG_FORBIDDEN_WORDS`（PERIOD/ERA/MODERN/民国/古装/年代 等）在服务端 `VisualStyleService` 与 `visual_style.analyze` 的 postValidate 两处强制；参考图 AI 分析产出的草稿同样过这道闸。
4. **统一注入片段**：`buildVisualStylePromptText(style)` 生成 `[VISUAL STYLE]/STYLE ANCHOR/RENDERING/STYLE GUARDS` 四段式片段，所有消费方用同一个渲染函数，禁止各自拼装。

## 当前规则

- 模块边界：业务在 `server/src/services/visualStyle/VisualStyleService.ts`，路由入口在 `server/src/modules/visual-style/http/visualStyleRoutes.ts`（`/api/visual-styles`：GET 列表 / GET :key 详情 / POST 创建 / PATCH :id / DELETE :id / POST analyze）。外部消费走 facade `modules/visual-style/index.ts` 或直接引服务；`modules/*/http` 只放路由的既有约定不变。
- 参考图分析 `visual_style.analyze@v1` 是 PromptAsset（`prompting/prompts/visualStyle/`，已注册 loader entries）。它向文本模型发送多模态消息（text + image_url data URL）：**当前文本通道若不支持视觉输入会显式失败**，这是预期行为——配置了视觉能力模型后即可用，不做静默降级。
- 通用图片管线（`ImageGenerationService` 三个 create*Task）：请求带 `styleKey` 时优先解析注册表并替换 `stylePreset` 自由文本；解析结果会写入任务行的 stylePreset 字段，任务记录自解释。
- 漫画：`ComicProject.stylePreset` JSON 新增 `visualStyleKey/styleText/styleLabel` 字段。PATCH `/comic/projects/:id/preset` 带 `visualStyleKey` 时服务端解析并把**风格全文快照**写入 JSON；`comicStylePrompt.resolveStyleEntry` 同步读快照（内置预设可无快照直接还原），旧 `style` 关键词继续兼容。漫画各生图链路（四视图/表情稿/资产/场景/格子图）经 `resolveComicStyleKeywords` 自动获得注入，无逐点改造。
- 客户端：`client/src/components/visual/VisualStylePicker`（选择器+管理弹窗，react-query key `visualStyles.all`）。已接入：封面（NovelCoverDialog）、立绘（CharacterImageDialog）、拆书人设（BookAnalysisCharacterImagePanel）、漫画画风卡片（ComicProjectPage，与经典画风并列分组）。选中预设时禁用原自由文本字段，避免两套描述打架。

## 失败模式

- `styleKey` 解析不到 → 返回 null，回退 `stylePreset` 文本/各自默认值；不会 500。
- 漫画选了自定义风格后该风格被删除 → 快照 `styleText` 仍在 JSON 里，画风注入继续有效；只有切回经典画风才会清空。
- 参考图分析对无视觉能力模型报错 → 明确失败并提示，属 AI 能力缺口，禁止加关键词兜底。

## 相关模块

- `services/image/`（通用图片管线）、`services/comic/comicStylePrompt.ts`（漫画画风注入）、`modules/bookAnalysis/http/bookAnalysisCharacterRoutes.ts`（拆书人设生图）。
- 后续书级默认画面风格（Novel 级）应通过 `visualStyleService.resolveStyle` 实现接入，不允许复制预设内容到别处。

## 来源

- mydrama `src/novelvideo/styles/presets/STYLE_DESIGN.md`（设计红线原文）、`services/style_service.py`（custom-shadows-preset、family/subtype 分组）、`generators/style_analyzer.py`（参考图分析提示词语义）。

## 漫画/短剧图像资产视角规范（2026-08-19 起）

业务约定，各生图链路统一执行：

- 角色状态四视图：一张原生 1536x864、严格 16:9 的横版四等分参考板，依次为面部正面、面部 90°侧面、全身正面、全身背面；四个视图必须共用同一角色身份、服装和光线，漫画与短剧状态资产同规范。
- 场景参考图：360° 全景（等距柱状提示词），2048x1024 严格 2:1，一张覆盖整个空间。
- 道具/武器等角色资产：单张 1536x864、严格 16:9 的 3/4 透视图；服装类资产保留正面/侧面/背面多视图。

提示词实现在各自 service 的 prompt builder（`ComicCharacterImageService` / `DramaCharacterImageService` / `ComicSceneService` / `ComicCharacterAssetService`）；尺寸一律取 `server/src/services/image/imageSpecs.ts` 的 `IMAGE_SPECS`（见《生图规格规范》页）。角色、道具和分镜使用严格 16:9（1536x864），场景全景使用严格 2:1（2048x1024），不能用普通横版比例替代全景。

## 漫剧资产画风拆分（2026-08-22 当前规则）

### Background

漫剧的角色、场景和道具虽然共享渲染质感，但参考图用途不同：角色需要锁定人物造型，场景需要覆盖完整空间，道具需要展示单件结构。把三者放进一个“通用画风”会让固定视图要求互相污染，也会让设置页出现角色专用字段却宣称适用于全部画面的问题。

### Decision

- 漫剧资产画风只由 `server/src/services/drama/visual/dramaVisualStyles.ts` 的三类默认配置提供：`character`、`scene`、`prop`。
- 角色资产和角色状态图固定为横向四视图：头部正面、头部侧面、全身正面、全身背面。
- 场景资产和场景状态图固定为横向 360° 全景，覆盖前方、左右两侧、后方和地平线。
- 道具资产和道具状态图固定为横向单件 45° 三点透视图。
- `formatInstructions` 与 `avoidInstructions` 是系统固定约束；设置页只允许编辑该类别的 `styleInstructions` 正向补充。负面约束按类别隔离，场景和道具不继承角色人体结构禁区。
- `drama.assetArtStyles` 只保存三类正向覆盖。历史系统画风记录保留在数据库中但不进入新的解析器、页面或生成链。

### Current Rule

- 资产图/状态图按 `buildAssetStylePromptLines(kind, asset, specific)` 组装：固定规格 → 类别标签 → 类别正向画风 → 小说时代/题材风格。
- 分镜首帧按镜头实际出现的角色、地点和道具选择类别，只注入类别标签、正向画风和对应负面约束；固定四视图、360° 全景、45° 透视只属于参考资产，不进入横屏视频首帧提示词。
- 统一解析入口 `resolveDramaArtStyleContext` 返回 `assets.character/scene/prop` 与 `specific`。时代风格仍按脚本标记、项目选择、小说默认、内置默认的原顺序解析。
- 设置入口是 `/settings/art-style` 的“画风管理”页，GET `/api/settings/drama-asset-styles` 返回三张卡，PUT `/api/settings/drama-asset-styles/:kind` 只更新一个类别。保存一个类别不能覆盖其他类别。

### Failure Modes

- 将 `assets.character` 传给场景或道具生成，会把错误的固定格式和人体禁区带入提示词；调用方必须按 `kind` 选择资产。
- 将整个资产集合的格式说明传给分镜，会把四视图或全景要求错误地带入首帧；分镜只能使用 `buildShotStylePromptLines`。
- 新增资产类别时必须同时补默认规格、正向风格、负面约束、设置卡片、生成调用方和 focused tests，不能只增加一个 UI 选项。

### Related Modules

- `server/src/services/settings/DramaAssetArtStyleSettingsService.ts`
- `server/src/services/drama/visual/dramaArtStyleResolver.ts`
- `server/src/services/drama/visual/DramaShotKeyframeService.ts`
- `client/src/pages/settings/views/ArtStyleSettingsPage.tsx`
