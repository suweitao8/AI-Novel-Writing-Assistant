# 场景预览 HDR 环境边界

## Background

模型、动画和漫剧的 3D 预览都需要同时解决两件事：让 HDR 全景图作为可见背景被正确投射到有限空间，以及让同一张 HDR 为角色提供环境光照。无限天空球会随相机轨道旋转，独立的平面地面又会造成不同预览入口的地面尺度和网格不一致。

## Decision

`blocking3d` 的 `createBlocking3dEnvironmentRuntime` 是所有场景预览的 HDR 环境实现。一次资源加载同时生成可见投影 cubemap 和 `envAtlas`；`envAtlas` 只负责照明，可见背景由固定在世界原点的有限半圆穹顶和地面过渡面提供。

环境设置沿用漫剧 3D 合同：

- `domeRadius` 的用户语义是半球完整直径，默认值为 15 米；内部基础网格半径为 0.5，实体按直径缩放。
- `projectionCenterHeight` 默认值为 2 米，并以 `2 / 15` 的比例随直径派生。
- `panoramaHorizonV` 默认值为 0.5，表示全景图的水平分界处位于中线。
- 所有使用该环境的相机都必须移除 `SKYBOX` 层，否则 `envAtlas` 会额外渲染一个随相机旋转的无限背景。

地面网格是独立的调试 overlay，不属于 HDR 几何。网格由环境真实半径和半圆地面的平底比例计算范围，漫剧、模型、动画实时预览及两类离屏缩略图调用同一个构建/绘制入口。这样直径变化时网格、地面和穹顶边界同步变化。

## Current Rule

- 模型环境预设可以替换 HDR 资源；同一预览中的直径调整只更新投影参数、重建依赖直径或投射高度的几何，并重新计算网格，不重复下载 HDR。
- 环境实体必须挂在预览专属的 world entity 下并保持原点位置。相机 orbit 只改变相机，不移动或旋转穹顶。
- 环境句柄销毁时释放原始纹理 asset、投影 cubemap、环境光 atlas、材质、穹顶、shadow catcher、瞬态主光和 world entity。
- HDR 资源全部不可用时，运行时恢复默认环境光并返回无可见背景状态；模型/动画预览不得将没有 HDR 背景的结果当作成功画面。

## Failure Modes

- 只设置 `scene.envAtlas` 而保留相机 `SKYBOX` 层：角色看似有 HDR 光照，但背景会随着相机旋转漂移。
- 可见穹顶和环境光分别加载：背景与角色受到的光照来自不同资源，且切换环境时容易出现旧请求覆盖新请求。
- 在动画或缩略图里重新创建固定尺寸平面和固定范围网格：不同入口的地面尺度不再对应半圆穹顶。
- 把 15 米直径当作 15 米半径：取景边界、网格范围和投射纹理比例都会扩大一倍。
- 没有在异步预览取消或资源失败时销毁已完成的另一条加载分支：会留下 WebGL 资产和环境实体。

## Related Modules

- `client/src/pages/drama/comicDrama/components/blocking3d/`：漫剧环境几何、投影材质、环境运行时与共享地面网格。
- `client/src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts`：模型/动画预览的薄适配层和预设资源兜底。
- `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`：模型实时预览的环境切换、直径更新和生命周期。
- `client/src/pages/animations/animationPreviewApp.ts`：动画实时预览的环境加载、网格绘制和取消清理。
- `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`、`client/src/pages/animations/animationThumbnailStudio.ts`：两类离屏缩略图环境。

## Source Documents

- `docs/superpowers/specs/2026-08-30-scene-preview-environment-unification-design.md`
- `docs/superpowers/plans/2026-08-30-scene-preview-environment-unification.md`
