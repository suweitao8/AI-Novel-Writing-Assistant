# Character Schema 漂移修复实施计划

## 目标

修复开发服务使用新 Prisma 字段而 SQLite `dev.db` 未同步的问题，并让后续开发 schema 变更在启动/热重载时经过受控的 SQLite 运行时迁移检查。

## 实施步骤

### 1. 先补回归测试

- 在 `server/tests/runtimeMigrations.test.js` 增加 Web 开发 SQLite 场景。
- 使用临时数据库构造缺少 `Character.actorKind/bodyBuild` 的旧 schema，验证首次调用补齐列、默认值和 migration 记录，第二次调用保持幂等。
- 增加生产 Web/非 SQLite 不执行该路径的边界断言（如现有配置解析适合直接覆盖）。
- 先编译并运行新增测试，确认现状会失败，再实现修复。

### 2. 扩展运行时迁移入口

- 修改 `server/src/db/runtimeMigrations.ts`，将执行条件收敛为：桌面模式，或非生产 Web 模式下的有效 SQLite。
- 复用当前迁移历史、旧库满足性识别和 backfill 逻辑，不引入第二套 schema 修复器。
- 保留 PostgreSQL、生产 Web 和无 SQLite 数据库路径的安全退出行为。

### 3. 沉淀长期排查规则

- 新增 `docs/wiki/debugging/character-database-schema-drift.md`，记录“schema/client/数据库/长驻热重载”四者的关系、证据链和禁止使用的破坏性恢复手段。
- 在 `docs/wiki/README.md` 的 Debugging 目录加入入口。
- 本次改动属于开发运行时可靠性修复，不增加产品功能；按项目规则跳过 release notes/README 对外摘要，并在交付说明中明确。

### 4. 自测与交付

- 运行服务端构建、运行时迁移集成测试和针对性 Node 测试。
- 在当前 `server/dev.db` 上先生成带完整性校验的备份，再使用同一迁移逻辑补齐缺失 schema，并验证列、默认值、健康检查和角色查询。
- 复核 diff、签名提交；在干净 `main` 上用项目集成入口重新验证并推送 `origin/main`，然后删除已合并 worktree/分支。
