import type { DramaShotBlockingSketchActor } from "@/api/media/drama";

export const BLOCKING_SKETCH_CANVAS = {
  width: 1280,
  height: 720,
} as const;

export const BLOCKING_SKETCH_LIMITS = {
  pitch: { min: -60, max: 60 },
  fov: { min: 40, max: 100 },
  scale: { min: 0.08, max: 2 },
} as const;

export function clampBlockingSketchPitch(value: number): number {
  return Math.max(BLOCKING_SKETCH_LIMITS.pitch.min, Math.min(BLOCKING_SKETCH_LIMITS.pitch.max, value));
}

export function clampBlockingSketchFov(value: number): number {
  return Math.max(BLOCKING_SKETCH_LIMITS.fov.min, Math.min(BLOCKING_SKETCH_LIMITS.fov.max, value));
}

export function clampBlockingSketchUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function wrapBlockingSketchYaw(value: number): number {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 && value > 0 ? 180 : wrapped;
}

export function updateBlockingSketchYaw(yawDeg: number, deltaX: number, degreesPerPixel: number): number {
  return wrapBlockingSketchYaw(yawDeg + deltaX * degreesPerPixel);
}

export function moveBlockingSketchActor<T extends Pick<DramaShotBlockingSketchActor, "x" | "y">>(
  actor: T,
  deltaX: number,
  deltaY: number,
): T {
  return {
    ...actor,
    x: clampBlockingSketchUnit(actor.x + deltaX),
    y: clampBlockingSketchUnit(actor.y + deltaY),
  };
}

export function scaleBlockingSketchActor<T extends Pick<DramaShotBlockingSketchActor, "scale">>(actor: T, factor: number): T {
  return {
    ...actor,
    scale: Math.max(BLOCKING_SKETCH_LIMITS.scale.min, Math.min(BLOCKING_SKETCH_LIMITS.scale.max, actor.scale * factor)),
  };
}

export function nextBlockingSketchZIndex(actors: DramaShotBlockingSketchActor[]): number {
  return actors.reduce((highest, actor) => Math.max(highest, actor.zIndex), -1) + 1;
}
