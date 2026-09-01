# 模型库现代写实准入与可恢复隐藏实施计划

> 设计基线：`docs/superpowers/specs/2026-09-01-model-library-curation-delete-design.md`

## Execution order

### 1. 固化模型库准入契约与质量门禁

Files:

- `scripts/models/model-library-selection.json`
- `scripts/models/modelLibraryPolicy.mjs`
- `scripts/models/modelLibraryQuality.mjs`
- `scripts/models/model-library-quality.test.mjs`
- `scripts/models/model-library-expansion-policy.test.mjs`（仅在需要补充契约回归时）

Tasks:

1. 在选择清单中声明 Cine57、现代、写实和视觉审核为发布契约。
2. 将静态目录来源和视觉审核状态接入质量检查；任何来源、风格、时代或审核状态不符合的条目必须失败。
3. 保留现有显式 mesh 选择、技术组件排除、GLB/材质/纹理、尺寸、分类覆盖和缩略图审核规则，不执行未经审核的全量 FBX 导入。
4. 用当前已发布目录运行质量检查，确认现有资产全部通过且不生成或删除资产文件。

TDD:

- 先增加非 Cine57、非现代或非写实条目会失败的测试，确认测试先红。
- 实现契约读取和质量断言后，运行模型库测试确认转绿。

### 2. 增加服务端模型可见性领域能力

Files:

- `server/src/modules/model-library/application/ModelLibraryVisibilityService.ts`
- `server/src/modules/model-library/http/modelLibraryRoutes.ts`
- `server/src/app.ts`
- `server/tests/modelLibraryVisibility.test.js`

Tasks:

1. 使用 `AppSetting` 逐模型保存隐藏状态，键前缀固定为 `model-library:hidden:`，模型 ID 使用 URI 编码。
2. 提供读取隐藏集合、隐藏单个模型、恢复单个模型三个幂等操作。
3. 使用安全模型 ID schema，仅处理静态目录中的标识符，不接受路径和文件名写入。
4. 路由统一挂载在 `/api/model-library`，受现有认证中间件保护，并返回项目统一 `ApiResponse`。
5. 任何异常交给现有错误处理中间件；不触碰 GLB、纹理、缩略图或分镜引用。

TDD:

- 先写 service 测试覆盖空集合、重复隐藏、重复恢复和并发互不覆盖，再写路由契约测试覆盖 GET/POST/DELETE、非法 ID 和认证边界。
- 测试使用可替换的 AppSetting store 或现有测试 stub，不执行数据库 reset，不删除现有开发数据。

### 3. 接入客户端 API 与目录状态

Files:

- `client/src/api/modelLibrary.ts`
- `client/src/config/modelLibraryFilters.ts`
- `client/src/pages/models/ModelLibraryPage.tsx`
- `client/tests/modelLibraryVisibility.test.mjs`
- `client/tests/modelLibraryPage.contract.test.mjs`（必要时新增）

Tasks:

1. 封装可见性 GET、隐藏 POST 和恢复 DELETE 请求。
2. 把隐藏 ID 作为服务端事实来源，在目录初始加载时读取；读取失败时 fail closed，只显示加载/重试状态。
3. 在搜索、分类计数、分页之前排除隐藏条目，保持已有角色过滤和分类顺序。
4. 处理加载、重试和异常反馈，不使用 localStorage 保存该状态。

TDD:

- 先为纯筛选逻辑增加隐藏 ID、分类计数和分页测试，确认隐藏条目不会泄漏到任何结果。
- 再更新页面契约，覆盖加载、失败重试和 API 接入；实现后运行客户端聚焦测试和类型检查。

### 4. 在详情页增加删除与二次确认

Files:

- `client/src/pages/models/ModelEditorPage.tsx`
- `client/tests/modelEditorPage.contract.test.mjs`

Tasks:

1. 在现有详情操作区增加明确的破坏性按钮“删除模型”。
2. 使用项目已有 `Dialog`/`AppDialogContent`，实现标题、保留资源说明、取消和确认删除。
3. 确认请求进行中锁定重复提交，显示进行中状态；成功 toast 后返回 `/models`，失败保留当前页面并显示错误。
4. 保持键盘 Esc、遮罩关闭、焦点管理和无障碍语义由现有 Dialog 组件处理。

TDD:

- 先增加源代码/组件契约测试，要求存在删除按钮、Dialog 二次确认、保留资源文案和 loading 防重复提交。
- 实现后运行客户端测试，再进行真实浏览器交互验证。

### 5. 更新长期文档与发布说明

Files:

- `docs/wiki/product/model-library.md`
- `docs/releases/release-notes.md`
- `README.md`

Tasks:

1. 将模型库架构说明更新为“静态资产目录 + 服务端可见性覆盖”，说明为何不物理删除。
2. 记录批量导入的候选、转换、清洗、视觉审核和质量门禁边界，不写成逐提交变更日志。
3. 按发布说明规范记录用户可见的现代写实资产筛选和可恢复隐藏能力，并同步 README 最新更新。

### 6. 自测、浏览器验收和交付

Commands:

```powershell
pnpm test:model-library
pnpm --filter @ai-novel/server typecheck
pnpm --filter @ai-novel/server test:node
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client test -- modelLibraryVisibility.test.mjs modelEditorPage.contract.test.mjs
pnpm check:model-library
```

Browser smoke (built-in IAB):

1. 打开 `/models`，确认目录、分类计数和搜索正常，且无 console error/network failure。
2. 打开一个已发布模型详情，点击“删除模型”，确认二次确认弹窗可见。
3. 点击取消，确认模型仍在目录；重新打开并确认删除，确认回到目录且模型不再出现。
4. 使用恢复接口恢复带有 `smoke` 标记的测试模型状态，刷新目录确认模型重新出现；清理所有测试状态。
5. 截取目录和确认弹窗关键截图，记录服务端可见性 API 请求结果。

Delivery:

1. 在 `codex/model-library-curation-delete` 工作树中完成自测并签名提交。
2. 用 `pnpm workflow:integrate codex/model-library-curation-delete --push --verify "<focused verification>"` 从干净 `main` 合并并推送 `origin/main`。
3. 验证 `main` 与 `origin/main` SHA 一致、工作区干净、无遗留 `MERGE_HEAD`，再移除本次工作树和本地分支。

## Risks and mitigations

- 现有静态配置仍是目录事实来源：只增加服务端隐藏覆盖，不迁移模型元数据，降低迁移风险。
- 读取可见性失败可能暂时阻塞目录：采用 fail closed 和重试，避免隐藏资产泄漏。
- 用户误隐藏：保留恢复 API；不删除物理文件和引用。
- 批量脚本可能删除不在清单中的文件：本次只运行 `--check` 质量门禁；如未来确需运行非检查导入脚本，必须先按项目安全规则备份并验证备份。
