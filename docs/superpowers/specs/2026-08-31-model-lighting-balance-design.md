# 模型预览环境光与地面阴影平衡设计

## Background

当前模型库 3D 预览把同一张 HDRI 同时用于可见半圆背景、环境光 atlas 和主方向光。模型材质默认开启 `useSkybox`，因此会直接接收 HDRI 的环境漫反射与反射；与此同时，地面使用乘法阴影捕捉器接收方向光阴影。模型环境光较强时，模型的受光/背光层次会被抬平，而阴影捕捉器在完整阴影区域的乘法因子仍然偏低，最终形成“模型明暗不明显、地面阴影像黑色剪影”的不协调画面。

本次只调整模型详情页和模型缩略图使用的 `model-preview` 光照 profile。HDRI 亮点识别、主光方向、半球投影、分镜 3D 和场景预览的默认光照行为不改。

## Decision

在共享光照 profile 中增加模型预览专用的 `skyboxIntensity`，让环境 atlas 的漫反射/反射强度与可见 HDRI 背景解耦：

- 模型预览环境 atlas 强度设为 `0.25`，保留少量真实环境填充和材质反射，但不再让整张 HDRI 把背光面抬平；
- 模型 profile 的 `ambientLight` 继续作为低频中性填充，保证没有直接受光的表面不会完全压黑；
- 主方向光仍使用当前 HDRI 估算出的方向、颜色和强度，不修改光源方向算法；
- 模型预览阴影强度从 `0.62` 调整为 `0.30`。方向和接触关系保留，乘法阴影接收器的暗化幅度降低，地面阴影从黑色块变为柔和的中灰；
- 默认 profile 的 `skyboxIntensity` 保持 `1`，避免影响分镜、动画和场景环境预览；
- 环境运行时只在自己仍拥有当前 `envAtlas` 时写回之前的 `skyboxIntensity`，避免异步切换或销毁时污染宿主应用。

这套配置同时用于模型详情页和模型卡片缩略图，确保列表预览与详情预览的光照基准一致。

## Data flow

```text
model detail / model thumbnail
          │ loadStudioEnvironment({ lightingProfile: "model-preview" })
          ▼
blocking3d environment runtime
          ├─ same HDRI -> visible finite backdrop (unchanged)
          ├─ same HDRI -> envAtlas
          │              └─ scene.skyboxIntensity = 0.25 for model profile
          ├─ HDRI peak -> directional key light (unchanged)
          └─ shadow catcher <- profile shadowIntensity = 0.30
```

`scene.skyboxIntensity` 只影响 StandardMaterial 对环境 atlas 的 `processEnvironment` 结果；可见 HDRI 由自定义投影材质采样，不会因为这个强度降低而变暗。这样可以独立控制“背景看起来有多亮”和“模型吃多少环境光”。

## Components and boundaries

- `blocking3dEnvironmentLightingProfile.ts`
  - 为 profile 声明 `skyboxIntensity`，集中管理默认值与模型预览值。
- `blocking3dEnvironmentRuntime.ts`
  - 应用 profile 的环境 atlas 强度；清理当前环境时恢复创建运行时前的值。
  - 保持 HDRI 方向光、可见穹顶、投影中心和资源生命周期不变。
- `blocking3dEnvironmentKeyLight.ts`
  - 继续使用同一方向估算结果；只消费 profile 中的阴影强度，不新增第二个方向光。
- `modelViewerApp.ts` 与 `thumbnailStudio.ts`
  - 继续显式使用 `model-preview` profile，不增加调用方级别的 PlayCanvas 参数。

不通过关闭整个 envAtlas、删除模型材质反射或修改地面贴图来实现效果，避免材质失去 HDRI 质感以及其他预览入口发生视觉漂移。

## Error handling and compatibility

- `skyboxIntensity` 必须是有限的非负数；profile 由代码常量提供，不引入用户数据迁移。
- 如果环境加载失败，现有的 ambient 与 skybox 强度恢复逻辑继续生效。
- 当旧环境请求晚于新环境返回时，旧 runtime 不得恢复新 runtime 的 `skyboxIntensity`；通过“当前 envAtlas 所有权”判断后再恢复。
- 默认 profile 的参数保持兼容，分镜角色、动画预览和纯场景环境不会使用模型专用的低环境光/软阴影配置。

## Validation

### Code checks

- 增加 profile 契约测试：默认 profile 强度为 `1`，模型 profile 的环境 atlas 强度为 `0.25`、阴影强度为 `0.30`。
- 增加运行时清理测试或最小可测辅助函数，证明当前环境被清理时会恢复之前的 `skyboxIntensity`，过期 runtime 不会覆盖新环境。
- 运行受影响的 lighting/profile 聚焦测试、客户端 typecheck，并执行 `git diff --check`。

### Browser smoke test

在内置浏览器中打开 `http://127.0.0.1:5174/models/bed-12a`，等待模型材质和 HDRI 完成后：

1. 截取修改前后的同一视角，确认床体受光/背光层次更清楚；
2. 确认地面阴影仍指向主光相反方向，但不再接近纯黑，边缘保持 PCF5 的柔和效果；
3. 检查浏览器日志无新增 warning/error；
4. 回到 `/models`，确认缩略图与详情页的光照观感一致；
5. 不执行保存、生成或数据库写入操作。

## Acceptance criteria

1. 模型材质不再被完整 HDRI 环境光抬平，能读出受光面、背光面和基本体积层次。
2. 地面投影阴影保留方向、接触和轮廓，但不会显示成大面积黑色剪影。
3. 可见 HDRI 背景亮度和主光方向保持当前正确结果。
4. 模型详情页与缩略图使用同一套平衡参数。
5. 分镜、动画和场景环境预览不受模型 profile 调整影响。
