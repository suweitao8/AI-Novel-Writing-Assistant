import type {
  WorldMapData,
  WorldMapEdge,
  WorldMapNode,
  WorldMapTerrain,
  WorldMapTerrainType,
} from "@/api/story/storySettings";

// 地图画布的纯数据层：类型色调、层级（世界=国家 → 国家=城市 → 城市=地点）导航与编辑工具。
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

// 旅行速度（公里/天）：网文常用口径，只做展示估算，不是硬规则。
export const TRAVEL_MODES = [
  { label: "步行", kmPerDay: 40 },
  { label: "骑马", kmPerDay: 80 },
  { label: "车船", kmPerDay: 160 },
] as const;

export const KIND_TONES: Record<string, { stroke: string; fill: string; dot: string; label: string }> = {
  country: { stroke: "stroke-violet-600 dark:stroke-violet-400", fill: "fill-violet-500/15", dot: "bg-violet-500", label: "国家" },
  city: { stroke: "stroke-primary", fill: "fill-primary/15", dot: "bg-primary", label: "城市" },
  region: { stroke: "stroke-emerald-600 dark:stroke-emerald-400", fill: "fill-emerald-500/15", dot: "bg-emerald-500", label: "区域" },
  building: { stroke: "stroke-amber-600 dark:stroke-amber-400", fill: "fill-amber-500/15", dot: "bg-amber-500", label: "地点" },
  wild: { stroke: "stroke-muted-foreground", fill: "fill-muted", dot: "bg-muted-foreground", label: "荒野" },
  other: { stroke: "stroke-foreground/50", fill: "fill-muted/60", dot: "bg-muted-foreground/60", label: "其他" },
};

// 三层地图的层级语义（按 activePath 深度取）：世界层摆国家、国家层摆城市、城市层摆具体地点（场景）。
export const MAP_LEVELS = [
  { levelLabel: "国家", childLevelLabel: "城市", defaultKind: "country" },
  { levelLabel: "城市", childLevelLabel: "地点", defaultKind: "city" },
  { levelLabel: "地点", childLevelLabel: null, defaultKind: "building" },
] as const;

// 各层地图的内置地理尺度（公里 / 100 坐标单位），按现实量级估算做展示：
// 世界层=国家级跨度（参考中国东西约 5000 公里）、国家层=大国内部城际（约 2000 公里）、
// 城市层=建成区量级（参考广州建成区约 40 公里）。mapJson 的 scaleKm 字段不再由用户设置，展示一律用这里的内置值。
export const LEVEL_SCALE_KM = [5000, 2000, 40] as const;

export const TIER_LABELS: Record<string, { label: string; radius: number }> = {
  capital: { label: "世界中心", radius: 4.6 },
  city: { label: "重镇", radius: 3.6 },
  town: { label: "据点", radius: 2.8 },
  landmark: { label: "地标", radius: 2.4 },
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

export function tierRadius(tier: string | null) {
  return (tier && TIER_LABELS[tier]?.radius) || 2.6;
}

export function nodeLabel(node: WorldMapNode) {
  return node.name.trim() || "未命名地点";
}

export function edgeKey(edge: Pick<WorldMapEdge, "fromId" | "toId">) {
  return [edge.fromId, edge.toId].sort().join("\u0000");
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

// 层级导航：activePath 是从世界级开始的节点 id 序列，逐层下钻进 childMaps。
export function mapAtPath(root: WorldMapData, path: string[]): WorldMapData | null {
  let current = root;
  for (const nodeId of path) {
    const next = current.childMaps?.[nodeId];
    if (!next) return null;
    current = next;
  }
  return current;
}

// 逐层写入：返回新的根地图（浅拷贝路径上的各级，避免原地突变）。
export function withMapAtPath(root: WorldMapData, path: string[], updater: (map: WorldMapData) => WorldMapData): WorldMapData {
  if (path.length === 0) return updater(root);
  const [head, ...rest] = path;
  const child = root.childMaps?.[head];
  if (!child) return root;
  return {
    ...root,
    childMaps: {
      ...root.childMaps,
      [head]: withMapAtPath(child, rest, updater),
    },
  };
}

// 面包屑标签：沿下钻路径取各级节点名。
export function pathLabels(root: WorldMapData, path: string[]): string[] {
  const labels: string[] = [];
  let current = root;
  for (const nodeId of path) {
    const node = current.nodes.find((item) => item.id === nodeId);
    labels.push(node ? nodeLabel(node) : "内部地图");
    const next = current.childMaps?.[nodeId];
    if (!next) break;
    current = next;
  }
  return labels;
}

// 两点直线距离（坐标单位 0-100）；地图跨度换算成公里。
export function coordinateDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function edgeDistanceKm(
  from: { x: number; y: number },
  to: { x: number; y: number },
  scaleKm: number | null,
): number | null {
  if (!scaleKm || scaleKm <= 0) return null;
  return Math.round((coordinateDistance(from, to) / 100) * scaleKm * 10) / 10;
}

export function travelEstimates(km: number): Array<{ label: string; text: string }> {
  return TRAVEL_MODES.map((mode) => {
    const days = km / mode.kmPerDay;
    if (days < 1) {
      const hours = Math.max(1, Math.round(days * 24));
      return { label: mode.label, text: `约 ${hours} 小时` };
    }
    return { label: mode.label, text: `约 ${Math.round(days)} 天` };
  });
}

export function polygonCenter(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (points.length === 0) return { x: 50, y: 50 };
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export function polygonPointsAttribute(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}
