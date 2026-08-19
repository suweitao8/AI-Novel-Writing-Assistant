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
- 工作室顶栏统一承载：返回漫剧列表、作品名、居中的四阶段主 tab（小说/分镜/配音/视频）与小说阶段子 tab（大纲/细纲/设定），右侧放当前阶段的操作按钮（小说=章节管理+AI 写作进度，分镜=同步最新章节/打开分镜工作台，视频=打开视频工作台）。针对大纲的「解析」按钮（触发自动导演接管开始/继续写作）位于小说阶段子页签行右侧，与大纲/细纲/设定同一行。大纲编辑区是 `LineNumberedTextarea`（行号镜像实测对齐、默认 50 行起、回车加行），修改走静默自动保存（`saveOutlineMutation` 的 `silent` 参数，1.2s 防抖、失焦与切页签即冲保存，成功不弹 toast、失败仍报错）。

### 小说阶段的大纲契约（空白小说工作台）

- `Novel.outline` 存用户手写简略大纲；`Novel.userChapterOutlineJson` 存确认后的分章细纲（schemaVersion=1）。
- Prompt 资产 `novel.outline.expand@v1`：输入大纲 + 设定中心快照，输出分章细纲**草稿（不落库）**；postValidate 强制章序连续、章数等于期望值、出场角色必须在设定中心名单内。该入口只服务空白小说书架的三步流；漫剧工作室不暴露全书级细纲推理与期望章数——漫剧按逐章推进（章节管理里写本章大纲→AI 节拍），分章细纲页签只做手动整理与确认。
- 确认细纲后同步 `estimatedChapterCount`，让导演链按用户章数规划规模。
- 剧情契约注入点：接管 idea 携带用户大纲（`novelDirectorTakeover.ts` 的 `buildTakeoverIdea`）；卷战略/卷骨架/节奏板/章节列表/章节细化上下文注入 `user_outline_contract` 块（`prompting/prompts/novel/volume/contextBlocks.ts`，priority=99）——章节划分、事件顺序与结果不得推翻，允许补节奏与衔接。
- 简易模式写守卫（`simpleCreationWriteGuard.ts`）放行 `/settings` 与 `/outline` 工作台端点；其余写入仍只读。修改守卫白名单时必须同步更新 `simpleCreationMode.test.js`。

### 小说阶段的章节管理与单章细纲

- 工作室小说阶段常驻三个子 tab（大纲/细纲/设定）：大纲/细纲页签消费 `useNovelOutlineWorkspace`（与空白小说书架 `BlankStartPanel` 共用的大纲工作区 hook，草稿态挂在页面级、切换页签或阶段不丢失）；章节管理从顶栏「章节管理」按钮以弹窗（`ChapterManageDialog`）承载 `ChapterManagePanel`，提供章节卡片列表、按序号/标题搜索、手动新建章节与单章详情。
- 单章细纲是**人工创作辅助**：`Chapter.expectation` 存本章大纲，`Chapter.detailOutlineJson` 存确认后的节拍（schemaVersion=1，beats 3～10 拍）。Prompt 资产 `novel.chapter.detail_outline@v1`（`chapterDetailOutline.prompts.ts`）：输入本章大纲 + 前后章梗概 + 设定快照，输出节拍草稿**不落库**（preview-then-save，同设定中心模式）；端点挂在章节路由 `POST/PUT /novels/:id/chapters/:chapterId/detail-outline*`。
- **V1 边界：细纲不注入自动导演写作上下文**——它是用户对着写正文的依据，不进入 `user_outline_contract` 或章节生成上下文；要注入必须另立设计并更新本页。
- 自动导演任务运行中：章节浏览/搜索/细纲可用，手动新建章节禁用（导演链按 order 顺序写作，手动插章会打乱规划）；该约束由前端禁用态表达，服务端不强制。

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
