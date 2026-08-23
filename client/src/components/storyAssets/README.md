# 故事资产展示组件

本目录统一角色、场景、道具这三类故事设定资产在脚本侧和设定中心的卡片展示模型。

- `storyAssetPresentation.ts`：把 API 资产转换成稳定的展示模型，不发起请求。
- `StoryAssetCard.tsx`：统一卡片结构和点击打开行为。

三类资产的新建/编辑弹窗是 `pages/novels/components/storySettings/StoryAssetEditDialog.tsx`（与 assetForms 表单同族）：设定中心三个资产页签与漫剧脚本页右侧列表共用同一个可编辑可保存的弹窗（2026-08-23 用户要求：所有入口同一个界面）。

角色库里的图片灯箱、图片生成确认弹窗和分镜首帧预览属于媒体/镜头流程，不使用本目录。
