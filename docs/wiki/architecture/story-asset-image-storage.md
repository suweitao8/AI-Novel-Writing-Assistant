# 故事资产状态图片不可变制品存储

## Background

角色、场景和道具的状态 id 只在资产内部有意义，`initial`、`受伤` 等 id 不是全局文件主键。旧实现把文件写到 `story-state-images/<stateId>/image.*`，不同资产生成同名状态时会覆盖同一个文件；数据库中的图片状态仍保留旧 URL，因此覆盖后无法判断哪张图属于哪个资产。

## Decision

图片文件和状态 JSON 指针分离：`StoryAssetImageArtifact` 记录每一次生成的制品、当前状态、所有权、文件 key、hash、大小、MIME 和生成批次；`statesJson.image.artifactId` 只指向当前可读制品。文件使用以下稳定层级：

```text
story-state-images/
  id-<novelId>/<kind>/id-<assetId>/id-<stateId>/generations/id-<generationId>/image.<ext>
```

生成前用包含四级所有权、长度编码且无分隔符歧义的 target key 取得持久 lease。生成结果先以独占 `.part` 文件写入，校验图片头、MIME、SHA-256 和字节数，再在同一目录原子改名。数据库事务同时完成状态 JSON CAS、制品 metadata 提交和 lease 释放；任一步失败都保留旧 `artifactId`，新文件最多成为可审计的 orphaned 制品。

## Current Rule

- 正常资产图片路由只接受资产所有权、状态 id 和当前 `artifactId` 都匹配的 committed 制品，并重新校验文件 metadata。
- 正常读取不扫描或猜测 legacy 目录，不按 `stateId` 选择图片；找不到当前制品返回 missing/404，不能用其他资产的图片兜底。
- 稳定的状态图片 URL 必须禁止长时间缓存，因为 URL 不变而当前 artifactId 会变化。
- legacy `/:stateId` URL 只返回迁移提示（410），旧目录仅供审计工具使用。
- 状态表单保存必须保留服务端生成的 `image` 和 `voice` 运行时字段；生图期间保留旧 artifact pointer，成功后才切换。
- 生成锁的进程内 map 只能优化同进程请求，不能替代数据库 lease；key 必须包含项目、类型、资产和状态四级范围。
- lease 在长生成期间定时续期；generating/error 中间状态写入会在同一事务内条件触碰 staging 制品，lease 失效的旧任务不能回写状态，更不能把当前指针回滚到旧图。

## Migration and Recovery

迁移工具默认 dry-run，只报告 `migrate`、`ambiguous`、`missing`、`corrupt` 和 `already_committed`。只有生成时间与文件修改时间形成唯一正向证据时才可复制到新 generation；仅凭唯一资产或同名 stateId 不足以归属，歧义文件不自动绑定。apply 必须先验证 DB backup 和 storage backup，复制使用 `COPYFILE_EXCL`，迁移 generation key 由 legacy 文件内容稳定派生以支持重跑幂等，不删除旧文件、不覆盖已存在的新制品，并用 CAS 防止覆盖用户刚保存的状态。已存在的 artifact pointer 还要校验制品表所有权、committed 状态、路径和 hash。

如果 legacy 文件无法安全归属，资产状态被标记为缺失/错误，用户重新生成即可；如果 provider、写盘或数据库提交失败，旧制品仍然是当前图，新 generation 不会成为可读指针。

## Failure Modes

| 故障 | 结果 |
| --- | --- |
| 两个资产同时生成 `initial` | 目标锁和资产目录不同，两个制品并行且互不覆盖 |
| 同一资产重复生成 | 第二个请求得到 409；旧图继续可读 |
| provider 失败或请求取消 | staging 制品释放为 orphaned，旧 pointer 不变 |
| `.part` 写入中断 | final 文件不存在，读取返回 missing |
| CAS 冲突 | 事务回滚，旧状态/旧制品不变 |
| legacy 同名文件无法确定归属 | 不自动绑定，报告 ambiguous，要求重新生成 |
| 文件被外部损坏 | hash/size/MIME 校验失败，读取返回 missing |

## Related Modules

- `server/src/modules/novel/story-settings/application/StoryAssetImageArtifactStore.ts`：路径、临时文件、原子改名和完整性校验。
- `server/src/modules/novel/story-settings/application/StoryAssetImageGenerationLock.ts`：持久目标 lease 和制品生命周期。
- `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`：角色/场景/道具状态图生成、artifact-first 读取和事务提交。
- `server/src/services/image/runtime/runner.ts`：通用图片运行时的制品 session 钩子；旧适配器仍可使用固定路径，但故事状态图必须使用新钩子。
- `server/src/modules/novel/story-settings/application/StoryAssetImageAudit.ts` 与 `server/scripts/audit-story-asset-images.cjs`：dry-run 审计和备份保护的迁移入口。

## Source Documents

- `docs/superpowers/specs/2026-08-23-story-asset-image-immutable-storage-design.md`
- `docs/superpowers/plans/2026-08-23-story-asset-image-immutable-storage-plan.md`
