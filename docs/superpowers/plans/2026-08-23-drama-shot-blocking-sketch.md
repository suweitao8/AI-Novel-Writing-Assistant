# 漫剧分镜摆位草图实施计划

> **实施约束：** 每一步先写会失败的聚焦测试，确认失败原因符合预期后才实现；所有实现留在 `codex/drama-shot-blocking-sketch` 隔离工作树。

## 1. 持久化与草图领域服务

**文件：**

- 修改：`server/src/prisma/schema.prisma`
- 新增：`server/src/prisma/migrations/20260824090000_drama_shot_blocking_sketch/migration.sql`
- 新增：`server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- 测试：`server/tests/dramaShotBlockingSketchService.test.ts`

**步骤：**

1. 在测试中覆盖：安全范围校验、项目归属校验、未上传 PNG 不能确认、确认后保存 `confirmed` 状态、文件路径固定在该镜头目录。
2. 执行测试并确认新增测试以模块不存在/行为缺失失败。
3. 给 `DramaShot` 添加可空 `blockingSketchData`，补充 PostgreSQL/SQLite 均可执行的 `ADD COLUMN` 迁移。
4. 实现草图 DTO 的解析、归一化与边界校验；只允许归一化坐标、有限缩放、有限景深/俯仰/偏航。
5. 实现以镜头归属项目为前置条件的读取、保存、PNG 上传、确认与文件解析；原始上传仅接受有效 PNG、限制文件大小，使用 `generated-images/drama-shots/<shotId>/blocking-sketch.png`。
6. 再次运行服务测试，确认全部通过。

## 2. HTTP 与客户端 API 契约

**文件：**

- 修改：`server/src/modules/drama/http/dramaRoutes.ts`
- 修改：`client/src/api/media/drama.ts`
- 测试：`server/tests/dramaShotBlockingSketchRoutes.test.ts`
- 测试：`client/tests/dramaShotBlockingSketchApi.test.js`

**步骤：**

1. 为读取编辑上下文、保存元数据、上传 PNG、确认草图和读取 PNG 写路由/API 契约测试，覆盖项目路径与镜头路径不匹配时被拒绝。
2. 确认测试先失败。
3. 添加受 Zod 保护的 JSON schema；图片端点直接读取请求流，避免把二进制放进 JSON。
4. 在 `DramaShotKeyframeService` 复用的镜头上下文中返回匹配场景的默认全景图与本镜角色状态图，让编辑器不复制服务端匹配规则。
5. 补齐客户端 `DramaShotBlockingSketch*` 类型和 API 调用；在 `DramaShot` 上公开持久化字段。
6. 运行服务端/客户端契约测试并确认通过。

## 3. 确认草图接入首帧和批量生成

**文件：**

- 修改：`server/src/services/drama/visual/DramaShotKeyframeService.ts`
- 修改：`server/src/services/drama/production/DramaBatchOrchestrator.ts`
- 新增：`server/src/prompting/prompts/drama/shotKeyframe.prompts.ts`
- 修改：`server/src/prompting/registry/promptAssetLoaderEntries.ts`
- 测试：`server/tests/dramaShotKeyframeBlockingSketch.test.ts`
- 测试：`server/tests/dramaBatchBlockingSketch.test.ts`

**步骤：**

1. 写测试：确认草图排在 `refImages`/`referenceImages` 第一位，草图标签为 `layout_sketch`；草图草稿不能生成；无草图维持旧顺序；批量跳过未确认草图并且不计费用。
2. 确认失败。
3. 将原来内联的首帧提示词迁为 `drama.shot.keyframe@v1` PromptAsset 并登记入 registry；已确认草图追加“以草图锁定构图但不渲染辅助标记”的约束。
4. 首帧预览与正式生成调用同一草图读取逻辑。已确认草图缺文件时报告可恢复错误，草图草稿时报“先确认摆位草图”。
5. 批量作业在准备、估算和执行三个阶段一致跳过草稿草图，不把跳过误记为失败或消耗图片额度。
6. 运行两组聚焦测试。

## 4. 编辑器与分镜行入口

**文件：**

- 新增：`client/src/pages/drama/comicDrama/components/shotBlockingSketchMath.ts`
- 新增：`client/src/pages/drama/comicDrama/components/ShotBlockingSketchDialog.tsx`
- 修改：`client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`
- 测试：`client/tests/shotBlockingSketchMath.test.js`
- 测试：`client/tests/shotBlockingSketchDialog.contract.test.js`

**步骤：**

1. 为全景偏航环绕、俯仰与视场边界、角色拖拽归一化、缩放/层级/翻转、草图导出契约写纯函数测试；先确认失败。
2. 实现 1280×720 Canvas 画布与二维全景裁切：场景图横向环绕，偏航/俯仰/视场与角色数据都可重开还原。
3. 以状态图第三格全身正面裁取角色；无图仅显示姓名轮廓占位。支持选中、拖拽、缩小/放大、翻转、前后层级、删除和右侧角色列表重新加入。
4. 对话框只使用现有 `Dialog`、`AppDialogContent`、`Button`、`AiButton`、toast 和语义 token；保存顺序为保存 JSON → 画布 `toBlob` 上传 PNG，确认只在 PNG 成功后可用。
5. 在每镜画面区加入“摆位草图”入口，并展示已确认草图作为可放大的小预览；草稿显示继续编辑入口。所有异步按钮禁重并保留可见状态。
6. 运行客户端聚焦测试与 `client` 类型检查。

## 5. 迁移、文档与验收

**文件：**

- 修改：`docs/wiki/workflows/comic-drama-workflow.md`
- 修改：`docs/releases/release-notes.md`
- 修改：`README.md`
- 视测试结果修改：相邻服务/组件测试

**步骤：**

1. 使用安全的现有 Prisma 迁移方式，验证迁移 SQL 与 schema 字段一致，不执行 reset、truncate 或其他破坏性数据库操作。
2. 更新漫剧工作流 Wiki，说明“摆位事实 → 已确认草图 → 首帧参考”的稳定边界与草稿跳过规则。
3. 按 Release Notes 工作流更新用户可见更新及 README 最新更新。
4. 执行新增聚焦服务/客户端测试、相关类型检查和构建（仅在变更后没有新证据可复用时运行）。
5. 复查工作树只包含本功能改动，`git commit -s`。在主工作区重新读取分支规则、合并已验证分支、推送 `origin main`，随后清理已合并的本工作树。

