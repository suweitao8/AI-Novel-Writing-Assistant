import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, MapPin, MousePointer2, Pencil, Save, Sparkles } from "lucide-react";
import {
  annotateWorldMap,
  getStorySettingsWorld,
  updateStorySettingsWorld,
  type WorldMapData,
  type WorldMapTerrainType,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import MapCanvas, { type CanvasMode } from "./worldMap/MapCanvas";
import { LevelListCard, NodeEditorCard, TerrainEditorCard } from "./worldMap/MapEditorPanels";
import {
  MAP_LEVELS,
  TERRAIN_TYPES,
  createEmptyMap,
  mapAtPath,
  normalizeMapShape,
  pathLabels,
  withMapAtPath,
} from "./worldMap/mapData";

// 漫剧「设定 · 地图」画布工作面：
// 三层地图——世界层摆国家的相对位置，点进国家看城市分布，点进城市看具体地点（场景）。
// 「AI 标注场景」把未标注的场景资产交给 AI 判断归属（可新建国家/城市）并直接落库；
// 无法定位的场景会被标记，之后不再重复处理。地形（平地/山/水）是程序化多边形，全程不经过 AI 生图。

const CLOSE_VERTEX_DISTANCE = 4;

interface WorldMapPanelProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

export default function WorldMapPanel({ novelId, onChanged }: WorldMapPanelProps) {
  const queryClient = useQueryClient();
  const [rootMap, setRootMap] = useState<WorldMapData>(() => createEmptyMap(1000));
  const [activePath, setActivePath] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTerrainId, setSelectedTerrainId] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>({ kind: "select" });
  const [drawTerrainType, setDrawTerrainType] = useState<WorldMapTerrainType>("plain");
  const [draftTerrainPoints, setDraftTerrainPoints] = useState<Array<{ x: number; y: number }>>([]);

  const worldQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsWorld(novelId),
    queryFn: () => getStorySettingsWorld(novelId),
  });
  const world = worldQuery.data?.data;

  const currentMap = useMemo(() => mapAtPath(rootMap, activePath), [rootMap, activePath]) ?? createEmptyMap(20);
  const breadcrumb = useMemo(() => pathLabels(rootMap, activePath), [rootMap, activePath]);
  // 层级语义按深度取：0=世界（国家）、1=国家（城市）、2=城市（地点）。
  const level = MAP_LEVELS[Math.min(activePath.length, MAP_LEVELS.length - 1)];

  const applyMap = (map: WorldMapData) => {
    const normalized = normalizeMapShape(map);
    setRootMap(normalized);
    setActivePath([]);
    setSelectedNodeId(null);
    setSelectedTerrainId(null);
    setDraftTerrainPoints([]);
    setSavedSnapshot(JSON.stringify(normalized));
  };

  useEffect(() => {
    if (!world || hydrated) return;
    setHydrated(true);
    applyMap(world.map ?? createEmptyMap(1000));
  }, [hydrated, world]);

  // Esc 结束/取消画地形。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDraftTerrainPoints([]);
      setMode((prev) => (prev.kind === "terrain" ? { kind: "select" } : prev));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const dirty = hydrated && JSON.stringify(rootMap) !== savedSnapshot;
  const selectedNode = currentMap.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedTerrain = currentMap.terrain.find((item) => item.id === selectedTerrainId) ?? null;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsWorld(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    ]);
    await onChanged?.();
  };

  const saveMutation = useMutation({
    mutationFn: (map: WorldMapData) => updateStorySettingsWorld(novelId, { map }),
    onSuccess: async (result) => {
      if (result.data) {
        applyMap(result.data.map);
      }
      toast.success("地图已保存。");
      await invalidate();
    },
    onError: (error: Error) => {
      toast.error("地图保存失败。", { description: error.message });
    },
  });

  // AI 场景标注：服务端直接落库并返回新地图；无法定位的场景已标记，下次自动跳过。
  const annotateMutation = useMutation({
    mutationFn: () => annotateWorldMap(novelId),
    onSuccess: async (result) => {
      if (result.data) {
        applyMap(result.data.map);
      }
      const placed = result.data?.assignments.length ?? 0;
      const skipped = result.data?.unplaceable.length ?? 0;
      const detail = skipped > 0 ? `，${skipped} 个无法定位已标记（下次不再处理）` : "";
      toast.success(`已标注 ${placed} 个场景${detail}。`);
      await invalidate();
    },
    onError: (error: Error) => {
      toast.error("场景标注失败", { description: error.message });
    },
  });

  // ---- 当前层级地图的编辑操作（写入 rootMap 的对应层级） ----

  const updateCurrentMap = (updater: (map: WorldMapData) => WorldMapData) => {
    setRootMap((prev) => withMapAtPath(prev, activePath, updater));
  };

  const patchNode = (nodeId: string, patch: Partial<WorldMapData["nodes"][number]>) => {
    updateCurrentMap((map) => ({
      ...map,
      nodes: map.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
    }));
  };

  const moveNode = (nodeId: string, x: number, y: number) => patchNode(nodeId, { x, y });

  const addNode = () => {
    const angle = (currentMap.nodes.length * 137.5 * Math.PI) / 180;
    const node = {
      id: crypto.randomUUID(),
      name: "",
      kind: level.defaultKind,
      summary: "",
      x: Math.round((50 + 30 * Math.cos(angle)) * 10) / 10,
      y: Math.round((50 + 30 * Math.sin(angle)) * 10) / 10,
      tier: null,
    };
    updateCurrentMap((map) => ({ ...map, nodes: [...map.nodes, node] }));
    setSelectedNodeId(node.id);
    setSelectedTerrainId(null);
  };

  const removeNode = (nodeId: string) => {
    const node = currentMap.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const childLabel = level.childLevelLabel ? `它的${level.childLevelLabel}会一起删除。` : "";
    const message = `删除${level.levelLabel}「${node.name || "未命名"}」？${childLabel}`.trim();
    if (!window.confirm(message)) return;
    updateCurrentMap((map) => ({
      ...map,
      nodes: map.nodes.filter((item) => item.id !== nodeId),
      childMaps: Object.fromEntries(Object.entries(map.childMaps ?? {}).filter(([key]) => key !== nodeId)),
    }));
    setSelectedNodeId(null);
  };

  // ---- 地形绘制 ----

  const finishDraftTerrain = () => {
    if (draftTerrainPoints.length < 3) {
      toast.error("至少点三个点才能圈出一块地形。");
      return;
    }
    const terrain = {
      id: crypto.randomUUID(),
      type: drawTerrainType,
      label: "",
      points: draftTerrainPoints,
    };
    updateCurrentMap((map) => ({ ...map, terrain: [...map.terrain, terrain] }));
    setDraftTerrainPoints([]);
    setSelectedTerrainId(terrain.id);
    setSelectedNodeId(null);
    toast.success("地形已添加，可在右侧改名字和类型。");
  };

  const handleCanvasClick = (point: { x: number; y: number }) => {
    if (mode.kind !== "terrain") return;
    const first = draftTerrainPoints[0];
    if (first && Math.hypot(first.x - point.x, first.y - point.y) <= CLOSE_VERTEX_DISTANCE && draftTerrainPoints.length >= 3) {
      finishDraftTerrain();
      return;
    }
    setDraftTerrainPoints((prev) => [...prev, point]);
  };

  const patchTerrain = (terrainId: string, patch: Partial<{ type: WorldMapTerrainType; label: string }>) => {
    updateCurrentMap((map) => ({
      ...map,
      terrain: map.terrain.map((item) => (item.id === terrainId ? { ...item, ...patch } : item)),
    }));
  };

  const moveTerrain = (terrainId: string, dx: number, dy: number) => {
    updateCurrentMap((map) => ({
      ...map,
      terrain: map.terrain.map((item) => (item.id === terrainId
        ? {
          ...item,
          points: item.points.map((point) => ({
            x: Math.round(Math.min(100, Math.max(0, point.x + dx)) * 10) / 10,
            y: Math.round(Math.min(100, Math.max(0, point.y + dy)) * 10) / 10,
          })),
        }
        : item)),
    }));
  };

  const removeTerrain = (terrainId: string) => {
    updateCurrentMap((map) => ({ ...map, terrain: map.terrain.filter((item) => item.id !== terrainId) }));
    if (selectedTerrainId === terrainId) setSelectedTerrainId(null);
  };

  // ---- 层级导航：进入下级地图 ----

  const openChildMap = (nodeId: string) => {
    updateCurrentMap((map) => {
      if (map.childMaps?.[nodeId]) return map;
      return { ...map, childMaps: { ...(map.childMaps ?? {}), [nodeId]: createEmptyMap(20) } };
    });
    setActivePath((prev) => [...prev, nodeId]);
    setSelectedNodeId(null);
    setSelectedTerrainId(null);
    setDraftTerrainPoints([]);
  };

  // ---- 保存 ----

  // 递归净化：去空白、空名兜底、丢掉完全空的内部地图（防止「进入又退出」留下空占位）。
  const sanitizeMap = (map: WorldMapData): WorldMapData => {
    const childMaps: Record<string, WorldMapData> = {};
    for (const [key, child] of Object.entries(map.childMaps ?? {})) {
      const sanitized = sanitizeMap(child);
      const empty = !sanitized.overview.trim()
        && sanitized.terrain.length === 0
        && sanitized.nodes.length === 0
        && sanitized.edges.length === 0
        && Object.keys(sanitized.childMaps).length === 0;
      if (!empty) childMaps[key] = sanitized;
    }
    return {
      overview: map.overview.trim(),
      scaleKm: map.scaleKm,
      terrain: map.terrain.map((item) => ({ ...item, label: item.label.trim() })),
      nodes: map.nodes.map((node) => ({
        ...node,
        name: node.name.trim() || "未命名地点",
        summary: node.summary.trim(),
        tier: node.tier ?? null,
      })),
      edges: map.edges.map((edge) => ({ ...edge, label: edge.label.trim() })),
      childMaps,
    };
  };

  const buildPayload = (): WorldMapData => sanitizeMap(rootMap);

  const save = (map: WorldMapData) => {
    const collectUnnamed = (data: WorldMapData): number => data.nodes.filter((node) => !node.name.trim()).length
      + Object.values(data.childMaps ?? {}).reduce((sum, child) => sum + collectUnnamed(child), 0);
    const collectNodes = (data: WorldMapData): number => data.nodes.length
      + Object.values(data.childMaps ?? {}).reduce((sum, child) => sum + collectNodes(child), 0);
    if (collectNodes(map) === 0) {
      toast.error("至少要有一个地点才能保存地图。");
      return;
    }
    if (collectUnnamed(map) > 0) {
      toast.error("还有地点没有命名，命名后再保存。");
      return;
    }
    saveMutation.mutate(map);
  };

  if (worldQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">正在加载地图...</p>;
  }

  const drawing = mode.kind === "terrain";

  return (
    <div className="space-y-4">
      {/* 面包屑：世界 › 国家 › 城市 */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          className={cn(
            "rounded-md px-2 py-1 transition-colors",
            activePath.length === 0 ? "font-medium text-foreground" : "text-muted-foreground hover:bg-muted",
          )}
          onClick={() => setActivePath([])}
        >
          世界
        </button>
        {breadcrumb.map((label, index) => (
          <span key={`${activePath[index]}-${index}`} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <button
              type="button"
              className={cn(
                "rounded-md px-2 py-1 transition-colors",
                index === breadcrumb.length - 1 ? "font-medium text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setActivePath((prev) => prev.slice(0, index + 1))}
            >
              {label}
            </button>
          </span>
        ))}
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={drawing ? "outline" : "secondary"}
            size="sm"
            onClick={() => {
              setMode(drawing ? { kind: "select" } : { kind: "terrain", terrainType: drawTerrainType });
              setDraftTerrainPoints([]);
            }}
          >
            {drawing ? <Pencil className="h-4 w-4" /> : <MousePointer2 className="h-4 w-4" />}
            {drawing ? "画地形中（Esc 结束）" : "画地形"}
          </Button>
          {drawing ? (
            <SelectControl
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={drawTerrainType}
              onChange={(event) => setDrawTerrainType(event.target.value as WorldMapTerrainType)}
            >
              {TERRAIN_TYPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </SelectControl>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={addNode}
          >
            <MapPin className="h-4 w-4" />
            添加{level.levelLabel}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AiButton
            variant="outline"
            size="sm"
            onClick={() => annotateMutation.mutate()}
            disabled={annotateMutation.isPending}
            title="AI 判断未标注场景的归属（可新建国家与城市）并放到地图上"
          >
            {annotateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {annotateMutation.isPending ? "标注中..." : "AI 标注场景"}
          </AiButton>
          <Button size="sm" onClick={() => save(buildPayload())} disabled={saveMutation.isPending || !dirty}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saveMutation.isPending ? "保存中..." : dirty ? "保存地图" : "已保存"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="min-w-0 border-border/70">
          <CardContent className="p-3 sm:p-4">
            {currentMap.nodes.length === 0 && currentMap.terrain.length === 0 ? (
              <div className="flex aspect-square max-h-[520px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
                <MapPin className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  {activePath.length === 0 ? "世界地图。" : `${breadcrumb[breadcrumb.length - 1] ?? ""}内部。`}
                </p>
                <p className="text-xs text-muted-foreground">
                  点「AI 标注场景」依据场景资产生成，或手动添加{level.levelLabel}。
                </p>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-[540px]">
                <MapCanvas
                  map={currentMap}
                  mode={mode}
                  selectedNodeId={selectedNodeId}
                  selectedEdgeKey={null}
                  selectedTerrainId={selectedTerrainId}
                  draftTerrainPoints={draftTerrainPoints}
                  onNodeMove={moveNode}
                  onNodeSelect={(nodeId) => {
                    setSelectedNodeId(nodeId);
                    setSelectedTerrainId(null);
                  }}
                  onEdgeSelect={() => {}}
                  onTerrainSelect={(terrainId) => {
                    setSelectedTerrainId(terrainId);
                    setSelectedNodeId(null);
                  }}
                  onTerrainMove={moveTerrain}
                  onCanvasClick={handleCanvasClick}
                />
              </div>
            )}
            {drawing ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                在画布上依次点击圈出范围，回到起点或点满三个点后再次点击起点闭合；Esc 取消。
              </p>
            ) : currentMap.nodes.length > 0 ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                拖动圆点/地形调整位置，点击元素后在右侧编辑。
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {selectedNode ? (
            <NodeEditorCard
              node={selectedNode}
              childLevelLabel={level.childLevelLabel}
              onPatch={(patch) => patchNode(selectedNode.id, patch)}
              onDelete={() => removeNode(selectedNode.id)}
              onOpenChildMap={() => openChildMap(selectedNode.id)}
            />
          ) : selectedTerrain ? (
            <TerrainEditorCard
              terrain={selectedTerrain}
              onPatch={(patch) => patchTerrain(selectedTerrain.id, patch)}
              onDelete={() => removeTerrain(selectedTerrain.id)}
            />
          ) : (
            <LevelListCard
              map={currentMap}
              levelLabel={level.levelLabel}
              childLevelLabel={level.childLevelLabel}
              selectedNodeId={selectedNodeId}
              onSelect={(nodeId) => setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId)}
              onOpenChild={openChildMap}
              onAdd={addNode}
            />
          )}
        </div>
      </div>
    </div>
  );
}
