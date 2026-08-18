# services/novel 根层收敛与 NovelEdit 拆分

## Background

`server/src/services/novel` 根层曾堆积 46 个文件（facade、内核服务、章节生命周期、工具混放），`client/src/pages/novels/NovelEdit.tsx` 曾达 2865 行（超 1300 行硬阈值一倍以上），两者都是架构规则明确要求收敛的违例。

## Decision

- 服务端按「根层只留 facade 与稳定入口」收敛，分阶段只动一个内聚子系统，保留兼容 re-export。
- 客户端编辑页按领域拆入 `pages/novels/edit/`，拆分方式为代码原样搬移 + 同名参数解构，hooks 顺序不变。

## Current Rule

已完成的收敛阶段（2026-08-19，commit 574c1ed1…100dbffa）：

- 6 个零引用 deprecated facade 删除；novelPromptTraceReport（零引用）删除。
- novelCore* 10 文件 → `novelCore/`；chapterLifecycleState/chapterWritingGraph/NovelPipelineRuntimeService → `runtime/`，chapterPatchRepairService → `runtime/repair/`；外围 8 文件按消费方下沉（tokenUsageSummary/chapterArtifacts/biblePersistence→novelCore，productionHelpers→production，BookContract→director，DraftOptimize→quality，highMemoryReservation→runtime，structuredOutline→volume）。
- pipelineJobState/pipelineJobDedup 消费方横跨 5+ 目录，确认为根层共享内核；bookFraming（跨 styleEngine）、chapterSummarySchemas（prompting 引用）同样保留根层。
- 根层移动一律留 `export *` 兼容壳，消费方零改动；根层真实实现从 46 降至 17 个（facade 与共享内核）。
- NovelEdit.tsx 2865→1280 拆 9 模块（见 `client/src/pages/novels/edit/README.md`）；worldStructure/CharactersPanel/world.prompts 均降至阈值内；全库已无超过 1300 行的源文件。

剩余方向：

- `routes/` 已完成三批共 22 个文件的收敛（cbea50e7/ca8e7232/bdb7ce5d）：genre/knowledge/llm/styleEngine(+extraction)/titleLibrary/writingFormula/task/settings 系(含子路由与 settingsAutoDirector)/storyMode/character/rag/promptWorkbench/health/agentCatalog/agentRuns/astrology/autoDirector 系。归属规则：产品能力进 `modules/<域>/http/`，llm/health 等基础设施进 `platform/**/http/`，promptWorkbench 归 `prompting/http/`，autoDirector 系归 director 自有 `http/`。仅剩 4 个（bookAnalysis/chat/creativeHub/images），均属并行会话活跃域，待其落定后收尾。
- `prompting/prompts/novel`（42 文件）与 `client/src/pages/novels/components`（64 文件）的目录密度收敛。
- 根层兼容壳在新代码不再引用后可分批退役。

## 测试环境与验证结论（2026-08-19）

- 服务端测试必须运行在与 better-sqlite3 原生绑定匹配的 Node 上：本机用 WinGet 的 Node v22.22.2（ABI 127）。默认 PATH 的 Node v26 会导致 `ERR_DLOPEN_FAILED`；不要为迁就单一会话随手 rebuild 原生模块，先确认共享 dev 进程的 Node 版本。
- 兼容壳（`export *` 再导出）的命名空间是只读的：测试对模块导出做 monkey-patch 时必须 require 真实模块路径，不能经过壳。
- 删除 facade 前的引用检索必须覆盖 `require("…dist/….js")` 形式的测试路径，仅查 TS import 会漏。
- 失败归属方法：在改动前的基线提交建 worktree 跑同一套测试做差集；本轮 46 个失败经比对全部归属并行会话在途工作或既有问题，结构迁移零残留。

## Failure Modes

- 拆分长文件时用「列表项数」估算行数会低估（多行字符串占一个元素），必须以 wc -l 为准。
- Python 处理行区间时 `str.startswith(prefix, n)` 的第二参数是字符串内偏移，不是列表起点，必须用 `i > start` 过滤。

## Related Modules

- server/src/services/novel、server/src/modules/export
- client/src/pages/novels/NovelEdit.tsx、client/src/pages/novels/edit/

## Source Documents

- 2026-08-19 架构清理：commit 574c1ed1（facade 删除）、43b7adae（NovelEdit 拆分）。
