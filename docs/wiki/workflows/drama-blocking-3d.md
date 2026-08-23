# 漫剧分镜 3D 摆位工作流

## Background

分镜生成需要先确定镜头中的角色相对位置、视角和动作。旧的摆位草图只在场景全景图上做二维叠放，能够快速修正构图，但无法表达角色的前后深度、垂直位置、旋转或坐着、躺着等姿势。3D 摆位台承担的是“生成分镜前的构图预演”，不是最终角色资产或成片渲染器。

## Decision

- 3D 摆位台使用独立路由 `/drama/projects/:id/shots/:shotId/blocking-3d`，不把 3D 引擎状态塞进旧的二维弹窗。
- 视口使用 PlayCanvas WebGL。通用 Quaternius UAL 角色模型只作为低成本摆位代理，保存的 PNG 仍是分镜首帧生成可以消费的构图参考图。
- 场景全景图作为视口背景，角色代理放在带网格的地面上；相机、角色位置、朝向、缩放、姿势和动作播放状态一起保存为 `layout3d` 快照。
- 3D 保存和确认继续复用原有摆位草图接口。确认后的 PNG 仍按旧规则成为分镜画面的首位锁定参考图，未确认的草图不能进入分镜生成链。
- 旧数据没有 `layout3d` 时，前端把已有二维角色位置投影到默认 3D 布局；旧的 2D 草图入口保留为兼容和精细叠图回退路径。

## Current Rule

### 视口交互

- 左键拖动角色调整地面位置，右键拖动旋转相机，中键拖动平移相机，滚轮调整距离。
- 右侧控制面板提供选中角色的前后左右、上下、旋转、缩放和落地操作；相机支持适配和重置。
- 角色列表负责加入、选择和移除本镜角色。保存前页面会监听视口直接拖动和相机变化，避免用户操作后仍被误认为未修改。

### 姿势与动作

姿势使用稳定的业务枚举保存，不把具体 GLB 动画剪辑名暴露给 API。当前支持站立、交谈、抱臂、坐着、蹲下、跪下、躺着、趴着、走路、跑步、指向、持物、互动、战斗和持剑，并可单独播放或暂停动作。

UAL 代理资源没有专用“趴着”剪辑时，运行时使用最接近的贴地/躺卧剪辑作为视觉近似；业务快照仍保存 `prone`，以后替换代理资源不需要迁移数据库数据。代理姿势只服务摆位，不替代角色真实设计稿。

### 数据与下游

`layout3d` 使用版本化结构保存：

- `schemaVersion` 固定为 `1`，并声明 `engine: "playcanvas"`。
- `camera` 保存方位角、俯仰角、距离和观察焦点。
- `actors` 保存角色名、三维位置、绕 Y 轴朝向、缩放、姿势和动作是否播放。
- 服务端只做结构校验、范围归一化和兼容旧数据，不根据角色名或文本关键词猜测摆位。
- 下游分镜生成优先消费已确认的 PNG；`layout3d` 负责恢复和继续编辑 3D 摆位，不能绕过确认状态直接成为生成参考图。

## Failure Modes

- 不能把通用代理模型当成最终角色渲染结果，否则会把低模、临时材质和动画库限制带进成片。
- 不能只保存 PNG 而丢失 `layout3d`，否则用户无法继续调整空间关系和姿势。
- 不能把 3D 草图确认前的图片注入分镜生成或批量任务；确认状态仍是参考图锁定的闸门。
- 不能删除旧 2D 数据或要求已有项目重新摆位；缺少 3D 快照时必须能够从旧二维布局恢复一个可编辑的默认 3D 场景。
- 姿势枚举是业务契约，代理 GLB 的剪辑名可以变化。若某个代理缺少剪辑，应明确报出资源能力问题或采用已定义的近似剪辑，不得静默把用户选择改成站立。

## Related Modules

- `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dMath.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.ts`
- `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`
- `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- `server/src/modules/drama/http/dramaRoutes.ts`
- `docs/wiki/workflows/short-drama-workspace.md`

## Source Documents

- `docs/superpowers/specs/2026-08-24-drama-blocking-3d-design.md`
- `docs/superpowers/plans/2026-08-24-drama-blocking-3d.md`
- MyDrama viewer-kit 的 PlayCanvas 3D Director 参考实现
