# 开发环境 SQLite Schema 漂移

## Background

开发服务同时依赖 Prisma schema、生成的 Prisma Client 和实际 SQLite 文件。`ensure-dev-prisma.cjs` 只在长驻 API 父进程启动时执行一次；`ts-node-dev` 子进程热重载时，应用代码可能已经读取了新字段，而 `server/dev.db` 仍是旧 schema。旧开发库又可能没有 `_prisma_migrations`，因此单看 migration 记录不能判断实际表结构。

典型表现是 Prisma 查询报某个新字段不存在，例如 `main.Character.actorKind does not exist`。这不是角色数据被删除，而是代码与数据库 schema 不在同一版本。

## Decision

启动阶段由 `ensureRuntimeDatabaseReady()` 负责开发 SQLite 的最后一道 schema 就绪检查：

- Desktop 运行时继续执行 SQLite 运行时迁移。
- Web 运行时仅在非生产环境且有效 provider 为 SQLite 时执行。
- 生产 Web 不自动改数据库；PostgreSQL 也不进入 SQLite 迁移路径。
- 已有旧表通过迁移 SQL 的表、索引和列满足性登记已完成迁移；缺失的加法式迁移才执行。
- 索引满足性不能只比较历史名称：后续 migration 可能在复合唯一索引中增加字段并换名；旧库已有同表、同唯一性且覆盖原字段的替代索引时，应视为该历史索引已满足。
- 迁移完成后再执行兼容性 column backfill，所有操作都必须保留原数据。

这样，首次启动与每次 API 热重载都使用同一条受控路径，避免只依赖一次性 `prisma db push`。

## Current Rule

排查时按“进程 → 数据库路径 → 实际列 → migration → 查询入口”顺序确认：

1. 确认提供 `3100` 的进程属于当前 checkout，并请求 `/api/health`。
2. 读取当前 checkout 的 `server/.env` 和 `server/src/config/database.ts`，确认 `DATABASE_URL` 实际指向的 SQLite 文件。
3. 对目标库只读执行 `PRAGMA table_info("Character")`，不要只看 Prisma schema 或生成客户端。
4. 检查 `server/src/prisma/migrations.sqlite/` 是否包含对应 migration；当前角色模型字段由 `20260903090000_character_model_profile` 添加。
5. 通过角色列表的真实 API 查询复现/确认，不用“页面能打开”代替数据链路验证。

修复当前开发库前必须先生成独立备份，并检查备份文件存在、大小合理且 `PRAGMA integrity_check` 返回 `ok`。允许使用现有运行时迁移补齐缺列；禁止使用 `db reset`、删除 `dev.db`、`--accept-data-loss` 或未经备份的手工改表。

## Example

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3100
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3100/api/health
Get-Content server/.env
```

需要确认数据时，用只读 SQLite 客户端查询目标文件的 `sqlite_master`、`PRAGMA table_info("Character")` 和 `_prisma_migrations`；不要把 worktree 的数据库路径误当成主工作区的 `server/dev.db`。

## Failure Modes

- 只重新加载 Vite 页面：客户端可以继续响应，但不会补齐 API 使用的数据库列。
- 只检查 `schema.sqlite.prisma`：schema 正确不代表实际 `dev.db` 已同步。
- 只运行一次 `prisma db push`：长驻开发 API 后续热重载仍可能再次产生漂移。
- API 使用了另一个 checkout 或另一个 `DATABASE_URL`：即使目标库已修复，当前页面仍会继续报旧错误。
- 用破坏性 reset 掩盖 schema 漂移：会损失角色、资产和项目数据，且无法说明真正根因。

## Related Modules

- `server/src/db/runtimeMigrations.ts`
- `server/scripts/ensure-dev-prisma.cjs`
- `server/src/config/database.ts`
- `server/src/runtime/appPaths.ts`
- `server/src/modules/novel/story-settings/application/StorySettingsService.ts`
- `server/src/prisma/migrations.sqlite/20260903090000_character_model_profile/migration.sql`
- `server/src/app.ts`

## Source Documents

- `docs/superpowers/specs/2026-09-04-character-schema-drift-design.md`
- `docs/superpowers/plans/2026-09-04-character-schema-drift.md`
