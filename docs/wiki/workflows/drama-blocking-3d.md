# 漫剧分镜 3D 草图工作流

## Background

分镜生成需要先确定镜头中的角色相对位置、视角和静态姿势。3D 草图承担的是“生成分镜前的构图预演”，不是最终角色资产或成片渲染器。角色动画库只用来采样可复现的关键帧，视口本身不播放动作。

## Decision

- 用户从每一镜唯一的「3D 草图」入口进入独立路由 `/drama/projects/:id/shots/:shotId/blocking-3d`；服务端继续保留 `blockingSketchData` 和旧 PNG 接口，保证已有项目可读取。
- 视口使用 PlayCanvas WebGL。通用 Quaternius UAL 角色模型只作为低成本摆位代理，保存的 PNG 仍是分镜首帧生成可以消费的构图参考图。
- 场景状态图作为半球 HDRI 环境贴图，角色代理放在半球底部的弧形地面上；环境固定在世界坐标，避免把场景图铺成后置平面或在相机旋转时搬动地面。相机、角色位置、朝向、缩放和静态姿势一起保存为 `layout3d` 快照。
- 姿势先从 UAL 动画剪辑采样一个稳定时间点，再暂停动画并渲染该帧；保存的 `actionPlaying` 仅为旧数据兼容字段，规范化后始终为 `false`。
- 3D 保存和确认继续复用原有摆位草图接口。确认后的 PNG 仍按旧规则成为分镜画面的首位锁定参考图，未确认的草图不能进入分镜生成链。
- 旧数据没有 `layout3d` 时，前端把已有二维角色位置投影到默认 3D 布局；旧的二维 JSON/PNG 只作为数据兼容，不再提供用户侧 2D 编辑入口。

## Current Rule

### 视口交互

- 左键拖动角色调整地面位置，右键拖动旋转相机，中键拖动平移相机，滚轮调整距离。
- 右侧控制面板提供选中角色的前后左右、上下、旋转、缩放和落地操作；相机支持适配和重置。
- 角色列表负责加入、选择和移除本镜角色。保存前页面会监听视口直接拖动和相机变化，避免用户操作后仍被误认为未修改。

### 静态姿势与关键帧

姿势使用稳定的业务枚举保存，不把具体 GLB 动画剪辑名暴露给 API。当前支持站立、交谈、抱臂、坐着、蹲下、跪下、躺着、趴着、走路、跑步、指向、持物、互动、战斗和持剑。用户选择姿势后，运行时只截取对应关键帧，不提供播放动作入口。

UAL 代理资源没有专用“趴着”剪辑时，运行时使用最接近的贴地/躺卧剪辑作为视觉近似；业务快照仍保存 `prone`，以后替换代理资源不需要迁移数据库数据。代理姿势只服务摆位，不替代角色真实设计稿。

### 数据与下游

`layout3d` 使用版本化结构保存：

- `schemaVersion` 固定为 `1`，并声明 `engine: "playcanvas"`。
- `camera` 保存方位角、俯仰角、距离和观察焦点。
- `actors` 保存角色名、三维位置、绕 Y 轴朝向、缩放、姿势和兼容字段 `actionPlaying`；该字段必须是 `false`。
- 服务端只做结构校验、范围归一化和兼容旧数据，不根据角色名或文本关键词猜测摆位。
- 下游分镜生成优先消费已确认的 PNG；`layout3d` 负责恢复和继续编辑 3D 摆位，不能绕过确认状态直接成为生成参考图。
- 3D 视口可以随工作区自适应，但摆位 PNG 始终按开发基准 1280×720（严格 16:9）捕获，避免浏览器窗口尺寸改变分镜参考图契约。
- 保存流程会在写入快照、捕获 PNG 和上传确认期间锁住视口及控制面板；保存结束后再恢复编辑，确保 JSON 空间状态和 PNG 构图来自同一次摆位。

## Failure Modes

- 不能把通用代理模型当成最终角色渲染结果，否则会把低模、临时材质和动画库限制带进成片。
- 不能只保存 PNG 而丢失 `layout3d`，否则用户无法继续调整空间关系和姿势。
- 不能把 3D 草图确认前的图片注入分镜生成或批量任务；确认状态仍是参考图锁定的闸门。
- 不能删除旧二维数据或要求已有项目重新摆位；缺少 3D 快照时必须能够从旧二维布局恢复一个可编辑的默认 3D 场景，但前端只暴露 3D 草图入口。
- 姿势枚举是业务契约，代理 GLB 的剪辑名可以变化。若某个代理缺少剪辑，应明确报出资源能力问题或采用已定义的近似剪辑，不得静默把用户选择改成站立。

### HDRI 环境

场景状态图加载到内侧剔除的 EnviroDome 式环境网格中。接近 2:1 的等距 HDRI 由完整半球承担天空和弧面地面；普通 16:9 场景图则由上半球显示天空/远景，并用同一贴图的下半球网格承接下半幅图像，地面仍然是带贴图的弧面而不是后置平面。加载成功后隐藏仅用于无环境时兜底的纯色地面平面，定位网格仍作为辅助线绘制在地面上。环境实体固定在世界坐标，Y 轴固定在世界地面；相机旋转或移动只改变视点，不搬动环境地面。没有状态图或环境加载失败时恢复纯色地面。

场景状态图和真正的等距 HDRI 不能共用同一种地面采样：2:1 素材保留标准等距半球 UV；其他比例（当前产品默认是 1280×720 场景图）把上半球限制在源图上半幅，并让独立的下半球网格采样源图下半幅，保持 EnviroDome 的圆球投影形状。环境纹理使用线性采样、关闭 mipmap、各向异性过滤和边缘寻址；环境材质用自发光强度显示贴图，不让场景灯光压糊地面细节。

`layout3d.environment` 是可选的向后兼容字段，保存投射中心高度、半球尺寸、水平旋转和环境亮度。投射中心严格位于世界 X/Z 原点，只有世界 Y 高度可调；普通场景图的下半球按投射中心到地面顶点的方向计算一次 UV，不通过重复贴图制造密度变化，环境实体和地面中心仍固定在世界原点。旧快照中的 `groundTextureScale` 作为未知字段被忽略，新的导出数据不会再写回。右侧 HDRI 环境面板是这些参数的唯一编辑入口，保存草图时与角色、相机快照一起写回。

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
- `docs/superpowers/specs/2026-08-24-drama-blocking-3d-static-hdri-design.md`
- `docs/superpowers/plans/2026-08-24-drama-blocking-3d-static-hdri.md`
- `docs/superpowers/specs/2026-08-24-drama-hdri-backdrop-clarity-design.md`
- `docs/superpowers/plans/2026-08-24-drama-hdri-backdrop-clarity.md`
- MyDrama viewer-kit 的 PlayCanvas 3D Director 参考实现
