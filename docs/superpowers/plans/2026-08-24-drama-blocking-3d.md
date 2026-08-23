# 漫剧分镜 3D 摆位台实施计划

## Goal

把现有分镜行里的 2D 摆位草图入口升级为独立的 3D 摆位页面：用 PlayCanvas 渲染可操作的 3D 代理角色，保存相机/位置/旋转/缩放/姿势快照，并继续上传 PNG 作为分镜生成参考图。

## Step 1: 建立共享 3D 契约与纯逻辑测试

- 在 client/server 共享的摆位草图类型中增加 `BlockingSketchPose`、`layout3d`、相机和 3D actor 快照类型。
- 对 3D 相机、位置、旋转、缩放、角色数量、姿势值做有限范围归一化；旧 JSON 没有 `layout3d` 时保持原结果。
- 添加测试：旧 2D 数据兼容、合法 3D 数据保留、越界/未知姿势拒绝、3D 快照转旧 2D 投影字段。

## Step 2: 接入服务端保存/读取/路由 schema

- 更新 blocking sketch route 的 zod schema，允许并校验 `layout3d`。
- 更新保存服务，保存 3D 快照且不丢失已有 URL/时间戳语义；确认和 keyframe 读取逻辑继续只依赖可读的 PNG/现有角色字段。
- 添加 focused route/service/keyframe 回归测试，证明 3D 字段不会被保存服务剥掉。

## Step 3: 引入参考项目的 PlayCanvas runtime

- 在 client 引入 `playcanvas`，复用参考项目的 CC0 Quaternius UAL1/UAL2 GLB 代理/动画资源并保留许可证文件。
- 在 `components/blocking3d/` 建立小型模块边界：姿势映射、轨道相机、PlayCanvas viewer、快照投影和页面控制器分离；不把参考项目的 Director World/3GS 业务耦合搬进当前项目。
- viewer 提供 WebGL 初始化/销毁、背景图片平面、地面/网格/灯光、代理角色加载、选中、拖动/键盘微调、旋转、缩放、姿势采样/播放、相机状态和 PNG 导出。
- 为 viewer 的纯姿势映射和快照恢复写 focused tests；用依赖注入/接口隔离避免 node test 需要真实 WebGL。

## Step 4: 建立独立 3D 页面并接入现有入口

- 新增 `/drama/projects/:id/shots/:shotId/blocking-3d` 路由和页面。
- 页面使用项目现有语义 token 与 Button/Card/Badge/SelectControl/toast，包含角色列表、姿势选择、移动/旋转/缩放控制、相机操作、加载/错误/空状态和保存底栏。
- 修改分镜行入口为导航到独立页面；保留旧 2D dialog 作为旧数据或 WebGL 失败时的降级编辑器。
- 离开页面时保护未保存变更；保存先写 JSON，再从当前 canvas 上传 PNG；确认沿用现有确认接口。

## Step 5: 文档与回归验证

- 更新稳定的 3D 摆位工作流 wiki；按 release-note 规则更新用户可见变更说明和 README 最新更新。
- 运行 client focused tests/typecheck/build，server focused tests/typecheck；必要时运行全量相关测试。
- 在当前本地浏览器实际进入独立页面，加载第一镜角色，切换坐着/躺着/趴着，移动角色与相机，保存、确认、返回并检查分镜状态。
- 提交独立分支，合并到 main，推送 `origin main`，确认最终工作树和远端 ref。

