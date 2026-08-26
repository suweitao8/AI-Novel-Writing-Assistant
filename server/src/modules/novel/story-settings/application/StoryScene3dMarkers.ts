/**
 * 场景 3D 空间标记归一化的兼容门面：实现已迁至 @ai-novel/shared/utils/scene3dMarkers，
 * novel 设定中心与漫剧分镜共享同一份标记集合规则；本文件保留原导入路径。
 */
export {
  STORY_SCENE_3D_MARKER_LIMITS,
  WALKABLE_FLOOR_MARKER_ID,
  adoptLegacyStoryScene3dMarkerEnvironment,
  normalizeStoryScene3dMarkerSet,
  parseStoryScene3dMarkerSet,
  serializeStoryScene3dMarkerSet,
} from "@ai-novel/shared/utils/scene3dMarkers";
export type { StoryScene3dMarkerProjectionEnvironment } from "@ai-novel/shared/utils/scene3dMarkers";
