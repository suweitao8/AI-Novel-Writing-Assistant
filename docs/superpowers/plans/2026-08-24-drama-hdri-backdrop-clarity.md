# 漫剧 HDRI 地面清晰度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 3D 草图正确处理 16:9 场景图的地面投影，并提供可保存的 HDRI 环境参数。

**Architecture:** PlayCanvas 环境层按纹理宽高比选择标准等距 DomeGeometry，或普通场景图的上半球 + 带贴图的下半球网格，模拟 Unreal `EnviroDome` 的弧形地面。环境参数由 viewer 持有、由右侧控件调整、由 `layout3d.environment` 保存；普通场景图的下半球额外使用 1–20 倍 UV 重复密度（默认 10），旧布局缺少参数时使用默认值，地面永远保持在世界 Y=0。

**Tech Stack:** React 19、Vite、PlayCanvas 2.21、TypeScript、Node test、Zod。

---

### Task 1: 扩展 3D 环境数据契约

**Files:**
- Modify: `client/src/api/media/drama.ts` — 为 `DramaShotBlockingSketch3DLayout` 增加可选环境参数。
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts` — 增加环境参数类型、边界归一化和布局持久化。
- Modify: `server/src/modules/drama/http/dramaRoutes.ts` — 让 HTTP schema 接受同样的环境参数边界。

- [ ] **Step 1: 写服务端边界测试**：使用现有 drama contracts 测试模式，断言环境参数缺失时兼容旧布局，参数超出 `projectionCenterHeight 0.6–2.0`、`domeRadius 24–96`、`groundTextureScale 1–20`、`yawDeg -180–180`、`intensity 0.6–1.6` 时拒绝。
- [ ] **Step 2: 运行定向服务端测试确认失败**：执行 `pnpm --filter @ai-novel/server test -- --runInBand` 中对应 contracts 测试文件，预期新断言因字段尚未定义失败。
- [ ] **Step 3: 实现客户端和服务端类型/schema**：新增 `DramaShotBlockingSketch3DEnvironment`，在 layout 中以 optional 字段保存；归一化函数为旧数据返回 undefined，为新数据按边界保留数值。
- [ ] **Step 4: 运行定向测试确认通过**：重复同一命令，确认旧布局和新布局边界均通过。

### Task 2: 修复 HDRI/场景图投影与纹理质量

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts` — 增加普通场景图地面投影、纹理采样配置、环境参数 API 和布局读写。
- Test: `client/tests/dramaBlocking3dStaticHdri.contract.test.js` — 覆盖普通场景图分支和参数 API。

- [ ] **Step 1: 保持失败测试**：运行 `node --experimental-strip-types --test client/tests/dramaBlocking3dStaticHdri.contract.test.js`，确认新投影和参数断言为 RED。
- [ ] **Step 2: 实现最小几何修复**：根据 `texture.width / texture.height` 判断 2:1 等距 HDRI；非 2:1 时，上半球只采样源图上半幅，新增带贴图的下半球网格采样下半幅，保持圆球地面并避免普通透视图整张映射到完整球面。
- [ ] **Step 3: 实现纹理和环境参数**：设置线性采样、关闭 mipmap、设备最大各向异性过滤、U 重复/V 边缘寻址；以 `domeRadius`、`projectionCenterHeight`、`yawDeg`、`intensity` 更新天空和地面网格的尺度、旋转和材质自发光，并以 `groundTextureScale` 重建下半球 UV；保持环境世界坐标固定、Y=0 地面。
- [ ] **Step 4: 实现 viewer API 和布局持久化**：增加 `getEnvironmentSettings`、`setEnvironmentSettings`，在 `exportLayout`/`loadLayout` 读写环境参数；清空 URL 时销毁环境并恢复纯色地面。
- [ ] **Step 5: 运行客户端定向测试确认 GREEN**：执行 `node --experimental-strip-types --test client/tests/dramaBlocking3dStaticHdri.contract.test.js client/tests/dramaBlocking3dPage.contract.test.js`，确认全部通过。

### Task 3: 增加紧凑环境参数面板

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx` — 显示和调整环境参数，沿用页面现有 Card/Button/token。
- Test: `client/tests/dramaBlocking3dPage.contract.test.js` — 断言控件存在且保存路径继续使用 viewer 导出的布局。

- [ ] **Step 1: 写页面契约断言**：要求页面包含 `HDRI 环境`、`投影高度`、`半球尺寸`、`水平旋转`、`环境亮度` 和 range 控件。
- [ ] **Step 2: 运行页面契约确认失败**：执行上述客户端定向测试，预期新断言失败。
- [ ] **Step 3: 实现受控控件**：用 viewer 默认值初始化状态，滑块变更调用 `setEnvironmentSettings`、标记 dirty 并通过 `onChange` 同步；加载旧布局时回到默认值，保存仍由 `buildSketchData` 使用 `exportLayout`。
- [ ] **Step 4: 运行页面契约和 client typecheck**：执行 `node --experimental-strip-types --test client/tests/dramaBlocking3dPage.contract.test.js` 与 `pnpm --filter @ai-novel/client typecheck`。

### Task 4: 文档、构建和真实页面验证

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md` — 记录场景图与等距 HDRI 的分支规则和参数持久化边界。
- Modify: `docs/releases/release-notes.md` — 添加用户可见的 HDRI 环境调节说明。
- Modify: `README.md` — 更新最新更新区的 3D 草图说明。

- [ ] **Step 1: 运行客户端定向测试、服务端类型/契约检查和完整构建**：先执行 `pnpm install --frozen-lockfile`、`pnpm --filter @ai-novel/server prisma:generate`，再执行客户端 typecheck、定向测试和 `pnpm build`。
- [ ] **Step 2: 在固定端口页面回归**：保持 API 3100、客户端 5174，刷新当前 3D 草图，确认地面细节不再整片拉伸、调节五个参数立即生效、保存刷新后参数仍在；读取浏览器 console 确认无新增错误。
- [ ] **Step 3: 检查 diff 和提交**：确认只包含本功能文件，使用 `git commit -s` 提交。
- [ ] **Step 4: 从 main 集成并推送**：使用 `pnpm workflow:integrate codex/drama-hdri-backdrop-clarity --push --verify "pnpm build"`，随后检查 `main` 与 `origin/main` SHA 一致、工作区干净并清理本次 worktree。
