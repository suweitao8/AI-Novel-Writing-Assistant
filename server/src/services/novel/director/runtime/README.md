# Director Runtime 子模块边界

`runtime/` 是自动导演的执行子系统：接管、候选/确认/继续流程、节点执行、运行时状态与韧性防护。根目录只保留 `directorSubsystem.ts` 门面；新增能力必须进入下述职责目录，不再向根目录添加同前缀业务文件。

## 子模块所有权

- `takeover/`：既有项目接管执行链——接管主流程、继续、重置、执行与节点适配，入口 `novelDirectorTakeover.ts`。
- `flows/`：导演流程运行时——候选、确认、继续执行三个流程入口，以及共享的 `novelDirectorHelpers` / errors / schemas / persistence / framing 与运行时编排器。`novelDirectorHelpers` 被全子系统引用，视为共享内核，修改前需检查全部引用方。
- `execution/`：节点执行引擎——`DirectorRuntimeService` 编排、`DirectorNodeRunner` 节点契约、策略引擎、工作区分析、章节执行进度检查与质量环预算台账。
- `store/`：运行时状态持久化——runtime store、快照合并、状态提案决议与默认值。
- `artifacts/`：导演产物台账——artifact 网关、台账写入与查询、工作区产物清单（普通与质量）。
- `events/`：事件与遥测投影——自动化台账事件、事件投影服务、用量遥测查询。
- `resilience/`：韧性防护——熔断器、内存安全、自动导演校验。

## 依赖方向

- `store/`、`events/`、`resilience/` 是底层能力，不得反向依赖执行链与流程链。
- `execution/`、`flows/`、`takeover/` 可依赖 `store/`、`artifacts/`、`events/`、`resilience/`。
- director 之外的路由、worker、commands 等优先通过 `./directorSubsystem` 门面导入；直接导入时只允许指向子模块入口，不得跨层深入内部文件（测试除外）。

## 变更守则

- 运行时状态契约（`store/`、`events/`）变更时，同步更新 `docs/wiki/workflows/` 中自动导演恢复与投影相关条目。
- 接管链（`takeover/`）是恢复入口，修改必须保持检查点恢复语义：本地质量债不得升级为全局重规划阻断（见 AGENTS.md 自动导演质量门规则）。
