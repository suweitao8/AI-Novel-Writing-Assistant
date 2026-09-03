# 开发环境 SQLite Schema 漂移自愈设计

## 背景

`Character.actorKind` 已经进入 Prisma schema 和 SQLite migration，但现有开发数据库由启动前的一次性 `prisma db push` 维护，数据库本身没有 `_prisma_migrations` 历史。长驻的 `ts-node-dev` 只会在父进程启动时执行一次这段准备逻辑；schema 后续变化触发子进程热重载时，应用代码会先于数据库同步使用新字段，于是 `Character.actorKind does not exist`。

## 决策

把已有的幂等运行时 SQLite migration 入口扩展到“非生产 Web 开发模式”。应用启动时继续调用同一个 `ensureRuntimeDatabaseReady()`：

1. 桌面运行时保持现有行为。
2. Web 运行时只有在 `NODE_ENV !== production` 且有效数据库 provider 为 SQLite 时执行；生产 Web 和 PostgreSQL 不由应用自动改 schema。
3. 通过现有 migration 目录、schema 满足性检测和 column backfill 修复漂移；已经存在但没有 migration 记录的旧表只补登记，不重复执行。
4. 只允许迁移文件中的幂等/加法式变更，不使用 reset、drop、truncate 或 `--accept-data-loss`。

这样，首次开发启动和每次 `ts-node-dev` 子进程重载都经过同一条数据库就绪检查，避免“代码先热更新、数据库没跟上”的窗口。

## 验收标准

- Web + development + SQLite 的临时旧库缺少 `Character.actorKind/bodyBuild` 时，调用就绪检查后两列存在、默认值可用，且重复调用不会报错或重复加列。
- Desktop 既有运行时迁移测试继续通过。
- Web + production 或 PostgreSQL 不会进入 SQLite 迁移路径。
- 当前 `server/dev.db` 在备份并完成完整性检查后补齐缺失列，`/api/health` 和角色列表查询不再触发该 Prisma 列错误。

## 非目标

- 不把生产 Web 数据库迁移责任转移给应用启动。
- 不把 `prisma db push` 改成运行时业务逻辑。
- 不清理或重建现有角色数据。
