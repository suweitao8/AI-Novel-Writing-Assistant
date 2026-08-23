# 漫剧视频输出分辨率设置实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or an equivalent focused implementation workflow when delegating independent work. Keep the current worktree ownership clear and do not overwrite concurrent changes.

**Goal:** 在系统设置总览提供可持久化的 720P/1080P 视频输出选择，并让整集合成、本地 FFmpeg 视频任务和时间线导出统一使用该选择。

**Architecture:** 保留 `renderProfile.ts` 的纯分辨率定义和 16:9 校验；新增 `AppSetting` 驱动的设置服务作为数据库/环境变量/默认值边界；设置路由和 React Query API 提供读写；Remotion 及其他视频入口在任务开始或导出请求时获取一次 profile，渲染层只接收参数。

**Tech Stack:** TypeScript, Express, Prisma AppSetting, React, TanStack Query, existing UI Card/SelectControl, Vitest/Node test, pnpm workspaces.

---

## 1. 先写失败测试和契约

**Files:**

- Add: `server/tests/dramaVideoRenderProfileSettings.test.js`
- Add: `server/tests/dramaVideoRenderProfileIntegration.test.js`
- Add: `client/tests/dramaVideoRenderProfileSettingsContracts.test.js`

**Work:**

1. 断言渲染配置暴露 720P/1080P 选项，并能将配置 ID 解析为正确的宽高。
2. 断言设置服务以 `drama.videoRenderProfile` 保存值，默认和环境变量回退使用 720P，保存 1080P 返回 1920×1080，非法值被拒绝。
3. 断言整集合成、本地 FFmpeg 和 timeline JSON 读取已配置 profile；Remotion assembler/renderer 继续通过输入参数接收 profile。
4. 断言前端 API、query key、设置卡片和 `SettingsOverviewPage` 挂载存在，且用户可见选项包含 720P 与 1080P。
5. 先运行这些测试，确认它们因实现尚不存在而失败。

## 2. 扩展纯渲染配置和持久化设置服务

**Files:**

- Modify: `server/src/services/drama/video/renderProfile.ts`
- Add: `server/src/services/settings/DramaVideoRenderProfileSettingsService.ts`

**Work:**

1. 导出 profile 选项和按 ID 解析函数，集中维护 `720p → 1280×720`、`1080p → 1920×1080`、24fps 与 16:9 校验。
2. 保留现有 `getDramaRenderProfile(env)` 的环境变量兼容行为，默认仍为 720P。
3. 新设置服务使用 `AppSetting` key `drama.videoRenderProfile`，提供读取、保存和获取已配置 `DramaRenderProfile` 的函数。
4. 读取优先使用数据库值，其次环境变量，最后 720P；数据库表缺失时沿用既有缺表回退约定。
5. 保存前进行 profile ID 校验，通过 Prisma upsert 写入，不引入数据库迁移。

## 3. 增加设置 API 和前端 API 类型

**Files:**

- Modify: `server/src/modules/settings/http/settingsRoutes.ts`
- Modify: `client/src/api/settings.ts`
- Modify: `client/src/api/queryKeys.ts`

**Work:**

1. 在认证设置路由注册 `GET /settings/drama-video-render-profile` 和 `PUT /settings/drama-video-render-profile`。
2. PUT 使用 Zod enum 校验 `{ profile: "720p" | "1080p" }`，以统一 API 响应格式返回完整当前 profile 与 options。
3. 前端定义 profile/options 类型和读写函数，补充 `queryKeys.settings.dramaVideoRenderProfile`。
4. 保持错误状态和响应结构与现有设置 API 一致。

## 4. 用测试驱动方式实现设置卡片

**Files:**

- Add: `client/src/pages/settings/components/DramaVideoRenderProfileCard.tsx`
- Modify: `client/src/pages/settings/views/SettingsOverviewPage.tsx`

**Work:**

1. 使用现有 Card、SelectControl、Button/状态反馈和语义设计 token，不新增硬编码颜色或自定义控件。
2. 卡片标题使用“视频输出”，提供 720P（1280×720）和 1080P（1920×1080）两个选择，显示当前尺寸/24fps。
3. 覆盖加载、错误、保存中、保存成功和保存失败状态；保存期间禁用选择与按钮，并保留键盘可操作性和焦点样式。
4. 保存成功后更新本地选择、失效设置 query 并提示用户；只影响后续任务，不触碰已有视频。
5. 在设置总览直接渲染卡片，保持响应式布局与现有设置卡片一致。

## 5. 接入所有视频输出入口

**Files:**

- Modify: `server/src/services/drama/video/DramaEpisodeAssemblyService.ts`
- Modify: `server/src/services/drama/video/LocalFfmpegVideoProvider.ts`
- Modify: `server/src/services/drama/DramaExportService.ts`

**Work:**

1. `startAssembly` 启动时读取并捕获 profile，传入后台 `runAssemblyJob`，避免用户在任务运行期间切换设置导致同一任务尺寸变化。
2. `getAssemblyStatus` 返回持久化设置对应的 profile，供状态和后续 UI 使用。
3. `LocalFfmpegVideoProvider.createTask` 获取 profile 并传给 FFmpeg 参数构造函数，移除其对环境默认值的直接读取。
4. `DramaExportService` 在 timeline JSON 导出请求中读取一次 profile，复用 width/height/fps。
5. Remotion assembler/renderer 保持参数化，不增加对 Prisma 或设置服务的耦合。

## 6. 更新长期文档与用户可见说明

**Files:**

- Modify: `docs/wiki/workflows/comic-drama-episode-assembly.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

**Work:**

1. 在工作流 wiki 记录设置 key、读取优先级、任务启动快照和三条输出入口的统一规则。
2. 按 release-note skill 检查本次 Git 范围，记录用户可见的全局分辨率选择能力。
3. 更新 README 的“最新更新”摘要，保留历史发布说明不被覆盖。

## 7. 验证并交付

**Work:**

1. 运行新增服务端/客户端测试，确认红灯转绿。
2. 运行相关视频测试、服务端构建和客户端类型检查；如依赖生成要求，先执行对应 workspace 的 Prisma/shared 构建步骤。
3. 对变更执行 `git diff --check`，检查只包含本任务文件，使用 `git status --short` 审核暂存范围。
4. 在隔离分支创建签名提交；按项目规则在主工作区执行验证后的 `--no-ff --no-commit` 合并、签名合并提交并显式 `git push origin main`。
5. 检查主工作区和 worktree 列表，保留其他并发改动；若本任务 worktree 含无法安全清理的本地数据库等 ignored 文件，不强制删除并明确报告。
