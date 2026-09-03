# 模型导入前景准入与历史台账实施计划

## 目标

在现有 Cine57 材质/详情预览门禁之上增加前景用途与尺寸准入、导入历史跳过和暂存发布边界，并清理当前已经确认不适用的模型。

## 实施顺序

- [ ] **任务 1：先建立失败测试和稳定数据契约**
  - 新增导入历史模块测试：规范化资产键、稳定源指纹、相同指纹跳过、指纹变化重审、事件追加和非法台账拒绝。
  - 新增前景准入模块测试：显式策展拒绝、尺寸下限/上限、预览缺失/非方形/错误请求拒绝，以及完整证据通过。
  - 将新测试加入 `test:model-library`，先运行并确认缺失实现导致失败。

- [ ] **任务 2：实现导入历史和候选选择器接入**
  - 创建 `modelLibraryImportHistory.mjs`，提供规范化路径、资产键、源指纹、台账读取/校验、查询和追加事件函数。
  - 修改 `modelLibraryExpansionCandidates.mjs`：历史拒绝检查在转换前执行；返回明确 reason 和资产键；保留原有来源、技术变体、组件拒绝。
  - 在策略模块导出前景准入配置和显式拒绝查询，禁止发布 allowlist 与拒绝清单重叠。

- [ ] **任务 3：实现统一前景准入门禁**
  - 创建模型导入准入模块，复用 `inspectGlb` 的世界空间尺寸和现有预览/材质证据校验。
  - 把 `0.1m <= maxDimensionMeters <= 5m` 设为默认边界；语义结论只接受策略中的显式资产 ID/Mesh 记录。
  - 修改 `modelLibraryQuality.mjs`，使发布库也执行同一准入规则，并让错误信息带原因码和尺寸证据。

- [ ] **任务 4：实现 preflight/stage/publish 工作流边界**
  - 创建仓库内导入工作流门面；`preflight` 只输出计划，先跳过历史拒绝项，再安排转换。
  - 将候选产物放入隔离 run 目录，`publish` 接收并验证浏览器方形预览审计、当前资源哈希、GLB/贴图/尺寸门禁后才允许写发布目录。
  - 对失败候选写 rejected 台账事件和可恢复隔离记录；不得让外部历史构建器直接覆盖发布目录。
  - 为 CLI 增加无副作用的 `--check` 测试，证明缺预览时 publish 不会更新目录。

- [ ] **任务 5：策展清理当前模型库**
  - 根据现有 GLB 世界空间尺寸和已完成的详情页预览证据，写入第一批显式碎屑/草/极小模型拒绝记录；不做模糊关键词删除。
  - 用 `--apply-review-only` 或新发布门面更新生成目录，不物理删除源文件；必要时把产物保留在仓库外带 SHA-256 清单的隔离目录。
  - 为当前目录和已拒绝候选生成台账记录，更新导入/预览审计覆盖范围。

- [ ] **任务 6：文档、回归和交付**
  - 更新 `docs/wiki/product/model-library.md`，记录准入边界、历史台账、暂存发布和恢复规则；必要时新增模型导入调试页。
  - 按 release-note 规则记录用户可见的模型库清理和导入保护，并刷新 README 最新更新。
  - 运行模型库测试、类型检查/构建和工作区检查；启动 worktree lane，在内置浏览器访问 `/models` 及代表性 `/models/<id>`，确认方形预览、无 console/network 错误。
  - 完成 self-test 后签名提交，使用集成入口合并到 `main`、显式推送 `origin/main`，确认 main 与远端 SHA 一致并清理本次 worktree。

## 重点验收命令

```text
pnpm exec node --experimental-strip-types --test scripts/models/model-library-import-history.test.mjs scripts/models/model-library-import-admission.test.mjs scripts/models/model-library-expansion-candidates.test.mjs
pnpm test:model-library
pnpm check:model-library
pnpm typecheck
```

浏览器验收只使用本 worktree `server/.env` 中的 API/client lane，不占用用户当前 `5174` 页面。

