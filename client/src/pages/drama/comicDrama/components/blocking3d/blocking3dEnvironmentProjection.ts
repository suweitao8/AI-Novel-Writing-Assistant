import * as pc from "playcanvas";
import { STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V } from "@ai-novel/shared/types/comicDrama";
import { rotateHdriLightDirectionAzimuth } from "./blocking3dEnvironmentLighting.ts";

export interface ProjectedHdriMaterialSettings {
  projectionCenterHeight: number;
  projectionRadiusMeters: number;
  /** Source-image V coordinate that should land on the 3D projection horizon. */
  panoramaHorizonV: number;
  /** World-space HDRI rotation shared with the derived key light and EnvAtlas. */
  hdriAzimuthOffsetDegrees: number;
}

export interface ProjectedHdriCoordinates {
  u: number;
  v: number;
}

export interface ProjectedHdriSurfaceCoordinates extends ProjectedHdriCoordinates {
  groundStabilization: number;
}

interface ProjectedHdriShaderImpl {
  isLinked?: (device: pc.GraphicsDevice) => boolean;
  finalize?: (device: pc.GraphicsDevice, shader: pc.Shader) => boolean;
}

const PROJECTED_HDRI_SHADER_WAIT_TIMEOUT_MS = 5_000;
const PROJECTED_HDRI_SHADER_POLL_INTERVAL_MS = 16;
export const PROJECTED_HDRI_GROUND_STABILIZATION_START_RATIO = 0.08;
export const PROJECTED_HDRI_GROUND_STABILIZATION_END_RATIO = 0.28;

const PROJECTED_HDRI_GROUND_CAP_MIN_HEIGHT_METERS = 0.001;
const PROJECTED_HDRI_GROUND_CAP_MAX_V = 0.96;
const PROJECTED_HDRI_MIN_RADIUS_METERS = 0.001;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

function resolveProjectionRadius(value: number): number {
  return Number.isFinite(value) && value > 0
    ? Math.max(value, PROJECTED_HDRI_MIN_RADIUS_METERS)
    : PROJECTED_HDRI_MIN_RADIUS_METERS;
}

export function getProjectedHdriGroundStabilization(
  horizontalDistance: number,
  projectionRadiusMeters: number,
): number {
  if (!Number.isFinite(horizontalDistance) || horizontalDistance < 0) return 0;
  if (!Number.isFinite(projectionRadiusMeters) || projectionRadiusMeters <= 0) return 0;
  const normalizedDistance = horizontalDistance / resolveProjectionRadius(projectionRadiusMeters);
  return 1 - smoothstep(
    PROJECTED_HDRI_GROUND_STABILIZATION_START_RATIO,
    PROJECTED_HDRI_GROUND_STABILIZATION_END_RATIO,
    normalizedDistance,
  );
}

function mixWrappedUnit(start: number, end: number, amount: number): number {
  let delta = end - start;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return wrapUnit(start + delta * amount);
}

/**
 * Keep the CPU projection contract next to the GLSL equivalent below. This
 * is used for numerical regression tests because the browser shader itself is
 * represented as a string and cannot be imported into a Node test directly.
 */
export function projectEquirectangularDirection(
  direction: [number, number, number],
  panoramaHorizonV: number = STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
  hdriAzimuthOffsetDegrees: number = 0,
): ProjectedHdriCoordinates {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  const normalizedDirection: [number, number, number] = length > 0
    ? [direction[0] / length, direction[1] / length, direction[2] / length]
    : [0, 0, 1];
  // The key light is placed at +offset in world space. To find the original
  // source texel for a world direction, the visible backdrop samples -offset.
  const projectionDirection = rotateHdriLightDirectionAzimuth(
    normalizedDirection,
    -hdriAzimuthOffsetDegrees,
  );
  const horizontalLength = Math.hypot(projectionDirection[0], projectionDirection[2]);
  let u = 0.5;
  if (horizontalLength > 0.0001) {
    const azimuthProgress = ((
      (Math.atan2(projectionDirection[2], projectionDirection[0]) + Math.PI * 0.5)
      / (Math.PI * 2)
    ) + 1) % 1;
    u = 1 - azimuthProgress;
    const poleProgress = smoothstep(0.94, 0.999, Math.abs(projectionDirection[1]));
    u = u * (1 - poleProgress) + 0.5 * poleProgress;
  }
  const horizonV = Number.isFinite(panoramaHorizonV) ? clamp(panoramaHorizonV, 0, 1) : STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V;
  return {
    u,
    v: clamp(horizonV - Math.asin(clamp(projectionDirection[1], -1, 1)) / Math.PI, 0, 1),
  };
}

/**
 * Project a world-space surface point while replacing only the mathematical
 * nadir singularity with a finite, ground-only sampling cap. The visible
 * shader below mirrors this helper; the direction-only function above remains
 * the source projection used by HDRI light estimation.
 */
export function projectEquirectangularSurface(
  surfacePosition: [number, number, number],
  projectionCenterHeight: number,
  projectionRadiusMeters: number,
  panoramaHorizonV = STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
  hdriAzimuthOffsetDegrees = 0,
): ProjectedHdriSurfaceCoordinates {
  const height = Number.isFinite(projectionCenterHeight) ? projectionCenterHeight : 0;
  const horizonV = Number.isFinite(panoramaHorizonV)
    ? clamp(panoramaHorizonV, 0, 1)
    : STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V;
  const radius = resolveProjectionRadius(projectionRadiusMeters);
  const x = Number.isFinite(surfacePosition[0]) ? surfacePosition[0] : 0;
  const y = Number.isFinite(surfacePosition[1]) ? surfacePosition[1] : 0;
  const z = Number.isFinite(surfacePosition[2]) ? surfacePosition[2] : 0;
  const projectionToSurface: [number, number, number] = [x, y - height, z];
  const raw = projectEquirectangularDirection(
    projectionToSurface,
    horizonV,
    hdriAzimuthOffsetDegrees,
  );
  const isGround = y < height - 0.001;
  const groundStabilization = isGround
    ? getProjectedHdriGroundStabilization(Math.hypot(x, z), radius)
    : 0;
  const normalizedGroundDistance = Math.hypot(x, z) / radius;
  const stableAzimuthProgress = smoothstep(
    0,
    PROJECTED_HDRI_GROUND_STABILIZATION_END_RATIO,
    normalizedGroundDistance,
  );
  const stableU = mixWrappedUnit(0.5, raw.u, stableAzimuthProgress);
  const stableGroundHeight = Math.max(height, PROJECTED_HDRI_GROUND_CAP_MIN_HEIGHT_METERS);
  const stableGroundRadius = radius * PROJECTED_HDRI_GROUND_STABILIZATION_END_RATIO;
  const stableV = clamp(
    horizonV + Math.atan2(stableGroundHeight, stableGroundRadius) / Math.PI,
    0,
    PROJECTED_HDRI_GROUND_CAP_MAX_V,
  );
  return {
    u: mixWrappedUnit(raw.u, stableU, groundStabilization),
    v: raw.v * (1 - groundStabilization) + stableV * groundStabilization,
    groundStabilization,
  };
}

/**
 * The UE HDRIBackdrop floor and sky materials project the source panorama from
 * a world-space projection point. Scene state is stored as an equirectangular
 * 2:1 image, so the lookup stays in the fragment shader and samples that
 * original image directly. Reprojecting the lower half into a cubemap first
 * collapses the ground into the cubemap's nadir and creates the radial blur
 * visible around the projection center.
 */
export const PROJECTED_HDRI_VERTEX_GLSL = `
attribute vec3 aPosition;

uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;

varying vec3 vWorldPosition;

void main(void) {
    vec4 worldPosition = matrix_model * vec4(aPosition, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = matrix_viewProjection * worldPosition;
}
`;

export const PROJECTED_HDRI_FRAGMENT_GLSL = `
precision highp float;

#include "gammaPS"
#include "tonemappingPS"

uniform sampler2D uEnvironmentMap;
uniform float uProjectionCenterHeight;
uniform float uProjectionRadiusMeters;
uniform float uPanoramaHorizonV;
uniform float uHdriAzimuthOffsetDegrees;
uniform float uEnvironmentIsRgbE;

varying vec3 vWorldPosition;

void main(void) {
  vec3 projectionToSurface = vWorldPosition - vec3(0.0, uProjectionCenterHeight, 0.0);
  vec3 projectionDirection = normalize(projectionToSurface);
  float azimuthOffsetRadians = -uHdriAzimuthOffsetDegrees * 0.01745329252;
  float azimuthCosine = cos(azimuthOffsetRadians);
  float azimuthSine = sin(azimuthOffsetRadians);
  vec3 sourceDirection = normalize(vec3(
      projectionDirection.x * azimuthCosine - projectionDirection.z * azimuthSine,
      projectionDirection.y,
      projectionDirection.x * azimuthSine + projectionDirection.z * azimuthCosine
  ));
  float azimuthProgress = mod(
      (atan(sourceDirection.z, sourceDirection.x) + 1.57079633) / 6.28318531 + 1.0,
      1.0
  );
  // PROJECTED_HDRI_GROUND_STABILIZATION_START_RATIO = 0.08
  // PROJECTED_HDRI_GROUND_STABILIZATION_END_RATIO = 0.28
  float safeProjectionRadius = max(uProjectionRadiusMeters, 0.001);
  float normalizedGroundDistance = length(projectionToSurface.xz) / safeProjectionRadius;
  float groundSurfaceProgress = 1.0 - step(
      uProjectionCenterHeight - 0.001,
      vWorldPosition.y
  );
  float groundCenterProgress = groundSurfaceProgress * (1.0 - smoothstep(
      0.08,
      0.28,
      normalizedGroundDistance
  ));
  float rawPanoramaU = mix(
      1.0 - azimuthProgress,
      0.5,
      smoothstep(0.94, 0.999, abs(sourceDirection.y))
  );
  float rawPanoramaV = clamp(
      uPanoramaHorizonV - asin(clamp(sourceDirection.y, -1.0, 1.0)) / 3.14159265,
      0.0,
      1.0
  );
  float stableAzimuthProgress = smoothstep(
      0.0,
      0.28,
      normalizedGroundDistance
  );
  float stableUOffset = rawPanoramaU - 0.5;
  stableUOffset = stableUOffset > 0.5
    ? stableUOffset - 1.0
    : (stableUOffset < -0.5 ? stableUOffset + 1.0 : stableUOffset);
  float stablePanoramaU = fract(
      0.5 + stableUOffset * stableAzimuthProgress + 1.0
  );
  float stableGroundHeight = max(uProjectionCenterHeight, 0.001);
  float stableGroundRadius = safeProjectionRadius * 0.28;
  float stablePanoramaV = clamp(
      uPanoramaHorizonV
        + atan(stableGroundHeight, stableGroundRadius) / 3.14159265,
      0.0,
      0.96
  );
  float wrappedUDelta = stablePanoramaU - rawPanoramaU;
  wrappedUDelta = wrappedUDelta > 0.5
    ? wrappedUDelta - 1.0
    : (wrappedUDelta < -0.5 ? wrappedUDelta + 1.0 : wrappedUDelta);
  float panoramaU = fract(
      rawPanoramaU + wrappedUDelta * groundCenterProgress + 1.0
  );
  float panoramaV = mix(rawPanoramaV, stablePanoramaV, groundCenterProgress);
  vec4 rawColor = texture2D(uEnvironmentMap, vec2(panoramaU, panoramaV));
  // Generated scene panoramas are normal gamma-encoded images. The model
  // library may still provide Radiance RGBE files, so select the decoder from
  // the loaded texture type without changing the sampling path.
  vec3 linearColor = uEnvironmentIsRgbE > 0.5
    ? decodeRGBE(rawColor)
    : decodeGamma(rawColor);
  if (groundCenterProgress > 0.001) {
    vec4 stableColor = texture2D(
        uEnvironmentMap,
        vec2(stablePanoramaU, stablePanoramaV)
    );
    vec3 stableLinearColor = uEnvironmentIsRgbE > 0.5
      ? decodeRGBE(stableColor)
      : decodeGamma(stableColor);
    linearColor = mix(linearColor, stableLinearColor, groundCenterProgress);
  }
  gl_FragColor = vec4(gammaCorrectOutput(toneMap(linearColor)), rawColor.a);
}
`;

/**
 * PlayCanvas starts WebGL programs asynchronously when KHR_parallel_shader_compile
 * is available, but its forward renderer still finalizes a newly created shader
 * synchronously. Pre-create this material's exact forward variant and wait for
 * the driver to finish it before the backdrop becomes renderable; otherwise a
 * valid shader can be reported as `Failed to compile ... null` during the first
 * frame while the program is still being linked.
 */
export async function waitForProjectedHdriShader(
  app: pc.AppBase,
  meshInstance: pc.MeshInstance,
  camera: pc.CameraComponent,
  isActive: () => boolean = () => true,
): Promise<boolean> {
  if (!app.renderer.viewUniformFormat) app.renderer.frameUpdate();
  const worldLayer = app.scene.layers.getLayerById(pc.LAYERID_WORLD);
  const lightHash = worldLayer?.getLightHash(app.scene.clusteredLightingEnabled) ?? 0;
  const shader = meshInstance.getShaderInstance(
    pc.SHADER_FORWARD,
    lightHash,
    app.scene,
    camera.shaderParams,
    app.renderer.viewUniformFormat,
    [],
  ).shader;
  if (!shader) return isActive();
  const shaderImpl = shader.impl as ProjectedHdriShaderImpl | undefined;
  if (!shaderImpl?.isLinked) return isActive();

  const startedAt = Date.now();
  while (isActive()) {
    if (shaderImpl.isLinked(app.graphicsDevice)) {
      if (shaderImpl.finalize && !shader.ready) {
        if (!shaderImpl.finalize(app.graphicsDevice, shader)) {
          throw new Error("HDRI 可见着色器编译失败。");
        }
      }
      return true;
    }
    if (Date.now() - startedAt >= PROJECTED_HDRI_SHADER_WAIT_TIMEOUT_MS) return false;
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, PROJECTED_HDRI_SHADER_POLL_INTERVAL_MS);
    });
  }
  return false;
}

export function createProjectedHdriMaterial(
  texture: pc.Texture,
  settings: ProjectedHdriMaterialSettings,
): pc.ShaderMaterial {
  const material = new pc.ShaderMaterial({
    uniqueName: "drama-blocking3d-hdri-projection",
    attributes: {
      aPosition: pc.SEMANTIC_POSITION,
    },
    vertexGLSL: PROJECTED_HDRI_VERTEX_GLSL,
    fragmentGLSL: PROJECTED_HDRI_FRAGMENT_GLSL,
  });
  material.cull = pc.CULLFACE_FRONT;
  material.depthWrite = false;
  updateProjectedHdriMaterial(material, texture, settings);
  return material;
}

export function updateProjectedHdriMaterial(
  material: pc.ShaderMaterial,
  texture: pc.Texture,
  settings: ProjectedHdriMaterialSettings,
): void {
  material.setParameter("uEnvironmentMap", texture);
  material.setParameter("uProjectionCenterHeight", settings.projectionCenterHeight);
  material.setParameter("uProjectionRadiusMeters", settings.projectionRadiusMeters);
  material.setParameter("uPanoramaHorizonV", settings.panoramaHorizonV);
  material.setParameter("uHdriAzimuthOffsetDegrees", settings.hdriAzimuthOffsetDegrees);
  material.setParameter("uEnvironmentIsRgbE", texture.type === pc.TEXTURETYPE_RGBE ? 1 : 0);
  material.update();
}
