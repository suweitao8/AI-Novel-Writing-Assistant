# 角色分镜身高比例基准

## Background

角色资产默认由已有设定推断近似身高，但角色在不同状态下可能需要稳定且可复用的人工比例覆盖。若每个镜头都把代理角色当成同样高度，成年人、儿童和高大角色会在镜头之间频繁变形；若把身高放进每次构图提示词临时判断，又无法保证同一角色跨镜头保持一致。

## Decision

系统从角色已有设定中推断一个近似身高，保存为角色级的 `heightProfileJson`，并把它作为分镜 3D blocking 的默认比例基准。角色状态可以在 `statesJson` 中选填 `heightMeters`（例如 `1.75`）作为当前状态的人工覆盖值。推断入口使用 Prompt Registry 中注册的结构化 Prompt Asset `novel.character.heightEstimate@v1`；结果包含估算高度、置信度、理由、来源和输入指纹。

角色设定发生变化时，输入指纹变化会触发重新推断；同一输入会复用已有档案，避免每次进入资产页或分镜都重复调用模型。角色的年龄、外貌和图片提示词属于状态资产时，以默认状态作为身高推断输入；仍保留在角色级的旧字段优先用于兼容。模型不可用时保存明确标记为 `fallback` 的 1.8 米兼容基准，不把失败伪装成 AI 推断成功。

## Current Rule

- `Character` 与 `DramaCharacter` 都使用可空 `heightProfileJson`，不做破坏性回填或重置数据库；小说角色在进入资产列表、创建或更新时由幂等 ensure 流程自动补齐缺失/过期档案。
- 角色级 AI 身高档案的高度限制在 0.7–2.4 米；角色状态编辑器的 `身高（米）` 输入也使用同一范围和服务端校验。当前状态按“人工 `heightMeters` > 角色级 AI/兼容档案 > 1.8 米兼容基准”解析；留空状态身高不会修改角色级档案，而是继续使用 AI 档案。
- 提取模型不直接输出固定身高；提取应用把 `ageGroup`、`appearance` 和 `imagePrompt` 写入角色默认状态，身高服务从默认状态与角色级兼容字段合并出 Prompt 输入，资产卡片和分镜读取同一份档案。
- 分镜 blocking 上下文携带 `heightMeters`、`heightSource` 和可选置信度；AI 自动构图的 `scale` 只表示相对构图调整，不得把不同角色归一成同一高度。
- PlayCanvas 代理模型按其 1.8287 米原生高度换算到角色身高。布局保存身高基准，读取时按当前角色身高迁移缩放。
- 3D 草图不提供手工缩小/放大角色的入口；用户只能调整位置、旋转、姿势和代理颜色。滚轮缩放只改变相机视角，选中角色区域和角色资产卡展示身高基准。
- 没有 `heightMeters` 的旧布局保持历史原始缩放，不因兼容逻辑突然改变已有镜头；新布局则保存身高基准以支持后续稳定迁移。
- 身高档案属于角色的视觉一致性事实，不能由场景、镜头或单次生图结果覆盖；角色设定变化导致重新推断时，后续打开布局才按新基准迁移。
- 人工身高属于角色状态的局部视觉设定，只影响使用该状态的分镜 blocking；它不回写角色级 AI 档案，也不参与 AI 档案输入指纹，避免手工覆盖被下一次档案刷新吞掉。

## Failure Modes

- 只在画面生成提示词中临时写“高个子/小孩”：模型无法跨镜头记忆，角色比例会漂移。
- 把 AI 调用失败直接写成普通高度：无法区分真实推断和兼容回退，也会让排查失去依据。
- 读取旧布局时强行套用新高度比例：会破坏作者已经调整好的历史镜头，因此旧布局缺少身高字段时必须保留原始缩放。
- 只在角色级档案提供一个全局手工字段：会丢失不同状态之间的比例语义；人工身高必须归属角色状态，并由状态保存契约校验。
- 把状态身高写入场景或道具状态：会让非角色资产携带无意义字段，破坏资产类型边界；只有角色状态 schema 接受 `heightMeters`。
- 提取应用只保存角色名和性别、却不让默认状态参与身高输入：角色看似有外观资料，身高推断实际只能看到空的角色级字段，必须在身高服务边界合并默认状态。
- 在 3D 草图中保留缩小/放大角色按钮：用户操作会绕过角色级身高基准，导致同一角色跨镜头再次产生比例漂移。
- 让 AI 自动构图输出绝对模型尺寸：模型输出的局部构图意图会覆盖角色级高度基准；服务端应先换算角色基准，再应用 AI 的局部 `scale`。

## Related Modules

- `server/src/services/drama/visual/CharacterHeightProfileService.ts`
- `server/src/modules/novel/story-settings/application/StorySettingsService.ts`
- `server/src/prompting/prompts/novel/characterHeightEstimate.prompts.ts`
- `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- `client/src/pages/novels/components/storySettings/assetForms.tsx`
- `client/src/pages/novels/components/storySettings/StoryAssetEditDialog.tsx`
- `shared/types/novelReferenceExtraction.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dScale.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- `server/src/modules/novel/story-settings/application/StorySettingsProjection.ts`
- `client/src/pages/drama/comicDrama/components/ExtractApplyDialog.tsx`
