# Story Asset Immutable Image Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将角色、场景、道具及其状态图片改为按项目、资产、状态和生成批次隔离的不可变制品存储，保证同名状态不会互相覆盖，生成失败不会丢失旧图，并为既有 legacy 文件提供可审计、可回滚的迁移路径。

**Architecture:** `StoryAssetImageArtifact` 是文件元数据、当前指针和生成历史的权威记录；`statesJson.image.artifactId` 只保存当前制品指针。生成过程先取得目标锁，在独立 generation 目录写入 `.part` 临时文件，校验 MIME、SHA-256 和字节数后同文件系统原子改名，再通过数据库事务/CAS 同步提交制品和状态指针。正常读取只按 artifactId 和资产所有权解析，不再按 `stateId` 跨资产猜测 legacy 文件；旧目录仅由 dry-run 审计/迁移工具访问。

**Tech Stack:** TypeScript, Prisma (SQLite/Postgres schemas), Node.js tests, pnpm, SHA-256 hashing, filesystem atomic rename, Vitest-compatible Node contract tests.

---

## Task 1: 固化工作流规则、共享类型和数据库模型

**Files:** `AGENTS.md`, `shared/types/novelReferenceExtraction.ts`, `server/src/prisma/schema.prisma`, `server/src/prisma/schema.sqlite.prisma`, `server/src/prisma/migrations/**`, `server/src/prisma/migrations.sqlite/**`, `server/tests/storyAssetImageArtifactContract.test.js`

- [ ] 先写失败的契约测试：检查 `StoryAssetStateImage` 可携带可选 `artifactId`；两套 Prisma schema 都声明 `StoryAssetImageArtifact`、唯一 `storageKey`、可恢复的 `activeLockKey` 和 `Novel` 关系；SQLite/Postgres migration 都创建对应表和索引。
- [ ] 运行 `node server/tests/storyAssetImageArtifactContract.test.js`，确认测试因模型/契约尚不存在而失败。
- [ ] 在 `AGENTS.md` 写入并保留规则：提交设计文档即视为默认批准，直接进入实现、验证和收尾；只有用户明确要求仅输出方案、暂停或变更范围时才停止。
- [ ] 扩展共享类型与校验器，保持旧记录兼容：没有 `artifactId` 的旧 `image` 记录仍可读取，但不再触发跨资产 legacy fallback。
- [ ] 在两套 schema 增加制品模型、`Novel.storyAssetImageArtifacts` 关系、状态/锁字段、版本字段、时间字段和必要索引。
- [ ] 添加不删除旧数据的 SQLite/Postgres migration；不在开发数据库上执行 reset、truncate、drop 或删除式迁移。
- [ ] 重新运行契约测试和 `pnpm prisma:generate`，确认 Prisma client 与类型生成通过。

## Task 2: 以测试先行实现不可变制品存储

**Files:** `server/src/modules/novel/story-settings/application/StoryAssetImageArtifactStore.ts`, `server/src/modules/novel/story-settings/application/StoryAssetStateImageStorage.ts`, `server/tests/storyAssetImageArtifactStore.test.js`

- [ ] 先写失败测试：两个资产都使用 `initial` 状态时必须生成不同 storage key 和不同目录；写入中断不能留下可被正常读取的 final 文件；成功写入的 SHA-256、字节数和扩展名必须可验证。
- [ ] 运行该测试确认红灯。
- [ ] 实现按 `novelId/kind/assetId/stateId/generations/generationId` 生成路径和 storage key 的制品存储；旧路径只作为显式 legacy 诊断入口。
- [ ] 实现 `.part` 临时文件的独占写入、MIME/扩展名校验、SHA-256/byteSize 计算、同盘原子 rename 和最终文件完整性检查；不得清理或覆盖旧 generation。
- [ ] 让 storage 层提供制品创建、完成、失败标记、当前制品解析和文件存在性校验接口，便于服务层注入时钟/根目录完成测试。
- [ ] 重新运行存储测试和服务端构建，确认测试转绿。

## Task 3: 实现持久化目标锁和状态 CAS 提交

**Files:** `server/src/modules/novel/story-settings/application/StoryAssetImageGenerationLock.ts`, `server/src/modules/novel/story-settings/application/StorySettingsStatePolicy.ts`, `server/tests/storyAssetImageGenerationLock.test.js`, `server/tests/storyAssetImageStateCas.test.js`

- [ ] 先写失败测试：同一 `novelId/kind/assetId/stateId` 的并发生成只能有一个 lease；不同资产的相同 `initial` 可以并行；过期 lease 可安全回收；CAS 冲突不能替换旧 artifactId。
- [ ] 运行测试确认红灯。
- [ ] 用目标键 `<novelId>:<kind>:<assetId>:<stateId>` 实现持久 lease；利用 `activeLockKey` 唯一约束和 lease expiration 处理跨进程冲突，进程内 map 只作为性能优化且必须包含 `novelId`。
- [ ] 扩展状态 JSON CAS 写入能力，使 artifact 状态、当前指针和锁释放在同一 Prisma transaction 中提交；发生冲突或异常时保留旧指针并将新制品标记为 orphaned/staging，不删除旧文件。
- [ ] 保持现有状态 JSON 的规范化、重试和兼容行为；只在制品生成路径使用新事务辅助能力。
- [ ] 运行锁/CAS 测试、Prisma 生成和服务端 build。

## Task 4: 接入通用图片运行时的制品生命周期

**Files:** `server/src/services/image/runtime/types.ts`, `server/src/services/image/runtime/runner.ts`, `server/src/services/image/runtime/utils.ts`, `server/tests/imageRuntimeArtifact.test.js`

- [ ] 先写失败测试：制品适配器必须使用唯一 generation 文件；成功顺序必须是写完并校验文件后再提交 done 状态；provider 失败、写入失败或提交失败都不能清空旧状态。
- [ ] 运行测试确认红灯。
- [ ] 为 `ImageTargetAdapter` 增加可选 artifact session/commit/abort 生命周期；没有 artifact hook 的既有目标保持兼容。
- [ ] 将 runner 的固定 `diskPath` 写入改为可注入的 generation path，并把状态完成提交交给 artifact adapter；改造写入工具为独占临时文件 + 原子 rename，避免同一固定路径被覆盖。
- [ ] 统一清理策略：不可变制品路径禁止 `cleanupOtherExts` 删除历史 generation；旧适配器只保留原有行为。
- [ ] 运行运行时契约测试与 `pnpm --filter @ai-novel/server build`。

## Task 5: 接入故事资产状态图片服务

**Files:** `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`, `server/src/modules/novel/story-settings/application/StoryAssetStateImageStorage.ts`, `server/tests/storyAssetStateImage.test.js`, `server/tests/storyAssetImageCollisionRegression.test.js`

- [ ] 先写失败回归测试：叶竹和血角兽都为 `initial` 时生成后各自保持各自图片；重新生成其中一个不会改变另一个；失败生成仍可读旧图片；生成中不会把旧图误显示成别的资产。
- [ ] 运行测试确认红灯。
- [ ] 让状态图片服务使用制品存储、目标锁和事务/CAS 提交；`inFlightGenerations` 键包含 `novelId/kind/assetId/stateId`。
- [ ] 生成期间保留旧 `artifactId`，成功后只切换当前指针；异常只记录新制品失败状态并释放 lease。
- [ ] 将正常 URL 解析改为 artifact-first，按当前资产所有权校验；移除按 `stateId` 命中旧目录的隐式 fallback。保留独立 legacy 诊断方法供迁移工具调用。
- [ ] 更新 `pruneStateImage`、状态规范化及所有调用方，确保 artifactId 不被清洗丢失。
- [ ] 运行回归测试、服务端 build 和相关已有 story settings 测试。

## Task 6: 修复路由、投影和下游图片消费者的缺失语义

**Files:** `server/src/modules/novel/story-settings/http/storySettingsRoutes.ts`, `server/src/modules/novel/story-settings/application/StorySettingsProjection.ts`, `server/src/modules/novel/story-settings/application/StorySettingsService.ts`, `server/src/services/drama/**`, `server/tests/storyAssetImageRouteContracts.test.js`

- [ ] 先写失败契约测试：拥有者作用域路由只能解析当前资产制品；legacy 路由只能返回诊断/迁移信息，不能正常作为资产图片；缺失制品返回明确 missing 状态或 404，不返回另一个资产的图。
- [ ] 运行测试确认红灯。
- [ ] 接通当前制品解析到故事资产卡片、角色/场景/道具投影和需要图片的剧情下游；缺失时保留显式缺失状态，不以错误图片填充。
- [ ] 清点所有资产卡片消费者，统一使用同一个 preview URL/状态字段；不增加 UI fallback 到共享固定路径。
- [ ] 运行路由契约测试和 TypeScript build；按项目规则，UI 手工浏览器验收留给用户，不把未执行的浏览器检查写成已通过。

## Task 7: 提供 dry-run 优先的 legacy 审计和迁移工具

**Files:** `server/src/modules/novel/story-settings/application/StoryAssetImageAudit.ts`, `server/scripts/audit-story-asset-images.cjs`, `server/tests/storyAssetImageAudit.test.js`, `docs/wiki/architecture/story-asset-image-storage.md`

- [ ] 先写失败测试：默认 dry-run 不写数据库/文件；只有传入并验证非空可读的 DB/storage backup 才允许 apply；唯一可确定归属的 legacy 文件复制到新 generation；同一 `initial` 的歧义文件不自动分配；重复执行幂等。
- [ ] 运行测试确认红灯。
- [ ] 实现扫描报告：按项目、资产、状态列出当前指针、文件存在性、hash/size、legacy 冲突、缺失和建议动作；默认只输出报告。
- [ ] 实现 apply 前置检查和备份校验；迁移只复制/创建新制品并写审计结果，不删除 legacy、不覆盖已有新制品、不把歧义文件绑定到资产；叶竹缺失标记为 missing/需重新生成，血角兽按证据单独迁移。
- [ ] 写稳定架构 wiki，记录背景、决策、当前规则、失败模式、模块边界、迁移和恢复路径，不写成变更日志。
- [ ] 运行审计测试，并在临时 fixture/数据库副本上执行一次 dry-run；不对真实开发库执行 apply，除非另行完成备份与恢复校验。

## Task 8: 收口、发布记录和分支交付

**Files:** `docs/releases/release-notes.md`, `README.md`（仅当发布更新要求）、implementation branch files

- [ ] 使用 `readme-release-updater` 检查 Git 范围；若用户可见行为发生变化，更新 release notes/README 最新更新；若最终 diff 只有内部存储与诊断能力，明确记录跳过理由。
- [ ] 运行针对性 Node tests、Prisma generate、服务端 build/typecheck，并检查 `git diff --check`、秘密扫描和 staged scope。
- [ ] 复核迁移安全条件：未执行 destructive command；未覆盖旧文件；备份要求写入工具而不是依赖人工记忆。
- [ ] 检查工作树只包含本任务文件，使用 `git add <明确路径>` 和 `git commit -s` 提交；不提交主工作区其他会话的变更。
- [ ] 输出最终证据：测试命令与结果、构建结果、未执行的真实库迁移/浏览器验收、分支和待集成状态。

## Review Checklist

- [ ] 设计约束没有被实现层 fallback 绕开：正常读取永远不按 `stateId` 猜图。
- [ ] 相同 stateId 的不同资产没有共享 final path、锁或进程内 key。
- [ ] 写文件失败、provider 失败、数据库冲突和进程重启都不会清空旧 current pointer。
- [ ] legacy 迁移默认 dry-run，歧义不自动归属，apply 需要可验证备份。
- [ ] AGENTS 规则、wiki、release note 和实现行为一致。
