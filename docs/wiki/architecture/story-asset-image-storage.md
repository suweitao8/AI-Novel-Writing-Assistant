# 故事资产状态图片不可变制品存储

## Background

角色、场景和道具的状态 id 只在资产内部有意义，`initial`、`受伤` 等 id 不是全局文件主键。旧实现把文件写到 `story-state-images/<stateId>/image.*`，不同资产生成同名状态时会覆盖同一个文件；数据库中的图片状态仍保留旧 URL，因此覆盖后无法判断哪张图属于哪个资产。

## Decision

图片文件和状态 JSON 指针分离：`StoryAssetImageArtifact` 记录每一次生成的制品、当前状态、所有权、文件 key、hash、大小、MIME 和生成批次；`statesJson.image.artifactId` 只指向当前可读制品。文件使用以下稳定层级：

```text
story-state-images/
  id-<novelId>/<kind>/id-<assetId>/id-<stateId>/generations/id-<generationId>/image.<ext>
```

生成前用包含四级所有权、长度编码且无分隔符歧义的 target key 取得持久 lease。生成结果先以独占 `.part` 文件写入，校验图片头、MIME、SHA-256 和字节数，再在同一目录原子改名。数据库事务同时完成状态 JSON CAS、制品 metadata 提交和 lease 释放；任一步失败都保留旧 `artifactId`，新文件最多成为可审计的 orphaned 制品。失败状态写回还会从 CAS 读到的最新状态中恢复当前可读指针，不能用慢任务开始时的旧快照覆盖后来提交的图片。

## Current Rule

- 正常资产图片路由优先读取资产所有权、状态 id 和当前 `artifactId` 都匹配的 committed 制品，并重新校验文件 metadata；当前制品缺失或损坏时，按最新优先顺序尝试同一 `novelId/kind/assetId/stateId` 下的其它 committed 制品，再尝试该资产自己的旧归属目录。
- 数据库行上的 `novelId/kind/assetId/stateId` 不是 `storageKey` 的可信证明；每个候选还必须与完整的目标路径（含 `generationId`、扩展名和 `generations` 层级）精确匹配。单个路径异常、越界或文件损坏只淘汰该候选，不能阻断更旧制品恢复。
- 正常读取不扫描或猜测共享 legacy 目录，不按裸 `stateId` 选择图片；找不到同一资产的制品和归属目录图片时才返回 missing/404，不能用其他资产的图片兜底。
- 制品恢复候选必须来自完整资产所有权范围；共享 `story-state-images/<stateId>` 永远不能作为正常路由的恢复来源，即使多个资产使用同名 `initial`。
- 稳定的状态图片 URL 必须禁止长时间缓存，因为 URL 不变而当前 artifactId 会变化。
- legacy `/:stateId` URL 只返回迁移提示（410），旧目录仅供审计工具使用。
- 状态表单保存必须保留服务端生成的 `image` 和 `voice` 运行时字段；生图期间保留旧 artifact pointer，成功后才切换。
- 生成失败只记录本次错误；已有图片时保留当前 `artifactId`、归属 URL 和生成时间，没有已有图片时不暴露 staging 制品指针。
- `status` 表示最近一次生成尝试，不能单独决定图片是否可用；只要保留了 URL 指针，资产卡、状态引用、分镜参考图和 3D 场景预览都继续使用最后可读图片，同时显示生成中/失败反馈。
- 关闭失败提示是独立的状态级 CAS 动作：客户端必须提交用户当时看到的完整 `error` 文本和该次生成的 `attemptId`，服务端只在两者仍完全匹配时删除 `error` 字段，不改变 `status`、`artifactId`、URL、生成时间或重试入口。旧数据没有 `attemptId` 时只按 `error` 做单次 CAS，发生并发冲突就停止而不重试，避免同文案的新一轮错误被旧提示误清掉。
- 生成锁的进程内 map 只能优化同进程请求，不能替代数据库 lease；key 必须包含项目、类型、资产和状态四级范围。
- lease 在长生成期间定时续期；generating/error 中间状态写入会在同一事务内条件触碰 staging 制品，lease 失效的旧任务不能回写状态，更不能把当前指针回滚到旧图。
- 资产列表展示生成状态时以有效的 `staging` lease 为跨进程事实来源：即使服务在取得 lease 后、写入 `statesJson.image.status=generating` 前重启，也要保留旧可读指针并投影为生成中；跨进程取消必须按当前 staging 制品和 target key fencing，不能要求状态快照已经是 generating。

## Migration and Recovery

迁移工具默认 dry-run，只报告 `migrate`、`ambiguous`、`missing`、`corrupt` 和 `already_committed`。只有生成时间与文件修改时间形成唯一正向证据时才可复制到新 generation；仅凭唯一资产或同名 stateId 不足以归属，歧义文件不自动绑定。apply 必须先验证 DB backup 和 storage backup，复制使用 `COPYFILE_EXCL`，迁移 generation key 由 legacy 文件内容稳定派生以支持重跑幂等，不删除旧文件、不覆盖已存在的新制品，并用 CAS 防止覆盖用户刚保存的状态。已存在的 artifact pointer 还要校验制品表所有权、committed 状态、路径和 hash。

如果 legacy 文件无法安全归属，资产状态被标记为缺失/错误，用户重新生成即可；如果 provider、写盘或数据库提交失败，旧制品仍然是当前图，新 generation 不会成为可读指针。

## Failure Modes

| 故障 | 结果 |
| --- | --- |
| 两个资产同时生成 `initial` | 目标锁和资产目录不同，两个制品并行且互不覆盖 |
| 同一资产重复生成 | 第二个请求得到 409；旧图继续可读 |
| 取得 lease 后服务在写入生成中快照前中断 | 列表按有效 lease 显示生成中；终止入口按 staging 制品回收锁，旧图指针仍保留 |
| provider 失败或请求取消 | staging 制品释放为 orphaned，最新可读 pointer 不变，用户仍可看到旧图并重试 |
| `.part` 写入中断 | final 文件不存在，读取返回 missing |
| CAS 冲突 | 事务回滚，旧状态/旧制品不变 |
| 当前 committed 文件缺失或损坏 | 在同一资产状态的历史 committed 制品中恢复；再尝试同一资产的旧归属目录 |
| legacy 同名文件无法确定归属 | 不自动绑定，报告 ambiguous，要求重新生成 |
| 文件被外部损坏 | hash/size/MIME 校验失败，读取返回 missing |

## Related Modules

- `server/src/modules/novel/story-settings/application/StoryAssetImageArtifactStore.ts`：路径、临时文件、原子改名和完整性校验。
- `server/src/modules/novel/story-settings/application/StoryAssetImageGenerationLock.ts`：持久目标 lease 和制品生命周期。
- `server/src/modules/novel/story-settings/application/StoryAssetImageRecoveryPolicy.ts`：失败指针保留和同一资产历史制品恢复排序规则。
- `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`：角色/场景/道具状态图生成、artifact-first 读取、事务提交和失败提示关闭。
- `server/src/services/image/runtime/runner.ts`：通用图片运行时的制品 session 钩子；旧适配器仍可使用固定路径，但故事状态图必须使用新钩子。
- `server/src/modules/novel/story-settings/application/StoryAssetImageAudit.ts` 与 `server/scripts/audit-story-asset-images.cjs`：dry-run 审计和备份保护的迁移入口。

## Source Documents

- `docs/superpowers/specs/2026-08-23-story-asset-image-immutable-storage-design.md`
- `docs/superpowers/plans/2026-08-23-story-asset-image-immutable-storage-plan.md`
