# 场景空间标记与投射中心可视化 Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让全景图视觉证据决定场景标记的水平空间方向，修复旧标记的经度侧偏移，并在共享 3D viewer 中显示可实时更新的投射中心方形参考体与高度线，同时保证本地 Grok 多模态图片真正进入视觉模型。

**Architecture:** 在 `shared` 放置等距柱状图水平投影数学；服务端在标记构建、场景读取和分镜构图上下文三个入口调用统一归一化；AI Prompt 强制输出图像区域；Grok CLI bridge 以 JSON Prompt + ACP 资源链接转发图片；客户端 viewer 将投射中心 gizmo 作为环境级、不可拾取的 PlayCanvas 实体接入现有环境生命周期。

**Tech Stack:** TypeScript, Zod, Node.js test runner, React/PlayCanvas, Vite, pnpm workspace, PowerShell.

---

## 1. 建立可测试的全景水平投影合同

- [ ] 先新增 `server/tests/scene3dMarkerProjection.test.js`，覆盖正前方、右侧、左侧、缺失 `imageRegion`、手工来源和幂等性；先运行测试并确认因缺少投影实现而失败。
- [ ] 新增 `shared/utils/scene3dProjection.ts`，实现区域中心 `u` 到世界 X/Z 径向方向、墙面 yaw 和半径保守继承，明确不从单张全景图推断真实深度。
- [ ] 保持角度范围、半径下限和无效数值处理与现有标记归一化兼容，并通过 shared build 后重跑投影测试。

## 2. 统一服务端标记读取、写入和下游上下文

- [ ] 扩展 `StoryScene3dMarkers.ts` 的归一化选项，支持环境参数；AI 标记有 `imageRegion` 时按投影合同纠正位置，手工标记和无区域旧数据保持兼容。
- [ ] 在 `StoryScene3dMarkerService.ts` 传入场景环境，使新识别保存的 marker 已经是纠正结果。
- [ ] 在 `StorySettingsProjection.ts` 和场景状态归一化入口传入环境，使已有数据库数据通过页面 API 即时得到纠正结果且不需要破坏性迁移。
- [ ] 在 `DramaShotBlockingSketchService.ts` 传入同一环境，确保自动构图 Prompt 使用的空间标记与编辑器显示一致。
- [ ] 更新服务端测试，验证门窗经度方向、地面落地、手工覆盖、旧数据兼容和构图上下文。

## 3. 让 Prompt 和本地视觉桥接与空间合同一致

- [ ] 将 `sceneState3dMarkers` Prompt 升级到 v2，要求每个可识别标记必须输出归一化 `imageRegion`，并说明 `position.x/z` 只作为临时半径提示，不能覆盖图像证据。
- [ ] 更新 Prompt 注册表和现有 Prompt 测试，保留历史 v1 数据的读取兼容。
- [ ] 修改 `scripts/grok-cli-core.cjs`，对包含 `image_url` 的消息构建 `--prompt-json`，把内联图片物化成临时资源并以 ACP 资源链接传给 Grok；纯文本请求继续走现有参数路径，并在 finally 中清理临时文件。
- [ ] 增加 bridge 回归测试，证明多模态请求不丢图片、不把 base64 放进命令行，且纯文本调用行为不变。

## 4. 接入投射中心方形/晶体参考体

- [ ] 新增 `blocking3dProjectionCenterGizmo.ts`，创建半透明方形实体、更新高度和尺寸、绘制地面到中心的高度线，并提供销毁函数。
- [ ] 在 `blocking3dViewerApp.ts` 的初始化、环境更新、每帧绘制和销毁生命周期中接入 gizmo；确保它不进入 marker/actor 拾取和保存数据。
- [ ] 为 gizmo 和 viewer 接入增加前端静态契约测试；保持现有设计 token 和按钮组件不变，因为本次不新增 UI 控件。

## 5. 维护长期规则与用户可见记录

- [ ] 更新 `docs/wiki/workflows/drama-blocking-3d.md`，记录 `imageRegion` 优先、深度近似、投射中心 gizmo 和旧数据读取纠正规则。
- [ ] 更新 `docs/wiki/architecture/grok-build-provider.md`，记录本地 Grok bridge 的多模态资源转发边界。
- [ ] 使用 `readme-release-updater` 检查 Git 范围，更新 `docs/releases/release-notes.md` 的 2026-08-26 用户可见说明和 README 最新更新区；保留历史记录。
- [ ] 运行 `git diff --check`，确认文档、代码和测试只包含本任务范围。

## 6. 回归验收与交付

- [ ] 运行 shared build、服务端投影/Prompt/bridge 测试、客户端定向测试和 server/client typecheck。
- [ ] 在当前 5174/3100 实例上用真实浏览器刷新场景 3D 编辑器和分镜 3D 草图，检查投射中心方形/高度线与门窗桌椅方向，并查看本次刷新产生的控制台日志。
- [ ] 检查分支状态，使用 `git commit -s` 提交；从干净 main 执行 `pnpm workflow:integrate codex/scene-marker-projection-gizmo --push --verify "pnpm typecheck"`，确认本地 main 与 `origin/main` 一致。
- [ ] 只清理本任务已创建的 worktree 和分支，保留其他并行 worktree 的未提交改动，最后更新计划和目标状态。
