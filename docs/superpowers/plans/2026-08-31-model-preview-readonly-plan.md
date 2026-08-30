# 模型库详情页只读预览实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让模型详情页只负责查看模型，展示实时计算的顶点数量、米制包围盒长宽高和 3D 包围盒，同时继续使用通用资产 HDRI 设置而不暴露详情页环境或模型变换编辑入口。

**Architecture:** 在模型库 3D 查看器内部以实例化 GLB 的 render mesh 为唯一数据源计算几何统计；通过唯一 vertex buffer 去重顶点数、通过节点变换后的 AABB 计算尺寸，并在固定模型空间中用 PlayCanvas 即时线框绘制包围盒。查看器 API 只返回几何只读信息和相机操作；详情页移除环境 setter、Transform API、gizmo 和对应 UI，但保留系统环境参数作为初始化输入。

**Tech Stack:** React 19, TypeScript, PlayCanvas 2.21, Tailwind/shadcn UI, Node test runner (`--experimental-strip-types`), Vite。

---

## 1. 先写失败测试，锁定几何统计和只读边界

**Files:**

- Add: `client/src/pages/models/modelLibrary3d/modelGeometryStats.test.mjs`
- Add: `client/tests/modelPreviewReadonly.contract.test.js`
- Modify: `client/tests/modelStudioEnvironment.contract.test.js`

- [ ] 为几何统计写红测试：共享 vertex buffer 只计一次；AABB 的 X/Z/Y 分别映射为长/宽/高；unitScale 转成米制；尺寸格式化不保留无意义尾零。
- [ ] 为模型详情合约写红测试：`ModelEditorPage` 不再包含半球直径、环境切换、Transform 面板和工具栏；模型查看器不再创建/挂载变换 gizmo；页面包含顶点数量、长宽高和只读包围盒标记。
- [ ] 为环境边界写红测试：详情页仍把系统环境偏好作为初始化输入，但不包含环境 setter；通用资产 HDRI 预览页仍保留环境参数控制。
- [ ] 运行新增测试，确认失败原因只来自尚未实现的行为。

## 2. 提取几何统计责任并接入模型查看器

**Files:**

- Add/Modify: `client/src/pages/models/modelLibrary3d/modelGeometryStats.ts`
- Modify: `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`
- Modify: `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`（仅在几何边界公共函数移动时更新导入）
- Modify: `client/src/pages/animations/animationPreviewApp.ts`（仅在几何边界公共函数移动时更新导入）
- Modify: `client/src/pages/animations/animationThumbnailStudio.ts`（仅在几何边界公共函数移动时更新导入）

- [ ] 在模型库 3D 责任目录中提供几何统计类型、AABB 聚合和显示格式化函数，避免把统计逻辑放进通用 `utils/shared`。
- [ ] 在 GLB 实例化并同步层级后收集统计，顶点数按 vertex buffer 身份去重，包围盒与既有取景使用同一份源 AABB。
- [ ] 将统计以只读字段或 getter 暴露给 `ModelViewer`，在模型加载失败或没有网格时保持现有错误路径。
- [ ] 运行几何统计和模型查看器相关测试，修复类型/契约问题后转绿。

## 3. 将 3D 画面收敛为只读预览

**Files:**

- Modify: `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`
- Modify: `client/src/pages/models/ModelEditorPage.tsx`

- [ ] 删除模型详情查看器的变换 gizmo、拖拽回调、变换读写 API 及不再需要的类型依赖。
- [ ] 保留相机右键环绕、中键平移、滚轮缩放、键盘导航，以及聚焦/复位视角/快照；保证这些操作只改变相机状态。
- [ ] 每帧用 PlayCanvas `drawWireAlignedBox` 绘制最终米制模型 AABB；线框不挂到模型层级、不参与拾取、不成为拖拽目标。
- [ ] 移除模型详情页的预览环境区块、半球直径滑杆、环境 setter 与环境切换状态；保留系统通用资产偏好作为查看器初始化参数。
- [ ] 在“模型信息”中增加顶点数量和长/宽/高，加载后显示真实数值；删除 Transform 工具栏和“拖动手柄变换模型”提示，改为相机操作提示。
- [ ] 运行新增合约测试和客户端 typecheck，确保系统 HDRI 设置页与其它预览调用不受影响。

## 4. 补齐长期边界文档和用户可见记录

**Files:**

- Add: `docs/wiki/architecture/model-preview-readonly.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] 记录模型几何统计、包围盒和只读边界的模块归属、数据来源、失败模式与环境设置 ownership。
- [ ] 按 `readme-release-updater` 规则把用户可见能力合并到当前日期的 release notes，并只更新 README 的最新日期摘要。
- [ ] 检查文档不写成逐文件变更日志，不暴露内部测试实现细节。

## 5. 自测、浏览器验收与交付

- [ ] 运行模型相关 focused test：几何统计、模型只读合约、模型环境、模型材质/灯光、场景预览环境契约。
- [ ] 运行 `pnpm --filter @ai-novel/client typecheck`、`pnpm --filter @ai-novel/client build` 和 `git diff --check`。
- [ ] 先在 worktree 完成自审和签名提交，再通过 `pnpm workflow:integrate codex/model-preview-readonly --push --verify "<focused test command>"` 合并推送。
- [ ] 在内置浏览器访问 `http://127.0.0.1:5174/models/bed-12a`：确认模型、顶点数、长宽高和包围盒可见；确认没有半球直径、Transform、gizmo 或模型变换提示；确认控制台无错误。
- [ ] 确认通用资产 HDRI 页面仍可进入并保留它自己的环境参数入口，不在模型详情页新增第二套设置。
- [ ] 检查 `main` 与 `origin/main` SHA 一致、工作区干净、只清理本次创建且已合并的 worktree，并报告浏览器截图和任何未覆盖的风险。
