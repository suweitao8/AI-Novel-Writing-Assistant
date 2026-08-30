# 模型使用说明实施计划

> 设计依据：`docs/superpowers/specs/2026-08-31-model-usage-instructions-design.md`
> 执行方式：在 `codex/model-usage-instructions` 独立 worktree 中直接完成，测试先行；不修改主工作区。

## 1. 建立结构化模型使用说明

### 目标

让 `ModelLibraryEntry` 的每个实例都拥有完整的 `usage`，并提供稳定的按 ID 读取入口。

### 文件

- 新增 `client/src/config/modelLibraryUsage.ts`。
- 修改 `client/src/config/modelLibrary.ts`。

### 实现内容

1. 在 `modelLibraryUsage.ts` 定义支撑面、摆放方式、定位基准、朝向的字面量类型和 `ModelUsageInstruction` 接口。
2. 定义可复用的冻结 profile：落地竖直、地面平铺、水平支撑面竖直、水平支撑面方向性、墙面挂装、天花板向下悬挂。
3. 为 79 个现有模型 ID 建立显式 `MODEL_USAGE_INSTRUCTIONS` 映射：时钟使用墙面挂装，宫灯使用天花板悬挂，双筒望远镜使用方向性水平支撑，其余模型按实际接触面归入落地或水平支撑面。
4. 实现 `attachModelUsageInstructions(entries)`：缺失 ID 或映射孤儿立即抛错，然后把说明装配到目录条目。
5. 暴露 `getModelUsageInstruction(id)`、`getModelUsageSurfaceLabel()`、`getModelUsagePlacementLabel()`、`getModelUsageOrientationLabel()` 供 UI 和后续摆放逻辑使用。
6. 将原模型数组改名为内部 base entries，通过装配函数导出 `MODEL_LIBRARY`；`ModelLibraryEntry.usage` 为必填，保留现有模型文件与材质数据不变。

### 先行测试

在写生产实现前新增 `client/tests/modelUsageInstructions.contract.test.js`，先断言：

- 所有当前目录条目都有 `usage`；
- 说明枚举属于允许集合，`requiresFacingDirection` 是布尔值，说明文字非空；
- `clock-01a` 是 `wall-mounted / wall-facing / back` 且需要方向；
- `chinese-lamp-01a` 是 `ceiling-hung / downward / top` 且需要方向；
- `garbagebasket01` 是 `grounded / upright / base` 且不需要方向；
- helper 按 ID 返回同一个结构化说明，未知 ID 返回 `null`；
- 覆盖函数遇到缺失映射或孤儿映射会失败。

先运行该测试，确认在没有生产实现时按预期失败，再实现上面的契约。

## 2. 接入模型库质量门禁

### 文件

- 修改 `scripts/models/modelLibraryQuality.mjs`。
- 扩展 `scripts/models/model-library-quality.test.mjs`。

### 实现内容

1. 在质量门禁中校验 `usage` 的必填字段、允许枚举和布尔值。
2. 校验 `wall-mounted` 与 `wall-facing/back`、`ceiling-hung` 与 `downward/top` 的关键组合，避免字段互相矛盾。
3. 汇总所有模型的使用说明违规，不因第一条错误提前结束；既有 GLB、尺寸、材质、孤儿文件检查保持不变。
4. 增加质量测试，保证全量 79 个模型的说明门禁通过，并确保关键模型的说明不会被目录再生成流程漏掉。

## 3. 让卡片和详情页读取同一份说明

### 文件

- 修改 `client/src/pages/models/ModelLibraryPage.tsx`。
- 修改 `client/src/pages/models/ModelEditorPage.tsx`。
- 如需拆分展示格式化函数，只放入 `client/src/config/modelLibraryUsage.ts`，不新增无归属的通用 helper。

### 实现内容

1. 模型卡片增加紧凑的 `Badge`，显示支撑面和摆放方式标签，并设置 `data-model-usage-summary` 便于回归检查。
2. 详情页增加“使用说明” `InspectorComponentSection`，用 `entry.usage` 展示支撑面、摆放方式、定位基准、朝向、是否需要方向和短说明。
3. 说明区使用现有 `Badge`、`Card`、`InspectorComponentSection` 与语义化 token，不硬编码颜色；信息为只读，不新增编辑状态。
4. 在详情页保留现有只读 3D 预览、实时几何信息和包围盒开关，不把使用说明混入模型变换路径。
5. 让未来摆放调用方可以直接导入 `getModelUsageInstruction` 或读取 `entry.usage`，不从 DOM 或中文文字反推规则。

### 测试

扩展客户端契约测试，锁定卡片标签和详情说明来自 `entry.usage`，并通过真实浏览器检查页面可见文本、代表模型字段和无障碍标签。

## 4. 文档和发布说明

### 文件

- 修改 `docs/wiki/product/model-library.md`，补充使用说明字段契约、分类规则、未来摆放消费边界和漏配失败模式。
- 使用 `readme-release-updater` 检查本次 Git 范围，更新 `docs/releases/release-notes.md` 的 `2026-08-31` 用户可见记录。
- 按检查结果更新 `README.md` 的“最新更新”区，只保留最新日期块。

### 规则

wiki 记录稳定的数据边界与失败诊断，不记录本次文件变更清单；release notes 和 README 只描述用户能看到的模型使用说明能力。

## 5. 验证和交付

在 worktree 中依次运行：

1. `node --test client/tests/modelUsageInstructions.contract.test.js`（实现前必须有一次红测，实现后转绿）。
2. `pnpm test:model-library`。
3. `pnpm --filter @ai-novel/client test -- tests/modelUsageInstructions.contract.test.js tests/modelPreviewReadonly.contract.test.js`。
4. `pnpm --filter @ai-novel/client typecheck`。
5. `pnpm --filter @ai-novel/client build`。
6. `pnpm check:model-library`。
7. `git diff --check`，并复核只包含本计划范围的变更。

通过代码检查后提交签名 commit。合并前使用 Codex 内置浏览器访问 `http://127.0.0.1:5174/models` 和 `/models/clock-01a`、`/models/chinese-lamp-01a`，确认卡片标签、墙挂/吊顶说明、方向字段、3D 页面仍可加载且控制台/网络无新增错误，保存关键截图。

最后从干净 `main` 运行：

```text
pnpm workflow:integrate codex/model-usage-instructions --push --verify "pnpm test:model-library"
```

随后核对 `git status --short --branch`、`git rev-parse HEAD`、`git rev-parse origin/main` 和 worktree 列表，清理本次已完全合并的 worktree/本地分支，不触碰其他会话的 worktree。
