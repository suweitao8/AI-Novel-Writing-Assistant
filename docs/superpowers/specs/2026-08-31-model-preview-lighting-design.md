# 模型预览环境光与软阴影设计

## Background

模型库 3D 预览当前能显示 HDRI 背景和模型材质，但模型底部的投影阴影接近纯黑，边缘有明显锯齿，模型背光面也缺少环境补光。问题来自共享的 blocking3d 环境运行时：加载 HDRI 后把 `scene.ambientLight` 设为黑色，方向光沿用 PlayCanvas 默认 PCF3 过滤，且阴影接收器使用乘法材质，方向光阴影强度为 1 时会把地面投影压成黑块。

模型、动画、分镜和场景预览共用这套环境运行时，但本次需求只针对模型库详情预览和模型库卡片缩略图。必须避免为修复模型视觉效果而改变分镜的既有光照或场景纯环境预览的行为。

## Decision

为共享环境运行时增加显式的光照 profile。模型详情页和模型缩略图使用 `model-preview` profile；动画详情、动画缩略图、分镜 3D 和场景环境预览继续使用默认 profile。

`model-preview` profile 的初始参数如下，最终以真实浏览器截图校准：

- 使用低强度中性环境光为模型暗部提供填充，不覆盖 HDRI 的方向性和颜色。
- 方向光使用 PlayCanvas `SHADOW_PCF5_32F`，通过 5×5 采样软化阴影边缘。
- 保持 2048 阴影贴图分辨率，并把方向光 `shadowDistance` 从 25 米收紧到 16 米，让模型预览中有限的地面区域获得更高的有效像素密度。
- 将 `shadowIntensity` 调整到约 0.62，使阴影保留接触关系和方向，同时避免乘法阴影变成纯黑块。
- 将 `shadowBias` 与 `normalOffsetBias` 调整到较小的模型预览值，减少阴影漂浮和表面锯齿；不通过提高 bias 掩盖阴影贴图质量问题。

不重写现有 HDRI 投影穹顶和阴影接收器，不引入第二套背景或手工绘制的假阴影。模型材质仍使用现有的真实贴图、法线和粗糙度，profile 只负责环境光、方向光和阴影采样配置。

## Architecture and data flow

```text
模型详情页 / 模型缩略图
        │ loadStudioEnvironment({ lightingProfile: "model-preview" })
        ▼
模型环境适配层
        │ createBlocking3dEnvironmentRuntime(..., { lightingProfile })
        ▼
共享环境运行时
        ├─ 设置 profile 对应的 scene.ambientLight
        ├─ 创建 profile 对应的 HDRI 方向光
        ├─ 生成同一份 envAtlas 与可见 HDRI 穹顶
        └─ 通过 shadowIntensity 驱动同一阴影接收器
```

默认 profile 不改变现有调用方的参数。模型库缩略图显式传入 `model-preview`，因此卡片和详情页的光照一致；动画相关调用不传该 profile，继续使用默认值。

## Compatibility and boundaries

- profile 是共享运行时的显式类型，不在调用方复制 PlayCanvas 参数。
- 默认 profile 的现有方向光、环境光和阴影行为保持不变。
- 运行时清理环境时仍恢复 fallback ambient light，避免模型运行时退出后污染宿主应用。
- 不改变模型的相机、HDRI 预设、材质贴图、半球尺寸或用户 Transform。
- 不改变分镜角色身上的手工缩放、位置、姿势和保存合同。

## Validation

代码验证：

- profile 单元/契约测试：模型 profile 的环境补光、PCF5、阴影距离、阴影强度和 bias 参数稳定；默认 profile 不携带模型专用覆盖。
- 模型环境适配测试：详情页和模型缩略图传递 `model-preview`，动画与分镜保持默认。
- client typecheck/build 和受影响的前端测试。

浏览器自测：

- 在内置浏览器打开 `/models/bed-12a`，等待真实 GLB、材质和 HDRI 加载完成。
- 对比修改前截图，确认床体背光面可见环境填充，地面阴影不再接近纯黑，边缘明显软化且锯齿减少。
- 回到 `/models`，确认缩略图使用同一光照 profile。
- 检查控制台无错误；不执行生成、保存或其他会修改业务数据的操作。

## Acceptance criteria

1. 模型详情预览存在可见但不过曝的环境补光。
2. 模型投影阴影不再是纯黑乘法块，仍能看出接触和方向。
3. 阴影边缘使用软阴影过滤，截图中锯齿较当前基线明显减少。
4. 模型详情和缩略图视觉配置一致。
5. 动画、分镜 3D、场景环境预览没有被模型 profile 改写。
