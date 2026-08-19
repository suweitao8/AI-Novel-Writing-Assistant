# 漫剧工作流（Comic Drama）

漫剧 = 从写小说到动态漫视频的完整流水线：写小说 → 影视分镜 → 配音 → 视频合成。本文记录该工作流的模块边界、数据契约与编排决策。设计文档见 `docs/superpowers/specs/2026-08-19-comic-drama-studio-design.md` 与 `2026-08-19-blank-novel-creation-design.md`。

## 背景 / 决策

- 用户需要第四种创作形态：漫剧不是"写小说的另一种模式"，而是一条以小说为起点、以视频为终点的生产流水线。漫剧项目必须与普通小说隔离管理（只出现在漫剧列表）。
- 分镜采用**影视分镜镜头**（drama shots：首帧图 + 台词 + 时长/运镜）而不是漫画分格：只有镜头形态能直接衔接配音与动态视频生成，这是产出"动态漫视频"的最短路径。
- 生产节奏是**边写边做**：小说有成稿即可开始分镜/配音/视频，后续章节通过来源重新装配同步。
- 实现策略是**编排复用而不是重写**：小说阶段复用空白小说工作台（设定中心 + 大纲细纲 + 自动导演链），分镜之后复用 drama bounded context 的既有管线。studio 层只做投影与链接，不复制业务逻辑。

## 当前规则

### 数据与隔离

- `Novel.productionKind`（`novel` | `comic_drama`，默认 `novel`）标记漫剧项目；创建漫剧时同时置 `creationExperience=simple`。
- 小说列表（`GET /novels`）与首页最近作品**默认只返回 `productionKind=novel`**（`productionKind: productionKind ?? "novel"`）；漫剧列表用 `?productionKind=comic_drama` 查询。新增任何消费小说列表的界面都要意识到这个默认过滤。
- DramaProject 完全复用：`source="novel_import"` + `sourceRef=novelId`（软链，不建外键）。分镜项目在用户首次进入分镜阶段时**懒创建**（避免空来源快照）；"同步最新章节"走既有 `source-bundle` 重新装配。

### 阶段编排（studio 层）

- 服务端投影：`server/src/services/drama/studio/ComicDramaStudioService.ts` + `/api/drama/studio/links`（批量阶段统计，供列表卡片）与 `/api/drama/studio/:novelId/overview`（单项目完整阶段视图）。前端只消费这一层，不自行拼装 Novel 与 DramaProject。
- 前端：`client/src/pages/drama/comicDrama/`——`ComicDramaListPage`（/drama，横版卡片 + 四阶段徽章）、`ComicDramaStudioPage`（/drama/studio/:novelId，四阶段工作流页）、`ComicDramaCreateDialog`（书名 + 可选想法 → 创建后直达工作室）。
- 工作室顶栏统一承载：返回按钮（图标）+项目名、居中的项目级主 tab（当前/资产/设定；「资产」页签=角色/场景/道具，「设定」页签=世界观+项目级配置——画面风格选择器（创建分镜项目前选择会被记住并在创建时生效）与分镜项目状态；三个项目级页签下各有自己的居中子页签条（`SubTabRow`：与「当前」章级子 tab 同款三栏网格，子页签居中、右侧放当前子页签自己的工具（参考=解析参考文本→初稿、初稿=自动保存状态+解析初稿→节拍、视频=打开视频工作台，其余子页签暂无）；「资产」的子页签带数量角标，数据来自 `getStorySettingsOverview`）。「资产」由 studio 页直接组合 `SettingsCharactersTab`/`SettingsScenesTab`/`SettingsPropsTab`（不套 `StorySettingsTabs`，避免把世界观一起带进资产），世界观组件 `SettingsWorldTab` 归「设定」页签；改动统一走页面级 `invalidateStorySettings` 失效全部设定缓存。与「当前」的章级子 tab（参考/初稿/正文/分镜/配音/视频，全部作用于当前章），返回=图标+项目名的整体 Link（弱化样式：无高亮、无悬停/点击效果，点任意部分回 /drama）。右侧放当前页签的操作按钮（当前=当前章按钮（无图标，如「1 · 重生」，点开章节管理弹窗）+紧邻的「新增」图标按钮（快速新建下一章，AI 写作中禁用；`CreateChapterDialog` 为独立组件，页头与章节管理面板共用）+AI 写作进度；分镜/视频子页签不在顶栏放按钮，视频工作台入口在「视频」子页签行右侧）。「当前」按「当前章」创作：`useNovelChapterWorkspace`（comicDrama/hooks）持有当前章（默认第一个无正文章，否则最后一章）、本章初稿 expectation（1.2s 防抖静默自动保存、失焦/切页签/切章即冲保存、空白铺 20 行）与本章节拍 beats 草稿；切章时先落库上一章再重置。「初稿」子页签行右侧的「解析」按钮=按本章初稿推理本章节拍（`previewChapterDetailOutline`，成功后切到正文页签）；分镜子页签内嵌 `StoryboardStagePanel`（comicDrama/StoryboardStagePanel.tsx）：`DramaNextStepPanel`（管线下一步：策略/分集/台本/质量/分镜/视频提示词，onSetTab 置空）+ `DramaVisualPanel`（分镜板/首帧批量/视频任务，全 mutation 就地接线，复用工作台组件不复制实现；有活跃批量任务/视频任务/首帧生成中时 4s 轮询项目详情）；无分镜项目时引导卡内嵌「从成稿生成分镜」。**章节自动同步**：页面在切换当前章或进入分镜子页签时静默调用 `assembleDramaSourceBundle`（幂等：upsert 内容包、重建角色与初始事实，纯 DB 操作无 LLM），去掉了手动「同步最新章节」按钮；同步成功不弹 toast、失败仍报错。工室内不再提供自动导演接管入口（章节管理弹窗无页脚），启动接管走小说侧简易书架。初稿编辑区是 `LineNumberedTextarea`，基于开源 CodeMirror 6（`@uiw/react-codemirror` + `@codemirror/view`，client 直接依赖）：行号固定编辑器最左侧且只读、软换行、当前行/行号高亮、默认 20 行起随内容自动增高；颜色全部走语义 token（CSS 变量）随明暗主题自适应；minRows 换算 minHeight，maxLength 在 onChange 截断。不要再用「透明 textarea + 排版镜像」方案重写该组件——对齐维护成本高，已废弃。highlight prop 接收设定名单（角色/场景/道具名）做实体高亮：MatchDecorator + lookbehind/lookahead 断词（\p{L}\p{N}），长名优先、≥2 字才匹配，三类各用一种色调（角色 primary token、场景 emerald、道具 amber，后两者是组件内色调映射允许的调色板原色）。初稿页签右侧的 `OutlineSettingsAside` 复用 createStorySettingsCharacter/Scene/Prop 与 queryKeys.novels.storySettings*（与资产页签共享缓存，创建后互相同步）。面板 lg:sticky 固定右栏、max-h 视口高度内部滚动，卡片按 updatedAt 倒序（最近使用优先），搜索为提交制（输入 + 回车/搜索按钮提交 appliedKeyword），新增走弹窗（类型/角色定位/名称/一句话说明）。空白初稿会在前端一次性铺 20 行换行（useNovelChapterWorkspace 的重置 effect，trim 后判空所以纯换行不会触发自动保存），修改走静默自动保存（成功不弹 toast、失败仍报错）。

### 小说阶段的大纲契约（空白小说工作台）

- `Novel.outline` 存用户手写简略大纲；`Novel.userChapterOutlineJson` 存确认后的分章细纲（schemaVersion=1）。
- Prompt 资产 `novel.outline.expand@v1`：输入大纲 + 设定中心快照，输出分章细纲**草稿（不落库）**；postValidate 强制章序连续、章数等于期望值、出场角色必须在设定中心名单内。该入口只服务空白小说书架的三步流；漫剧工作室不暴露全书级细纲推理与期望章数——漫剧按逐章推进（章节管理里写本章初稿→AI 节拍），分章细纲页签只做手动整理与确认。
- 确认细纲后同步 `estimatedChapterCount`，让导演链按用户章数规划规模。
- 剧情契约注入点：接管 idea 携带用户大纲（`novelDirectorTakeover.ts` 的 `buildTakeoverIdea`）；卷战略/卷骨架/节奏板/章节列表/章节细化上下文注入 `user_outline_contract` 块（`prompting/prompts/novel/volume/contextBlocks.ts`，priority=99）——章节划分、事件顺序与结果不得推翻，允许补节奏与衔接。
- 简易模式写守卫（`simpleCreationWriteGuard.ts`）放行 `/settings` 与 `/outline` 工作台端点；其余写入仍只读。**漫剧项目例外**：漫剧创建的小说固定简易模式（`ComicDramaCreateDialog` 传 `creationExperience: "simple"`），工作室的单章工作台端点——`PUT /chapters/:chapterId`（本章初稿保存）、`POST /chapters`（手动建章）、`POST|PUT /chapters/:chapterId/detail-outline(/preview)`（节拍推理与保存）——对已关联 DramaProject（`source=novel_import, sourceRef=novelId`，与工作室 overview 反查同款约定）的简易小说放行；章节删除、正文生成等其余端点、以及未关联漫剧项目的普通简易小说仍然只读。修改守卫白名单时必须同步更新 `simpleCreationMode.test.js`（纯函数 + 守卫异步行为两组断言）。
- **守卫内 req.path 是剥掉 `/:id` 前缀的形状**：守卫挂在 `router.use("/:id", ...)`（novel 路由 `app.use("/api/novels", ...)` 内），Express 在中间件执行期间会把已匹配的 `/:id` 从 `req.url` 剥掉，所以守卫看到的 path 是 `/chapters/xxx` 而不是 `/{novelId}/chapters/xxx`；小说 id 要从 `req.params.id` 取。给守卫写锚定正则（`^/chapters/...`）时必须用剥前缀后的形状，用完整路径形状写的正则会静默不匹配（放行失效、回落 409）。旧白名单用 `includes()` 所以两种形状都能过，这曾掩盖过该差异。

### 「当前」阶段的章节管理与单章节拍

- 「参考」子页签：粘贴参考小说原文（50 行 `LineNumberedTextarea`，无 placeholder 等附加文案；参考文本按「小说+章」键存浏览器 localStorage、粘贴即写穿自动保存、切章载入对应章文本，刷新不丢——不落服务端，正式产物是初稿），「解析」按钮在该子页签行右侧（与初稿的解析同位；mutation 与参考文本状态收敛在 `useReferenceDraftStage`，替换确认弹窗挂页级、切页签不丢），走 `POST /novels/:id/chapters/:chapterId/reference-draft/preview`（Prompt 资产 `novel.chapter.reference_draft@v1`：15～25 行、目标 20 行，每行 `speaker/kind/text`——旁白行 speaker 固定「旁白」，台词行保留原文角色名；postValidate 强制行去重与说话人规则），服务端只做纯预览不落库。前端拿到 `draftText` 后经 `useNovelChapterWorkspace.applyExpectationText` 替换初稿并**立即静默落库**（不等初稿页签的 1.2s 防抖）；初稿已有内容时先弹「替换本章初稿」确认框（弹窗内可预览全文）。该端点已加入简易模式写守卫的漫剧工作台白名单（仅 POST preview 形状）。
- 工作室「当前」常驻六个章级子 tab（参考/初稿/正文/分镜/配音/视频），都作用于当前章：初稿页签=本章 expectation 的 CodeMirror 编辑区 + 右侧 `OutlineSettingsAside`（快速查找与创建）；正文页签=本章 beats 编辑器（3～10 拍，逐拍可改可增删，保存走 `saveChapterDetailOutline`）+ 本章已成稿正文的只读展示（content 非空时常驻在节拍下方）。章节管理弹窗（`ChapterManageDialog` 承载 `ChapterManagePanel`，无页脚，关闭走右上角 × 或点弹窗外）点卡片=切换当前章（父级 `switchChapter` 落库上一章并重置编辑态，弹窗关闭）；工具栏与设定面板同款（图标化新建 + 搜索框 + 搜索按钮，提交制搜索），卡片只显示第几章、章节名与字数。全书级大纲（`Novel.outline`）不在工作室编辑，只保留空白小说书架的 `BlankStartPanel` 三步流（`useNovelOutlineWorkspace`）。
- 单章节拍是**人工创作辅助**：`Chapter.expectation` 存本章初稿，`Chapter.detailOutlineJson` 存确认后的节拍（schemaVersion=1，beats 3～10 拍）。Prompt 资产 `novel.chapter.detail_outline@v1`（`chapterDetailOutline.prompts.ts`）：输入本章初稿 + 前后章梗概 + 设定快照，输出节拍草稿**不落库**（preview-then-save，同设定中心模式）；端点挂在章节路由 `POST/PUT /novels/:id/chapters/:chapterId/detail-outline*`。
- **V1 边界：节拍不注入自动导演写作上下文**——它是用户对着写正文的依据，不进入 `user_outline_contract` 或章节生成上下文；要注入必须另立设计并更新本页。
- 自动导演任务运行中：章节浏览/搜索/节拍可用，手动新建章节禁用（导演链按 order 顺序写作，手动插章会打乱规划）；该约束由前端禁用态表达，服务端不强制。

## 本地生产通道（2026-08-19 E2E 验证结论）

漫剧已在真实环境完成全链路验证（现成小说《黑暗文明》10 章 → 2 集 → 台本 → 38+ 镜 → 首帧图 → VoxCPM2 逐镜配音 → ffmpeg 本地视频合成 → 整集 35 秒竖屏成片）。沉淀的运行知识：

- **文本通道**：本地 OpenCode 桥接（18762），配置在模型设置的文本模型槽位。
- **图片通道**：本地 Codex 图片通道（18766）；注意部分血腥/敏感画面描述会被图片侧拒答（codex_generation_failed），这类镜头换提示词重试，不是链路故障。
- **语音通道**：VoxCPM2 桥接服务 `D:\Github\VoxCPM\openai_speech_server.py`（FastAPI，OpenAI /v1/audio/speech 兼容，默认 18761）。启动：`cd D:\Github\VoxCPM && .venv/Scripts/python.exe openai_speech_server.py`。CPU 上约 0.8s/字，先知预热情境下可用；项目 venv 无 CUDA torch，装 CUDA 版可提速。
- **视频通道**：`LocalFfmpegVideoProvider`（provider id `local_ffmpeg`）——首帧图+台词配音 → Ken Burns 竖屏 mp4，产物在 `server/storage/generated-videos/{taskId}.mp4`，经 `GET /api/drama/video-files/:taskId` 提供。ffmpeg 需在 PATH（本机 C:fmpegin）。
- **ffmpeg 拼接两个坑**：concat demuxer 列表必须 `-f concat -safe 0` 显式声明且列表内用正斜杠（Windows 反斜杠被当转义符）；多段配音文件扩展名按 dataUrl mime 定（wav 别存成 .mp3）。
- **批量任务与进程重启**：drama 批量任务跑在服务进程内（`void runBatchJob()`），ts-node-dev 重启会杀掉进行中的批量——恢复方式是重建同类型批量（已完成镜头自动跳过）；视频 providerTask 卡 running 时把 DramaVideoPrompt 置 failed 并清 providerTaskId 后重新派发。
- **画面风格**：`services/drama/visual/dramaVisualStyles.ts`（6 预设，移植自旧项目 mydrama/supertale 的 styles/presets）。注入点：首帧图提示词与角色设计稿提示词；风格只约束渲染媒介，`style_instructions` 中明确不得覆盖角色外貌/服装/场景描述。与 styleEngine 的通用画面风格体系是两套来源（drama 侧为项目级预设），后续可考虑收敛。

## 失败模式 / 注意事项

- 视频通道是可插拔 port（`VideoProviderPort`），默认 mock **不会生成真实视频**：studio 视频阶段必须保留"未配置真实通道"的提示，不能让用户误以为出片失败是 bug。
- `ComicDramaStudioService` 的 links 查询按项目做聚合并发查询（列表 ≤50 本）；若未来漫剧项目规模显著变大，需要改为 groupBy 一次聚合。
- 漫剧小说仍可经 `/novels/:id/simple` 深链访问（书架行为一致）；不要在书架路径上做漫剧特判。
- 与 drama 模块的边界：studio 只读投影；任何对 drama 管线行为的修改仍应发生在 `services/drama/` 原有服务里，不要把管线逻辑写进 studio 层。

## 相关模块

- `server/src/services/drama/`（分镜/配音/视频管线）、`server/src/services/drama/studio/`（漫剧投影）
- `server/src/modules/novel/planning/`（大纲工作台服务与路由）、`server/src/prompting/prompts/novel/outlineExpand.prompts.ts`
- `client/src/pages/drama/comicDrama/`、`client/src/pages/novels/simpleCreation/BlankStartPanel.tsx`、`client/src/pages/novels/components/storySettings/`
