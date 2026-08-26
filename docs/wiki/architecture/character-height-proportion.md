# 角色分镜身高比例基准

## Background

角色资产不要求作者手工填写身高，但分镜 blocking 仍需要稳定的相对尺度。若每个镜头都把代理角色当成同样高度，成年人、儿童和高大角色会在镜头之间频繁变形；若把身高放进每次构图提示词临时判断，又无法保证同一角色跨镜头保持一致。

## Decision

系统从角色已有设定中推断一个近似身高，保存为角色级的 `heightProfileJson`，并把它作为分镜 3D blocking 的比例基准。推断入口使用 Prompt Registry 中注册的结构化 Prompt Asset `novel.character.heightEstimate@v1`；结果包含估算高度、置信度、理由、来源和输入指纹。

角色设定发生变化时，输入指纹变化会触发重新推断；同一输入会复用已有档案，避免每次进入分镜都重复调用模型。模型不可用时保存明确标记为 `fallback` 的 1.8 米兼容基准，不把失败伪装成 AI 推断成功。

## Current Rule

- `Character` 与 `DramaCharacter` 都使用可空 `heightProfileJson`，旧数据无需回填或重置数据库。
- 高度限制在 0.7–2.4 米，客户端和服务端都做边界归一；角色设置页只读展示，不提供手工覆盖入口。
- 分镜 blocking 上下文携带 `heightMeters`、`heightSource` 和可选置信度；AI 自动构图的 `scale` 只表示相对构图调整，不得把不同角色归一成同一高度。
- PlayCanvas 代理模型按其 1.8287 米原生高度换算到角色身高。布局保存身高基准，读取时按当前角色身高迁移缩放。
- 3D 草图不提供手工缩小/放大角色的入口；用户只能调整位置、旋转、姿势和代理颜色。滚轮缩放只改变相机视角，选中角色区域和角色资产卡展示身高基准。
- 没有 `heightMeters` 的旧布局保持历史原始缩放，不因兼容逻辑突然改变已有镜头；新布局则保存身高基准以支持后续稳定迁移。
- 身高档案属于角色的视觉一致性事实，不能由场景、镜头或单次生图结果覆盖；角色设定变化导致重新推断时，后续打开布局才按新基准迁移。

## Failure Modes

- 只在画面生成提示词中临时写“高个子/小孩”：模型无法跨镜头记忆，角色比例会漂移。
- 把 AI 调用失败直接写成普通高度：无法区分真实推断和兼容回退，也会让排查失去依据。
- 读取旧布局时强行套用新高度比例：会破坏作者已经调整好的历史镜头，因此旧布局缺少身高字段时必须保留原始缩放。
- 将身高作为可编辑的普通表单字段：手工改动会绕过角色设定与输入指纹，造成数据和视觉基准不一致。
- 在 3D 草图中保留缩小/放大角色按钮：用户操作会绕过角色级身高基准，导致同一角色跨镜头再次产生比例漂移。
- 让 AI 自动构图输出绝对模型尺寸：模型输出的局部构图意图会覆盖角色级高度基准；服务端应先换算角色基准，再应用 AI 的局部 `scale`。

## Related Modules

- `server/src/services/drama/visual/CharacterHeightProfileService.ts`
- `server/src/prompting/prompts/novel/characterHeightEstimate.prompts.ts`
- `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dScale.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- `server/src/modules/novel/story-settings/application/StorySettingsProjection.ts`
