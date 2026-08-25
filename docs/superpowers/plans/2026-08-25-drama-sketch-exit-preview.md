# 分镜 3D 草图自动保存与 AI 预览修复计划

## 目标

完成 `2026-08-25-drama-sketch-exit-preview-design.md`：3D 草图退出自动保存并回灌分镜，AI 首帧不再把参考场景图当作成功结果或预览输出。

## 实施步骤

### 1. 回归测试先行

- 在 `server/tests/imageRuntimeState.test.js` 增加参考图字节完全相同的失败用例，断言 provider 结果不会落盘为 `done`，而是保存 `error`。
- 在 `client/tests/dramaBlocking3dPage.contract.test.js` 增加返回必须等待保存、刷新项目查询和成功后导航的合同断言。
- 在 `client/tests/shotVoiceBlockingSketchEntry.test.js` 增加 AI/3D 预览使用生成时间缓存参数、AI 图片失败空态的合同断言。
- 先运行对应测试，确认新回归在现有代码上失败。

### 2. 图片完整性边界

- 为参考附件准备流程增加 SHA-256 指纹。
- 将指纹传递给 provider 结果，在统一 image runtime 中校验生成 bytes。
- 命中参考图时在写入图片前抛错，沿用现有错误状态机。
- 在 `DramaShotKeyframeService` 增加已有 keyframe 的参考图重复检测和短缓存；keyframe 图片路由命中时返回 404。

### 3. 3D 草图退出保存

- 让 `handleSave` 返回 `Promise<boolean>`。
- 让返回动作在 dirty 时执行草稿 JSON + PNG 保存，保存失败留在页面。
- 保存成功后刷新 drama project 查询，清除 dirty，再导航。
- 保留显式保存/确认按钮的现有语义与 loading/disabled 状态。

### 4. 分镜预览状态

- 扩展 `LightboxImage` 的图片错误回调。
- 对 AI 图和 3D 草图 URL 使用 `generatedAt`/版本缓存参数。
- AI 图加载失败时显示无图状态，绝不切到 `scene.imageUrl`；保留重新生图入口。

### 5. 验证与交付

- 运行 server 定向 node tests、client 定向 tests、server/client typecheck/build。
- 用当前运行中的 3100/5174 内置浏览器验证返回自动保存、3D 图刷新、AI 图空态和 tab 切换；不重启现有服务、不触发生成任务。
- 检查用户可见变更并更新 release notes/README 最新更新；补充稳定架构规则到开发 wiki（若确有长期规则价值）。
- 在 `codex/drama-sketch-preview-fix` 签名提交，使用项目集成命令合并到 `main`、推送并清理 worktree，最后核对本地/远端状态。

## 风险与回滚边界

- 不删除现有图片或历史版本；异常旧图只在输出接口层拒绝，用户可重新生成。
- 参考图完整性校验仅拒绝字节级完全相同的结果，不对视觉相似但内容不同的合法生成结果做主观判断。
- 浏览器关闭无法等待异步保存，继续保留离开提示；应用内返回路径执行自动保存。
