import * as pc from "playcanvas";

export interface ProjectedHdriMaterialSettings {
  projectionCenterHeight: number;
}

export interface ProjectedHdriCoordinates {
  u: number;
  v: number;
}

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
): ProjectedHdriCoordinates {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  const projectionDirection: [number, number, number] = length > 0
    ? [direction[0] / length, direction[1] / length, direction[2] / length]
    : [0, 0, 1];
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
  return {
    u,
    v: clamp(0.5 - Math.asin(clamp(projectionDirection[1], -1, 1)) / Math.PI, 0, 1),
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

varying vec3 vWorldPosition;

void main(void) {
    vec3 projectionToSurface = vWorldPosition - vec3(0.0, uProjectionCenterHeight, 0.0);
    vec3 projectionDirection = normalize(projectionToSurface);
    vec4 rawColor = textureCube(uEnvironmentMap, projectionDirection);
    vec3 linearColor = decodeGamma(rawColor);
    gl_FragColor = vec4(gammaCorrectOutput(toneMap(linearColor)), rawColor.a);
}
`;

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
  material.update();
}
