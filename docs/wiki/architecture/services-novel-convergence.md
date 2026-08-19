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

- `routes/` 已完成三批共 22 个文件的收敛（cbea50e7/ca8e7232/bdb7ce5d）：genre/knowledge/llm/styleEngine(+extraction)/titleLibrary/writingFormula/task/settings 系(含子路由与 settingsAutoDirector)/storyMode/character/rag/promptWorkbench/health/agentCatalog/agentRuns/astrology/autoDirector 系。归属规则：产品能力进 `modules/<域>/http/`，llm/health 等基础设施进 `platform/**/http/`，promptWorkbench 归 `prompting/http/`，autoDirector 系归 director 自有 `http/`。已全部完成（038d3458）：bookAnalysis→modules/bookAnalysis/http/、chat+creativeHub→creativeHub/http/（顶层领域包）、images→modules/image/http/；src/routes/ 目录删除，路由层契约测试改为扫描 **/http/** 全部入口。
- ~~`prompting/prompts/novel`（42 文件）~~ 已收敛（f34bbbd7）：31 个文件按家族进 chapter/character/director 子目录，根层 44→13；registry loader、29 个服务引用方、9 个测试 require 同步改路径，无兼容壳。~~`client/src/pages/novels/components`~~ 已收敛（f8ed87e5）：54 文件入 chapter/character/director/structured/takeover/cards/tabs 七个子目录，根层 65→14。
- ~~根层兼容壳退役~~ 已完成（e53600f1）：22 个 export * 壳全部删除，59 处引用（39 源文件 + 10 测试）由位置感知解析器重定向至真实模块；根层定格 17 个文件（facade 与共享内核）。
- ~~`director/runtime`（38 文件）~~ 已收敛（2026-08-19 第二轮）：根层只留 `directorSubsystem.ts` 门面，37 个实现文件进入 7 个子模块——`takeover/`（接管链 6，消除 novelDirectorTakeover* 同前缀超标）、`flows/`（候选/确认/继续流程与共享 helpers/errors/schemas/persistence/framing/orchestrator 9）、`execution/`（运行时编排、节点契约、策略引擎、工作区分析、进度检查、质量环预算 6）、`store/`（runtime store、快照合并、状态提案决议、默认值 5）、`artifacts/`（产物台账 5）、`events/`（事件与遥测投影 3）、`resilience/`（熔断、内存安全、校验 3）。依赖方向与变更守则固化在 `director/runtime/README.md`，目录契约由 `directorDirectoryBoundary.test.js` 固化（runtime 根仅允许 directorSubsystem.ts）。迁移验证：1278 项测试失败集与基线完全一致。
- ~~`client/src/api`（38 文件平铺）~~ 已收敛（2026-08-19 第二轮）：8 个 `novel*` 同前缀文件并入既有 `novel/` 目录（`novel.ts` 原本就是 `export * from "./novel/*"` 的纯门面，移为 `novel/index.ts` 后 `@/api/novel` 引用零改写），另有 19 个文件进入 `media/`（comic/comicDrama/drama/images/visualStyles/title）、`story/`（genre/storyMode/storySettings/writingFormula）、`characters/`、`creative/`（chat/creativeHub/creationStudio）、`agents/`、`director/`（autoDirectorFollowUps/directorRiskPolicy）六个领域目录；根层 38→11（client/queryKeys 共享内核 + 单文件领域）。client 导入全部为 `@/api/*` 别名，改写仅在导入上下文内进行，`pnpm --filter @ai-novel/client typecheck` 零错误。
- ~~`services/novel/runtime`（25 文件）~~ 已收敛（2026-08-19 第二轮）：14 个文件进入 `generation/`（写作图、运行时管线、流式编排、批次上下文缓存 4）、`artifacts/`（产物增量/后台同步/直写同步 3）、`finalization/`（内容定稿、时间线定稿 2）、`qualityGate/`（质量门、验收判定 2）、`context/`（+GenerationContextAssembler 总装）、`proseQuality/`（+生成后风格复查 runner 与策略）；根层 25→11（ChapterRuntimeCoordinator 协调门面、流水线门面与共享内核）。边界与依赖方向固化在 `runtime/README.md`，根层清单与子目录集合由 `chapterRuntimeBoundary.test.js` 固化。质量门判定结果分级必须维持「局部质量债不得升级为全局重规划阻断」的规则（见 AGENTS.md）。迁移验证：1282 项测试失败集与基线完全一致。
- ~~`services/novel/volume`（24 文件）~~ 已收敛（2026-08-19 第二轮）：14 个文件进入 `generation/`（卷战略骨架/章节清单/预算分配生成链及生成期 schemas/helpers/内存安全/遥测 9）与 `workspace/`（结构化大纲文档与持久化、旧版来源兼容 5）；根层 24→10（NovelVolumeService 门面、同步与任务书质量门入口、共享工具）。目录契约由 `volumeDirectoryBoundary.test.js` 固化，边界说明见 `volume/README.md`。迁移验证：1284 项测试，89 个真实失败与基线完全一致（基线中多出的 1 个失败是本批新增目录契约测试在迁移前树上的预期失败，迁移后转为通过）。

## 测试环境与验证结论（2026-08-19）

- 服务端测试必须运行在与 better-sqlite3 原生绑定匹配的 Node 上：本机用 WinGet 的 Node v22.22.2（ABI 127）。默认 PATH 的 Node v26 会导致 `ERR_DLOPEN_FAILED`；不要为迁就单一会话随手 rebuild 原生模块，先确认共享 dev 进程的 Node 版本。
- 兼容壳（`export *` 再导出）的命名空间是只读的：测试对模块导出做 monkey-patch 时必须 require 真实模块路径，不能经过壳。
- 删除 facade 前的引用检索必须覆盖 `require("…dist/….js")` 形式的测试路径，仅查 TS import 会漏。
- 失败归属方法：在改动前的基线提交建 worktree 跑同一套测试做差集；本轮 46 个失败经比对全部归属并行会话在途工作或既有问题，结构迁移零残留。
- 批量改写相对导入的教训：Windows 下 Python `glob` 返回反斜杠路径，`path.split("/")` 会静默失效，必须用 `os.sep`；批量替换脚本禁用「占位标签再回填」模式（正则 `.TAG.` 会误伤正常代码中的同名子串，如 `NOVEL_PROMPT_BUDGETS`）。安全模式：以 HEAD 原文为基准做逐行 diff，非 import-spec 行的任何差异一律从 HEAD 恢复后再单独处理路径。更优解（components 批次验证）：完全不用规则正则——移动文件从 HEAD 原文重生成，import spec 用文件系统 `os.path.relpath` 直接算出（需对目标也做家族重定向 + 扩展名归一：引用不带 .tsx 而映射表带）。另：共享工作区禁止 `git stash` 做基线对照（会短暂清空他人可能正在读的工作树），改用基线 worktree。
- 引用检索的完整覆盖面（runtime 子模块批次补充）：除 TS import 与 `require("…dist/….js")` 外，测试还存在直接 `readFileSync("…src/….ts")` 的源码路径字符串，三类都要扫；相对导入解析用的「移动前快照」必须包含「目录 + index.ts」形态的目标（如 `modules/novel/writing-platform` 这类目录导入），否则文件移入子目录加深层级时会漏改。迁移后用「全库相对导入逐条按当前位置解析」的校验器兜底，可把漏改定位到唯一行。

## Failure Modes

- 拆分长文件时用「列表项数」估算行数会低估（多行字符串占一个元素），必须以 wc -l 为准。
- Python 处理行区间时 `str.startswith(prefix, n)` 的第二参数是字符串内偏移，不是列表起点，必须用 `i > start` 过滤。

## Related Modules

- server/src/services/novel、server/src/modules/export
- client/src/pages/novels/NovelEdit.tsx、client/src/pages/novels/edit/

## Source Documents

- 2026-08-19 架构清理：commit 574c1ed1（facade 删除）、43b7adae（NovelEdit 拆分）。
