# 漫剧优先产品面清理设计

## 背景

当前网站的主要工作流已经集中到漫剧：漫剧项目、章节脚本、分镜与配音、角色/场景/道具资产、模型与动画预览、系统设置和任务记录。仓库仍保留一组旧的小说创作、独立漫画、创作中枢、拆书、世界样本和通用资产入口，导致产品入口与实际工作流不一致，也让维护者误以为这些页面仍是主流程。

## 目标

将网站的可访问产品面收敛为漫剧工作台及其必要支撑能力，减少旧页面和旧导航带来的认知负担，同时保留漫剧运行所依赖的共享服务、历史数据和兼容 API。

## 现状证据

- `/drama` 通过 Novel 的 `productionKind="comic_drama"` 管理漫剧项目，漫剧工作室直接使用小说章节、知识文档和故事设定 API。
- 漫剧工作室复用 `pages/novels/components/storySettings` 中的角色、场景、道具状态编辑器；这些不是旧页面，可以继续作为漫剧内部组件使用。
- 模型库、动画库和系统中的通用资产/环境预览直接复用漫剧 3D viewer，必须保留。
- 独立 `/comic` 与 `/comic/projects/:id` 使用单独的前端页面树和 `/api/comic` 服务，与 `/drama` 的 `comicDrama` 链路不是同一模块。
- 图片生成的 `ImageGenerationPreview` 与 `ImageGenerationOverrides` 类型被拆书和漫剧共同引用，不能随独立漫画 API 文件一起删除。

## 决策

### 1. 保留的产品入口

保留以下入口作为漫剧主工作流及其必要支撑：

- `/drama`、`/drama/studio/*`、`/drama/projects/*`
- `/models`、`/models/:modelId`
- `/animations`、`/animations/:animationId`
- `/tasks`
- `/knowledge`（漫剧参考资料与索引管理）
- `/settings` 及模型、知识库、画风、旁白音色、环境预览、记录等子页面

### 2. 旧产品面的处理

旧入口不再加载旧页面代码，而是保留兼容路由并引导到 `/drama`：

- 独立漫画：`/comic`、`/comic/projects/:id`
- 通用小说工作流：`/novels`、`/create`、`/novels/create`、`/novels/auto-director`、`/novels/:id/simple`、`/novels/:id/story`、`/novels/:id/preview`、`/novels/:id/edit`、`/novels/:id/chapters/:chapterId`
- 旧辅助工作区：`/creative-hub`、`/chat`、`/book-analysis`、`/worlds/*`、`/style-engine`、`/writing-formula`、`/base-characters`、`/titles`、`/genres`、`/story-modes`、`/anti-ai-rules`、`/prompt-workbench`、`/auto-director/follow-ups`

兼容路由只做确定性的 URL 跳转，不执行关键词匹配，也不删除数据库记录。带有小说 id 的旧编辑地址优先跳转到对应的 `/drama/studio/:novelId`，避免同一个漫剧项目因历史 URL 无法进入。

### 3. 代码清理边界

- 从路由入口移除旧页面的 lazy import，避免旧页面进入前端构建图。
- 删除没有其他引用的独立漫画前端页面树和其专用 UI 组件。
- 将图片生成的共享类型移到由图片生成能力负责的独立类型文件；独立漫画 API 文件仍保留为兼容客户端类型/接口的过渡模块，直到确认外部调用已迁移。
- 清理桌面端与移动端导航中旧产品入口，以及不再需要的旧页面标题和 route pattern。
- 首阶段不删除 `/api/comic`、`server/src/services/comic`、Prisma `Comic*` 模型或历史迁移；这些属于兼容/数据边界，不应通过前端入口清理顺带破坏。

### 4. 不在本阶段处理

- 不删除数据库表、记录、迁移文件或 storage 资产。
- 不删除漫剧依赖的 Novel/Knowledge/RAG/Settings/Model/Animation/Task 服务。
- 不修改漫剧业务逻辑、提示词、图片/音频生成流程或 3D viewer 行为。
- 不改变外部 API 的响应结构。

## 兼容与回退

旧 URL 仍能得到确定响应，但不再打开旧工作台。服务端兼容 API 与数据库保留，因此已有漫画数据仍可由历史客户端或后续迁移工具访问。若未来确认不再需要外部兼容，再单独提交 API/数据层退役设计，并按数据保护规则备份和验证后处理。

## 验证要求

1. 客户端类型检查与构建通过，且构建图不再包含旧漫画页面 lazy chunk。
2. 漫剧页面、项目工作室、模型、动画、任务、知识库和系统设置路由可加载。
3. 旧入口全部按约定跳转，带 id 的小说旧编辑地址能进入对应漫剧工作室。
4. 运行现有漫剧合同测试和路由测试；不修改数据库数据。
5. 使用内置浏览器访问漫剧列表和一个工作室页面，确认无控制台错误、关键导航正常。
