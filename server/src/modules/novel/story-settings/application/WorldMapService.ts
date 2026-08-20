// 世界地图应用服务：AI 生成地点草稿（纯预览不落库）与人工编辑后地图的保存。
// 地图存储在 NovelSettingsWorld.mapJson：
// { overview, scaleKm, terrain:[{id,type,label,points}], nodes:[{id,name,kind,summary,x,y,tier?}],
//   edges:[{fromId,toId,label}], childMaps:{[nodeId]: 同构内部地图} }。
// 地形（平地/山/水）是程序化多边形，AI 不生成地形也不生图；childMaps 是城市/村镇内部地图，按节点 id 挂接。
// 边界说明：
// - node id 必须稳定：AI 草稿按名称对齐已有节点沿用原 id，NovelScene.mapNodeId 的引用因此不丢；
//   保存时被删除的节点会把引用它的场景挂点清空（不删场景本身）。
// - 坐标是 0-100 平面百分比，前端渲染成 SVG 并允许拖拽；旧数据（bundle 写入的无坐标节点）x/y 为 null，
//   渲染回落环形布局，兼容不迁移。
import { randomUUID } from "node:crypto";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  worldMapPrompt,
  type WorldMapOutput,
} from "../../../../prompting/prompts/novel/worldMap.prompts";
import { storySettingsService } from "./StorySettingsService";

const NODE_COUNT_MAX = 24;
const EDGE_COUNT_MAX = 32;
const TERRAIN_COUNT_MAX = 24;
const TERRAIN_VERTEX_MAX = 24;
const CHILD_MAP_COUNT_MAX = 16;
// 世界(0) → 城市/村镇(1) → 城区(2)：超过三级的内部地图丢弃，防止无限嵌套。
const CHILD_MAP_DEPTH_MAX = 3;
const NODE_KINDS = new Set(["city", "region", "building", "wild", "other"]);
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

function normalizeString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// 确定性归一：坐标夹紧、长度截断、id 去重、悬空/自环/重复连线剔除、地形多边形与内部地图递归处理。
// 输入来自前端编辑器（已过 zod）或 AI 草稿，这里只做格式兜底，不做业务拒绝。
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

  // 内部地图只挂在真实存在的节点上，超出深度上限或数量的丢弃（静默兜底）。
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

// AI 草稿按名称对齐已有节点：同名沿用原 id（保住场景挂点引用），新地点生成新 id。
export function resolveDraftIds(draft: WorldMapOutput, existingNodes: Array<{ id: string; name: string }>): WorldMapData {
  const idByName = new Map(existingNodes.map((node) => [node.name, node.id]));
  const nodes: WorldMapNode[] = draft.locations.map((location) => ({
    id: idByName.get(location.name) ?? randomUUID(),
    name: location.name,
    kind: location.kind,
    summary: location.summary,
    x: clampCoordinate(location.x),
    y: clampCoordinate(location.y),
    tier: location.tier ?? null,
  }));
  const idByNameAfter = new Map(nodes.map((node) => [node.name, node.id]));
  const edges: WorldMapEdge[] = [];
  const seenPairs = new Set<string>();
  for (const path of draft.paths) {
    const fromId = idByNameAfter.get(path.fromName);
    const toId = idByNameAfter.get(path.toName);
    if (!fromId || !toId || fromId === toId) continue;
    const pairKey = [fromId, toId].sort().join("\u0000");
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    edges.push({ fromId, toId, label: path.label.slice(0, 40) });
  }
  return {
    overview: draft.overview.slice(0, 600),
    scaleKm: null,
    terrain: [],
    nodes,
    edges,
    childMaps: {},
  };
}

export class WorldMapService {
  // AI 生成世界地图草稿：不落库，前端在预览弹窗里确认后才随保存写入。
  async previewWorldMap(
    novelId: string,
    options: { taskId?: string } = {},
  ): Promise<WorldMapData> {
    const [novel, worldRow, scenes, characters] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId }, select: { id: true, title: true } }),
      prisma.novelSettingsWorld.findUnique({ where: { novelId } }),
      prisma.novelScene.findMany({
        where: { novelId },
        select: { name: true, summary: true },
        orderBy: { sortOrder: "asc" },
        take: 12,
      }),
      prisma.character.findMany({
        where: { novelId },
        select: { name: true, role: true },
        orderBy: { createdAt: "asc" },
        take: 12,
      }),
    ]);
    if (!novel) {
      throw new AppError("没有找到这本小说。", 404);
    }

    const existingMap = normalizeWorldMap(parseJsonObjectSafe(worldRow?.mapJson));
    const premise = worldRow?.premise?.trim() ?? "";
    const keySettings = worldRow
      ? (() => {
        try {
          const parsed = JSON.parse(worldRow.keySettingsJson || "[]");
          return Array.isArray(parsed)
            ? parsed
              .filter((item) => item && typeof item === "object")
              .map((item) => ({
                title: normalizeString((item as { title?: unknown }).title, 60),
                content: normalizeString((item as { content?: unknown }).content, 400),
              }))
              .filter((item) => item.title && item.content)
            : [];
        } catch {
          return [];
        }
      })()
      : [];
    const existingLocations = existingMap?.nodes ?? [];

    const generated = await runStructuredPrompt({
      asset: worldMapPrompt,
      promptInput: {
        novelTitle: novel.title,
        premise: premise || undefined,
        era: worldRow?.era?.trim() || undefined,
        toneRules: (() => {
          try {
            const parsed = JSON.parse(worldRow?.toneRulesJson || "[]");
            return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : undefined;
          } catch {
            return undefined;
          }
        })(),
        keySettings: keySettings.length > 0 ? keySettings : undefined,
        existingLocations: existingLocations.length > 0
          ? existingLocations.map((node) => ({ name: node.name, kind: node.kind, summary: node.summary }))
          : undefined,
        sceneNames: scenes.length > 0 ? scenes.map((scene) => scene.name) : undefined,
        characterNames: characters.length > 0
          ? characters.map((character) => `${character.name}（${character.role}）`)
          : undefined,
      },
      options: {
        novelId,
        taskId: options.taskId,
        stage: "world_map_preview",
        entrypoint: "drama_studio",
        temperature: 0.7,
      },
    });
    return resolveDraftIds(generated.output, existingLocations);
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
