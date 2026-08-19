# Novel Runtime（章节生产链运行时）子模块边界

`services/novel/runtime/` 是章节生产链的执行运行时：生成编排、上下文装配、质量门、产物同步与定稿。根目录只保留协调门面与共享内核；新增能力必须进入下述职责目录，不再向根目录添加同前缀业务文件。

## 子模块所有权

- `generation/`：生成执行——写作图（chapterWritingGraph）、运行时管线（chapterRuntimePipeline）、流式生成编排、批次上下文缓存。
- `context/`：章节执行上下文装配——GenerationContextAssembler 总装，以及来源文本、参与角色、待复核资源、奖励与合成资源议题等上下文构件。
- `qualityGate/`：章节级质量门与验收判定（ChapterQualityGateService、ChapterAcceptanceAssessmentService）。注意质量债规则：局部审计问题记为章节级质量债，不得升级为全局重规划阻断（见 AGENTS.md 自动导演质量门规则）。
- `proseQuality/`：文本质检——AI 味检测与生成后风格复查（runner 与策略解析）。
- `artifacts/`：章节产物同步——产物增量（delta）、后台同步与直写同步。
- `finalization/`：定稿——内容定稿与时间线定稿。
- `repair/`：修复链——补丁修复、修复流运行时与审计上下文。

## 根层共享内核（不迁移）

`ChapterRuntimeCoordinator`（协调门面，路由与上层服务唯一入口）、`ChapterPipelineRuntimeAdapter`、`NovelPipelineRuntimeService`（流水线门面）、`ChapterRuntimeDefaultDeps`、`ChapterRuntimeReadinessService`、`chapterRuntimePackageBuilders`（禁止 IO 与服务单例，见 chapterRuntimeBoundary 契约）、`chapterRuntimeSchema`、`chapterLifecycleState`、`chapterEmptyContentError`、`runtimeContextBlocks`、`highMemoryReservation`。

## 依赖方向

- `generation/`、`finalization/`、`repair/` 可依赖 `context/`、`qualityGate/`、`artifacts/`。
- `context/`、`qualityGate/`、`proseQuality/`、`artifacts/` 互不依赖，均为底层构件。
- 路由层只允许依赖 `ChapterRuntimeCoordinator` 门面（chapterRuntimeBoundary 契约测试固化）。

## 变更守则

- 质量门与验收判定（`qualityGate/`）的判定结果分级变更时，同步更新 `docs/wiki/workflows/` 章节生产链条目。
- 目录契约由 `chapterRuntimeBoundary.test.js` 固化：根层文件清单与子目录集合变更必须显式改契约，不允许悄悄加文件。
