# 角色生图的亚洲人物身份约束设计

## Background

项目中的角色参考图由 Codex 等图片模型生成。当前角色状态四视图虽然统一了版式、透明底、外貌锁定和辨识度规则，但没有明确指定人类角色的地域/族裔身份；漫画角色设计稿和旧版角色图又各自维护提示词。模型在角色资料缺少面部细节时会使用欧美人物作为默认补全，导致同一本书的角色形象偏离产品目标。

## Decision

所有“人类角色”图片生成入口统一采用中国/东亚人物身份约束，覆盖：

- 小说设定中心的角色状态图；
- 短剧角色设计稿与漫画角色四视图/表情稿；
- 旧版角色图和拆书角色图任务；
- 经过手动自定义提示词、参考图编辑和历史任务重试的最终图片请求。

约束使用一个共享、可幂等追加的提示词契约。提示词明确要求人类角色呈现中国/东亚人物形象，禁止模型在信息不足时默认使用欧美/白人面部特征；角色资料明确的发色、肤色、服装、时代与画面风格仍按资料执行。明确的怪物、动物或其他非人角色保持其非人设定，不强行套用人类族裔。

约束在两层生效：

1. 角色提示词构建器直接展示该约束，使生成预览、保存的 prompt 和模型输入保持一致。
2. 图片 provider 最终请求边界按 `sceneType` 对 `character` 与 `book_analysis_character` 幂等补强，兜住 direct prompt、历史任务重试和绕过某个模板的入口。已经包含契约标记的 prompt 不重复追加。

## Data Flow

```text
角色资料 / 状态 / 自定义 prompt
        ↓
角色专用 prompt builder（预览可见）
        ↓
图片 runtime / 历史任务 executor
        ↓
provider 最终请求边界（幂等身份约束）
        ↓
Codex / 其他图片模型
```

`sceneType=chapter_illustration` 的分镜画面不在本次范围内强制替换画面中所有人物的族裔，因为分镜可能包含未建档的路人、群像或非人主体；分镜中的已建档角色继续通过角色参考图和角色上下文保持一致。

## Failure Handling

- prompt 已含身份约束标记时不得重复追加，避免重试或多层调用造成 prompt 膨胀。
- 非角色场景和道具请求不得带入人物族裔约束，避免污染空场景/单体道具生成。
- 角色资料为空时仍必须使用中国/东亚身份约束，不能把“资料不足”交给模型自由猜测。

## Verification

- 共享 prompt helper 的行为测试：空 prompt、已有约束、非人角色说明均能稳定处理。
- 角色状态图、短剧/漫画角色稿和旧版角色任务的 prompt 契约测试。
- provider JSON 请求体测试，以及 multipart 编辑路径的源码契约测试，确认两条最终请求路径都会调用同一幂等约束。
- 运行服务端聚焦测试、shared/server typecheck 和构建；不做浏览器验证，UI 页面未改变。

## Related Modules

- `shared/imagePrompt.ts`
- `server/src/services/drama/visual/characterStateSheet.ts`
- `server/src/services/comic/ComicCharacterImageService.ts`
- `server/src/services/image/provider.ts`
- `server/src/services/image/ImageGenerationService.ts`
- `server/src/prompting/prompts/image/image.prompts.ts`
