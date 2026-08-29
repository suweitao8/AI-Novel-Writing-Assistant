# HDR 全景图背景/前景分层设计

## Background

场景 HDR 全景图会被投射到 3D 半球，作为角色和前景模型的环境背景。当前项目已经将全景图定位为背景层，并在共享提示词中禁止部分家具和近景自然物，但三个生成入口对场景原文的追加顺序不一致：旧场景接口和旧漫剧场景接口会在约束之后追加 `environmentPrompt`、`keyElements`、`layout` 等内容。原文里如果出现床、椅子或前景石块，模型仍可能把它们当作必须绘制的主体。

这会造成两个问题：一是家具被固化在 HDR 背景中，后续无法用可交互 3D 模型替换；二是近景石块、草丛、木箱和碎片会在等距投射后被拉伸，侵入角色活动区域。墙面、天花、地面材质、固定建筑和远处景观则仍然是合法的背景信息，应当继续保留。

## Decision

建立一份共享的 HDR 内容分层合同，并让旧场景图、场景状态图、旧漫剧场景图三个入口都遵循同一顺序：

1. 原始场景描述只作为背景语境输入，放在生成约束之前，保留墙面、建筑、材质、光照、远景山体和远处树线等信息。
2. 共享正向规则明确允许的背景类别：固定墙面、天花、地面/地形材质、门窗楼梯等固定建筑、远处建筑/山体/天际线/远处树线。
3. 共享正向规则明确禁止的前景类别：床、桌、椅、沙发、书桌、柜子、货架、柜台及其他可交互或可摆放家具/道具；这些内容由后续 3D 模型摆放。
4. 共享正向规则明确禁止的近景自然物：贴近角色的石头、石块、草丛、灌木、树干、木箱、散落碎片和地面杂物；远处山体、远景树线等背景景观仍可生成。
5. 共享规则放在每条最终提示词的末尾，明确说明“即使场景原文提到被排除物，也只保留其背景语境，不把它渲染成画面主体”。负向提示词继续同步覆盖这些类别。
6. 移除旧漫剧场景入口中“允许极小背景人物”的冲突描述，统一为空环境，不生成人物、动物或生物主体。

不使用按关键词删除场景原文的逻辑。这样可以避免误伤“石墙”“木地板”“远处山体”等合法背景内容；模型的结构化生成提示词合同负责语义区分，代码只负责稳定地组织上下文和约束顺序。

## Data flow

```text
scene/state/bible fields
        │
        ▼
background context only (raw scene information)
        │
        ▼
shared panorama layout + background/foreground policy
        │
        ├── image prompt
        └── negative prompt
        │
        ▼
2:1 equirectangular HDR panorama
        │
        ├── fixed background remains in EnviroDome
        └── interactive furniture / near-field props are placed as 3D models
```

## Components

- `server/src/services/image/panorama/scenePanoramaLayout.ts`
  - Owns the shared allowed-background and forbidden-foreground prompt contract.
  - Keeps the existing 2:1, three-zone and interior layout rules.
  - Exports reusable final policy lines and the negative prompt.
- `server/src/modules/novel/story-settings/application/StoryAssetImageService.ts`
  - Moves legacy scene environment context before the shared final policy.
  - Keeps the legacy scene image endpoint compatible while applying the same content split.
- `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`
  - Applies the shared final policy after scene state descriptions and reference-image instructions.
  - Character and prop state-image behavior remains unchanged.
- `server/src/services/comic/ComicSceneService.ts`
  - Moves scene bible context before the shared final policy.
  - Uses the same empty-environment wording and negative prompt as the novel scene paths.
- `server/tests/storyAssetImage.test.js`, `server/tests/storyAssetStateImage.test.js`, and a focused comic scene test
  - Lock the allowed-background, forbidden-foreground, prompt ordering, and no-tiny-figures contract for all three paths.

## Error handling and compatibility

- No database schema or persisted scene data changes are required.
- Existing panorama files are not silently modified; the new contract applies on the next explicit generation or regeneration.
- Existing provider routing, 2:1 image size, reference-image behavior, and 3D projection parameters remain unchanged.
- If a scene has no description, the shared background policy still produces a valid empty environment prompt.

## Verification

- Run the focused server prompt tests after building shared and server output.
- Run server typecheck/build and the relevant test suite.
- Review generated prompt strings to verify raw context appears before the final policy and that all three entry points contain the same foreground exclusion.
- No browser UI smoke test is required because this change is server-side prompt assembly only; the existing local 3D editor is not modified.
