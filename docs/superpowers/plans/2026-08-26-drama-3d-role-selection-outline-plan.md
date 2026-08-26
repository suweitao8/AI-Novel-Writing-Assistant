# 漫剧 3D 角色选中外描边实现计划

> **执行约束：** 每个实现任务先补充能表达行为的失败测试，再写最小生产代码让测试通过；完成后运行客户端构建和真实浏览器验收。

## 任务 1：锁定轮廓渲染契约

- 修改 `client/tests/dramaBlocking3dPage.contract.test.js`，把旧的 AABB `drawEntitySelectionOutline` 契约替换为独立轮廓层、当前角色切换、相机帧同步和捕获隔离契约。
- 运行聚焦测试，确认新断言在旧实现上失败。

## 任务 2：接入 PlayCanvas 屏幕空间轮廓

- 重构 `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dSelectionOutline.ts`，封装独立 `Layer` 与 `OutlineRenderer` 的创建、选择对象切换、逐帧同步、捕获期间隐藏和销毁。
- 在 `blocking3dViewerApp.ts` 中创建并维护轮廓运行时，选中角色/参考角色时绑定到当前实体；移除 AABB 线框调用。
- 让捕获 PNG 前暂时移除轮廓，捕获后恢复；保持场景标记、角色脚底圆环和对象选择行为不变。

## 任务 3：聚焦验证与视觉回归

- 运行 blocking 3D 相关契约测试和客户端类型/构建检查。
- 启动或复用固定端口的本地服务，用内置浏览器选择普通角色、怪物和参考角色，确认真实轮廓、取消选择和相机变化后的效果。
- 检查工作区 diff，确认没有改动数据库、导出布局协议或无关模块。

## 任务 4：交付收尾

- 按用户可见变化更新 `docs/releases/release-notes.md` 与 README 最新更新。
- 请求独立代码审查，修复审查指出的问题并重新验证。
- 在隔离分支签名提交，通过集成入口合并到 `main`、显式推送 `origin/main`，最后清理本任务工作树并核对本地/远端状态。

