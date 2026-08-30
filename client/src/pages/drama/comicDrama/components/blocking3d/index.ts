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
  BLOCKING_3D_BLUE_ACTOR_COLOR,
  createMaterial,
  createPlane,
  createShadowCatcherMaterial,
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
  createBackdropGeometry,
  createGroundDomeGeometry,
  configureEnvironmentTexture,
  createVisibleHdriCubemap,
} from "./blocking3dViewerCore";
export { createProjectedHdriMaterial } from "./blocking3dEnvironmentProjection";
export type { ProjectedHdriMaterialSettings } from "./blocking3dEnvironmentProjection";
export {
  buildBlocking3dGroundGridLines,
  drawBlocking3dGroundGrid,
} from "./blocking3dEnvironmentOverlay";
export type { Blocking3dGroundGridLine } from "./blocking3dEnvironmentOverlay";
