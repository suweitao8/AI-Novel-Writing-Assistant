# 模型预览光照与软阴影

## Background

模型库和动画库的 3D 预览同时承担材质、动作和资产比较。模型接收 HDRI 环境光、方向光和地面阴影；如果卡片离屏实例不参与投影，缩略图就会与详情页出现“卡片无阴影、点开有阴影”的断层。阴影强度过低时，即使链路正确，缩略图尺寸下也难以辨认落地关系。通用漫剧、分镜和纯 HDRI 预览仍依赖既有默认阴影基线，不能为了资产卡片效果直接改变共享默认行为。

## Decision

`blocking3d` 环境运行时支持由预览入口显式传入的 `lightingProfile`。模型详情页、模型缩略图、动画详情页和动画缩略图使用 `model-preview`；漫剧、分镜和纯 HDRI 场景不传入该 profile，继续使用 `default`。

模型 profile 的固定参数是：

- 环境补光 `ambientLight = [0.18, 0.18, 0.18]`，让材质暗部保留可读细节。
- HDRI `envAtlas` 对模型环境填充和反射的贡献保持 `skyboxIntensity = 1`；可见背景穹顶不受该值影响，因此背景亮度和全景构图保持不变，同时模型不会只剩弱常量环境光。
- 阴影过滤使用 PlayCanvas `SHADOW_PCF5_32F`，比默认 PCF3 有更柔和的边缘。
- 阴影贴图分辨率保持 2048，阴影距离收窄为 16 米，减少无效范围造成的锯齿。
- `shadowIntensity = 0.62`，在 288×216 卡片缩略图中保留清晰的投影方向和接触关系；环境补光仍负责避免模型暗部变成黑块。
- `shadowBias = 0.025`、`normalOffsetBias = 0.02`，在近距离模型预览中降低阴影悬浮和自阴影伪影。
- `hdriAzimuthOffsetDegrees = 180`，绕世界 Y 轴翻转模型预览的 HDRI 方位并保留原有高度；可见 HDRI 穹顶、`envAtlas` 环境光和派生方向光必须使用同一方位。

配置集中在 `blocking3dEnvironmentLightingProfile.ts`，主光创建和环境运行时只消费 profile，不在各个页面复制参数。未指定 profile 时仍使用原有零环境补光、PCF3、25 米阴影距离和满阴影强度的默认配置。

PlayCanvas 的 `Scene.skyboxRotation` 是环境查找的逆旋转：profile 的世界方位偏移为 `offset` 时，EnvAtlas 使用绕 Y 轴的 `-offset` 场景旋转。自定义可见 HDRI 投影也必须用 `-offset` 从立方体反向取样；方向光则使用 `+offset` 旋转高光区域推导方向。这样同一张 HDRI 中的亮部、模型受光面和地面阴影才会落在同一侧。

## Current Rule

- 模型详情页必须通过 `studioEnvironmentRuntime` 将 `model-preview` 传给共享环境运行时。
- 模型缩略图、动画详情和动画缩略图必须使用同一 profile；模型和动画缩略图实例必须传入 `castShadows: true`，共享 shadow catcher 必须开启。
- 模型/动画离屏相机使用与详情页一致的默认 Linear 色调映射，不得重新强制设置 ACES。
- 光照、材质、投影、缩略图构图或动画资源逻辑发生用户可见变化时，必须递增对应缩略图缓存版本；当前模型为 v28，动画为 v14，确保旧图不会覆盖新效果。
- 卡片缩略图是最终资产预览图：离屏出图不得调用 `buildBlocking3dGroundGridLines` 或 `drawBlocking3dGroundGrid`，只保留 HDRI、模型/角色和 shadow catcher 产生的真实投影阴影；详情页交互式编辑器可以继续显示网格辅助线。
- 漫剧、分镜和纯 HDRI 场景入口不得隐式继承 `model-preview`；它们只有在明确的产品需求下才能单独接入新的 profile。
- profile 只能表达环境光、阴影过滤、阴影范围、强度和偏差等渲染参数，不能把模型页面逻辑塞进共享运行时。
- `skyboxIntensity` 只随当前环境 atlas 的所有权应用和恢复：模型预览和未指定 profile 的共享预览都使用 `1`；清理时若 atlas 已被其他运行时接管，不得覆盖其他预览的环境强度。相同的所有权边界也适用于 `skyboxRotation`。
- 环境运行时加载 HDRI 时要同时设置 EnvAtlas 的 `skyboxRotation`、可见投影材质的方位 uniform 和方向光偏移；清理时仅当仍拥有当前 atlas 才恢复原场景旋转，避免覆盖新预览。
- 环境资源失败时仍沿用运行时的清理和 fallback 行为，不能为了显示模型而保留失效的 WebGL 资源。

## Failure Modes

- 只降低方向光强度：模型整体变暗，地面阴影仍可能是纯黑，不能解决阴影接收器的乘法结果。
- 只改阴影贴图分辨率：边缘采样会改善，但环境光不足导致的黑色暗部不会消失。
- 直接修改共享默认 profile：动画、分镜和场景的画面会无意变化，难以判断是模型优化还是回归。
- 只修改实时模型详情页：模型卡片仍读取旧缩略图，用户横向比较时会看到两套不同的光影。
- 只修改卡片的 `castShadows`：模型能投影但没有接收器，缩略图仍不会显示落地阴影；卡片入口必须同时开启角色投影和 shadow catcher。
- 将 HDRI 方向整体取反：光源会被翻到模型下方，造成不符合棚拍逻辑的受光；180°需求只允许水平偏转并保持 Y 分量。
- 将模型预览的 `envAtlas` 强度压到 `0.25`：可见 HDRI 穹顶仍然明亮，但 StandardMaterial 得不到足够的环境填充，模型会表现为几乎没有光照；模型预览必须保留完整环境贡献。
- 只旋转方向光：HDRI 背景和环境反射仍在原方位，角色阴影会与画面高光反向；只旋转可见 HDRI 或只改 EnvAtlas 也会产生同样的错位，三条路径必须共用一个 profile 偏移。
- 只给 EnvAtlas 设置旋转而不更新自定义投影材质：StandardMaterial 的环境光方向正确，但可见穹顶仍显示未旋转的原图，预览会出现“背景和阴影相反”。
- 调整光照后不刷新缩略图缓存：localStorage 中的旧版本会继续命中，导致代码已生效但卡片看不到变化。

## Related Modules

- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLightingProfile.ts`：模型与默认光照 profile 的唯一配置源。
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentKeyLight.ts`：将 profile 应用到 PlayCanvas 方向光。
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts`：将 profile 的环境补光、方位偏移应用到场景并负责生命周期清理。
- `client/src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts`：模型库环境适配层，负责透传 profile。
- `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`：模型详情实时预览入口。
- `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`：模型卡片离屏渲染和缩略图缓存。
- `client/src/pages/animations/animationPreviewApp.ts`：动画详情实时预览入口。
- `client/src/pages/animations/animationThumbnailStudio.ts`：动画卡片离屏渲染和缩略图缓存。

## Verification

- `client/tests/modelPreviewLighting.contract.test.js` 锁定 profile 数值、主光偏转、模型/动画入口接入范围、卡片无网格约束和缩略图缓存版本。
- `blocking3dEnvironmentLighting.test.mjs` 锁定水平偏转不会改变主光高度；`blocking3dEnvironmentLightingProfile.test.mjs`、`blocking3dEnvironmentProjection.test.mjs` 和 `blocking3dEnvironmentRuntime.test.mjs` 锁定同一方位在方向光、可见投影与 EnvAtlas 之间的符号关系及清理恢复；模型和动画页面通过内置浏览器确认卡片与详情均能显示清晰的落地阴影。
- 模型页面的浏览器验收需要确认环境加载完成后暗部可读、地面阴影为柔和灰阶且无明显锯齿，同时检查控制台无错误。
