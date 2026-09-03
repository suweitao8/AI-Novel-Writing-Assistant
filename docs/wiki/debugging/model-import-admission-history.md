# 模型导入准入与历史台账

## Background

Cine57 的外部 FBX→GLB 构建器可以完成转换，但它面对的是源资产池，不知道哪些模型适合成为产品里的前景道具。只要转换器直接写正式目录，地面碎屑、草叶散布物、没有可见尺寸的小物件和缺材质/坏预览的候选就可能先进入模型库；下一轮导入还会再次消耗同一模型的转换和预览时间。

## Decision

模型导入采用“候选预检 → 暂存转换 → 真实详情预览 → 发布门禁”的边界。源模型是否已经处理过，由稳定资产键和源指纹共同决定：资产键是规范化 `/Game/...` 包路径加 `#MeshName`，源指纹是 manifest 源行的规范化 SHA-256。导入历史不是按展示名建立的永久黑名单，因此源文件发生变化或人工明确重开审查时，旧拒绝结论可以重新进入流程。

## Current Rule

- `model-library-selection.json` 的 `foregroundAdmission` 只保存确定的资产级拒绝记录；当前尺寸规则是世界空间最大轴 `0.1m–5m`（含边界）。
- `model-library-import-history.json` 必须为每个处理过的候选保留当前结论和 `events`。`approved` 记录不能自动永久跳过，更新时仍需经过当前准入门禁；同源指纹的 `rejected + skipUntilSourceChange=true` 在转换前返回 `previously-rejected`。
- `modelLibraryImportWorkflow.mjs --preflight` 默认读取仓库内历史台账；显式传入 `--history` 时必须读取指定台账。历史文件格式不合法应直接失败，不能静默当作空历史继续导入。
- 暂存报告中的每个候选必须有真实 `/models/<id>` 详情预览证据：方形截图、当前资源指纹、几何已就绪、贴图状态有效、无失败请求和控制台错误。预览截图哈希与文件内容不一致时不得发布。
- `curate-cine57-library.mjs --check` 是最终总门禁。失败候选保留在可恢复隔离位置；产品目录只包含通过准入和视觉审核的条目。

## Failure Modes

- 只按文件名或中文翻译筛选：同名但用途不同的资产会被误杀，或真正的地面散布物被漏掉。解决方式是把结论写成显式 ID/Mesh 记录，并留下原因和证据。
- 只检查能否加载 GLB：可加载不代表有可见尺寸、真实材质或可用预览。必须同时检查世界空间包围盒、贴图绑定、详情截图、资源哈希和浏览器请求。
- 只用文件名作为历史键：不同包路径下的同名 Mesh 会互相覆盖。必须使用规范化包路径 + Mesh。
- 只用展示名或当前时间做指纹：展示名可以被策展修改，时间每次都会变化。指纹只使用稳定 manifest 源字段并忽略运行元数据。
- 继续让外部构建器直接覆盖 `client/public/models/cine57/`：导入失败会污染当前可用目录。外部转换器只能写候选暂存产物，发布必须由仓库门禁决定。

## Related Modules

- `scripts/models/modelLibraryImportHistory.mjs`：资产键、源指纹、台账格式、追加事件和跳过决策。
- `scripts/models/modelLibraryImportAdmission.mjs`：显式策展、尺寸、材质和详情预览准入结论。
- `scripts/models/modelLibraryImportWorkflow.mjs`：preflight 与 staged report 检查入口。
- `scripts/models/modelLibraryExpansionCandidates.mjs`：在转换前应用来源、技术变体和历史跳过规则。
- `scripts/models/modelLibraryQuality.mjs`：发布目录总门禁，并校验台账覆盖当前模型和拒绝项。
- `scripts/models/curate-cine57-library.mjs`：应用视觉策展、清理陈旧证据和执行最终质量检查。

## Source Documents

- `docs/superpowers/specs/2026-09-03-model-import-admission-history-design.md`
- `docs/superpowers/plans/2026-09-03-model-import-admission-history.md`
- `.agents/skills/unreal-import/SKILL.md`
