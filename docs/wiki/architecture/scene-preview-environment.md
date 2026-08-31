# 场景预览 HDR 环境边界

## Background

模型、动画和漫剧的 3D 预览都需要同时解决两件事：让 HDR 全景图作为可见背景被正确投射到有限空间，以及让同一张 HDR 为角色提供环境光照。无限天空球会随相机轨道旋转，独立的平面地面又会造成不同预览入口的地面尺度和网格不一致。

## Decision

`blocking3d` 的 `createBlocking3dEnvironmentRuntime` 是所有场景预览的 HDR 环境实现。一次资源加载同时生成可见投影 cubemap 和 `envAtlas`；`envAtlas` 只负责照明，可见背景由固定在世界原点的有限半圆穹顶和地面过渡面提供。

主光方向也必须来自同一张 HDRI，而不能使用固定方向。RGBE 源先按 PlayCanvas 的共享指数解码到线性亮度，再以全景采样块的峰值归一化，识别局部太阳/高光区域；这样经过曝光归一化、峰值只有 1 的 HDRI 仍能得到有效方向。主光的经度、纬度换算使用与可见投影相同的 `panoramaHorizonV`，并按 PlayCanvas 方向光的实体 Y 轴约定设置，避免角色受光和全景亮区错位。

环境设置沿用漫剧 3D 合同：

- `domeRadius` 的用户语义是半球完整直径，默认值为 15 米；内部基础网格半径为 0.5，实体按直径缩放。
- `projectionCenterHeight` 默认值为 2 米，并以 `2 / 15` 的比例随直径派生。
- `panoramaHorizonV` 默认值为 0.5，表示全景图的水平分界处位于中线。
- 所有使用该环境的相机都必须移除 `SKYBOX` 层，否则 `envAtlas` 会额外渲染一个随相机旋转的无限背景。

地面网格是独立的调试 overlay，不属于 HDR 几何。网格由环境真实半径和半圆地面的平底比例计算范围，漫剧、模型、动画实时预览及两类离屏缩略图调用同一个构建/绘制入口。这样直径变化时网格、地面和穹顶边界同步变化。

## Current Rule

- 模型环境预设可以替换 HDR 资源；同一预览中的直径调整只更新投影参数、重建依赖直径或投射高度的几何，并重新计算网格，不重复下载 HDR。
- HDRI 主光估算必须在 RGBE 线性空间中使用相对峰值阈值；禁止把固定的色调映射后绝对阈值用于所有 HDRI，因为归一化全景会因此错误回退到固定方向。
- 方向光必须透传当前环境的 `panoramaHorizonV`，并与可见投影的经纬度坐标保持一致；无明显峰值/局部高光时才使用稳定后备光，避免从均匀环境噪声生成伪方向。
- 纯 HDRI 预览没有角色投影物时必须关闭 shadow catcher；空阴影接收器会把 PlayCanvas 的阴影乘法通道输出为黑色。分镜、模型和动画预览有角色或模型投影需求时才启用它。
- 可见 HDRI cubemap 使用 RGBA8 的 RGBP 打包，投影材质必须用 `decodeRGBP` 解码；环境光 atlas 仍由原始 RGBE HDR 生成，不能把可见纹理和光照纹理的编码混用。
- 环境实体必须挂在预览专属的 world entity 下并保持原点位置。相机 orbit 只改变相机，不移动或旋转穹顶。
- 环境句柄销毁时释放原始纹理 asset、投影 cubemap、环境光 atlas、材质、穹顶、shadow catcher、瞬态主光和 world entity。
- HDR 资源全部不可用时，运行时恢复默认环境光并返回无可见背景状态；模型/动画预览不得将没有 HDR 背景的结果当作成功画面。
- 使用异步加载 HDRI 的实时预览必须先启动 PlayCanvas 应用，再开始环境和模型资源加载；如果初始化流程会通过 `app.render()` 恢复首帧，不能在 `app.start()` 之前主动渲染。
- 离屏缩略图只借用 `app.start()` 完成系统初始化，随后取消其持续 RAF，并在抓图前显式调用 `app.update()`；这样动作状态仍会推进，但销毁缩略图应用时不会留下访问空 `renderer` 的异步帧。

## Failure Modes

- 只设置 `scene.envAtlas` 而保留相机 `SKYBOX` 层：角色看似有 HDR 光照，但背景会随着相机旋转漂移。
- 可见穹顶和环境光分别加载：背景与角色受到的光照来自不同资源，且切换环境时容易出现旧请求覆盖新请求。
- 在动画或缩略图里重新创建固定尺寸平面和固定范围网格：不同入口的地面尺度不再对应半圆穹顶。
- 把 15 米直径当作 15 米半径：取景边界、网格范围和投射纹理比例都会扩大一倍。
- 没有在异步预览取消或资源失败时销毁已完成的另一条加载分支：会留下 WebGL 资产和环境实体。
- 纯环境页沿用带 shadow catcher 的通用运行时：页面没有角色时，空 shadow map 会把整个地面压成黑色；通过 `enableShadowCatcher: false` 关闭该可选通道。
- 将 HDRI 重投影目标创建为普通 RGBA8 并继续按 gamma 解码：RGBE/RGBP 数据语义不一致，暗部会明显变黑，应该让目标使用 RGBP 并对应解码。
- 在 RGBE 贴图上继续使用固定的 `0.52` 色调映射后亮度阈值：归一化全景的最大色调映射亮度只有 `0.5`，所有候选都会被过滤，主光实体会退回与全景无关的固定方向。
- 动画预览在异步环境完成后才启动应用，却在恢复动作首帧时先调用 `app.render()`：部分 WebGL 上下文会在材质首次编译时出现 HDRI/阴影 shader 错误，主视图可能黑屏；应统一采用“先 `app.start()`，后加载资源并恢复首帧”的生命周期。
- 离屏动画缩略图让 `autoRender=false` 的应用持续运行，或让没有投影者的 shadow catcher 参与合成：前者会在销毁竞态中访问已清空的 renderer，后者会把缩略图地面压黑；应取消持续 RAF、手动推进动作帧，并关闭该缩略图的 shadow catcher。

## Related Modules

- `client/src/pages/drama/comicDrama/components/blocking3d/`：漫剧环境几何、投影材质、环境运行时与共享地面网格。
- `client/src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts`：模型/动画预览的薄适配层和预设资源兜底。
- `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`：模型实时预览的环境切换、直径更新和生命周期。
- `client/src/pages/animations/animationPreviewApp.ts`：动画实时预览的环境加载、网格绘制和取消清理。
- `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`、`client/src/pages/animations/animationThumbnailStudio.ts`：两类离屏缩略图环境。

## Source Documents

- `docs/superpowers/specs/2026-08-30-scene-preview-environment-unification-design.md`
- `docs/superpowers/plans/2026-08-30-scene-preview-environment-unification.md`
