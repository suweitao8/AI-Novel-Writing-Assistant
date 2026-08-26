import * as pc from "playcanvas";

export interface ProjectedHdriMaterialSettings {
  projectionCenterHeight: number;
  domeRadius: number;
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
 * world-space projection point. Our scene state is an equirectangular 2:1
 * image rather than a GPU cubemap, so this shader performs the equivalent
 * direction lookup directly against the panorama. Keeping the lookup in the
 * fragment shader is important: interpolating atan2-derived UVs across the
 * center of a floor fan turns the projection into a visible circular swirl.
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
uniform float uDomeRadius;

varying vec3 vWorldPosition;

const float PI = 3.1415926535897932384626433832795;
const float TWO_PI = 6.283185307179586476925286766559;

void main(void) {
    vec3 projectionToSurface = vWorldPosition - vec3(0.0, uProjectionCenterHeight, 0.0);
    vec3 projectionDirection = normalize(projectionToSurface);
    float horizontalLength = length(projectionDirection.xz);
    float u = 0.5;
    // Longitude is undefined at either pole. Avoid atan(0, 0) entirely; a
    // cubemap has a stable filtered pole, so use a fixed longitude there.
    if (horizontalLength > 0.0001) {
        float azimuthProgress = fract(
            (atan(projectionDirection.z, projectionDirection.x) + PI * 0.5) / TWO_PI + 1.0
        );
        u = 1.0 - azimuthProgress;
        float poleProgress = smoothstep(0.94, 0.999, abs(projectionDirection.y));
        // Blending to a fixed longitude gives the 2D panorama the same
        // behavior as a filtered cubemap near either pole.
        u = mix(u, 0.5, poleProgress);
    }
    float v = clamp(
        0.5 - asin(clamp(projectionDirection.y, -1.0, 1.0)) / PI,
        0.0,
        1.0
    );
    vec4 rawColor = texture2D(uEnvironmentMap, vec2(u, v));
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
  material.setParameter("uDomeRadius", settings.domeRadius);
  material.update();
}
