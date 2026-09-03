import * as pc from "playcanvas";
import { STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V } from "@ai-novel/shared/types/comicDrama";
import { rotateHdriLightDirectionAzimuth } from "./blocking3dEnvironmentLighting.ts";

export interface ProjectedHdriMaterialSettings {
  projectionCenterHeight: number;
  /** Source-image V coordinate that should land on the 3D projection horizon. */
  panoramaHorizonV: number;
  /** World-space HDRI rotation shared with the derived key light and EnvAtlas. */
  hdriAzimuthOffsetDegrees: number;
  /** Lower-image row used to derive the flat ground material color. */
  groundSampleV?: number;
}

export interface ProjectedHdriCoordinates {
  u: number;
  v: number;
}

export type ProjectedHdriSurfaceCoordinates = ProjectedHdriCoordinates;

interface ProjectedHdriShaderImpl {
  isLinked?: (device: pc.GraphicsDevice) => boolean;
  finalize?: (device: pc.GraphicsDevice, shader: pc.Shader) => boolean;
}

const PROJECTED_HDRI_SHADER_WAIT_TIMEOUT_MS = 5_000;
const PROJECTED_HDRI_SHADER_POLL_INTERVAL_MS = 16;
/** Fixed source row used to derive a flat, low-frequency ground material. */
export const PROJECTED_HDRI_GROUND_SAMPLE_V = 0.72;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return progress * progress * (3 - 2 * progress);
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
 * Project a world-space surface point for the sky/wall part of the backdrop.
 * Ground pixels are deliberately not returned here: generated scene images
 * are often ordinary perspective panoramas rather than calibrated equirects,
 * so reprojecting their lower half onto a floor creates a circular vortex.
 */
export function projectEquirectangularSurface(
  surfacePosition: [number, number, number],
  projectionCenterHeight: number,
  panoramaHorizonV = STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
  hdriAzimuthOffsetDegrees = 0,
): ProjectedHdriSurfaceCoordinates {
  const height = Number.isFinite(projectionCenterHeight) ? projectionCenterHeight : 0;
  const horizonV = Number.isFinite(panoramaHorizonV)
    ? clamp(panoramaHorizonV, 0, 1)
    : STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V;
  const x = Number.isFinite(surfacePosition[0]) ? surfacePosition[0] : 0;
  const y = Number.isFinite(surfacePosition[1]) ? surfacePosition[1] : 0;
  const z = Number.isFinite(surfacePosition[2]) ? surfacePosition[2] : 0;
  return projectEquirectangularDirection(
    [x, y - height, z],
    horizonV,
    hdriAzimuthOffsetDegrees,
  );
}

/**
 * The UE HDRIBackdrop sky and outer wall project the source panorama from a
 * world-space projection point. Generated 2:1 scene images are often ordinary
 * perspective views, so their lower half is not a calibrated floor swatch.
 * The visible floor therefore uses only a low-frequency color derived in the
 * fragment shader; reprojecting the composed floor would make its perspective
 * lines converge into a vortex.
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
uniform float uPanoramaHorizonV;
uniform float uHdriAzimuthOffsetDegrees;
uniform float uGroundSampleV;
uniform float uEnvironmentIsRgbE;

varying vec3 vWorldPosition;

vec3 sampleEnvironmentLinear(vec2 uv) {
  vec4 rawColor = texture2D(uEnvironmentMap, uv);
  return uEnvironmentIsRgbE > 0.5
    ? decodeRGBE(rawColor)
    : decodeGamma(rawColor);
}

/**
 * Generated scene panoramas are not guaranteed to be calibrated equirects.
 * Use a small lower-image neighborhood only to derive the flat floor's color;
 * never map the perspective ground painting back onto the floor geometry.
 */
vec3 sampleGroundMaterialColor() {
  float lower = clamp(uGroundSampleV - 0.06, 0.52, 0.98);
  float upper = clamp(uGroundSampleV + 0.06, 0.52, 0.98);
  vec3 color = vec3(0.0);
  color += sampleEnvironmentLinear(vec2(0.20, lower));
  color += sampleEnvironmentLinear(vec2(0.50, lower));
  color += sampleEnvironmentLinear(vec2(0.80, lower));
  color += sampleEnvironmentLinear(vec2(0.20, upper));
  color += sampleEnvironmentLinear(vec2(0.50, upper));
  color += sampleEnvironmentLinear(vec2(0.80, upper));
  return color / 6.0;
}

void main(void) {
  float groundSurfaceProgress = 1.0 - step(
      uProjectionCenterHeight - 0.001,
      vWorldPosition.y
  );
  if (groundSurfaceProgress > 0.5) {
    vec3 groundLinearColor = sampleGroundMaterialColor();
    gl_FragColor = vec4(gammaCorrectOutput(toneMap(groundLinearColor)), 1.0);
    return;
  }

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
  float panoramaU = rawPanoramaU;
  float panoramaV = rawPanoramaV;
  vec4 rawColor = texture2D(uEnvironmentMap, vec2(panoramaU, panoramaV));
  // Generated scene panoramas are normal gamma-encoded images. The model
  // library may still provide Radiance RGBE files, so select the decoder from
  // the loaded texture type without changing the sampling path.
  vec3 linearColor = uEnvironmentIsRgbE > 0.5
    ? decodeRGBE(rawColor)
    : decodeGamma(rawColor);
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
  material.setParameter("uPanoramaHorizonV", settings.panoramaHorizonV);
  material.setParameter("uHdriAzimuthOffsetDegrees", settings.hdriAzimuthOffsetDegrees);
  const groundSampleV = typeof settings.groundSampleV === "number"
    && Number.isFinite(settings.groundSampleV)
    ? settings.groundSampleV
    : PROJECTED_HDRI_GROUND_SAMPLE_V;
  material.setParameter("uGroundSampleV", groundSampleV);
  material.setParameter("uEnvironmentIsRgbE", texture.type === pc.TEXTURETYPE_RGBE ? 1 : 0);
  material.update();
}
