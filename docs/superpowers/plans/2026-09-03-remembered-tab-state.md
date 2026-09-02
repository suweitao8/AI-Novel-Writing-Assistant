# 页签记忆与恢复实施计划

> **执行说明：** 设计文档已提交为 `a8683b66`，本计划直接在 `codex/remember-tab-state` worktree 执行。

## 目标与边界

为所有稳定的页签/页签式分类增加浏览器侧记忆能力。记忆按全局功能或业务对象隔离；有效 URL 页签优先；无效值、对象切换和浏览器存储异常安全回退。保持现有业务 API、数据库、路由语义、UI token、键盘操作和 ARIA 行为不变。

## 任务 1：建立可校验的本地页签记忆基础层

- [ ] 新增 `client/src/lib/rememberedTabs.ts`，集中管理命名空间、scope 编码、允许值校验、`localStorage` 安全读写和清理。
- [ ] 新增 `client/src/hooks/useRememberedTab.ts`，提供对象/全局页签的受控状态同步；处理 scope 变化、跨同源窗口 `storage` 事件和无效旧值。
- [ ] 新增 URL 页签 Hook（同一 hooks 模块或明确归属的路由状态模块），保留其他 query 参数，区分有效 URL、记忆值和默认值。
- [ ] 为存储工具与 Hook 编写聚焦单元测试：读写、异常降级、无效值、scope 隔离、scope 变化、URL 优先级和 query 保留。
- [ ] 先运行测试观察基线失败，再实现最小代码并重跑，遵循 TDD。

## 任务 2：接入全局库与主要路由页签

- [ ] `ModelLibraryPage` 记住模型分类页签；切换分类继续重置已有分页行为。
- [ ] `AnimationLibraryPage` 记住动画分类页签；与模型库使用独立 scope。
- [ ] `KnowledgePage` 接入 URL 页签恢复，保留已有 `tab` 语义和其他参数。
- [ ] `WorldWorkspace`、`TitleStudioPage`、`ShortStoryStudioPage`、`SimpleNovelShelfPage` 接入对象/页面级页签记忆。
- [ ] `DramaProjectPage` 接入项目级主工作区页签；项目 id 变化时不能串用上个项目状态。
- [ ] 为每个接入点补充允许值集合和稳定 scope，删除不必要的本地初始化重复逻辑。

## 任务 3：接入顶部导航和小说编辑工作区

- [ ] 为 `PageTabsContext`/`TopNav` 增加可选记忆标识，仅在调用方提供稳定 scope 时写入选择，不改变现有导航回调。
- [ ] 设置页的路由式模块页签支持返回根设置入口时恢复上次模块；显式模块路由优先。
- [ ] 检查小说工作区 rail、章节/分析/资产路由式页签，按小说、章节、角色或世界 id 接入，不把路由导航误当成全局状态。
- [ ] `StorySettingsTabs`、`OutlineTab`、章节管理/章节洞察、角色资产、世界手册等稳定嵌套页签接入记忆。
- [ ] 对由父组件控制的页签，在父组件持有的状态层接入 Hook，避免受控 `Tabs` 被子组件的默认值覆盖。

## 任务 4：接入剧本、书籍分析和 Prompt 工作台

- [ ] `ComicDramaStudioPage` 的主 stage 与设置子页签分别使用项目级 scope；显式 URL stage 优先。
- [ ] 书籍分析主视图及稳定详情页签按分析/书籍对象隔离；动态 section key 只在仍然存在于允许值集合时恢复。
- [ ] Prompt 工作台编辑/预览的稳定页签按工作台语义记忆；临时生成消息/诊断页签只在值集合稳定时接入。
- [ ] 复查写作公式、标题生成等页签式对话框：仅接入具有稳定语义且会被重复使用的步骤，避免把一次性流程状态污染到下一次创建。

## 任务 5：一致性审计与文档

- [ ] 用 `rg` 重新扫描 `Tabs`、`role="tab"` 和页签式路由/按钮，逐项判断已接入、明确排除或需要补充。
- [ ] 检查所有新增用户可见文案，保持直接、简短，不添加实现说明或历史叙述。
- [ ] 如本次形成稳定的运行时边界，更新对应 `docs/wiki/` 页面；用户可见变化同步更新 `docs/releases/release-notes.md` 和 README 最新更新。

## 任务 6：验证、提交与集成

- [ ] 运行客户端类型检查、页签 Hook/组件聚焦测试和必要的构建检查。
- [ ] 启动当前 worktree 的独立开发端口（API `3144`、Web `5361`），确认 `/api/health` 与页面响应来自本 worktree。
- [ ] 使用 Codex 内置浏览器验证模型库、动画库、项目/小说对象隔离、有效 URL 优先、刷新恢复、键盘/ARIA 和控制台/网络错误。
- [ ] 检查 diff 仅包含本功能，完成自验后用 `git commit -s` 提交；需要用户可见发布说明时一起提交。
- [ ] 在干净主工作区运行 `pnpm workflow:integrate codex/remember-tab-state --push --verify "<focused-check>"`，确认主分支与 `origin/main` 一致，清理本次 worktree 和已合并分支。

## 风险与处理

- `localStorage` 被禁用或配额异常：读写静默失败，页面继续使用默认值。
- 组件在同一挂载周期切换对象：Hook 监听 storage key，重新读取对应 scope，防止串页。
- URL 与本地记忆冲突：始终使用有效 URL；只在用户实际选择或有效 URL 被解析时更新记忆。
- 动态页签被删除：使用允许值集合校验并回退默认值，不让内容区进入空白状态。
- 并发开发端口或主工作区变更：只操作独立 worktree 的 3144/5361，不停止或改写主 lane。
