# HDRI 半球地面阴影设计

## Background

场景 3D 草图当前使用自定义 `ShaderMaterial` 把全景图投射到有限半球上。它能提供 HDRI 的可见背景和环境光，但这条自定义材质没有 PlayCanvas 标准光照材质的阴影采样通道。同时，HDRI 派生方向光和代理角色实例都显式关闭了阴影投射，因此场景中即使有角色，也不会在半球地面看到影子。

## Decision

保留现有 HDRI 投影材质作为唯一可见背景，并在同一世界坐标中增加一个只覆盖下半部地面和弧形过渡的独立 shadow catcher。shadow catcher 使用 PlayCanvas `StandardMaterial.shadowCatcher` 和乘法混合：无阴影区域相当于乘以白色，不改变 HDRI；有阴影区域只压暗背景。它复用地面半球几何，但不覆盖天空部分，避免把角色阴影投到天空图像上。

HDRI 加载成功后，派生方向光开启 `castShadows`，代理角色开启 `castShadows`；shadow catcher 的 `MeshInstance.receiveShadow` 开启、`castShadow` 关闭，并使用有限阴影距离、PCF 阴影和适合当前米制场景的 bias。没有 HDRI 时继续使用现有纯色地面和原有回退光照行为。

透明家具/场景标记继续作为编辑辅助，不参与物理阴影；真正加入世界的角色或模型才是阴影投射者。该改动只覆盖 PlayCanvas 场景/分镜 3D 草图，Remotion 最终视频仍使用自己的 2D 合成链路。

## Components and data flow

1. `blocking3dViewerApp` 实例化代理角色时请求投射阴影。
2. `blocking3dEnvironmentKeyLight` 创建可投射阴影的 HDRI 派生方向光。
3. `blocking3dEnvironmentRuntime` 加载 HDRI 时同时创建可见背景和地面 shadow catcher；切换、失败、销毁时同时释放两套网格与材质。
4. `blocking3dViewerCore` 提供现有 PlayCanvas 几何包装和 shadow-catcher 材质配置，确保 shadow catcher 使用和可见地面相同的米制缩放。
5. 半球直径或投射中心高度变化时，可见半球和 shadow catcher 一起重建；全景分界线只更新投影 uniform。

## Alternatives considered

- 在全景投影 GLSL 中手写 PlayCanvas 阴影贴图采样：理论上可以让同一个 draw call 接收阴影，但必须复制引擎光源的 shadow uniform、坐标变换和阴影类型分支，容易随 PlayCanvas 升级失效。
- 把整个半球改成 `StandardMaterial`：可以获得标准阴影，但会失去当前基于世界坐标的 cubemap 投影契约，且容易让天空也参与实体光照。
- 使用独立地面 shadow catcher：利用 PlayCanvas 官方支持的 shadow-catcher 分支，保持全景投影不变，只让地面接收阴影，边界和生命周期也容易测试。因此采用此方案。

## Error handling and lifecycle

shadow catcher 创建失败必须和 HDRI 资源加载失败一样进入现有环境清理路径，不能留下半套材质或网格。shadow catcher 不拥有 HDRI 纹理；可见背景和投影 cubemap 仍由现有环境资源负责释放。切换请求被更新请求接管时，旧 shadow catcher 与旧投影背景一起丢弃。

## Verification

- 合同测试确认方向光和代理角色开启投影，shadow catcher 只使用地面几何、开启接收并在重建/销毁路径中释放。
- 服务端不受影响；运行 client 类型检查或构建，以及 HDRI 相关合同测试和 PlayCanvas 环境单元测试。
- 在本地 3D 场景中加载一张 HDRI、放置参考角色并观察地面是否出现与 HDRI 派生主光方向一致的柔和阴影；移动角色后影子应随位置变化，天空不应出现影子。
