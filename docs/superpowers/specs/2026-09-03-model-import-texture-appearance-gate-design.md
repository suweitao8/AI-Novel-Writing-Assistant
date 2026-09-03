# 模型导入颜色贴图准入门禁设计

## 背景

上一轮导入门禁已经检查了 GLB 是否可解析、尺寸是否合格、目录贴图路径是否存在以及详情页预览是否为方形，但它没有把 FBX2glTF 生成的内嵌 `1×1` Base Color 占位图识别为失败。斧头 `SM_Axe_Black_01.glb` 和旗帜 `SM_Flag3.glb` 的 manifest 没有真实 Base Color，目录却为材质填入中性灰 `tint`，因此运行时用灰色材质替代了原本缺失的外观，旧视觉审核只看到“模型可渲染”就批准了。

当前静态目录中已经发现 17 个相同模式的候选：GLB 材质含内嵌 `1×1` Base Color 占位图，同时目录没有对应材质的真实 `baseColor` 文件绑定。它们必须和斧头、旗帜一起撤出目录，避免只修复用户当前看到的两个条目。

## 目标

1. 对每个候选的实际材质来源做可解释检查；只有真实 Base Color 贴图可解析，或明确属于不带 Base Color 纹理的纯色材质，才允许继续预览和发布。
2. 识别“内嵌占位 Base Color + 无目录真实贴图绑定”的灰模根因，并在转换发布前返回稳定的 `missing-base-color-texture` 原因码。
3. 将当前已确认的 17 个同类模型写入显式拒绝清单和导入历史；源指纹未变化时后续导入在转换前跳过。
4. 不误伤已经有目录 Base Color 绑定的模型，即使 FBX2glTF 仍在 GLB 内保留占位纹理；运行时会使用经过审计的目录贴图。

## 方案

### 1. 统一颜色来源检查

`modelLibraryImportAdmission.mjs` 复用 `inspectGlb()` 返回的材质信息，以和前端运行时相同的“忽略大小写和符号”规则匹配目录 `entry.materials`。对实际声明 Base Color 纹理且内嵌图片尺寸为 `1×1`（或无法读取尺寸）的材质：

- 找到同名目录材质并且有 `baseColor` 文件绑定：继续后续贴图路径、预览和质量检查；
- 没有真实 `baseColor` 绑定：返回 `failureStage=texture`、`reasonCode=missing-base-color-texture`，不得进入发布目录；
- 目录绑定存在但文件不存在或材质合同不完整：继续由现有 `texture-invalid` 门禁报告具体路径错误。

该判断只针对真实 GLB 材质证据，不用“斧子”“旗帜”或其他名称关键词做删除。未来同类模型会自动命中门禁，显式拒绝清单只记录已经完成审查的当前资产。

### 2. 当前库的精确清理

将以下已审查的 17 个 ID 写入 `foregroundAdmission.rejectedAssets`，原因统一为 `missing-base-color-texture`、阶段为 `texture`：

`bin`、`bottle-01`、`bucket-01`、`asian-sack-01a`、`asian-sack-01b`、`asian-bread-01`、`binocular-01`、`wooden-board-01`、`book-single`、`baseball-bat-metal`、`baseball-bat-wood`、`basketball-hoop`、`asian-pottery-01`、`soviet-caged-lamp-01`、`axe-01`、`wooden-canoe-01`、`asian-flag-01`。

策展脚本只移除目录和陈旧证据引用，不删除源 GLB；历史生成器使用现有五份 Cine57 manifest 重新计算这些资产的拒绝事件和源指纹。

### 3. 发布边界

外部转换器仍只能产生暂存产物。`preflight` 先跳过历史拒绝；暂存候选必须通过颜色来源、贴图路径、尺寸、方形详情预览、资源哈希和视觉审核，`--check-staged` 通过后才允许策展脚本更新正式目录。

## 验收标准

- 准入单测证明：无真实 Base Color 的 `1×1` 占位材质被拒绝；同名且存在真实目录 `baseColor` 绑定的材质可以继续；失败结果含 `texture/missing-base-color-texture`。
- 全库质量门禁证明：当前目录不再包含上述 17 个模型；其源文件仍可恢复；历史台账覆盖 445 个通过的静态模型和 39 个拒绝项。
- 真实浏览器回归证明：模型目录正常加载，`/models/axe-01` 与 `/models/asian-flag-01` 不再作为详情页公开，搜索结果中不出现它们；代表性有贴图详情页无控制台/网络错误。
- `pnpm test:model-library`、`pnpm check:model-library`、`pnpm typecheck` 和文档清单检查通过，之后签名提交、合并并推送 `main`。

## 长期规则

任何新增模型只要使用了 FBX2glTF 的内嵌 Base Color 占位图，就必须在目录材质映射中提供可验证的真实 Base Color，或停留在拒绝/隔离状态。预览“能渲染”不再等同于外观合格；颜色来源和可见效果必须同时成立。
