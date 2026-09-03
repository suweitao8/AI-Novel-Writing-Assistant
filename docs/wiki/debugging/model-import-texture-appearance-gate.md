# 模型导入颜色贴图准入门禁

## Background

FBX→GLB 转换器可能会把没有真实 Base Color 的材质写成可加载的内嵌 `1×1` 图片。模型因此能够出现在 3D 画布中，但如果目录只有 `tint`，运行时会用中性灰材质替代颜色贴图，用户看到的就是没有真实外观的灰模。旧的“资源能加载、截图是方形、没有请求错误”检查无法区分这种情况。

## Decision

颜色来源检查属于模型进入正式目录前的统一准入门禁，由 `modelLibraryImportAdmission.mjs` 和目录质量门禁共同执行。它使用 GLB 实际材质证据，不使用“斧头”“旗帜”等名称关键词：对声明了 Base Color、且内嵌图片为 `1×1` 或无法读取尺寸的材质，必须找到同名目录材质的非空 `baseColor` 绑定；没有绑定时返回 `texture/missing-base-color-texture`，候选不能发布。

同名目录贴图绑定存在时，内嵌占位图可以被目录回填，但贴图路径、alpha 审计、预览和资源指纹仍必须通过现有门禁。纯色材质如果没有 Base Color 纹理声明，可以继续使用经过审计的 `tint`，不能把带占位纹理的槽位误当作纯色材质。

## Current Rule

- `inspectGlb()` 必须暴露 Base Color 的内嵌状态、MIME 类型和图片尺寸；`1×1` 是当前 FBX2GLTF 占位图的可复核证据。
- 材质名匹配沿用运行时规则：转小写并移除非字母数字字符。这样 `MI_Axe_Black_01` 等 GLB 名称会和目录材质声明使用同一匹配边界。
- 统一准入在几何尺寸检查之后、详情预览检查之前执行颜色来源检查。目录已有 `baseColor` 但文件不存在或审计不完整时，继续返回具体的 `texture-invalid` 错误。
- 已经确认不可用的当前资产写入 `foregroundAdmission.rejectedAssets`，历史台账追加 `status=rejected`、`failureStage=texture`、`reasonCode=missing-base-color-texture` 和 `skipUntilSourceChange=true`。源指纹没有变化时，`--preflight` 在转换前跳过它。
- 只从正式目录移除条目和陈旧证据，不删除源 GLB。补齐真实颜色贴图后，源指纹变化或人工重开审查才允许重新进入候选流程。

## Failure Modes

- **把 `tint` 当真实漫反射**：`tint` 只能表示没有纹理的纯材质槽。对带 `1×1` 占位 Base Color 的槽位保留 `tint`，会把缺失外观伪装成“已处理”。
- **只看浏览器请求是否成功**：占位图片本身可以成功加载；必须同时检查图片尺寸和目录 Base Color 绑定。
- **只删用户当前看到的两个模型**：相同导出故障可能出现在多个类别。先扫描所有 GLB 的材质证据，再将已核实条目逐项写入拒绝清单。
- **生成历史时遗漏旧源 manifest**：模型库包含不同批次的源产物。重建历史必须显式包含历史记录中出现的全部 manifest；本库当前使用 `Cine57-exported2/_manifest.json` 以及 batch3、model_expansion、batch5、batch6、batch6b 五份 JSONL。

## Diagnosis Path

1. 用 `inspectGlb()` 检查候选的 `materials[].baseColorTexture`，记录 `embedded`、尺寸和材质名。
2. 用运行时同样的规范化材质名查目录 `entry.materials`，确认是否有非空 `baseColor`。
3. 检查 `models/cine57/tex` 文件是否存在，并运行 `validateModelTextureContract()` 的 alpha 与输出格式审计。
4. 生成当前 worktree 的详情页方形预览，绑定 GLB/贴图资源指纹，确认没有请求或控制台错误。
5. 只有颜色来源、贴图、几何、预览和视觉审核全部通过，才执行策展脚本写入正式目录。

## Related Modules

- `scripts/models/modelLibraryImportAdmission.mjs`：统一颜色来源与其他发布准入结论。
- `scripts/models/modelLibraryQuality.mjs`：对正式目录逐项执行准入和总质量检查。
- `scripts/models/modelLibraryTextureAudit.mjs`：验证目录贴图路径、alpha 语义和源审计。
- `scripts/models/modelLibraryImportWorkflow.mjs`：在暂存报告发布前复用统一准入结果。
- `scripts/models/curate-cine57-library.mjs`：应用策展结果、移除目录陈旧证据并保留源产物。

## Source Documents

- `docs/superpowers/specs/2026-09-03-model-import-texture-appearance-gate-design.md`
- `docs/superpowers/plans/2026-09-03-model-import-texture-appearance-gate.md`
- `.agents/skills/unreal-import/SKILL.md`
