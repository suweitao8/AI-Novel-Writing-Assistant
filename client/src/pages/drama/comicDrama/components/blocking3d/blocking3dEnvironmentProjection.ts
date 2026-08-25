import * as pc from "playcanvas";

export interface ProjectedHdriMaterialSettings {
  projectionCenterHeight: number;
  domeRadius: number;
}

/**
 * The UE HDRIBackdrop floor material projects the cubemap from a world-space
 * projection point. Our scene state is an equirectangular 2:1 image rather
 * than a GPU cubemap, so this shader performs the equivalent direction lookup
 * directly against the panorama. Keeping the lookup in the fragment shader is
 * important: interpolating atan2-derived UVs across the center of a floor fan
 * turns the projection into a visible circular swirl.
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

uniform sampler2D uEnvironmentMap;
uniform float uProjectionCenterHeight;
uniform float uDomeRadius;

varying vec3 vWorldPosition;

const float PI = 3.1415926535897932384626433832795;
const float TWO_PI = 6.283185307179586476925286766559;

void main(void) {
    vec3 projectionToSurface = vWorldPosition - vec3(0.0, uProjectionCenterHeight, 0.0);
    float horizontalDistance = max(length(projectionToSurface.xz), 0.0001);
    float domeScale = uDomeRadius * 0.5;
    float edgeHeight = clamp(uProjectionCenterHeight / uDomeRadius, 0.004, 1.0) * domeScale;
    float edgeDownAngle = atan(uProjectionCenterHeight - edgeHeight, domeScale);
    float downAngle = atan(uProjectionCenterHeight - vWorldPosition.y, horizontalDistance);
    float verticalProgress = clamp(
        (downAngle - edgeDownAngle) / (PI * 0.5 - edgeDownAngle),
        0.0,
        1.0
    );
    float azimuthProgress = fract(
        (atan(projectionToSurface.z, projectionToSurface.x) + PI * 0.5) / TWO_PI + 1.0
    );
    float u = 1.0 - azimuthProgress;
    float v = 0.5 + verticalProgress * 0.5;
    gl_FragColor = texture2D(uEnvironmentMap, vec2(u, v));
}
`;

export function createProjectedHdriGroundMaterial(
  texture: pc.Texture,
  settings: ProjectedHdriMaterialSettings,
): pc.ShaderMaterial {
  const material = new pc.ShaderMaterial({
    uniqueName: "drama-blocking3d-hdri-ground-projection",
    attributes: {
      aPosition: pc.SEMANTIC_POSITION,
    },
    vertexGLSL: PROJECTED_HDRI_VERTEX_GLSL,
    fragmentGLSL: PROJECTED_HDRI_FRAGMENT_GLSL,
  });
  material.cull = pc.CULLFACE_FRONT;
  material.depthWrite = false;
  updateProjectedHdriGroundMaterial(material, texture, settings);
  return material;
}

export function updateProjectedHdriGroundMaterial(
  material: pc.ShaderMaterial,
  texture: pc.Texture,
  settings: ProjectedHdriMaterialSettings,
): void {
  material.setParameter("uEnvironmentMap", texture);
  material.setParameter("uProjectionCenterHeight", settings.projectionCenterHeight);
  material.setParameter("uDomeRadius", settings.domeRadius);
  material.update();
}
