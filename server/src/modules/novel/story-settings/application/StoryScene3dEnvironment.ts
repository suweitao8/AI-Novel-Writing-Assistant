/**
 * 场景 3D 环境合同的兼容门面：实现已迁至 @ai-novel/shared/utils/scene3dEnvironment，
 * novel 与漫剧分镜共享同一份默认值与归一化规则；本文件保留原导入路径。
 */
export {
  DEFAULT_STORY_SCENE_3D_ENVIRONMENT,
  STORY_SCENE_3D_ENVIRONMENT_LIMITS,
  normalizeStorySceneType,
  resolveStorySceneType,
  getDefaultStoryScene3dEnvironment,
  normalizeStoryScene3dEnvironment,
  normalizeVisionStoryScene3dEnvironment,
  buildStoryScene3dImageFingerprint,
  isStoryScene3dEnvironmentAnalysisCurrent,
  shouldAutoAnalyzeStoryScene3dEnvironment,
  parseStoryScene3dEnvironment,
  serializeStoryScene3dEnvironment,
  resolveStoryScene3dEnvironment,
} from "@ai-novel/shared/utils/scene3dEnvironment";
