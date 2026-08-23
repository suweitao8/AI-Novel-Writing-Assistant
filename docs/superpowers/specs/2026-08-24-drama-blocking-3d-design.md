# 漫剧分镜 3D 摆位台设计

## Background

当前「摆位草图」是在场景图片上用 Canvas2D 叠放角色状态图。它能保存一张参考图，但不能表达真实的前后深度、相机轨道或角色姿势，无法满足需要在镜头空间内调度角色的分镜工作流。

参考项目的 Director World/3GS 使用 PlayCanvas WebGL 场景、可序列化的 3D marker 快照和 Quaternius 通用骨骼代理模型。当前项目已经把摆位草图 PNG 作为首帧参考图交给分镜生成，因此新实现应复用这条生成链，而不是另造一套分镜资产接口。

## Decision

将摆位草图升级为一个独立的 3D 摆位页面：

1. 使用 PlayCanvas 创建真实 WebGL 场景。场景包含地面、透视相机、网格、灯光，以及把当前场景状态图作为背景平面加载到 3D 场景中；角色不是 CSS/Canvas 图片，而是带骨骼动画的 Quaternius UAL2 通用 3D 代理模型。
2. 从当前镜头的角色列表加入/移除代理角色。角色支持点击选中、X/Y/Z 空间移动、地面吸附、Y 轴旋转、整体缩放和镜头对准；右键轨道、滚轮缩放、WASD/QE 移动相机，键盘按钮与非鼠标操作同时可用。
3. 为选中角色提供姿势预设：站立、交谈、抱臂、坐着、蹲伏、跪着、躺着、趴着、行走、奔跑、指向、持物、互动、格斗、持械。预设来自参考项目的 Quaternius 动画 clip；没有独立「趴着」clip 时使用同一骨骼的倒地 clip 作为可保存的姿势映射，并保留 `prone` 语义，避免 UI 退化成只有站立。
4. 每个角色的姿势支持暂停在当前动作帧或循环播放。保存的不是视频帧，而是可恢复的姿势名、动作播放状态、位置、旋转和缩放。
5. 保存时导出两份结果：
   - 3D 快照写入现有 `blockingSketchData`，用于下次恢复和后续扩展；
   - 当前 WebGL 画布导出 PNG，继续通过现有上传接口作为首帧参考图。
6. 当前已有的 2D 数据继续可读。服务端对 3D 字段做显式 schema 校验并以可选 `layout3d` 保存；没有 `layout3d` 的旧草图仍按原来的 2D 结构显示，不做破坏性迁移。
7. 「摆位草图」按钮进入独立路由页面，页面提供返回、保存草图、确认草图和未保存状态反馈。确认规则继续沿用现有规则：只有上传成功的 PNG 才能确认，确认后分镜生成链把该 PNG 作为锁定的布局参考图。

## 3D data contract

在现有 `DramaShotBlockingSketchData` 上增加可选字段：

```ts
layout3d?: {
  schemaVersion: 1;
  engine: "playcanvas";
  camera: {
    azim: number;
    elev: number;
    distance: number;
    focalPoint: [number, number, number];
  };
  actors: Array<{
    characterName: string;
    position: [number, number, number];
    yawDeg: number;
    scale: [number, number, number];
    pose: BlockingSketchPose;
    actionPlaying: boolean;
  }>;
}
```

`layout3d.actors` 与主 `actors` 以 `characterName` 关联。主 actors 的 `x/y/scale/flipX/zIndex` 继续保留，用于旧消费者和兼容解析；3D 页面保存时从 3D 快照生成稳定的 2D 投影字段，不能让旧 keyframe/context 代码因为缺少旧字段而失效。

## Boundaries

- 3D 代理模型用于空间、镜头和姿势预演，不替换角色真实参考图；最终分镜仍使用角色状态图/设计稿和摆位 PNG。
- 本阶段不要求为每个角色生成可驱动的专属 GLB，也不把 2D 角色状态图伪装成立体模型。
- 本阶段不引入场景建模、碰撞网格或道具资产编辑；网格和背景平面仅为稳定的 3D 摆位参照，后续可以在同一快照契约中扩展。
- 不删除旧 2D 弹窗逻辑，先保留为无 WebGL 或旧数据的降级入口，保证已有草图仍可编辑。

## Interaction and accessibility

- 独立页面使用现有 `Button`、`Card`、`Badge`、`SelectControl`、`toast` 和语义 Tailwind token，不引入新的 UI 组件库或硬编码主题色。
- 3D 视口有加载中、加载失败、无场景图和 WebGL 不可用状态；保存/确认按钮在保存中禁用并显示状态。
- 所有图标按钮带 `aria-label`，角色列表和姿势选择提供键盘可达的按钮/下拉操作；鼠标拖动之外提供位置微调、旋转、缩放和姿势按钮。
- 未保存变更离开页面时给出浏览器级离开保护；Esc/返回操作不会静默丢失快照。

## Verification

- 纯契约/数学模块：客户端 node test、服务端契约测试覆盖 3D 快照归一化、旧数据兼容、范围拒绝和姿势映射。
- 前端：client typecheck/build；PlayCanvas viewer 的初始化、代理模型加载、快照恢复和销毁通过 focused tests 覆盖。
- 后端：blocking sketch route/service/keyframe tests 证明 3D 字段可保存、确认和继续作为 PNG 参考图。
- 运行态：在当前本地工作台进入独立 3D 页面，实际加入角色、切换坐姿/躺姿/趴姿、移动相机、保存并确认，再返回分镜页检查状态。
