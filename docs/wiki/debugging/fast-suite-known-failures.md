# fast 测试套件已知失败与根因分类

更新日期：2026-08-27

## 背景

`pnpm --filter @ai-novel/server test:node` 以单进程 `require()` 串跑全部 fast 测试。2026-08-27 在 main 上全量跑约 35–57 项失败。排查结论：失败分三类，只有第一类是必须修代码/测试的缺陷，后两类是环境依赖。修复任何一条前先按本页归类，不要把环境失败当成代码回归去改产品逻辑。

## 已修复（2026-08-27，codex/shared-quality-audit-phase1）

- `services/drama 不依赖 novel 领域（低耦合守卫）`：drama 三处 import 违规，已通过 shared 合同迁移 + prompt registry 间接调用消除（见 `docs/wiki/architecture/drama-forge-module-boundary.md`）。
- `every stable issue code has one valid default policy`：目录新增第 24 个 issue code `runtime.background_prefetch_failed` 后计数断言未同步，已改为 24。
- `artifact delta ...`（2 项）：测试仍调用旧 `characterInfluenceProposal` 公共方法；实现已迁移为 `characterDialogueInfluence` 私有流程，测试已重写对准新 API。

## 待修：真实语义漂移（单进程和隔离运行都失败，代码或测试一方过期）

- `chapterAcceptanceAssessmentService`：`normalizeAssessment` 实际返回 `continue_with_risk`，测试期望 `repairable`。风险治理合并（84ad7c58 一带）后分类口径变化，需要确认产品语义以哪边为准再改。
- `novelDirectorAutoExecutionRuntime` 的 `circuit-breaker governance ...`：读取 `undefined.circuitBreaker`，测试消费的配置结构已改名/搬家。
- `directorRunCommandService` 的 `stale recovery applies the task policy ...`：同属 director 风险治理语义漂移。
- `runPipelineChapterWithRuntime escalates ...`（3 项）、`chapter character context ...`、`display state ...`（2 项）、`assembler refreshes ...`、`circuit-breaker governance ...`：集中在 chapter 生产链 runtime，建议按同一批语义变更一起对齐。

## 环境依赖（隔离运行同样失败，但原因是本机数据/服务缺失）

- `imageProviderReferences` 3 项：需要 DB 中存在 provider API key 记录；空库/新 worktree 会报 `Provider codex API key is not configured`。在 worktree 排查时先 `prisma migrate deploy` 并插入测试 key。
- `VoxCPM2 / IndexTTS / tts provider` 一组：依赖本机 18761 语音桥接或 ffmpeg。
- `auto director auto-approval audit / NovelExportService / BookAnalysis / NovelReferenceService` 等需要带历史数据的 dev 数据库。

## 诊断路径

1. 先 `node --test tests/<file>.test.js` 隔离复跑，确认不是套件内状态污染。
2. 隔离仍失败 → 看报错是否是 `table does not exist` / `not configured` / `ECONNREFUSED` → 环境类。
3. 是断言不等 / `is not a function` / `Cannot read properties of undefined` → 语义漂移类，进「待修」清单。
4. 修语义漂移时优先怀疑最近一次合并改了实现但漏改测试；用 `git log -S "<符号名>"` 定位改名点。
