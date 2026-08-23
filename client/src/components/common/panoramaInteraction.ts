export const PANORAMA_MAX_PITCH_DEGREES = 60;
export const PANORAMA_MAX_PITCH_RAD = (PANORAMA_MAX_PITCH_DEGREES * Math.PI) / 180;

export function clampPanoramaPitch(pitch: number): number {
  return Math.max(-PANORAMA_MAX_PITCH_RAD, Math.min(PANORAMA_MAX_PITCH_RAD, pitch));
}

export function updatePanoramaYaw(yaw: number, deltaX: number, scale: number): number {
  return yaw + deltaX * scale;
}

export function updatePanoramaPitch(pitch: number, deltaY: number, scale: number): number {
  return clampPanoramaPitch(pitch + deltaY * scale);
}

export function updateCanvasPanoramaOffsetX(
  offsetX: number,
  deltaX: number,
  pixelsPerScreen: number,
): number {
  return offsetX + deltaX * pixelsPerScreen;
}

export function getCanvasPanoramaOffsetY(pitch: number, imageHeight: number, sourceHeight: number): number {
  const maxOffsetY = Math.max(0, (imageHeight - sourceHeight) / 2);
  const pitchRatio = clampPanoramaPitch(pitch) / PANORAMA_MAX_PITCH_RAD;
  return pitchRatio * maxOffsetY;
}
