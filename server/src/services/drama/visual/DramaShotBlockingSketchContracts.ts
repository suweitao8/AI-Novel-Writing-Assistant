export const BLOCKING_SKETCH_CANVAS = {
  width: 1280,
  height: 720,
} as const;

export const BLOCKING_SKETCH_LIMITS = {
  yawDeg: { min: -180, max: 180 },
  pitchDeg: { min: -60, max: 60 },
  fovDeg: { min: 40, max: 100 },
  position: { min: 0, max: 1 },
  scale: { min: 0.08, max: 2 },
  zIndex: { min: 0, max: 99 },
  maxActors: 12,
} as const;

export type DramaShotBlockingSketchStatus = "draft" | "confirmed";

export interface DramaShotBlockingSketchScene {
  assetId: string;
  stateId: string;
  imageUrl: string;
  yawDeg: number;
  pitchDeg: number;
  fovDeg: number;
}

export interface DramaShotBlockingSketchActor {
  characterName: string;
  assetId?: string;
  stateId?: string;
  imageUrl?: string;
  x: number;
  y: number;
  scale: number;
  flipX: boolean;
  zIndex: number;
}

export interface DramaShotBlockingSketchData {
  status: DramaShotBlockingSketchStatus;
  version: number;
  url?: string;
  generatedAt?: string;
  scene: DramaShotBlockingSketchScene;
  actors: DramaShotBlockingSketchActor[];
}

function invalid(message: string): never {
  throw new Error(`摆位草图数据无效：${message}`);
}

function stringValue(value: unknown, label: string, required = true): string | undefined {
  if (typeof value !== "string") {
    if (required) invalid(`${label}不能为空`);
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) invalid(`${label}不能为空`);
    return undefined;
  }
  return trimmed;
}

function finiteNumber(value: unknown, label: string, min: number, max: number, integer = false): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max || (integer && !Number.isInteger(numeric))) {
    invalid(`${label}必须在 ${min} 到 ${max} 之间`);
  }
  return numeric;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label}不能为空`);
  }
  return value as Record<string, unknown>;
}

function optionalBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    invalid(`${label}必须是布尔值`);
  }
  return value;
}

function normalizeScene(input: unknown): DramaShotBlockingSketchScene {
  const scene = objectValue(input, "场景");
  return {
    assetId: stringValue(scene.assetId, "场景资产")!,
    stateId: stringValue(scene.stateId, "场景状态")!,
    imageUrl: stringValue(scene.imageUrl, "场景图片")!,
    yawDeg: finiteNumber(scene.yawDeg, "水平视角", BLOCKING_SKETCH_LIMITS.yawDeg.min, BLOCKING_SKETCH_LIMITS.yawDeg.max),
    pitchDeg: finiteNumber(scene.pitchDeg, "俯仰角", BLOCKING_SKETCH_LIMITS.pitchDeg.min, BLOCKING_SKETCH_LIMITS.pitchDeg.max),
    fovDeg: finiteNumber(scene.fovDeg, "视野角", BLOCKING_SKETCH_LIMITS.fovDeg.min, BLOCKING_SKETCH_LIMITS.fovDeg.max),
  };
}

function normalizeActor(input: unknown): DramaShotBlockingSketchActor {
  const actor = objectValue(input, "角色");
  return {
    characterName: stringValue(actor.characterName, "角色名称")!,
    ...(stringValue(actor.assetId, "角色资产", false) ? { assetId: stringValue(actor.assetId, "角色资产", false) } : {}),
    ...(stringValue(actor.stateId, "角色状态", false) ? { stateId: stringValue(actor.stateId, "角色状态", false) } : {}),
    ...(stringValue(actor.imageUrl, "角色图片", false) ? { imageUrl: stringValue(actor.imageUrl, "角色图片", false) } : {}),
    x: finiteNumber(actor.x, "横向位置", BLOCKING_SKETCH_LIMITS.position.min, BLOCKING_SKETCH_LIMITS.position.max),
    y: finiteNumber(actor.y, "纵向位置", BLOCKING_SKETCH_LIMITS.position.min, BLOCKING_SKETCH_LIMITS.position.max),
    scale: finiteNumber(actor.scale, "角色缩放", BLOCKING_SKETCH_LIMITS.scale.min, BLOCKING_SKETCH_LIMITS.scale.max),
    flipX: optionalBoolean(actor.flipX, "角色翻转"),
    zIndex: finiteNumber(actor.zIndex, "角色层级", BLOCKING_SKETCH_LIMITS.zIndex.min, BLOCKING_SKETCH_LIMITS.zIndex.max, true),
  };
}

export function normalizeBlockingSketchData(input: unknown): DramaShotBlockingSketchData {
  const data = objectValue(input, "草图");
  if (data.status !== "draft" && data.status !== "confirmed") {
    invalid("状态必须是 draft 或 confirmed");
  }
  if (!Array.isArray(data.actors) || data.actors.length > BLOCKING_SKETCH_LIMITS.maxActors) {
    invalid(`角色数量不能超过 ${BLOCKING_SKETCH_LIMITS.maxActors}`);
  }
  const url = stringValue(data.url, "草图图片", false);
  const generatedAt = stringValue(data.generatedAt, "生成时间", false);
  return {
    status: data.status,
    version: finiteNumber(data.version, "版本号", 1, Number.MAX_SAFE_INTEGER, true),
    ...(url ? { url } : {}),
    ...(generatedAt ? { generatedAt } : {}),
    scene: normalizeScene(data.scene),
    actors: data.actors.map(normalizeActor),
  };
}

export function parseBlockingSketchData(raw: string | null | undefined): DramaShotBlockingSketchData | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    return normalizeBlockingSketchData(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function isConfirmedBlockingSketch(data: DramaShotBlockingSketchData | null | undefined): data is DramaShotBlockingSketchData & { status: "confirmed"; url: string } {
  return Boolean(data && data.status === "confirmed" && data.url?.trim());
}
