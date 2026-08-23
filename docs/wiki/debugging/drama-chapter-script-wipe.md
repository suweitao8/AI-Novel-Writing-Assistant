# 漫剧章节脚本/参考文本被清空（空白值覆盖 + 卷章同步空值覆写）

## 背景

用户反馈：回到漫剧工作室第一章，「脚本」空了、「参考」也空了，「提取」结果还在。
数据库 `Chapter.expectation`（脚本初稿）只剩 19 个换行符，`referenceText` 为空，
`referenceExtractionJson` 完好；且从 8/21 深夜到 8/23 该清空**反复发生**（重新解析恢复后又被清掉）。

## 排查路径

1. 三个页签的字段落点：脚本＝`Chapter.expectation`、参考＝`Chapter.referenceText`、提取＝`Chapter.referenceExtractionJson`。
2. 对时间轴：`GET /chapters` 响应体积（.logs 里 morgan 行的 bytes）能判断清空发生在哪次请求之前——
   事故会话开服时列表只有 5KB（脚本+参考已空），15:22 的 PUT 是用户点「引用」把参考文本救回来的。
3. **19 个换行是唯一指纹**：全代码库只有 `useNovelChapterWorkspace` 的空脚本占位符
   （`"\n".repeat(DEFAULT_LINE_COUNT - 1)`，DEFAULT_LINE_COUNT=20）会产出这个值——说明清空脚本的一定是客户端 PUT。
4. 服务端写 expectation 的只有 `VolumeChapterSyncService`（卷章同步，`expectation: purpose||summary`）
   与章节 CRUD；`ChapterExecutionContractService` 不写该字段。

## 根因（两条叠加）

1. **客户端空白值覆盖**（主因）：编辑器加载空脚本时铺 19 行占位空行；当本地编辑态是占位/空白、
   而服务端已有非空内容（例如另一入口刚重新解析落库、或服务重启后缓存错位）时，
   `flushExpectationSave`/`flushReferenceSave` 判定 dirty＝true，自动保存/切页签冲保存就把空白 PUT 回去，
   整章脚本被清成换行、参考文本被清成空串。参考文本只有客户端这一个写入方。
2. **卷章同步空值覆写**（放大器）：`Chapter.expectation` 是双义字段——小说规划链当「章节概要」，
   漫剧链当「脚本初稿」。`VolumeChapterSyncService` 同步 update 时无条件写
   `expectation: purpose||summary`，规划值非空时会拿旧摘要覆盖新脚本，为空时直接清空。

## 当前规则

- **客户端**：`flushExpectationSave`/`flushReferenceSave` 新增守卫——空白文本（trim 后为空）不得覆盖
  服务端已有非空内容。清空整章是罕见操作，代价是重新粘贴，远好于静默丢稿。
- **服务端**：卷章同步 update 只在规划摘要（purpose||summary）非空时才写 expectation；
  空值一律跳过。create 路径给新章节带默认值不受此限。
- 契约锁定在 server/tests/chapterScriptWipeGuard.test.js。

## 恢复手段（本次实际用到）

- **`VolumeChapterPlan.summary` 是脚本的安全副本**：`NovelVolumeService.hydrateCanonicalChapterFields`
  会把非空 expectation 抄进卷章计划的 summary（`summary: expectation||item.summary`），脚本被清后副本仍在。
  本次从事故库的 summary 完整找回 1146 字脚本，经正常 PUT `/novels/:id/chapters/:id` 恢复。
- `dev.db.bak-*` 备份与 `.logs/*/＊.llm.jsonl`（解析响应体）是次级线索；本次备份早于事故、日志缺失。
- 恢复前先核对副本完整性（分镜标记/场景数量与提取结果对得上）再写回。

## 相关模块

- `client/src/pages/drama/comicDrama/hooks/useNovelChapterWorkspace.ts`（守卫）
- `server/src/services/novel/volume/VolumeChapterSyncService.ts`（同步守卫）
- `docs/wiki/debugging/drama-parse-results-loss.md`（同族事故：提取结果丢失）
- `docs/wiki/debugging/drama-studio-local-storage-loss.md`（同族事故：本地存储丢参考文本）
