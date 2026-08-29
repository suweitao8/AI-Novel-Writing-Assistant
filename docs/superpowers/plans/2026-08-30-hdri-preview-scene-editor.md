# HDRI 预览复用场景编辑器实施计划

> 目标：让通用资产 HDRI 3D 预览复用漫剧场景 3D 编辑器，并统一半球直径 5–30 米的编辑范围；同时提供可放大的 2D 全景图预览。

## 1. 先写契约测试并建立红灯

- 更新 `client/tests/modelStudioEnvironment.contract.test.js`：
  - 断言共享 blocking viewer 支持 `loadProxyActor: false`；
  - 断言 HDRI 预览适配器不再创建独立 PlayCanvas 应用、pointer 或 wheel 相机处理；
  - 断言 preset 包含 `previewImageUrl`，资产页不渲染 `sourceUrl`，并使用 Dialog/图片预览；
  - 断言场景编辑器、模型编辑器、HDRI 预览页面的半球直径输入范围均为 5–30。
- 运行单文件测试，确认新断言先失败，再开始生产代码修改。

## 2. 提取共享 HDRI 预览入口

- 在 `blocking3dViewerApp.ts` 增加可选的无代理模式；默认场景编辑行为保持不变，无代理模式跳过代理 GLB 加载并让角色相关 API 安全空操作。
- 将 `studioEnvironmentPreviewApp.ts` 收敛为共享 viewer 的轻量适配器，只保留 preset、半球直径、环境设置和销毁的映射。
- 在 `StudioEnvironmentPreviewPage.tsx` 使用 `Drama3DEditorShell`、对象列表和属性面板，复用场景编辑器的视口布局与状态反馈，不再保留独立的相机交互实现。

## 3. 补充 2D 全景图与统一资产表格

- 为三个 HDRI preset 增加仓库内 PNG 预览资源及 `previewImageUrl`。
- 在通用资产页使用现有 `Dialog`、`Button`、设计 token 和可访问名称展示平面全景图；移除资源路径列。
- 将 UI 文案从“半球直径”统一为“半球直径”并确保范围展示和 `aria-label` 一致。

## 4. 绿色验证与自审

- 运行 focused contract tests、blocking3d 环境几何测试、client typecheck 和 client build。
- 启动/复用固定端口服务，用隔离 Playwright 会话访问通用资产页和 HDRI 预览页，验证图片 Dialog、3D 进入、HDRI 切换、5/30 边界、视角复位、网络和控制台状态，并保存关键截图。
- 对照本设计逐项自审，检查旧数据兼容和未加载代理角色的行为。

## 5. 文档、提交和集成

- 若 diff 产生稳定的模块边界知识，更新 `docs/wiki/architecture/` 或 `docs/wiki/debugging/`；用户可见变更同步更新 release notes 和 README 最新更新。
- 运行 `git diff --check`，使用签名提交；从干净主工作区用 `pnpm workflow:integrate codex/hdri-preview-scene-runtime --push --verify "..."` 合并并推送。
- 验证 `main` 与 `origin/main`，清理已合并 worktree 和本地分支。
