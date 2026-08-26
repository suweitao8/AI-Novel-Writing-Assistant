export const DEFAULT_BLOCKING_3D_HEIGHT_METERS = 1.8;
export const BLOCKING_3D_HEIGHT_MIN_METERS = 0.7;
export const BLOCKING_3D_HEIGHT_MAX_METERS = 2.4;
export const BLOCKING_3D_PROXY_NATIVE_HEIGHT_METERS = 1.8287;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeBlocking3dHeight(heightMeters: number): number {
  return clamp(
    Number.isFinite(heightMeters) ? heightMeters : DEFAULT_BLOCKING_3D_HEIGHT_METERS,
    BLOCKING_3D_HEIGHT_MIN_METERS,
    BLOCKING_3D_HEIGHT_MAX_METERS,
  );
}

export function heightToBlocking3dScale(heightMeters: number): number {
  const safeHeight = normalizeBlocking3dHeight(heightMeters);
  return safeHeight / BLOCKING_3D_PROXY_NATIVE_HEIGHT_METERS;
}

export function scaleSavedActorForCurrentHeight(
  scale: [number, number, number],
  savedHeightMeters: number | undefined,
  currentHeightMeters: number,
): [number, number, number] {
  if (
    savedHeightMeters === undefined
    || !Number.isFinite(savedHeightMeters)
    || savedHeightMeters <= 0
    || !Number.isFinite(currentHeightMeters)
    || currentHeightMeters <= 0
  ) {
    return [...scale] as [number, number, number];
  }
  const ratio = currentHeightMeters / savedHeightMeters;
  return scale.map((value) => value * ratio) as [number, number, number];
}
