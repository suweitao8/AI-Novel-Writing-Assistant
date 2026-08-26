# 角色状态手动身高输入设计

## Background

角色状态已经是角色外观、年龄、图片和音色的统一持久化入口。角色级 `heightProfileJson` 可以根据角色资料生成一个 AI 估算值，但它无法表达“同一角色在不同状态下明确按 1.75 米参与分镜比例”的人工约束；当前状态编辑器也没有身高输入字段。

## Decision

在 `StoryAssetState` 增加可选的 `heightMeters` 数值字段。该字段语义为“角色在此状态下的人工身高覆盖值”，单位为米，合法范围为 `0.70–2.40`，前端步进为 `0.01`，例如 `1.75`。它只对角色状态有业务意义，场景和道具的 API 载荷不接受该字段。

空值表示不设置人工覆盖，分镜继续使用角色级 AI 估算；分镜计算当前角色状态时按以下优先级取值：

1. 当前镜头状态的 `heightMeters`；
2. 角色级 AI `heightProfile`；
3. 兼容默认值 `1.8` 米。

这样身高和状态图、年龄段、服装等资料处于同一状态快照中，镜头切换状态时比例也随状态稳定切换，不需要增加新的数据库列或另建角色级字段。

## Components and data flow

- `shared/types/novelReferenceExtraction.ts`
  - 定义、读取、归一化 `heightMeters`；保留合法数值，丢弃旧数据中的非法值。
- `storySettingsRoutes.ts` / `StorySettingsStatePolicy.ts`
  - 角色状态写入允许 `heightMeters`，服务端拒绝超出范围的数值；场景和道具 schema 继续拒绝该字段。
- `assetForms.tsx`
  - 在角色状态编辑器增加带 label、范围、步进和实时错误提示的数字输入；清空即可恢复 AI 估算。
- `CharacterHeightProfileService.ts` / `DramaShotBlockingSketchService.ts`
  - 提供纯函数解析当前状态的人工身高，并在 3D blocking 上将状态身高置于角色级估算之前。
- `storyAssetPresentation.ts`
  - 资产卡片默认状态有人工身高时显示人工值与来源，否则显示 AI 估算。

## Validation and error handling

- UI 使用 `type=number`、`min=0.7`、`max=2.4`、`step=0.01`，输入超范围时显示字段错误并阻止保存。
- 服务端 zod schema 和共享归一化同时校验，不能依赖前端校验保证数据安全。
- 清空输入会删除 `heightMeters`，不会写入 `null` 或 `NaN`。
- 历史状态没有该字段时行为不变，仍走 AI 估算或兼容默认值。

## Verification

- 共享契约测试：合法 `1.75` 可读取/归一化，非法范围不会进入有效状态。
- 分镜高度解析测试：人工状态值覆盖 AI 值，空值回退 AI，再回退默认值。
- 前端契约测试：角色状态编辑器存在数字输入、校验和清空逻辑，资产卡片展示人工来源。
- 运行共享构建、服务端聚焦测试/构建和客户端 typecheck。
