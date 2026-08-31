import * as pc from "playcanvas";

/** Environment-lighting profiles are selected by the owning preview surface. */
export const DEFAULT_BLOCKING_3D_LIGHTING_PROFILE = "default" as const;
export const MODEL_PREVIEW_LIGHTING_PROFILE = "model-preview" as const;

export type Blocking3dLightingProfile =
  | typeof DEFAULT_BLOCKING_3D_LIGHTING_PROFILE
  | typeof MODEL_PREVIEW_LIGHTING_PROFILE;

export interface Blocking3dLightingProfileConfig {
  /** Low-frequency fill applied to lit meshes while an HDRI is active. */
  ambientLight: readonly [number, number, number];
  /** EnvAtlas contribution to model ambient/reflection lighting; the backdrop is unaffected. */
  skyboxIntensity: number;
  shadowType: number;
  shadowResolution: number;
  shadowDistance: number;
  shadowIntensity: number;
  shadowBias: number;
  normalOffsetBias: number;
  /**
   * World-space horizontal rotation shared by the visible HDRI, EnvAtlas and
   * the HDRI-derived key light.
   */
  hdriAzimuthOffsetDegrees: number;
}

/** Existing shared-preview baseline; keep this stable for non-model viewers. */
const DEFAULT_LIGHTING: Blocking3dLightingProfileConfig = Object.freeze({
  ambientLight: [0, 0, 0] as const,
  skyboxIntensity: 1,
  shadowType: pc.SHADOW_PCF3_32F,
  shadowResolution: 2048,
  shadowDistance: 25,
  shadowIntensity: 1,
  shadowBias: 0.05,
  normalOffsetBias: 0.05,
  hdriAzimuthOffsetDegrees: 0,
});

/** Model-library fill and shadow tuning for a readable, softly grounded preview. */
const MODEL_PREVIEW_LIGHTING: Blocking3dLightingProfileConfig = Object.freeze({
  ambientLight: [0.18, 0.18, 0.18] as const,
  // The visible backdrop is a separate unlit projection. Keep the full
  // envAtlas contribution for model materials so the HDRI lights the asset
  // instead of leaving only the weak constant ambient fill.
  skyboxIntensity: 1,
  shadowType: pc.SHADOW_PCF5_32F,
  shadowResolution: 2048,
  shadowDistance: 16,
  shadowIntensity: 0.62,
  shadowBias: 0.025,
  normalOffsetBias: 0.02,
  hdriAzimuthOffsetDegrees: 180,
});

/**
 * PlayCanvas applies skyboxRotation as an inverse environment lookup. The
 * scene rotation therefore uses the inverse of the profile's desired
 * world-space HDRI rotation so EnvAtlas lighting lands beside the key light.
 */
export function createHdriEnvironmentRotation(azimuthOffsetDegrees: number): pc.Quat {
  const offset = Number.isFinite(azimuthOffsetDegrees) ? azimuthOffsetDegrees : 0;
  return new pc.Quat().setFromEulerAngles(0, -offset, 0);
}

export function resolveBlocking3dLightingProfile(
  profile: Blocking3dLightingProfile = DEFAULT_BLOCKING_3D_LIGHTING_PROFILE,
): Blocking3dLightingProfileConfig {
  return profile === MODEL_PREVIEW_LIGHTING_PROFILE
    ? MODEL_PREVIEW_LIGHTING
    : DEFAULT_LIGHTING;
}
