import * as pc from "playcanvas";

import {
  DEFAULT_HDRI_LIGHT_ESTIMATE,
  estimateHdriLightFromTexture,
} from "./blocking3dEnvironmentLighting";

/** Create the one transient key light reused by a viewer across environments. */
export function createHdriKeyLight(): pc.Entity {
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
    shadowBias: 0.05,
    normalOffsetBias: 0.05,
    shadowDistance: 25,
    shadowResolution: 2048,
  });
  entity.enabled = false;
  return entity;
}

export function clearHdriKeyLight(entity: pc.Entity): void {
  entity.enabled = false;
}

export function applyHdriKeyLight(entity: pc.Entity, texture: pc.Texture): void {
  const light = entity.light;
  if (!light) return;

  const estimate = estimateHdriLightFromTexture(texture);
  const sourceDirection = new pc.Vec3(
    estimate.direction[0],
    estimate.direction[1],
    estimate.direction[2],
  ).normalize();
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
