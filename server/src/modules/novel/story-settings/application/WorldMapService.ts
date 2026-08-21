// 地图应用服务：AI 场景标注（单层平面地图：场景资产按相互位置关系摆到画布上）与人工编辑后地图的保存。
// 地图存储在 NovelSettingsWorld.mapJson：
// { overview, scaleKm, terrain:[{id,type,label,points}], nodes:[{id,name,kind,summary,x,y,tier?}],
//   edges:[{fromId,toId,label}], childMaps:{[nodeId]: 同构内部地图} }。
// 当前地图是单层画布：只使用根图 nodes/terrain；childMaps 是旧版国家→城市层级数据的兼容字段，
// 读取时不展开、不再写入新内容（旧数据随用户删除节点逐步清理）。
// 边界说明：
// - 场景是否「已放上地图」以根图节点判定：NovelScene.mapNodeId 指向根图存在节点才算已放置；
//   旧层级数据里挂在 childMaps 内部节点上的场景视为未放置（下次标注会重新摆到根图，自愈迁移）。
// - node id 必须稳定：AI 标注按名称对齐已有地点沿用原节点，NovelScene.mapNodeId 的引用因此不丢；
//   保存时被删除的节点会把引用它的场景挂点清空（不删场景本身）。
// - 坐标是 0-100 平面百分比，前端 React Flow 渲染并允许拖拽；旧数据（bundle 写入的无坐标节点）x/y 为 null，
//   渲染回落环形布局，兼容不迁移。
// - 场景标注只新增节点，不改动已有节点/地形/坐标；无法定位的场景写 NovelScene.mapUnmappable=true，下次跳过。
import { randomUUID } from "node:crypto";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  worldMapAnnotatePrompt,
  type WorldMapAnnotateOutput,
} from "../../../../prompting/prompts/novel/worldMap.prompts";

const NODE_COUNT_MAX = 48;
const EDGE_COUNT_MAX = 48;
const TERRAIN_COUNT_MAX = 24;
const TERRAIN_VERTEX_MAX = 24;
// childMaps 只做旧数据兼容：深度与数量上限保留，防止异常数据无限嵌套。
const CHILD_MAP_COUNT_MAX = 32;
const CHILD_MAP_DEPTH_MAX = 3;
// country 是旧版层级数据的 kind，读取兼容但不再产生新节点。
const NODE_KINDS = new Set(["country", "city", "region", "building", "wild", "other"]);
const NODE_TIERS = new Set(["capital", "city", "town", "landmark"]);
const TERRAIN_TYPES = new Set(["plain", "mountain", "water"]);

export interface WorldMapNode {
  id: string;
  name: string;
  kind: string;
  summary: string;
  x: number | null;
  y: number | null;
  tier: string | null;
}

export interface WorldMapEdge {
  fromId: string;
  toId: string;
  label: string;
}

export interface WorldMapTerrain {
  id: string;
  type: string;
  label: string;
  points: Array<{ x: number; y: number }>;
}

export interface WorldMapData {
  overview: string;
  scaleKm: number | null;
  terrain: WorldMapTerrain[];
  nodes: WorldMapNode[];
  edges: WorldMapEdge[];
  childMaps: Record<string, WorldMapData>;
}

// AI 标注结果：已放到地图上的场景与无法定位的场景（含落库后的节点 id）。
export interface WorldMapAssignment {
  sceneId: string;
  sceneName: string;
  nodeId: string;
}

export interface WorldMapUnplaceable {
  sceneId: string;
  sceneName: string;
  reason: string;
}

export interface WorldMapAnnotationResult {
  map: WorldMapData;
  assignments: WorldMapAssignment[];
  unplaceable: WorldMapUnplaceable[];
}

function clampCoordinate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

function parseJsonObjectSafe(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

// 世界观关键设定条目（章节解析累积）：作为 AI 摆放场景与命名地形的世界观依据传入。
function parseKeySettings(value: string | null | undefined): Array<{ title: string; content: string }> {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        title: normalizeString((item as { title?: unknown }).title, 60),
        content: normalizeString((item as { content?: unknown }).content, 400),
      }))
      .filter((item) => item.title && item.content);
  } catch {
    return [];
  }
}

function normalizeString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// 确定性归一：坐标夹紧、长度截断、id 去重、悬空/自环/重复连线剔除、地形多边形与内部地图递归处理。
// 输入来自前端编辑器（已过 zod）或 AI 标注合并结果，这里只做格式兜底，不做业务拒绝。
export function normalizeWorldMap(raw: unknown, depth = 0): WorldMapData {
  const source = (raw ?? {}) as {
    overview?: unknown;
    scaleKm?: unknown;
    terrain?: unknown;
    nodes?: unknown;
    edges?: unknown;
    childMaps?: unknown;
  };
  const overview = normalizeString(source.overview, 600);
  const scaleKm = typeof source.scaleKm === "number" && Number.isFinite(source.scaleKm) && source.scaleKm > 0
    ? Math.min(1000000, Math.round(source.scaleKm * 10) / 10)
    : null;

  const terrain: WorldMapTerrain[] = [];
  const terrainIds = new Set<string>();
  if (Array.isArray(source.terrain)) {
    for (const item of source.terrain) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const id = normalizeString(record.id, 60);
      const type = TERRAIN_TYPES.has(String(record.type)) ? String(record.type) : "plain";
      if (!id || terrainIds.has(id)) continue;
      const points: Array<{ x: number; y: number }> = [];
      if (Array.isArray(record.points)) {
        for (const point of record.points) {
          if (!point || typeof point !== "object") continue;
          const pointRecord = point as { x?: unknown; y?: unknown };
          const x = clampCoordinate(pointRecord.x);
          const y = clampCoordinate(pointRecord.y);
          if (x === null || y === null) continue;
          const previous = points[points.length - 1];
          if (previous && Math.abs(previous.x - x) < 0.05 && Math.abs(previous.y - y) < 0.05) continue;
          points.push({ x, y });
          if (points.length >= TERRAIN_VERTEX_MAX) break;
        }
      }
      if (points.length < 3) continue;
      terrainIds.add(id);
      terrain.push({ id, type, label: normalizeString(record.label, 40), points });
      if (terrain.length >= TERRAIN_COUNT_MAX) break;
    }
  }

  const nodes: WorldMapNode[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(source.nodes)) {
    for (const item of source.nodes) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const id = normalizeString(record.id, 60);
      const name = normalizeString(record.name, 40);
      if (!id || !name || seenIds.has(id)) continue;
      seenIds.add(id);
      const kind = NODE_KINDS.has(String(record.kind)) ? String(record.kind) : "other";
      const tier = NODE_TIERS.has(String(record.tier)) ? String(record.tier) : null;
      nodes.push({
        id,
        name,
        kind,
        summary: normalizeString(record.summary, 200),
        x: clampCoordinate(record.x),
        y: clampCoordinate(record.y),
        tier,
      });
      if (nodes.length >= NODE_COUNT_MAX) break;
    }
  }
  const edges: WorldMapEdge[] = [];
  const seenPairs = new Set<string>();
  if (Array.isArray(source.edges)) {
    for (const item of source.edges) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const fromId = normalizeString(record.fromId, 60);
      const toId = normalizeString(record.toId, 60);
      if (!fromId || !toId || fromId === toId || !seenIds.has(fromId) || !seenIds.has(toId)) continue;
      const pairKey = [fromId, toId].sort().join("\u0000");
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      edges.push({ fromId, toId, label: normalizeString(record.label, 40) });
      if (edges.length >= EDGE_COUNT_MAX) break;
    }
  }

  // 旧层级 childMaps 只在挂点真实存在时保留（兼容读取），超出深度/数量上限的丢弃（静默兜底）。
  const childMaps: Record<string, WorldMapData> = {};
  if (depth < CHILD_MAP_DEPTH_MAX - 1 && source.childMaps && typeof source.childMaps === "object") {
    for (const [key, value] of Object.entries(source.childMaps as Record<string, unknown>)) {
      if (!seenIds.has(normalizeString(key, 60))) continue;
      if (Object.keys(childMaps).length >= CHILD_MAP_COUNT_MAX) break;
      childMaps[normalizeString(key, 60)] = normalizeWorldMap(value, depth + 1);
    }
  }

  return { overview, scaleKm, terrain, nodes, edges, childMaps };
}

function cloneMap(map: WorldMapData): WorldMapData {
  return JSON.parse(JSON.stringify(map)) as WorldMapData;
}

// AI 标注合并（纯函数，可测）：只新增地点节点，已有节点（含人工坐标）一律不动；
// 地点按名称对齐——同名沿用已有节点，避免重复建点。
export function mergeAnnotation(
  existing: WorldMapData,
  annotation: WorldMapAnnotateOutput,
  pendingScenes: Array<{ id: string; name: string; summary?: string }>,
): WorldMapAnnotationResult {
  const map = cloneMap(existing);
  const assignments: WorldMapAssignment[] = [];
  const unplaceable: WorldMapUnplaceable[] = [];
  const sceneByName = new Map(pendingScenes.map((scene) => [scene.name.trim(), scene]));

  // 地形分区：只在地图还没有地形时由 AI 输出（postValidate 保证），这里只追加。
  for (const draft of annotation.terrain ?? []) {
    const points = draft.points
      .map((point) => ({ x: clampCoordinate(point.x), y: clampCoordinate(point.y) }))
      .filter((point): point is { x: number; y: number } => point.x !== null && point.y !== null);
    if (points.length < 3) continue;
    map.terrain.push({
      id: randomUUID(),
      type: draft.type,
      label: draft.label?.trim().slice(0, 40) ?? "",
      points,
    });
  }

  for (const placement of annotation.placements) {
    const scene = sceneByName.get(placement.sceneName.trim());
    if (!scene) continue;
    const name = placement.sceneName.trim().slice(0, 40);
    // 同名地点沿用已有节点（不覆盖人工坐标）；场景挂点指向该节点。
    let place = map.nodes.find((node) => node.name.trim() === name);
    if (!place) {
      place = {
        id: randomUUID(),
        name,
        kind: placement.kind ?? "region",
        summary: scene.summary?.trim().slice(0, 200) ?? "",
        x: clampCoordinate(placement.x),
        y: clampCoordinate(placement.y),
        tier: null,
      };
      map.nodes.push(place);
    }
    assignments.push({
      sceneId: scene.id,
      sceneName: scene.name,
      nodeId: place.id,
    });
  }

  for (const item of annotation.unplaceable) {
    const scene = sceneByName.get(item.sceneName.trim());
    if (!scene) continue;
    unplaceable.push({ sceneId: scene.id, sceneName: scene.name, reason: item.reason.trim().slice(0, 120) });
  }

  return { map: normalizeWorldMap(map), assignments, unplaceable };
}

export class WorldMapService {
  // AI 标注地图（直接落库）：把还没放上画布的场景按相互位置关系摆到单层地图上；
  // 地图还没有地形时顺便生成地形分区。场景是否「已放置」按根图节点判定——旧层级数据里
  // 挂在 childMaps 内部节点上的场景视为未放置，会重新摆到根图（自愈迁移）。
  // 没有场景资产 / 所有场景都已放置（或标记无法定位）时 400。
  async annotateWorldMap(
    novelId: string,
    options: { taskId?: string } = {},
  ): Promise<WorldMapAnnotationResult> {
    const [novel, worldRow, sceneRows] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId }, select: { id: true, title: true } }),
      prisma.novelSettingsWorld.findUnique({ where: { novelId } }),
      prisma.novelScene.findMany({
        where: { novelId },
        select: { id: true, name: true, summary: true, mapNodeId: true, mapUnmappable: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    if (!novel) {
      throw new AppError("没有找到这本小说。", 404);
    }

    const existingMap = normalizeWorldMap(parseJsonObjectSafe(worldRow?.mapJson));
    const rootIds = new Set(existingMap.nodes.map((node) => node.id));
    const pendingScenes = sceneRows
      .filter((row) => !row.mapUnmappable && (!row.mapNodeId || !rootIds.has(row.mapNodeId)))
      .map((row) => ({
        id: row.id,
        name: row.name.trim().slice(0, 60),
        summary: (row.summary ?? "").trim().slice(0, 200),
      }));
    if (pendingScenes.length === 0) {
      throw new AppError(
        sceneRows.length === 0
          ? "还没有场景资产，先在「解析 → 提取」里应用场景，再生成地图。"
          : "所有场景都已放到地图上；新增场景后再点「生成地图」。",
        400,
      );
    }

    const existingNodes = existingMap.nodes
      .filter((node) => node.x !== null && node.y !== null)
      .map((node) => ({ name: node.name, x: node.x as number, y: node.y as number }));
    const premise = worldRow?.premise?.trim() || undefined;
    const keySettings = parseKeySettings(worldRow?.keySettingsJson);
    const generated = await runStructuredPrompt({
      asset: worldMapAnnotatePrompt,
      promptInput: {
        novelTitle: novel.title,
        premise,
        era: worldRow?.era?.trim() || undefined,
        keySettings: keySettings.length > 0 ? keySettings : undefined,
        existingNodes: existingNodes.length > 0 ? existingNodes : undefined,
        terrainEmpty: existingMap.terrain.length === 0,
        scenes: pendingScenes,
      },
      options: {
        novelId,
        taskId: options.taskId,
        stage: "world_map_annotate",
        entrypoint: "drama_studio",
        temperature: 0.4,
      },
    });

    const result = mergeAnnotation(existingMap, generated.output, pendingScenes);
    await this.applyWorldMap(novelId, result.map);
    for (const assignment of result.assignments) {
      await prisma.novelScene.update({
        where: { id: assignment.sceneId },
        data: { mapNodeId: assignment.nodeId, mapUnmappable: false },
      });
    }
    for (const item of result.unplaceable) {
      await prisma.novelScene.update({
        where: { id: item.sceneId },
        data: { mapUnmappable: true },
      });
    }
    return result;
  }

  // 保存人工编辑后的地图：归一后写 mapJson，并清掉被删节点上的场景挂点。
  async applyWorldMap(novelId: string, rawMap: unknown): Promise<void> {
    const novel = await prisma.novel.findUnique({ where: { id: novelId }, select: { id: true } });
    if (!novel) {
      throw new AppError("没有找到这本小说。", 404);
    }
    const next = normalizeWorldMap(rawMap);
    const previousRow = await prisma.novelSettingsWorld.findUnique({ where: { novelId } });
    const previous = normalizeWorldMap(parseJsonObjectSafe(previousRow?.mapJson));
    const nextIds = new Set(next.nodes.map((node) => node.id));
    const removedIds = (previous?.nodes ?? [])
      .map((node) => node.id)
      .filter((id) => !nextIds.has(id));

    await prisma.novelSettingsWorld.upsert({
      where: { novelId },
      create: {
        novelId,
        premise: previousRow?.premise ?? "",
        era: previousRow?.era ?? null,
        toneRulesJson: previousRow?.toneRulesJson ?? "[]",
        keySettingsJson: previousRow?.keySettingsJson ?? "[]",
        mapJson: JSON.stringify(next),
        source: "manual",
      },
      update: { mapJson: JSON.stringify(next), source: "manual" },
    });
    if (removedIds.length > 0) {
      await prisma.novelScene.updateMany({
        where: { novelId, mapNodeId: { in: removedIds } },
        data: { mapNodeId: null },
      });
    }
  }
}

export const worldMapService = new WorldMapService();
