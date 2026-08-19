# 漫剧·小说阶段章节管理（新建/搜索/单章大纲与 AI 细纲）设计文档

- 日期：2026-08-19
- 状态：已定稿，进入实现
- 参考：旧项目 `D:\Github\mydrama` 章节卡片网格与搜索交互（`episodes.tsx`、`header-episode-switcher.tsx`）

## 背景与问题

漫剧工作室的小说阶段（`ComicDramaStudioPage.tsx`）目前只有两种形态：
无自动写作任务时显示「创作（BlankStartPanel 我的大纲）/设定」子页签；有任务时只显示进度条+"打开阅读台"。
用户的工作流需要：**写当前章节的大纲 → AI 推理该章细纲 → 对着细纲写正文/交 AI 写**。
当前没有章节列表、没有新建章节入口、没有搜索，也看不到单章细纲。
（全书级"简略大纲→分章细纲"已有：`novel.outline.expand@v1`，存 `Novel.userChapterOutlineJson`，但那是导演链启动前的规划层，与 Chapter 表无映射。）

## 目标

1. 工作室小说阶段新增「章节」子页签：章节卡片网格列表（借鉴旧项目：章节号+标题+状态+摘要+字数）、
   搜索框（按序号/标题过滤）、新建章节（标题+本章大纲）。
2. 章节详情弹窗：本章大纲（可编辑保存，复用 `Chapter.expectation`）+ **AI 推理单章细纲**（节拍列表，
   可编辑保存）+ 正文状态与编辑入口。
3. 自动写作进行中也能浏览/搜索/查看章节大纲与细纲（手动新建在写作中禁用，避免打乱导演链章节顺序）。

## 非目标

- 细纲不注入自动导演写作上下文（V1 仅作为人工创作辅助；注入需改导演链上下文契约，另立设计）。
- 不做章节拖拽排序/删除（自动导演按 order 写作，乱序风险大；后续有需要再加）。
- 不在工作室重复做正文编辑器（详情弹窗提供跳转 `/novels/:id/simple` 与章节编辑器入口）。

## 方案

### 服务端

**新 PromptAsset**（Prompt Governance：prompting/ 是唯一入口）
- 文件：`server/src/prompting/prompts/novel/chapterDetailOutline.prompts.ts`
- id `novel.chapter.detail_outline`，version `v1`，taskType `outline`，mode structured，language zh，
  contextPolicy 显式列输入；zod strict outputSchema + postValidate。
- 输入：novelTitle、chapterTitle、chapterOrder、chapterSynopsis（=expectation）、
  neighborSummaries（前后章标题+梗概，来自章节列表 expectation）、settingsSnapshot（可空）。
- 输出：`{ beats: [{ summary: string（一句情节推进）, keyEvent?: string }]（3-10 拍）, notes?: string }`。
- postValidate：节拍数 3-10、summary 非空去重。
- 注册：`promptAssetLoaderEntries.ts`（懒加载 require）。

**存储**：Chapter 新增 `detailOutlineJson String?`（内容 `{schemaVersion:1, beats:[...], notes?, generatedAt}`）。
双 schema（schema.prisma + schema.sqlite.prisma）+ 双迁移目录 `20260819180000_chapter_detail_outline`
（延续 story_settings 迁移对模式），运行时 sqlite 迁移器自动应用。

**服务与端点**：`server/src/modules/novel/planning/application/ChapterDetailOutlineService.ts`
- `previewDetailOutline(novelId, chapterId, llmOptions?)`：读章节与上下文 → runStructuredPrompt → 草稿**不落库**
  （preview-then-save，同设定中心 entity.generate 模式）。
- `saveDetailOutline(novelId, chapterId, payload)`：zod 校验 → 写 `Chapter.detailOutlineJson`。
- HTTP 挂 `novelChapterRoutes`（章节资源内聚）：
  `POST /novels/:id/chapters/:chapterId/detail-outline/preview`、`PUT /novels/:id/chapters/:chapterId/detail-outline`。

### 客户端

- `client/src/api/novel/chapters.ts`：补 `previewChapterDetailOutline` / `saveChapterDetailOutline` 与类型；
  章节列表/新建/更新（`getNovelChapters`/`createNovelChapter`/`updateNovelChapter`）已有，直接复用。
- 新组件 `client/src/pages/drama/comicDrama/components/ChapterManagePanel.tsx`：
  - 顶部工具行：搜索框（过滤序号/标题，实时）、新建章节按钮（Dialog：标题必填+本章大纲选填；
    order=max+1；自动写作中禁用并提示）。
  - 卡片网格 `sm:grid-cols-2 xl:grid-cols-3`：章节号徽标+标题+状态+摘要两行截断+字数（正文去空白）。
  - 点卡片 → AppDialogContent 详情弹窗三块：
    ①本章大纲：textarea+保存（PUT expectation）；
    ②AI 细纲：生成按钮（AiButton）→ 节拍列表（序号+summary+keyEvent）逐条可编辑、可增删 → 保存；
    ③正文：字数 + 「去阅读台」链接。
- `ComicDramaStudioPage`：novel 阶段子页签改为「创作/章节/设定」并**常驻**（有 directorTask 时
  创作子页签内显示原 NovelRunningSection；章节子页签照常可用，仅新建禁用）。

### 交互与文案（UI Copy Rules）

- 文案面向动作："写本章大纲，AI 展开成细纲节拍，跟着节拍写正文"；
  禁用态写原因："AI 正在写作，暂停后再手动添加章节"。
- AI 按钮一律 AiButton；错误 toast.error 带描述。

## 边界与错误处理

- 大纲（expectation）为空时点"生成细纲"：提示先写大纲（输入校验，非 AI 调用）。
- 细纲草稿未保存切走：弹窗关闭即丢弃（预览语义，与设定中心一致）。
- 保存细纲做 zod 严格校验（beats 3-10、summary 非空），非法载荷 400。
- 章节列表空态：引导去"创作"页签先写全书大纲或直接新建第一章。

## 测试与验证

- server：`tests/chapterDetailOutline.test.js`（prompt 输出 schema/postValidate 边界 + service 落库/预览契约）；
  typecheck；迁移在 dev.db 启动时自动应用（不跑破坏性命令）。
- client：typecheck；UI 验收留用户。

## 文档

- 用户可见 → release notes + README 同日块。
- wiki：在现有漫剧工作流 wiki 页追加"小说阶段章节管理"小节（能力边界：细纲不注入导演链）。
