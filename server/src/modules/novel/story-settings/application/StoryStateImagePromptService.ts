// 微调服务已下沉到 services/image/StoryStateImagePromptService.ts：提示词微调只依赖
// Prompt Registry 与 LLM 运行时，小说场景状态与通用环境资产共用同一份契约；
// 此处 re-export 保持既有调用方（storySettingsRoutes）的导入路径不变。
export {
  storyStateImagePromptService,
  type StateImagePromptTweakRequest,
} from "../../../../services/image/StoryStateImagePromptService";