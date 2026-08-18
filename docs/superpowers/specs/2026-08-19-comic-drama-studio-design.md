# 漫剧工作流（漫剧列表 + 小说→分镜→配音→视频）设计

日期：2026-08-19
状态：已确认（用户已确认三项关键决策：只在漫剧列表显示、影视分镜镜头形态、边写边做；分镜形态与整体方案已在对话中确认）

## 背景与问题

用户需要第四种创作形态「漫剧」：从写小说开始，到输出动态漫视频结束的完整工作流——写小说 → 漫画分镜（影视分镜镜头）→ 合成语音 → 整合成视频。漫剧作品不进小说列表，由独立的「漫剧列表」统一管理，作品管理与小说列表体验一致。

调研结论（可复用底座）：

1. **空白小说流程**（见 `2026-08-19-blank-novel-creation-design.md`，已实现）：书名+想法创建简易模式小说 → 设定中心 → 简略大纲 → AI 分章细纲 → 自动导演写书。正好是漫剧的小说阶段。
2. **drama 模块是一条接近完整的动态漫管线**：DramaProject（novel_import 从小说导入，sourceRef 软链 novelId）→ 分集 → 台本 → 质检/合规 → 分镜（DramaStoryboard/DramaShot：景别/运镜/时长/台词/首帧图，首帧走真实图片模型）→ 配音（VoxCPM2 本地 TTS，逐台词）→ 视频提示词 + 视频通道（VideoProviderPort 可插拔，默认 mock，需配外部视频服务）→ 批量生产 → 导出（srt/timeline）。
3. `POST /drama/projects/:id/source/assemble` 可从原小说重新装配来源——支撑「边写边做」的新章节同步。
4. 缺口：drama 无桌面导航入口、不是从写小说开始、没有跨阶段的一站式视图；小说列表会显示所有小说（无法区分漫剧项目）。
5. 漫画工作台（comic 分格）是静态漫画线，未接语音/视频，不用于漫剧。

## 用户已确认的决策

- 漫剧项目**只在漫剧列表**显示，小说列表与首页最近作品不显示。
- 分镜采用**影视分镜镜头**（drama shots：首帧图+台词+时长/运镜），直接衔接配音与动态视频。
- **边写边做**：小说写到一定量即可开始分镜/配音/视频，后续章节通过来源重新装配同步。

## 方案

### 数据模型（增量迁移，无破坏性操作）

- `Novel` 新列 `productionKind String @default("novel")`，取值 `novel | comic_drama`；漫剧项目创建时置 `comic_drama`。
- DramaProject 完全复用：`source="novel_import"` + `sourceRef=novelId`（既有软链），分镜阶段首次进入时才创建（lazy），避免空来源快照。

### API

1. `createNovel` 增加 `productionKind` 可选字段（schema + service）。
2. 小说列表（`GET /novels`）默认排除 `productionKind=comic_drama`；新增 `productionKind` 查询参数（`comic_drama` 供漫剧列表查询）。首页最近作品走同一接口，自动生效。
3. 新增漫剧一站式投影（`server/src/modules/drama/http/dramaRoutes.ts` + `server/src/services/drama/studio/ComicDramaStudioService.ts`）：
   - `GET /drama/studio/links?novelIds=a,b,c`：批量返回 novelId → { projectId, status, episodeCount, storyboardShotCount, keyframeDoneCount, audioTaskCount, videoTaskCount, updatedAt }，供列表卡片展示阶段徽章。
   - `GET /drama/studio/:novelId/overview`：单个项目的完整阶段视图 = novel 基础信息 + 导演任务摘要（复用既有 director 投影查询）+ linked DramaProject 详情与阶段统计。
4. 分镜项目创建复用 `POST /drama/projects`（novel_import + sourceRef=novelId）；新章节同步复用 `POST /drama/projects/:id/source/assemble`。

### 前端

1. **漫剧列表页** `client/src/pages/drama/comicDrama/ComicDramaListPage.tsx`（路由 `/drama`，替换 DramaWorkspacePage 的列表职责）：
   - 头部：标题「漫剧列表」+ 说明 + 「创建漫剧」按钮（打开改造后的创建弹窗）。
   - 横版卡片网格（复用书架卡片形态）：横版封面、四阶段徽章（小说/分镜/配音/视频）、小说进度、进入项目按钮。
   - 数据：`GET /novels?productionKind=comic_drama`（含导演任务）+ `studio/links` 批量阶段统计。
2. **创建弹窗**：复用 `BlankNovelCreateDialog`，文案改为漫剧语境（先写小说，之后自动衔接分镜、配音、视频），创建后置 `productionKind=comic_drama` 并直达 `/drama/studio/:novelId`。
3. **漫剧项目页** `ComicDramaStudioPage.tsx`（路由 `/drama/studio/:novelId`）：四阶段工作流页，顶部书名+阶段步骤条。
   - **小说阶段**：无导演任务 → 复用 `BlankStartPanel`（含 创作/设定 两个子 tab，设定子 tab 复用 `StorySettingsTabs`）；导演已启动 → 进度卡 + 最近章节列表 + 「打开完整阅读台」（`/novels/:id/simple`）。
   - **分镜阶段**：无 DramaProject → 引导 +「从成稿章节生成分镜」（创建 novel_import 项目）；已有 → 阶段摘要 +「同步最新章节」（source/assemble）+「打开分镜工作台」（`/drama/projects/:id`，复用成熟工作台）。
   - **配音阶段 / 视频阶段**：阶段摘要 +「打开工作台」（deep link 到 DramaProjectPage 对应能力）；视频阶段展示视频通道可用性，未配置真实通道时明确提示可先产出素材（首帧图+配音+提示词）。
4. **入口**：Sidebar 创作 group 增加「漫剧列表」（`/drama`）；移除本轮先前加在首页与小说列表的「空白小说」入口（空白小说流程归入漫剧）。
5. 旧 `DramaWorkspacePage` 从路由摘除并删除（其 novel/text 导入创建能力后续可作为漫剧列表的扩展回归）。

### 阶段状态判定

- 小说：无导演任务=未开始；任务 queued/running=创作中；waiting_approval=待确认；succeeded/有稳定章节=已成稿。
- 分镜：无 DramaProject=未开始；status 与 storyboard/keyframe 统计来自 links 投影。
- 配音/视频：audio/video 任务计数与最新状态（含 provider 可用性提示）。

## 边界与风险

- 不改 drama 既有管线服务与导演链；studio 只做投影与编排（查询+链接）。
- 视频生成依赖外部通道配置（默认 mock）；未配置时 UI 明确说明并导出素材，不阻塞前三个阶段。
- 漫剧小说仍可经 `/novels/:id/simple` 深链访问（保留 BlankStartPanel 在书架的接线，行为一致）。
- productionKind 迁移纯增量；旧数据默认 novel，零影响。
- 与并行 comic-bridge 会话（novel↔comic）无文件冲突面：不触碰 comic 模块。

## 验证

- 服务端：typecheck、定向测试（productionKind 过滤、studio links/overview 投影、创建漫剧置位、漫剧小说不出现在默认列表）。
- 前端：typecheck；UI 验收留给用户。
- 文档：release notes（新漫剧工作流）+ wiki（产品决策与模块边界）。

## 后续可选（不在本次范围）

- 漫剧列表支持从已有小说/外部文本创建（回归 DramaWorkspacePage 的导入能力）。
- studio 页内嵌分镜/配音面板（当前为摘要+深链）。
- 漫剧成品的一键导出打包（图+音+提示词集合）。
