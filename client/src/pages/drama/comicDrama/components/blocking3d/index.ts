// 模块门面：3D 编辑器 primitives 对其他模块（如模型库）的统一出口。
export { createBlocking3dTransformGizmo } from "./blocking3dTransformGizmo";
export type {
  Blocking3dTransformGizmoCallbacks,
  Blocking3dTransformGizmoRuntime,
} from "./blocking3dTransformGizmo";
export type { Blocking3dTransformTool } from "./blocking3dTransformGizmo";
export { updateBlocking3dCameraAzimuth, wrapBlocking3dAzimuth } from "./blocking3dMath";
export {
  clamp,
  BLOCKING_3D_ACTOR_JOINT_HIGHLIGHT_RATIO,
  BLOCKING_3D_BLUE_ACTOR_COLOR,
  BLOCKING_3D_JOINT_MATERIAL_NAME,
  BLOCKING_3D_NECK_MATERIAL_NAME,
  createMaterial,
  createPlane,
  createShadowCatcherMaterial,
  getBlocking3dActorJointColor,
  getBlocking3dActorMaterialRole,
  loadAsset,
  MAX_DEVICE_PIXEL_RATIO,
  setEntityMaterial,
  DEFAULT_FOV,
  type ContainerResource,
} from "./blocking3dViewerCore";
export {
  DEFAULT_BLOCKING_3D_ENVIRONMENT,
  normalizeEnvironmentSettings,
} from "./blocking3dViewerCore";
export type { Blocking3dEnvironmentSettings } from "./blocking3dViewerCore";
export { createBlocking3dEnvironmentRuntime } from "./blocking3dEnvironmentRuntime";
export type {
  Blocking3dEnvironmentRuntime,
  Blocking3dEnvironmentRuntimeOptions,
} from "./blocking3dEnvironmentRuntime";
export {
  DEFAULT_BLOCKING_3D_LIGHTING_PROFILE,
  MODEL_PREVIEW_LIGHTING_PROFILE,
  resolveBlocking3dLightingProfile,
} from "./blocking3dEnvironmentLightingProfile";
export type {
  Blocking3dLightingProfile,
  Blocking3dLightingProfileConfig,
} from "./blocking3dEnvironmentLightingProfile";
export {
  createBackdropGeometry,
  createGroundDomeGeometry,
  configureEnvironmentTexture,
  createVisibleHdriCubemap,
} from "./blocking3dViewerCore";
export { createProjectedHdriMaterial } from "./blocking3dEnvironmentProjection";
export { mountBlocking3dOffscreenCanvas } from "./blocking3dOffscreenCanvas";
export type { ProjectedHdriMaterialSettings } from "./blocking3dEnvironmentProjection";
export {
  buildBlocking3dGroundGridLines,
  drawBlocking3dGroundGrid,
} from "./blocking3dEnvironmentOverlay";
export type { Blocking3dGroundGridLine } from "./blocking3dEnvironmentOverlay";
