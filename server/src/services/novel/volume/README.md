# Novel Volume（卷规划与拆章）子模块边界

`services/novel/volume/` 负责卷战略、卷骨架、节奏拆章与结构化大纲的生成与落库。根目录只保留服务门面、同步入口与共享工具；新增能力必须进入下述职责目录。

## 子模块所有权

- `generation/`：卷/章生成链——战略骨架生成（volumeBeatSheet*、volumeGenerationOrchestrator）、章节清单生成（volumeChapterListGeneration）、预算分配（volumeChapterBudgetAllocation）及生成期的 schemas/helpers/内存安全/遥测。
- `workspace/`：结构化大纲工作区——文档模型与持久化（volumeWorkspaceDocument/Persistence）、结构化大纲（structuredOutline）、旧版来源兼容（legacyVolumeSource、volumeStorylineCompat）。
- `chapterDetail/`：单章细纲生成（已有目录）。

## 根层（不迁移）

`NovelVolumeService`（门面）、`VolumeChapterSyncService`（拆章同步落库）、`ChapterExecutionContractService`、`ChapterTaskSheetQualityGateService`（任务书质量门）、`volumeDraftContext`、`volumeModels`、`volumePlanChangeDetection`、`volumePlanUtils`、`chapterTitleDiversity`、`chapterDetailModeLabel`。

## 变更守则

- 目录契约由 `volumeDirectoryBoundary.test.js` 固化：根层文件清单与子目录集合变更必须显式改契约。
- 拆章/结构化大纲的恢复与续跑语义变更时，同步更新 `docs/wiki/workflows/` 中结构化大纲与导演恢复相关条目。
