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
- 前端：`client/src/pages/drama/comicDrama/`——`ComicDramaListPage`（/drama，横版卡片 + 四阶段徽章）、`ComicDramaStudioPage`（/drama/studio/:novelId，四阶段工作流页）、`ComicDramaCreateDialog`（作品名 + 可选想法 + 拖拽/点击上传 txt 参考小说 → 创建后直达工作室；拖入文件自动按文件名填作品名，弹窗只保留字段不放解释文案。上传的参考正文两路存储：提交时入知识库挂 `referenceKnowledgeDocumentId`（取消创建不留孤儿文档），同时截断到 20000 字写入项目级参考源槽位 `drama-studio-reference:${novelId}:source`）。新建第 N 章时 `findReferenceChapterTitle` 从参考源按标题行确定性解析「第N章/回/节 标题」（中文数字到 9999、全篇无「第N章」式时退回「N、/N.」编号式），预填章节标题；无参考源或未匹配到则留空）。
- 工作室顶栏统一承载：返回按钮（图标）+项目名、居中的项目级主 tab（当前/资产/设定；「资产」页签=角色/场景/道具，「设定」页签=世界观+世界地图+美术风格+通用——世界观=条目式关键设定（`SettingsWorldTab` 传 `showMap=false` 不内嵌地图：概念名+多行解释逐条编辑、可删；基本设定只留世界前提+时代背景（下拉：常用 8 项+自定义自由输入；2026-08-20 用户决定基调规则不再编辑——世界规则一律走关键设定条目，存量 toneRules 数据保留在库里不删、AI 重新生成世界观仍会读它））；世界地图=`WorldMapPanel` 画布（mapJson：地形多边形 平地/山/水 程序化圈定 + 地点拖拽摆位 + 连线距离/耗时换算 + `childMaps` 按节点 id 下钻城市内部地图（面包屑导航）；AI 只起草地点（`novel.world.map@v1`）且应用时保留人工地形与内部地图，数据契约见 architecture/story-settings-hub.md）；美术风格=`ArtStylePanel`（默认风格点选即存——整本基准画风（封面/立绘/首帧图与视频，画风不进初稿），已有分镜项目时同步推送（仅内置预设 id，自定义风格名不推送：首帧图按预设 id 解析）；风格库=内置预设只读+自定义风格增删改（身份=风格名，改名时默认引用跟新名走、删除默认风格由服务端自动回落内置默认），存储契约见 story-settings-hub.md 美术风格一节；创建分镜项目的画风优先级=手动选择>分镜项目已存>小说默认风格>内置默认）；通用=参考小说卡片（`ReferenceNovelCard`）+分镜项目状态；三个项目级页签下各有自己的居中子页签条（`SubTabRow`：与「当前」章级子 tab 同款三栏网格，子页签居中、右侧放当前子页签自己的工具（参考=引用+解析、脚本=自动保存状态、视频=打开视频工作台，其余子页签暂无）；「资产」的子页签带数量角标，数据来自 `getStorySettingsOverview`）。「资产」由 studio 页直接组合 `SettingsCharactersTab`/`SettingsScenesTab`/`SettingsPropsTab`（不套 `StorySettingsTabs`，避免把世界观一起带进资产），世界观组件 `SettingsWorldTab` 归「设定」页签；改动统一走页面级 `invalidateStorySettings` 失效全部设定缓存。与「当前」的章级子 tab（参考/提取/脚本/分镜/视频，全部作用于当前章），返回=图标+项目名的整体 Link（弱化样式：无高亮、无悬停/点击效果，点任意部分回 /drama）。右侧放当前页签的操作按钮（当前=当前章按钮（无图标，如「1 · 重生」，点开章节管理弹窗）+紧邻的「新增」图标按钮（快速新建下一章，AI 写作中禁用；`CreateChapterDialog` 为独立组件（只有标题一个输入，按新建序号自动预填参考小说对应章节标题），页头与章节管理面板共用）+AI 写作进度；分镜/视频子页签不在顶栏放按钮，视频工作台入口在「视频」子页签行右侧）。「当前」按「当前章」创作：`useNovelChapterWorkspace`（comicDrama/hooks）持有当前章（默认第一个无正文章，否则最后一章）、本章脚本 expectation（1.2s 防抖静默自动保存、失焦/切页签/切章即冲保存、空白铺 20 行）与本章节拍 beats 草稿；切章时先落库上一章再重置。「分镜」子页签内嵌 `ShotVoiceListPanel`（comicDrama/ShotVoiceListPanel.tsx）：**一行=一个分镜+它的配音段**（左侧首帧缩略图/生成入口，右侧镜头号/景别运镜时长/台词摘要 + 该镜配音段逐行状态点与播放器 + 行内重配），配音段按 `shotId` 归组强关联；工具行=集选择/语音服务/生成缺失首帧/生成缺失配音/全部重配/音色设置（折叠面板复用 `VoiceStagePanel.tsx` 导出的 Narrator/CharacterVoiceCard）；有 tts 或首帧任务时 3s/2.5s 轮询。深度操作（圈选批量、宫格预览、视频提示词、导出、管线下一步）经行内链接跳独立分镜工作台 `/drama/projects/:id`；无分镜项目时引导卡内嵌「从成稿生成分镜」。**章节自动同步**：页面在切换当前章或进入分镜子页签时静默调用 `assembleDramaSourceBundle`（幂等：upsert 内容包、重建角色与初始事实，纯 DB 操作无 LLM），去掉了手动「同步最新章节」按钮；同步成功不弹 toast、失败仍报错。工室内不再提供自动导演接管入口（章节管理弹窗无页脚），启动接管走小说侧简易书架。「参考」页签的参考正文编辑器是 `LineNumberedTextarea`，基于开源 CodeMirror 6（`@uiw/react-codemirror` + `@codemirror/view`，client 直接依赖）：行号固定编辑器最左侧且只读、软换行、当前行/行号高亮、minRows 换算 minHeight、maxLength 在 onChange 截断；纯文本编辑器（脚本的着色/实体高亮已随列表化进入 ScriptTab 行内，该组件不再有 storyboardMode）。不要再用「透明 textarea + 排版镜像」方案重写该组件——对齐维护成本高，已废弃。脚本页签右侧的 `OutlineSettingsAside` 复用 createStorySettingsCharacter/Scene/Prop 与 queryKeys.novels.storySettings*（与资产页签共享缓存，创建后互相同步）；卡片只显示类型徽章+名字，点开 `AssetDetailDialog` 看完整字段（性格/外貌/生图提示词 facePrompt·environmentPrompt·visualPrompt/音色/外观状态）并可就地删除三类资产。面板 lg:sticky 固定右栏、max-h 视口高度内部滚动，卡片按 updatedAt 倒序（最近使用优先），搜索为提交制（输入 + 回车/搜索按钮提交 appliedKeyword），新增走弹窗（类型/角色定位/名称/一句话说明）。空白章节的 expectation 仍由 useNovelChapterWorkspace 铺 20 行换行（trim 后判空不触发自动保存；列表视图解析为空列表并显示引导文案），修改走静默自动保存（成功不弹 toast、失败仍报错）。

### 小说阶段的大纲契约（空白小说工作台）

- `Novel.outline` 存用户手写简略大纲；`Novel.userChapterOutlineJson` 存确认后的分章细纲（schemaVersion=1）。
- Prompt 资产 `novel.outline.expand@v1`：输入大纲 + 设定中心快照，输出分章细纲**草稿（不落库）**；postValidate 强制章序连续、章数等于期望值、出场角色必须在设定中心名单内。该入口只服务空白小说书架的三步流；漫剧工作室不暴露全书级细纲推理与期望章数——漫剧按逐章推进（章节管理里写本章初稿→AI 节拍），分章细纲页签只做手动整理与确认。
- 确认细纲后同步 `estimatedChapterCount`，让导演链按用户章数规划规模。
- 剧情契约注入点：接管 idea 携带用户大纲（`novelDirectorTakeover.ts` 的 `buildTakeoverIdea`）；卷战略/卷骨架/节奏板/章节列表/章节细化上下文注入 `user_outline_contract` 块（`prompting/prompts/novel/volume/contextBlocks.ts`，priority=99）——章节划分、事件顺序与结果不得推翻，允许补节奏与衔接。
- 简易模式写守卫（`simpleCreationWriteGuard.ts`）放行 `/settings` 与 `/outline` 工作台端点；其余写入仍只读。**漫剧项目整体豁免**（2026-08-20 用户决定，彻底根治）：漫剧创建的小说固定简易模式（`ComicDramaCreateDialog` 传 `creationExperience: "simple"`），而漫剧工作室就是这本书的正式编辑入口——`productionKind=comic_drama` 的小说**不走简易模式只读**，章节增删改、参考解析、细纲、设定全部放行。历史教训：曾按端点路径白名单放行漫剧工作台写入，端点改名（`reference-draft/extract` → `reference-parse`）后白名单失配把「解析」拦死，先后踩坑两次——**路径字符串守卫跟不上端点演进，不要再给漫剧加路径白名单**；判定依据必须是小说自身 `productionKind` 字段（不能用 DramaProject 关联做判定——要到「从成稿生成分镜」才创建，新项目没有关联行）。普通简易小说（productionKind 非 comic_drama）的只读行为不变。修改守卫必须同步更新 `simpleCreationMode.test.js`。
- **守卫内 req.path 是剥掉 `/:id` 前缀的形状**：守卫挂在 `router.use("/:id", ...)`（novel 路由 `app.use("/api/novels", ...)` 内），Express 在中间件执行期间会把已匹配的 `/:id` 从 `req.url` 剥掉，所以守卫看到的 path 是 `/chapters/xxx` 而不是 `/{novelId}/chapters/xxx`；小说 id 要从 `req.params.id` 取。给守卫写锚定正则（`^/chapters/...`）时必须用剥前缀后的形状，用完整路径形状写的正则会静默不匹配（放行失效、回落 409）。旧白名单用 `includes()` 所以两种形状都能过，这曾掩盖过该差异。

### 项目级参考小说（referenceKnowledgeDocumentId）

- `Novel.referenceKnowledgeDocumentId` 指向知识库文档（外键 onDelete: SetNull），漫剧创建弹窗与设定页「参考小说」卡片管理：上传 txt（复用 `readTextFile` 编码识别）→ `createKnowledgeDocument` → 关联；创建弹窗在**提交时才上传**（取消创建不留孤儿文档）。
- **同内容去重**：`KnowledgeService.createDocument` 命中同名文档且新内容 contentHash 与 activeVersion 一致时不追加新版本、直接返回原文档。此前每次「替换」上传同一文件都堆一份一模一样的版本（实测同一本参考小说积了 3 份版本，详情接口一次回 58KB 全版本正文）；去重后重复上传是幂等的。
- **与续写源解耦**：`sourceKnowledgeDocumentId` 仅 continuation 模式可设且会被 `NovelContinuationService` 读进写作上下文；参考小说不受 writingMode 门控、任何模式可挂，**不进入任何写作上下文**，仅存储备用（studio overview 投影 `novel.referenceDocument` 摘要：标题/文件名/字数）。
- 有效性校验（`resolveReferenceDocumentId`，创建与更新共用）：文档存在、未 archived、有 activeVersion，否则 400。契约锁定在 `tests/comicDramaReferenceNovel.test.js`。
- 章节级的「参考解析」（`novel.chapter.reference_parse@v1`——2026-08-20 起初稿改编与设定提取合并为单次调用，同一 schema 同时产出 segments 与四类设定建议；初稿部分粘贴原文解析分镜式初稿；每格带 scene（所在场景，优先沿用设定中心场景名）与 `stateSwitches`（角色外观状态切换，优先用设定中心登记过的状态名——characterStates 行「角色名：状态1、状态2」由 Character.statesJson 生成）；`serializeDraftSegments` 纯函数把两类变化序列化为单元上方的「【场景：…】」「【角色状态：名字：状态】」标记行（顺序固定 场景→角色状态，同值连续输出会被折叠），契约锁定在 tests/chapterReferenceParse.test.js。两类标记都持续生效到下一个同类标记：后续分镜/视频生成按【场景】换场景、按【角色状态】换角色形象——【角色状态】的逐镜解析消费尚未实现（首帧图当前不读它），属于画面生成侧的后续工作；**美术风格不进初稿**（v8 移除 v7 的 styleSwitch，2026-08-20 用户看过实际产出后决定：画风由设定·美术风格的默认风格决定，整本单一画风））与本字段是两回事：前者是章节工作台的即时解析输入，后者是项目级参考资料库。

### 「当前」阶段的章节管理与单章节拍

- 「参考」子页签：**编辑器 + 「引用」按钮，无任何隐藏回落**。子页签行右侧按钮顺序「引用 → 解析」：「引用」把参考小说对应章节（替换式）写入本章参考文本并随自动保存落库；**「解析」一次调用**（`novel.chapter.reference_parse@v1`，2026-08-20 由初稿/提取两个并行调用合并——参考文本量不大，单次调用共享同一份原文理解，人物与场景天然对齐），提取结果**立即随章节持久化**（`Chapter.referenceExtractionJson`，不用也保存，与脚本同级成果），脚本直接写入或弹「替换本章脚本」确认。参考小说按章节标题行**确定性切分**（`referenceChapters.ts` 的 `splitReferenceChapters`：「第N章/回/节 标题」优先，中文数字到 9999；全篇没有时退「N、/N. 标题」编号式且要求 ≥2 处；重复章号以首次出现为准），**工作室第 N 章引用参考小说第 N 章**（截前 2 万字）；切不出章节结构的文件引用整本；超出章节数时「引用」禁用。**编辑器里是什么，解析就用什么**（曾两踩坑：① 整本回落被当可编辑框，粘贴同一本小说叠出多份重复；② 整本含后面章节，第 1 章把第 2 章剧情带进了初稿/提取）。**持久化与守卫**：参考正文存 `Chapter.referenceText`（1.2s 防抖静默保存）；reference-parse preview 是纯预览端点（写守卫白名单 POST 形状），脚本经 `applyExpectationText` 立即落库、提取经 `applyReferenceExtraction` 立即落库。**不使用浏览器 localStorage**（内嵌浏览器本地存储不可靠，曾致参考文本/提取建议凭空消失，见 debugging/drama-studio-local-storage-loss.md）。**UI 文案纪律**：参考/提取页签不加解释性段落（2026-08-20 用户明确要求；规则见 AGENTS.md UI Copy Rules）。新建章节标题预填（`CreateChapterDialog`）从切分结果取「第N章 标题」（`collectReferenceChapterTitles`）。
- 「提取」子页签：**逐条核对可编辑后单个应用**（2026-08-20 用户明确要求：多选批量创建没有意义——要逐条看过、改好才应用）。卡片与资产页签同款风格（图标+名字+定位徽标+一行摘要），点击打开 `ExtractApplyDialog`：与资产页签**共用表单**（`assetForms.tsx` 的 Character/Scene/PropAssetFormFields，设定中心三个资产页签的编辑弹窗同源复用），预填提取内容，改完点「应用」单个创建并从持久化建议中移除该条；同名资产卡片标「已存在」、应用按钮拦截且弹窗内可改名后应用。提取字段契约随合并进入 `novel.chapter.reference_parse@v2`（合并前为 `reference_extract@v5`）：**角色的性别/年龄段是结构化字段**（gender male/female/other/unknown、ageGroup child/youth/middle/elder 可空），**外貌体型一个字段**（v2 起 physique/personality 不再单列——2026-08-20 用户要求属性从简：做视频只关注画面/音色提示词，基础属性=姓名/定位/性别/年龄段/外貌体型）；角色表单（assetForms）同步精简，性格/着装/背景不再出现在表单（DB 字段保留，编辑保存时清空旧值防重复拼接），契约锁定在 tests/chapterReferenceParse.test.js。v3 的 stateLabel/stateNote 与 existingAssets 上下文已移除——**外观状态不在提取环节生成**（用户手动管理；重复资产由前端按名称拦截，无需模型判断）；保留字段推测（角色 appearance/personality/imagePrompt/voicePrompt，场景/道具 imagePrompt）与「有场景却零角色判无效重试」守卫。
- 工作室「当前」常驻五个章级子 tab（参考/提取/脚本/分镜/视频），都作用于当前章；分镜与配音合并为一个列表视图（一行一镜，见上）。**脚本页签**（2026-08-20 用户决定：初稿+正文合并为一，解析产出的初稿质量已可当正文，自由文本编辑改成列表）= 本章 expectation 的**线性条目列表**（`ScriptTab`）：视频按什么顺序发生，列表就按什么顺序排——场景切换行（淡绿）、角色状态切换行（淡黄）、分镜行（景别可换+画面描述）、分镜下的台词行（说话人/语气/内容，角色台词淡蓝底、旁白素底、正文里的角色/场景/道具名按类别高亮）；行点击即编辑（本地草稿、失焦/回车提交、Esc 取消——不逐键回写，避免空行被序列化折叠时焦点跳丢），悬停出上移/下移/删除，分镜行可「+台词」，底部可加分镜/台词/场景切换/角色状态。**底层数据仍是 Chapter.expectation 文本**：列表是 `shared/utils/scriptDocument` 的 parse/serialize 结构化视图（canonical 文本往返逐字稳定的契约锁定在 tests/scriptDocument.test.js；不认识的行原样保留为纯文本条目，旧自由文本章节与已废弃的【风格：…】行都不丢内容），编辑后序列化回写、沿用 1.2s 防抖自动保存链路（成功不弹 toast、失败报错、切页签即冲保存）。右侧仍是 `OutlineSettingsAside`（快速查找与创建）。正文/节拍编辑页签已随合并移除：`Chapter.detailOutlineJson` 节拍链路保留在小说侧写作管线（previewChapterDetailOutline 端点与 detail_outline@v1 资产不动），工作室不再提供初稿→节拍按钮。章节管理弹窗（`ChapterManageDialog` 承载 `ChapterManagePanel`，无页脚，关闭走右上角 × 或点弹窗外）点卡片=切换当前章（父级 `switchChapter` 落库上一章并重置编辑态，弹窗关闭）；工具栏与设定面板同款（图标化新建 + 搜索框 + 搜索按钮，提交制搜索），卡片只显示第几章、章节名与字数。全书级大纲（`Novel.outline`）不在工作室编辑，只保留空白小说书架的 `BlankStartPanel` 三步流（`useNovelOutlineWorkspace`）。
- 单章节拍是**人工创作辅助**：`Chapter.expectation` 存本章初稿，`Chapter.detailOutlineJson` 存确认后的节拍（schemaVersion=1，beats 3～10 拍）。Prompt 资产 `novel.chapter.detail_outline@v1`（`chapterDetailOutline.prompts.ts`）：输入本章初稿 + 前后章梗概 + 设定快照，输出节拍草稿**不落库**（preview-then-save，同设定中心模式）；端点挂在章节路由 `POST/PUT /novels/:id/chapters/:chapterId/detail-outline*`。
- **V1 边界：节拍不注入自动导演写作上下文**——它是用户对着写正文的依据，不进入 `user_outline_contract` 或章节生成上下文；要注入必须另立设计并更新本页。
- 自动导演任务运行中：章节浏览/搜索/节拍可用，手动新建章节禁用（导演链按 order 顺序写作，手动插章会打乱规划）；该约束由前端禁用态表达，服务端不强制。

## 本地生产通道（2026-08-19 E2E 验证结论）

漫剧已在真实环境完成全链路验证（现成小说《黑暗文明》10 章 → 2 集 → 台本 → 38+ 镜 → 首帧图 → VoxCPM2 逐镜配音 → ffmpeg 本地视频合成 → 整集 35 秒竖屏成片）。沉淀的运行知识：

- **文本通道**：本地 OpenCode 桥接（18762），配置在模型设置的文本模型槽位。
- **图片通道**：本地 Codex 图片通道（18766）；注意部分血腥/敏感画面描述会被图片侧拒答（codex_generation_failed），这类镜头换提示词重试，不是链路故障。
- **语音通道**：VoxCPM2 桥接服务 `D:\Github\VoxCPM\openai_speech_server.py`（FastAPI，OpenAI /v1/audio/speech 兼容，默认 18761）。启动：`cd D:\Github\VoxCPM && .venv/Scripts/python.exe openai_speech_server.py`。CPU 上约 0.8s/字，先知预热情境下可用；项目 venv 无 CUDA torch，装 CUDA 版可提速。**台词情绪链路**：分镜台词行约定「角色名（语气）：台词」（`drama.storyboard@v2` 生成时写入，初稿解析 `novel.chapter.reference_parse@v1` 的 mood 同源语义）；`parseDialogueLines` 把（语气）拆成独立 `emotion` 字段、角色名保持干净用于匹配角色音色；配音时逐行 emotion 经 VoxCPM provider 透传为 `metadata.emotion_prompt`（`should_use_prompt_for_emotion: true`），行内语气优先于角色默认情绪（voice.emotion/voicePrompt），旁白行（含「旁白：」前缀行）用旁白音色描述；`buildDialogueVoiceKey` 把行内语气纳入音色指纹——语气变化会使已有音频判 stale 需重配。
- **视频通道**：`LocalFfmpegVideoProvider`（provider id `local_ffmpeg`）——首帧图+台词配音 → Ken Burns 竖屏 mp4，产物在 `server/storage/generated-videos/{taskId}.mp4`，经 `GET /api/drama/video-files/:taskId` 提供。ffmpeg 需在 PATH（本机 C:fmpegin）。
- **ffmpeg 拼接两个坑**：concat demuxer 列表必须 `-f concat -safe 0` 显式声明且列表内用正斜杠（Windows 反斜杠被当转义符）；多段配音文件扩展名按 dataUrl mime 定（wav 别存成 .mp3）。
- **批量任务与进程重启**：drama 批量任务跑在服务进程内（`void runBatchJob()`），ts-node-dev 重启会杀掉进行中的批量——恢复方式是重建同类型批量（已完成镜头自动跳过）；视频 providerTask 卡 running 时把 DramaVideoPrompt 置 failed 并清 providerTaskId 后重新派发。
- **美术风格（原「画面风格」，2026-08-20 统一改名）**：`services/drama/visual/dramaVisualStyles.ts`（7 预设，移植自旧项目 mydrama/supertale 的 styles/presets；每预设带中文 `summary`；`DEFAULT_DRAMA_VISUAL_STYLE_ID=unreal_cinematic_3d`「3D写实电影」——《黑神话：悟空》式 UE 写实 3D，排在预设列表首位）。注入点：首帧图提示词与角色设计稿提示词；风格只约束渲染媒介，`style_instructions` 中明确不得覆盖角色外貌/服装/场景描述。**小说级多套风格**：内置预设之外，每本小说可在「设定 · 美术风格」页签定义自定义风格与默认风格（存 `NovelSettingsWorld`，契约见 architecture/story-settings-hub.md 美术风格节）；**画风不进初稿**（v8 起无【风格】标记，2026-08-20 用户决定：整本用默认风格一种画风，想换画风改默认风格即可）。与 styleEngine 的通用画面风格体系仍是两套来源（drama 侧为项目级预设+小说级自定义），后续可考虑收敛。

## 失败模式 / 注意事项

- 视频通道是可插拔 port（`VideoProviderPort`），默认 mock **不会生成真实视频**：studio 视频阶段必须保留"未配置真实通道"的提示，不能让用户误以为出片失败是 bug。
- `ComicDramaStudioService` 的 links 查询按项目做聚合并发查询（列表 ≤50 本）；若未来漫剧项目规模显著变大，需要改为 groupBy 一次聚合。
- 漫剧小说仍可经 `/novels/:id/simple` 深链访问（书架行为一致）；不要在书架路径上做漫剧特判。
- 与 drama 模块的边界：studio 只读投影；任何对 drama 管线行为的修改仍应发生在 `services/drama/` 原有服务里，不要把管线逻辑写进 studio 层。

## 相关模块

- `server/src/services/drama/`（分镜/配音/视频管线）、`server/src/services/drama/studio/`（漫剧投影）
- `server/src/modules/novel/planning/`（大纲工作台服务与路由）、`server/src/prompting/prompts/novel/outlineExpand.prompts.ts`
- `client/src/pages/drama/comicDrama/`、`client/src/pages/novels/simpleCreation/BlankStartPanel.tsx`、`client/src/pages/novels/components/storySettings/`
