# 模型预览光照与软阴影

## Background

模型库的 3D 预览同时承担材质检查和资产比较。模型接收 HDRI 环境光、方向光和地面阴影；如果环境光为零且阴影强度为满值，模型暗部会失去填充，地面投影也容易呈现黑色硬块。通用漫剧、动画和场景预览还依赖既有阴影基线，不能为了模型库效果直接改变共享运行时的默认行为。

## Decision

`blocking3d` 环境运行时支持由预览入口显式传入的 `lightingProfile`。模型详情页和模型离屏缩略图使用 `model-preview`，动画、分镜和场景不传入该 profile，继续使用 `default`。

模型 profile 的固定参数是：

- 环境补光 `ambientLight = [0.18, 0.18, 0.18]`，让材质暗部保留可读细节。
- HDRI `envAtlas` 对模型环境填充和反射的贡献为 `skyboxIntensity = 0.25`；可见背景穹顶不受该值影响，因此背景亮度和全景构图保持不变。
- 阴影过滤使用 PlayCanvas `SHADOW_PCF5_32F`，比默认 PCF3 有更柔和的边缘。
- 阴影贴图分辨率保持 2048，阴影距离收窄为 16 米，减少无效范围造成的锯齿。
- `shadowIntensity = 0.30`，保留投影方向和接触关系，同时避免乘法阴影把地面压成过重的黑块。
- `shadowBias = 0.025`、`normalOffsetBias = 0.02`，在近距离模型预览中降低阴影悬浮和自阴影伪影。

配置集中在 `blocking3dEnvironmentLightingProfile.ts`，主光创建和环境运行时只消费 profile，不在各个页面复制参数。未指定 profile 时仍使用原有零环境补光、PCF3、25 米阴影距离和满阴影强度的默认配置。

## Current Rule

- 模型详情页必须通过 `studioEnvironmentRuntime` 将 `model-preview` 传给共享环境运行时。
- 模型缩略图必须使用同一 profile，并在光照参数发生用户可见变化时递增缩略图缓存版本，确保旧图不会覆盖新效果。
- 动画、分镜和场景入口不得隐式继承 `model-preview`；它们只有在明确的产品需求下才能单独接入新的 profile。
- profile 只能表达环境光、阴影过滤、阴影范围、强度和偏差等渲染参数，不能把模型页面逻辑塞进共享运行时。
- `skyboxIntensity` 只随当前环境 atlas 的所有权应用和恢复：模型预览使用 `0.25`，未指定 profile 的共享预览保持 `1`；清理时若 atlas 已被其他运行时接管，不得覆盖其他预览的环境强度。
- 环境资源失败时仍沿用运行时的清理和 fallback 行为，不能为了显示模型而保留失效的 WebGL 资源。

## Failure Modes

- 只降低方向光强度：模型整体变暗，地面阴影仍可能是纯黑，不能解决阴影接收器的乘法结果。
- 只改阴影贴图分辨率：边缘采样会改善，但环境光不足导致的黑色暗部不会消失。
- 直接修改共享默认 profile：动画、分镜和场景的画面会无意变化，难以判断是模型优化还是回归。
- 只修改实时模型详情页：模型卡片仍读取旧缩略图，用户横向比较时会看到两套不同的光影。
- 调整光照后不刷新缩略图缓存：localStorage 中的旧版本会继续命中，导致代码已生效但卡片看不到变化。

## Related Modules

- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLightingProfile.ts`：模型与默认光照 profile 的唯一配置源。
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentKeyLight.ts`：将 profile 应用到 PlayCanvas 方向光。
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts`：将 profile 的环境补光应用到场景并负责生命周期清理。
- `client/src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts`：模型库环境适配层，负责透传 profile。
- `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`：模型详情实时预览入口。
- `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`：模型卡片离屏渲染和缩略图缓存。

## Verification

- `client/tests/modelPreviewLighting.contract.test.js` 锁定 profile 数值、模型入口接入范围和缩略图缓存版本。
- 模型页面的浏览器验收需要确认环境加载完成后暗部可读、地面阴影为柔和灰阶且无明显锯齿，同时检查控制台无错误。
