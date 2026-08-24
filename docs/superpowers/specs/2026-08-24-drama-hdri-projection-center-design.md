# 漫剧 3D 草图投射中心设计

## 背景

上一版为了让普通 16:9 场景图的地面细节变小，直接把下半球 UV 重复了多次。这会把同一张场景图平铺成明显的 repeat 图案，与 Unreal HDRIBackdrop 的地面投射不同。UE 5.5 插件的 `HDRIBackdrop` Blueprint 暴露 `ProjectionCenter`、`Size` 和 `UseCameraProjection`，地面投射材质使用投射位置参与世界位置采样，而不是一个地面纹理密度参数。

## 决策

1. 删除 `groundTextureScale`：不再重复 UV，不再提供“地面贴图密度”控件，也不再把这个字段写入新的 `layout3d.environment`。旧快照中残留的字段在归一化时忽略，保持读取兼容。
2. 保留 `projectionCenterHeight`，但语义改为投射中心的世界 Y 坐标。投射中心的 X/Z 永远是世界原点，地面仍固定在世界 Y=0；用户只能调整高度。
3. 普通 16:9 场景图的地面 UV 使用投射中心到地面网格顶点的方向计算：水平角决定 U，方向的俯视角映射到源图下半幅 V。UV 始终只采样一次源图下半幅，不使用 `Math.floor`、UV repeat 或纹理平铺。
4. `projectionCenterHeight` 不再缩放半球的 Y 轴。环境实体保持统一 `domeRadius` 尺度，投射中心高度只改变地面纹理的投射关系；天空和地面实体仍固定在世界原点。
5. 2:1 等距 HDRI 继续使用完整 `DomeGeometry`；投射中心高度只作用于普通场景图的独立地面投射网格，因为完整等距 HDRI 已经包含标准球面投影。

## 数据与兼容

`DramaShotBlockingSketch3DEnvironment` 继续保存 `projectionCenterHeight`、`domeRadius`、`yawDeg` 和 `intensity` 四个字段，`schemaVersion: 1` 不变。缺少环境字段的旧布局仍由 viewer 使用默认投射中心高度 1；带有历史 `groundTextureScale` 的布局不会再读写该字段。

## 验证标准

- 源码和契约测试确认不存在 `groundTextureScale`、UV repeat 或基于 `Math.floor` 的地面平铺路径。
- 页面显示“投射中心高度”和“半球直径”，范围分别为 0.6–10 和 20–100，并使用现有语义 token 和 range 控件。
- 当前普通场景图页面能看到地面纹理保持单次投射，不出现重复拼贴；调整投射中心高度会改变中心区域的投射紧密程度。
- 投射中心 X/Z 和环境实体位置始终是世界原点，角色脚下的地面不随相机移动。
- 客户端/服务端定向测试、类型检查、构建和当前页面控制台检查通过。
