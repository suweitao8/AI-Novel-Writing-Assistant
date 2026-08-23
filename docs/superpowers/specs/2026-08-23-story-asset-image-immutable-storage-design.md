# 故事资产图片不可覆盖存储设计

## Background

角色、场景和道具的状态图片当前由 `StoryAssetStateImageService` 生成，图片文件保存到服务端文件系统，资产状态和图片 URL 保存到资产表的 `statesJson`。此前旧路径只使用 `stateId` 作为目录名，例如 `story-state-images/initial/image.png`。

状态 ID 只在单个资产内部有意义，不是全局唯一 ID。叶竹和血角兽都使用 `initial` 状态时，后生成的血角兽图片覆盖了叶竹的文件；数据库仍分别保存两条 `done` 元数据，因此形成了“数据库有图、文件实际属于另一个资产”的不一致。

当前代码已经把新写入路径改为 `novelId/kind/assetId/stateId` 归属路径，并对旧文件增加了时间保护。但这只能阻止继续把血角兽旧文件返回给叶竹，不能恢复已经覆盖的字节，也不能解决同一目标并发生成时的竞态。需要把图片文件从“可覆盖的当前文件”改成“不可变的版本产物”。

## Goals

- 不同小说、资产类型、资产和状态之间永远不能共享图片文件。
- 同一资产同一状态重新生成时不覆盖旧版本，保留可恢复历史。
- 同一目标的并发生成只能有一个有效任务，跨进程也有效。
- 只有文件已经完整落盘并通过校验，数据库才允许把它设为当前图片。
- 生成失败、取消、服务重启、数据库提交冲突或文件损坏都不能破坏旧的当前图片。
- 存量旧图片迁移可审计、可重复执行，不自动把有歧义的图片分配给错误资产。
- 图片卡片遇到缺失或损坏时明确显示缺失状态，不能回退到其他资产图片。

## Non-goals

- 本设计不重新生成叶竹图片，也不在设计阶段修改现有数据库或删除旧图片。
- 本设计不改变角色四视图、场景全景或道具图片的生成提示词和预览裁切规则。
- 本设计不把图片二进制写进 SQLite；二进制仍保存在文件存储中，数据库保存可校验的产物清单和当前指针。
- 本设计第一阶段覆盖故事资产状态图（角色、场景、道具）；其他生图入口在同一写入器稳定后逐步接入。

## Decision

采用“不可变图片产物 + 数据库当前版本指针 + 目标级持久化锁”的方案。

### 1. 产物目录和归属

新文件统一保存到以下目录：

```text
server/storage/generated-images/story-state-images/
  id-<novelId>/
    <kind>/
      id-<assetId>/
        id-<stateId>/
          generations/
            <generationId>/
              image.png
```

`generationId` 由服务端生成，不能来自用户输入或状态名称。生成完成后永远只新增自己的目录，不再写入状态目录下固定名称的 `image.png`，也不再执行删除其他版本扩展名的清理逻辑。

路径生成继续使用统一的 `storageSegment`，并在读取时校验最终路径仍位于生成图片根目录内。HTTP 路由不接受任意文件路径，只能根据 `novelId/kind/assetId/stateId` 查当前产物清单后读取服务端生成的 `storageKey`。

### 2. 图片产物清单

新增 `StoryAssetImageArtifact` 持久化模型，作为文件和资产状态之间的明确归属层。字段职责如下：

| 字段 | 作用 |
| --- | --- |
| `id` | 产物记录 ID，也是历史版本引用 ID |
| `novelId`、`kind`、`assetId`、`stateId` | 资产归属四元组 |
| `storageKey` | 相对生成图片根目录的唯一文件键，设置唯一约束 |
| `status` | `staging`、`committed`、`orphaned`、`missing` |
| `activeLockKey` | 生成中的目标锁键，可为空并设置唯一约束 |
| `leaseExpiresAt` | 服务重启后识别失效锁的租约时间 |
| `version` | 同一资产状态下的单调版本号 |
| `mimeType`、`extension` | 文件类型 |
| `sha256`、`byteSize` | 文件完整性和大小校验 |
| `sourceArtifactId` | 记录参考或派生自哪个版本，便于溯源 |
| `createdAt`、`committedAt`、`updatedAt` | 生命周期审计时间 |

唯一约束至少包括 `storageKey` 和非空的 `activeLockKey`；索引覆盖 `novelId/kind/assetId/stateId/status`。数据库迁移只新增表和索引，不重置数据库，不删除现有状态字段。

资产 `statesJson.image` 增加可选的当前 `artifactId`。现有 `status`、`url`、`prompt`、`provider`、`generatedAt` 等字段继续兼容；文件哈希、大小和历史版本以产物清单为权威来源，避免在多个 JSON 字段中复制可变文件路径。历史版本通过产物清单按资产四元组查询，不因重新生成而丢弃。

### 3. 当前图和历史图的读取

- 资产 DTO 继续返回资产归属明确的状态图片 URL，并通过 `artifactId` 或生成时间进行缓存刷新。
- 当前图片接口先查询该资产状态的 `artifactId`，再确认产物状态为 `committed`，最后读取对应 `storageKey`。
- 读取时文件不存在，返回缺失结果，不尝试按 `stateId` 去其他资产目录搜索。
- 读取时不信任数据库中历史遗留的旧 URL；投影层统一生成新的归属 URL。
- 历史版本由独立的版本查询方法读取，必须同时校验资产四元组和产物 ID，不能只凭一个 `initial` 查找。
- 旧的 `/state-images/:stateId` 兼容入口只供迁移和诊断使用，正常资产卡片、状态编辑器、参考图和分镜上下文均不得调用它。

## Generation and Commit Flow

### 1. 创建任务并获取目标锁

目标锁键为：

```text
<novelId>:<kind>:<assetId>:<stateId>
```

生成开始时在数据库中创建一条 `staging` 产物记录并写入 `activeLockKey`。同一锁键已有未过期记录时，第二次请求返回“该状态正在生成中”，不会启动第二个 Provider 请求。内存中的 `AbortController` 仍用于当前进程的取消操作，但不再承担跨进程互斥职责。

服务重启后，租约未过期的任务仍被视为活动任务；租约过期的 `staging` 任务可以被审计器标记为 `orphaned`，释放锁后再重新生成。取消操作只结束当前任务并释放锁，不改变旧的当前产物指针。

### 2. 独立临时文件和原子落盘

图片 Provider 返回结果后：

1. 将图片写入当前 `generationId` 专属目录下的唯一临时文件，例如 `image.png.part`。
2. 使用独占创建，避免同一个临时路径被重复写入。
3. 写入完成后计算 SHA-256、大小和 MIME 类型，并确认文件可读取。
4. 在同一文件系统内将临时文件原子 rename 为 `image.png`。
5. 只有上述步骤全部成功，才允许进入数据库提交阶段。

旧版本文件从不参与写入，也不参与扩展名清理。生成失败时只处理本次临时文件或本次产物记录，绝不删除旧版本。

### 3. 数据库提交

文件完成后，在一个数据库事务内完成以下操作：

- 确认当前生成记录仍持有目标锁；
- 确认资产状态 JSON 没有被其他保存操作改写，继续使用现有 CAS 语义；
- 将产物记录从 `staging` 更新为 `committed`；
- 更新状态 JSON 的 `image.artifactId`、`status`、`url` 和生成元数据；
- 将旧的当前产物保留为历史版本；
- 清空 `activeLockKey` 并记录 `committedAt`。

如果 CAS 或事务提交失败，新文件不会成为当前图，旧指针保持不变；未被引用的新文件由巡检识别为孤儿产物。这样即使进程在文件落盘和数据库提交之间崩溃，也只会留下可回收的额外文件，不会破坏用户正在使用的旧图。

## Migration and Recovery

### 1. 迁移前保护

迁移或任何会改写存量状态的命令必须先获得明确执行授权，并要求提供数据库备份路径和图片存储快照路径。命令需要验证备份文件存在、大小非零且可以读取；缺少备份时直接拒绝执行。

本次修复不删除旧目录、不覆盖旧文件。迁移使用复制而非移动，旧目录在确认稳定前保持只读。

### 2. Dry-run 清单

迁移工具先只读扫描：

- 资产表中所有有图片状态的记录；
- 新归属目录和旧共享目录中的实际文件；
- 旧文件修改时间与 `generatedAt` 的差异；
- 文件哈希、大小和 MIME 类型；
- 多个资产是否共享同一个旧 `stateId` 路径。

输出必须区分 `unique`、`ambiguous`、`missing`、`stale` 和 `already-migrated`，并支持重复执行而不产生第二份迁移记录。

### 3. 迁移规则

- 只有能唯一匹配资产四元组、文件存在且校验通过的旧图，才复制为一个新的 committed 产物。
- 多个资产共用同一个旧路径时禁止自动复制给所有资产。
- 叶竹和血角兽的 `initial` 旧文件只能依据生成时间和图片内容归属于血角兽；叶竹状态保留为缺失，等待重新生成。
- 数据库显示 `done` 但找不到文件的记录不伪造成功状态；迁移报告标记为 `missing`，状态服务返回明确的重新生成入口。
- 旧 URL 不作为资产归属证据，迁移完成后所有新的 DTO 都生成归属 URL。

## Audit and Runtime Protection

`StoryAssetImageAudit` 提供手动命令和服务启动后的轻量检查，至少覆盖：

- `done` 状态是否指向存在且 committed 的产物；
- 当前产物文件是否存在、大小是否一致；
- 定期抽查或显式审计时 SHA-256 是否一致；
- `storageKey` 是否唯一且没有越出生成根目录；
- 是否仍有状态返回旧共享 URL；
- 是否存在过期 staging 锁、孤儿产物或 missing 产物；
- 同一目标是否同时存在多个活动锁。

巡检不会自动删除文件。孤儿文件先进入 `orphaned` 状态并保留恢复窗口；删除属于独立的、需要备份和授权的清理操作。

卡片和详情读取遇到 missing、文件不存在或校验失败时，只显示“图片缺失，请重新生成”及对应操作，不按名称、状态标签或旧 URL 猜测其他图片。

## Module Boundaries

- `server/src/modules/novel/story-settings/application/StoryAssetImageArtifactStore.ts`：产物路径、临时文件、原子 rename、哈希和元数据。
- `server/src/modules/novel/story-settings/application/StoryAssetImageGenerationLock.ts`：目标锁、租约、取消和重启恢复。
- `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`：角色/场景/道具状态图业务流程和状态指针提交。
- `server/src/modules/novel/story-settings/application/StoryAssetImageAudit.ts`：dry-run、迁移清单、巡检和孤儿报告。
- `server/src/modules/novel/story-settings/application/StoryAssetStateImageStorage.ts`：只保留归属路径和 URL 生成，不再承担旧共享文件的正常回退。
- `server/src/services/image/runtime/`：在故事资产路径稳定后接入通用不可变写入器；其他入口逐步迁移，不能继续新增固定文件覆盖写入。

生成服务不直接拼接其他模块的物理路径；所有消费者通过产物 Store 或稳定 facade 读取。这样可以让故事资产状态图、旧版场景/道具图和后续其他入口逐步共享同一套不可覆盖边界。

## Testing and Acceptance

### Unit and contract tests

- 相同 `initial` 在不同小说、类型、资产和状态下生成不同 `storageKey`。
- `generationId` 永远不会复用旧文件路径。
- 旧共享路径不会被正常解析器作为其他资产的回退来源。
- MIME、大小和 SHA-256 元数据必须随 committed 产物保存。
- 目标锁键包含完整资产归属，重复锁请求被拒绝，租约过期后可以恢复。

### Integration tests

- 叶竹和血角兽同时生成 `initial`，两张图片分别可读且指针不串线。
- 同一资产同时发起两次生成，只有一个任务执行，旧图和最终指针保持一致。
- Provider 失败、用户取消或服务重启时，旧图仍然可读。
- 文件已写入但数据库事务失败时，旧图仍是当前图，孤儿产物可被审计。
- 当前文件被外部改坏或删除时，接口返回缺失/损坏状态，不返回其他资产图片。
- 迁移脚本重复执行不会重复创建产物；歧义旧文件不会被自动分配。

### Acceptance gate

只有以下条件同时满足才允许结束实现：

1. 所有新的故事资产状态图写入都经过不可变产物 Store。
2. 正常读取链路不再使用共享 `stateId` 文件回退。
3. 数据库和文件一致性测试通过。
4. 迁移 dry-run 有完整报告，备份和恢复检查有明确输出。
5. 叶竹缺失图可以安全重新生成，且不会影响血角兽或其他资产。
6. 旧目录没有被未经授权删除，工作区和数据库状态可回滚。

## Rollout

1. 先新增模型、类型、产物 Store、锁服务和测试，保持现有图片只读。
2. 切换故事资产状态图的新写入路径，正常读取优先使用产物清单。
3. 在备份验证后运行迁移 dry-run，人工确认歧义清单。
4. 复制唯一归属旧图，保留共享旧目录并切换所有 DTO 到新 URL。
5. 将缺失资产列为可操作的重新生成任务，逐个验证资产归属。
6. 运行连续巡检和并发/故障测试。
7. 把相同的不可变写入器推广到其他图片入口。
8. 旧目录清理另立任务，必须有新的备份、恢复验证和明确授权。

本设计只描述防覆盖和可恢复性，不包含本次叶竹图片的生成操作；设计文档提交本身不产生用户可见产品变化，因此不更新发布说明。


