import type {
  WorldMapData,
  WorldMapNode,
  WorldMapTerrain,
  WorldMapTerrainType,
} from "@/api/story/storySettings";

// 单层地图画布的纯数据层：类型色调与编辑工具。
// 地图是结构化数据渲染出来的 SVG——地形是程序化定义的多边形，不经过任何 AI 生图。

export const TERRAIN_TYPES: Array<{ value: WorldMapTerrainType; label: string }> = [
  { value: "plain", label: "平地" },
  { value: "mountain", label: "山地" },
  { value: "water", label: "水域" },
];

// 组件内语义色调映射（沿用场景 emerald / 道具 amber 的调色板原色先例）：
// 平地=emerald 绿意、山地=muted 灰褐、水域=primary 随主题的主色。
export const TERRAIN_TONES: Record<WorldMapTerrainType, { fill: string; stroke: string; text: string }> = {
  plain: { fill: "fill-emerald-500/10", stroke: "stroke-emerald-600/50 dark:stroke-emerald-400/50", text: "text-emerald-600 dark:text-emerald-400" },
  mountain: { fill: "fill-muted", stroke: "stroke-muted-foreground/50", text: "text-muted-foreground" },
  water: { fill: "fill-primary/10", stroke: "stroke-primary/40", text: "text-primary" },
};

// kind 是 AI 摆放场景时给出的地点类型；country 是旧版层级数据，只兼容显示（回落 other 色调）。
export const KIND_TONES: Record<string, { stroke: string; fill: string; dot: string; label: string }> = {
  city: { stroke: "stroke-primary", fill: "fill-primary/15", dot: "bg-primary", label: "城市" },
  region: { stroke: "stroke-emerald-600 dark:stroke-emerald-400", fill: "fill-emerald-500/15", dot: "bg-emerald-500", label: "区域" },
  building: { stroke: "stroke-amber-600 dark:stroke-amber-400", fill: "fill-amber-500/15", dot: "bg-amber-500", label: "地点" },
  wild: { stroke: "stroke-muted-foreground", fill: "fill-muted", dot: "bg-muted-foreground", label: "荒野" },
  other: { stroke: "stroke-foreground/50", fill: "fill-muted/60", dot: "bg-muted-foreground/60", label: "其他" },
};

export function kindTone(kind: string) {
  return KIND_TONES[kind] ?? KIND_TONES.other;
}

export function terrainTone(type: string) {
  return TERRAIN_TONES[(type as WorldMapTerrainType) in TERRAIN_TONES ? (type as WorldMapTerrainType) : "plain"];
}

export function terrainTypeLabel(type: string) {
  return TERRAIN_TYPES.find((item) => item.value === type)?.label ?? "平地";
}

export function nodeLabel(node: WorldMapNode) {
  return node.name.trim() || "未命名地点";
}

export function createEmptyMap(scaleKm: number | null): WorldMapData {
  return { overview: "", scaleKm, terrain: [], nodes: [], edges: [], childMaps: {} };
}

// 旧数据兼容：v1 地图没有 terrain/scaleKm/childMaps 字段，读入时补齐形状。
export function normalizeMapShape(map: Partial<WorldMapData> | null | undefined): WorldMapData {
  return {
    overview: typeof map?.overview === "string" ? map.overview : "",
    scaleKm: typeof map?.scaleKm === "number" && Number.isFinite(map.scaleKm) ? map.scaleKm : null,
    terrain: Array.isArray(map?.terrain) ? map!.terrain : [],
    nodes: Array.isArray(map?.nodes) ? map!.nodes : [],
    edges: Array.isArray(map?.edges) ? map!.edges : [],
    childMaps: map?.childMaps && typeof map.childMaps === "object" ? map.childMaps : {},
  };
}

export function polygonCenter(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (points.length === 0) return { x: 50, y: 50 };
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export function polygonPointsAttribute(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}
