import * as pc from "playcanvas";
import { STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V } from "@ai-novel/shared/types/comicDrama";
import { rotateHdriLightDirectionAzimuth } from "./blocking3dEnvironmentLighting.ts";

export interface ProjectedHdriMaterialSettings {
  projectionCenterHeight: number;
  /** Source-image V coordinate that should land on the 3D projection horizon. */
  panoramaHorizonV: number;
  /** World-space HDRI rotation shared with the derived key light and EnvAtlas. */
  hdriAzimuthOffsetDegrees: number;
}

export interface ProjectedHdriCoordinates {
  u: number;
  v: number;
}

interface ProjectedHdriShaderImpl {
  isLinked?: (device: pc.GraphicsDevice) => boolean;
  finalize?: (device: pc.GraphicsDevice, shader: pc.Shader) => boolean;
}

const PROJECTED_HDRI_SHADER_WAIT_TIMEOUT_MS = 5_000;
const PROJECTED_HDRI_SHADER_POLL_INTERVAL_MS = 16;

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
  panoramaHorizonV = STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
  hdriAzimuthOffsetDegrees = 0,
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
 * The UE HDRIBackdrop floor and sky materials project a cubemap from a
 * world-space projection point. Scene state is stored as an equirectangular
 * 2:1 image, so the viewer first reprojects it into a filtered GPU cubemap and
 * this shader samples that cubemap from the surface direction. Keeping the
 * lookup in the fragment shader is important: interpolating a projected
 * direction across the center of a floor fan turns the projection into a
 * visible circular swirl.
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

uniform samplerCube uEnvironmentMap;
uniform float uProjectionCenterHeight;
uniform float uPanoramaHorizonV;
uniform float uHdriAzimuthOffsetDegrees;

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
  float sourceLatitude = clamp(
      asin(clamp(sourceDirection.y, -1.0, 1.0)) + 3.14159265 * (0.5 - uPanoramaHorizonV),
      -1.57079633,
      1.57079633
  );
  vec3 projectedDirection = normalize(vec3(
      sourceDirection.x,
      sin(sourceLatitude),
      sourceDirection.z
  ));
  vec4 rawColor = textureCube(uEnvironmentMap, projectedDirection);
    // The visible cubemap is RGBA8/RGBP, not an sRGB texture. Decode the
    // packing written by reprojectTexture before tone mapping; decoding it as
    // gamma makes the low-luminance floor collapse to black.
    vec3 linearColor = decodeRGBP(rawColor);
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
  material.update();
}
