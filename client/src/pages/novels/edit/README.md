# 小说编辑页（NovelEdit）模块目录

`../NovelEdit.tsx` 是小说专业工作台页面编排层，只负责组装各领域模块并透传给 `NovelEditView`。本目录按领域承接从页面里拆出的逻辑，边界如下：

- `useNovelEditDataQueries`：工作台只读数据查询（质量报告、卷工作区、状态快照、 payoff、角色资源、章节上下文、导演任务/书自动化投影、基础角色/世界/题材/推进模式列表）。
- `useNovelEditWorkspaceData`：消费上者的查询结果，派生工作台展示数据与导演任务可见链（visibleDirectorTask、快照、跟随动作、当前工作流 Tab）。
- `useNovelDirectorTakeoverLogic`：导演接管横幅与任务抽屉的全部动作逻辑（继续/校准/取消/归档/重试/跟随动作分发、接管文案组装、签名变更触发缓存刷新）。
- `useNovelDirectorTaskInvalidations`：导演任务与工作台分页数据的缓存失效策略（按 Tab 分组的 invalidate 映射）。
- `useNovelCharacterResourceProposals`：角色资源提案确认/忽略/复查/回填四个 mutation。
- `useNovelEditStreams`：novelDetail 级缓存失效 + 章节/圣经/节拍/修复四条 SSE 流。
- `useStructuredOutlineWorkspaceSync`：结构化大纲工作区Store 的选中同步与导演章节自动定位。
- `NovelEditStepTakeoverEntry`：各阶段"导演接管"入口弹窗组件。
- `novelEditPage.utils`：无状态纯函数（接管模式映射、后台活动解析、下载、章节定位等）。

新增编辑页能力时：先判断归属领域，进对应模块；页面文件只做编排，不再长出新逻辑。
