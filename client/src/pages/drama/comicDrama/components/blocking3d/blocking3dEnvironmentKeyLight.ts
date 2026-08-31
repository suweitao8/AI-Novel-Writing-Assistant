import * as pc from "playcanvas";

import {
  DEFAULT_HDRI_LIGHT_ESTIMATE,
  estimateHdriLightFromTexture,
  rotateHdriLightDirectionAzimuth,
} from "./blocking3dEnvironmentLighting";
import {
  DEFAULT_BLOCKING_3D_LIGHTING_PROFILE,
  resolveBlocking3dLightingProfile,
  type Blocking3dLightingProfile,
} from "./blocking3dEnvironmentLightingProfile";

/** Create the one transient key light reused by a viewer across environments. */
export function createHdriKeyLight(
  profile: Blocking3dLightingProfile = DEFAULT_BLOCKING_3D_LIGHTING_PROFILE,
): pc.Entity {
  const lighting = resolveBlocking3dLightingProfile(profile);
  const entity = new pc.Entity("blocking3d-hdri-key-light");
  entity.addComponent("light", {
    type: "directional",
    color: new pc.Color(
      DEFAULT_HDRI_LIGHT_ESTIMATE.color[0],
      DEFAULT_HDRI_LIGHT_ESTIMATE.color[1],
      DEFAULT_HDRI_LIGHT_ESTIMATE.color[2],
    ),
    intensity: DEFAULT_HDRI_LIGHT_ESTIMATE.intensity,
    castShadows: true,
    shadowType: lighting.shadowType,
    shadowBias: lighting.shadowBias,
    normalOffsetBias: lighting.normalOffsetBias,
    shadowDistance: lighting.shadowDistance,
    shadowResolution: lighting.shadowResolution,
    shadowIntensity: lighting.shadowIntensity,
  });
  entity.enabled = false;
  return entity;
}

export function clearHdriKeyLight(entity: pc.Entity): void {
  entity.enabled = false;
}

/** Rotate only the horizontal (world-Y) component of a light direction. */
export function applyHdriKeyLight(
  entity: pc.Entity,
  texture: pc.Texture,
  panoramaHorizonV = 0.5,
  azimuthOffsetDegrees = 0,
): void {
  const light = entity.light;
  if (!light) return;

  const estimate = estimateHdriLightFromTexture(texture, panoramaHorizonV);
  const rotatedDirection = rotateHdriLightDirectionAzimuth(
    estimate.direction,
    azimuthOffsetDegrees,
  );
  const sourceDirection = new pc.Vec3(...rotatedDirection).normalize();
  // PlayCanvas dispatches a directional light along the negative entity Y
  // axis, then the Lambert shader negates that ray for the surface-facing
  // light vector. The entity's Y axis must therefore point from the actor
  // toward the HDRI source so the bright side is lit.
  entity.setRotation(new pc.Quat().setFromDirections(pc.Vec3.UP, sourceDirection));
  entity.setPosition(
    sourceDirection.x * 10,
    sourceDirection.y * 10,
    sourceDirection.z * 10,
  );
  light.color = new pc.Color(estimate.color[0], estimate.color[1], estimate.color[2]);
  light.intensity = estimate.intensity;
  entity.enabled = true;
}
