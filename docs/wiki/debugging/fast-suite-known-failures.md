# fast 测试套件已知失败与根因分类

更新日期：2026-08-27

## 背景

`pnpm --filter @ai-novel/server test:node` 以单进程 `require()` 串跑全部 fast 测试。2026-08-27 在 main 上全量跑约 35–57 项失败。排查结论：失败分三类，只有第一类是必须修代码/测试的缺陷，后两类是环境依赖。修复任何一条前先按本页归类，不要把环境失败当成代码回归去改产品逻辑。

## 已修复（2026-08-27，codex/shared-quality-audit-phase1）

- `services/drama 不依赖 novel 领域（低耦合守卫）`：drama 三处 import 违规，已通过 shared 合同迁移 + prompt registry 间接调用消除（见 `docs/wiki/architecture/drama-forge-module-boundary.md`）。
- `every stable issue code has one valid default policy`：目录新增第 24 个 issue code `runtime.background_prefetch_failed` 后计数断言未同步，已改为 24。
- `artifact delta ...`（2 项）：测试仍调用旧 `characterInfluenceProposal` 公共方法；实现已迁移为 `characterDialogueInfluence` 私有流程，测试已重写对准新 API。

## 已修复：语义漂移（2026-08-27 第二批，codex/fix-test-drift）

- `chapterAcceptanceAssessmentService`：soft 可补义务缺口自 2026-06-04（13aac0e2）起有意降级为 `continue_with_risk` 记质量债（符合本仓库最高优先级规则），测试改为断言新口径。
- `novelDirectorAutoExecutionRuntime` circuit-breaker：**真实回归**。2026-08-10（28f85766）实现的按治理决策分派（continue→闭合熔断继续 / pause→requeue / fail→停止）在 8 月 25 日并行分支收敛时未进入 main，main 停留在「一律暂停」。已按未合并分支 81c1babe 的最终设计移植恢复，applyAction 合同为 `(decision) => ...`。
- `directorRunCommandService` stale 恢复：**真实回归**。旧 `DirectorCommandService.recoverStaleLeases` 只记录治理不执行；已按 81c1babe 设计委托给 `DirectorCommandLeaseService`（带 applyAction 分派）。
- `StorySettingsService`：`new NovelWorkflowService()` 顶层实例化与 `GenerationContextAssembler → storySettingsService` 形成循环 require，单进程测试下拿不到构造器；改为惰性创建。
- `chapterRuntimePipeline`（3 项）：章节生成改走流式 `llm.stream`，测试 LLM 工厂 mock 补齐 `stream`。
- `characterVisibleProfile` / `generationContextAssembler`：被 2026-06-05（f056815b）有意删除的旧文本合同（`buildCharactersContextText`、`supportingContextText` 大杂烩），删除/对齐过期断言。
- `directorDisplayStateBuilder`（2 项）：2026-07-15（d13c4b9a）新增「世界观准备」阶段使步骤索引 +1，断言改用新索引。

## 环境依赖（隔离运行同样失败，但原因是本机数据/服务缺失）

- `imageProviderReferences` 3 项：需要 DB 中存在 provider API key 记录；空库/新 worktree 会报 `Provider codex API key is not configured`。在 worktree 排查时先 `prisma migrate deploy` 并插入测试 key。
- `VoxCPM2 / IndexTTS / tts provider` 一组：依赖本机 18761 语音桥接或 ffmpeg。
- `auto director auto-approval audit / NovelExportService / BookAnalysis / NovelReferenceService` 等需要带历史数据的 dev 数据库。

## 诊断路径

1. 先 `node --test tests/<file>.test.js` 隔离复跑，确认不是套件内状态污染。
2. 隔离仍失败 → 看报错是否是 `table does not exist` / `not configured` / `ECONNREFUSED` → 环境类。
3. 是断言不等 / `is not a function` / `Cannot read properties of undefined` → 语义漂移类，进「待修」清单。
4. 修语义漂移时优先怀疑最近一次合并改了实现但漏改测试；用 `git log -S "<符号名>"` 定位改名点。
