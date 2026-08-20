import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, MapPin, MousePointer2, Pencil, Save } from "lucide-react";
import {
  getStorySettingsWorld,
  previewWorldMap,
  updateStorySettingsWorld,
  type WorldMapData,
  type WorldMapTerrainType,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import MapCanvas, { type CanvasMode } from "./worldMap/MapCanvas";
import {
  EdgeCreatorCard,
  EdgeEditorCard,
  NodeEditorCard,
  NodeListCard,
  TerrainListCard,
} from "./worldMap/MapEditorPanels";
import {
  TERRAIN_TYPES,
  createEmptyMap,
  edgeKey,
  kindTone,
  mapAtPath,
  nodeLabel,
  normalizeMapShape,
  pathLabels,
  withMapAtPath,
} from "./worldMap/mapData";

// 漫剧「设定 · 世界地图」画布工作面：
// 地形（平地/山/水）是程序化定义的多边形，城市摆在画布上、连线算距离——全程不经过 AI 生图。
// 层级导航：世界级大地图 → 点城市的「内部地图」进入该城的城内图（childMaps 按节点 id 挂接）。
// AI 只负责起草地点名单（novel.world.map@v1），应用时保留人工画的地形与内部地图。

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
  const [previewDraft, setPreviewDraft] = useState<WorldMapData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
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

  const applyMap = (map: WorldMapData) => {
    const normalized = normalizeMapShape(map);
    setRootMap(normalized);
    setActivePath([]);
    setSelectedNodeId(null);
    setSelectedEdgeKey(null);
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
  const selectedEdgeIndex = selectedEdgeKey
    ? currentMap.edges.findIndex((edge) => edgeKey(edge) === selectedEdgeKey)
    : -1;

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
      toast.success("世界地图已保存。");
      await invalidate();
    },
    onError: (error: Error) => {
      toast.error("世界地图保存失败。", { description: error.message });
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => previewWorldMap(novelId),
    onSuccess: (result) => {
      setPreviewDraft(result.data ? normalizeMapShape(result.data) : null);
    },
    onError: (error: Error) => {
      toast.error("生成地点草稿失败", { description: error.message });
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
      kind: "city",
      summary: "",
      x: Math.round((50 + 30 * Math.cos(angle)) * 10) / 10,
      y: Math.round((50 + 30 * Math.sin(angle)) * 10) / 10,
      tier: null,
    };
    updateCurrentMap((map) => ({ ...map, nodes: [...map.nodes, node] }));
    setSelectedNodeId(node.id);
    setSelectedEdgeKey(null);
    setSelectedTerrainId(null);
  };

  const removeNode = (nodeId: string) => {
    const node = currentMap.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const linked = currentMap.edges.filter((edge) => edge.fromId === nodeId || edge.toId === nodeId).length;
    const hasChild = Boolean(currentMap.childMaps?.[nodeId]);
    const message = [
      `删除地点「${nodeLabel(node)}」？`,
      linked > 0 ? `它的 ${linked} 条连线会一起删除。` : "",
      hasChild ? "它的内部地图也会一起删除。" : "",
    ].join("");
    if (!window.confirm(message)) return;
    updateCurrentMap((map) => ({
      ...map,
      nodes: map.nodes.filter((item) => item.id !== nodeId),
      edges: map.edges.filter((edge) => edge.fromId !== nodeId && edge.toId !== nodeId),
      childMaps: Object.fromEntries(Object.entries(map.childMaps ?? {}).filter(([key]) => key !== nodeId)),
    }));
    setSelectedNodeId(null);
  };

  const addEdge = (fromId: string, toId: string, label: string) => {
    const key = edgeKey({ fromId, toId });
    if (currentMap.edges.some((edge) => edgeKey(edge) === key)) {
      toast.error("这两个地点之间已经有连线了。");
      return;
    }
    updateCurrentMap((map) => ({ ...map, edges: [...map.edges, { fromId, toId, label }] }));
  };

  const removeEdge = (index: number) => {
    updateCurrentMap((map) => ({ ...map, edges: map.edges.filter((_, i) => i !== index) }));
    setSelectedEdgeKey(null);
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
    setSelectedEdgeKey(null);
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

  // ---- 层级导航：进入/退出内部地图 ----

  const openChildMap = (nodeId: string) => {
    updateCurrentMap((map) => {
      if (map.childMaps?.[nodeId]) return map;
      return { ...map, childMaps: { ...(map.childMaps ?? {}), [nodeId]: createEmptyMap(20) } };
    });
    setActivePath((prev) => [...prev, nodeId]);
    setSelectedNodeId(null);
    setSelectedEdgeKey(null);
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
    return <p className="text-sm text-muted-foreground">正在加载世界地图...</p>;
  }

  const drawing = mode.kind === "terrain";

  return (
    <div className="space-y-4">
      {/* 面包屑：世界地图 › 城市内部 */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          className={cn(
            "rounded-md px-2 py-1 transition-colors",
            activePath.length === 0 ? "font-medium text-foreground" : "text-muted-foreground hover:bg-muted",
          )}
          onClick={() => setActivePath([])}
        >
          世界地图
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
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            地图跨度
            <Input
              className="h-8 w-24"
              type="number"
              min={1}
              value={currentMap.scaleKm ?? ""}
              placeholder="1000"
              onChange={(event) => {
                const value = Number(event.target.value);
                updateCurrentMap((map) => ({
                  ...map,
                  scaleKm: Number.isFinite(value) && value > 0 ? value : null,
                }));
              }}
            />
            公里
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AiButton
            variant="outline"
            size="sm"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending || activePath.length > 0}
            title={activePath.length > 0 ? "AI 起草只作用于世界级大地图" : undefined}
          >
            {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            {previewMutation.isPending ? "生成中..." : currentMap.nodes.length > 0 ? "AI 补充地点" : "AI 起草地点"}
          </AiButton>
          <Button size="sm" onClick={() => save(buildPayload())} disabled={saveMutation.isPending || !dirty}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saveMutation.isPending ? "保存中..." : dirty ? "保存地图" : "已保存"}
          </Button>
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{activePath.length === 0 ? "地图总述" : "内部地图说明"}</span>
        <textarea
          rows={2}
          className="min-h-[56px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
          placeholder={activePath.length === 0
            ? "一段话讲清整体格局：哪里是大陆、哪里临海、势力怎么分布。"
            : "这座城/村镇里面的格局：城区、要塞、集市怎么分布。"}
          value={currentMap.overview}
          onChange={(event) => updateCurrentMap((map) => ({ ...map, overview: event.target.value }))}
        />
      </label>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="min-w-0 border-border/70">
          <CardContent className="p-3 sm:p-4">
            {currentMap.nodes.length === 0 && currentMap.terrain.length === 0 ? (
              <div className="flex aspect-square max-h-[520px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
                <MapPin className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">空画布。</p>
                <p className="text-xs text-muted-foreground">
                                  先「画地形」圈出陆地与水域，再「添加地点」把城市摆上去；或让 AI 起草地点。
                </p>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-[540px]">
                <MapCanvas
                  map={currentMap}
                  mode={mode}
                  selectedNodeId={selectedNodeId}
                  selectedEdgeKey={selectedEdgeKey}
                  selectedTerrainId={selectedTerrainId}
                  draftTerrainPoints={draftTerrainPoints}
                  onNodeMove={moveNode}
                  onNodeSelect={(nodeId) => {
                    setSelectedNodeId(nodeId);
                    setSelectedEdgeKey(null);
                    setSelectedTerrainId(null);
                  }}
                  onEdgeSelect={(edge) => {
                    setSelectedEdgeKey(edgeKey(edge));
                    setSelectedNodeId(null);
                    setSelectedTerrainId(null);
                  }}
                  onTerrainSelect={(terrainId) => {
                    setSelectedTerrainId(terrainId);
                    setSelectedNodeId(null);
                    setSelectedEdgeKey(null);
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
              <p className="mt-2 text-center text-xs text-muted-foreground">拖动圆点/地形调整位置，点击元素后在右侧编辑。</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <NodeListCard
            map={currentMap}
            selectedNodeId={selectedNodeId}
            onSelect={(nodeId) => setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId)}
            onAdd={addNode}
          />
          {selectedNode ? (
            <NodeEditorCard
              node={selectedNode}
              hasChildMap={Boolean(currentMap.childMaps?.[selectedNode.id])}
              onPatch={(patch) => patchNode(selectedNode.id, patch)}
              onDelete={() => removeNode(selectedNode.id)}
              onOpenChildMap={() => openChildMap(selectedNode.id)}
            />
          ) : null}
          {selectedEdgeIndex >= 0 ? (
            <EdgeEditorCard
              map={currentMap}
              edgeIndex={selectedEdgeIndex}
              onPatchLabel={(label) => updateCurrentMap((map) => ({
                ...map,
                edges: map.edges.map((edge, index) => (index === selectedEdgeIndex ? { ...edge, label } : edge)),
              }))}
              onDelete={() => removeEdge(selectedEdgeIndex)}
            />
          ) : (
            <EdgeCreatorCard
              key={activePath.join("\u0000")}
              map={currentMap}
              onAdd={addEdge}
            />
          )}
          <TerrainListCard
            map={currentMap}
            selectedTerrainId={selectedTerrainId}
            onSelect={(terrainId) => setSelectedTerrainId(terrainId === selectedTerrainId ? null : terrainId)}
            onPatch={patchTerrain}
            onDelete={removeTerrain}
          />
        </div>
      </div>

      <Dialog open={previewDraft !== null} onOpenChange={(open) => { if (!open) setPreviewDraft(null); }}>
        <AppDialogContent
          title="AI 起草的地点名单"
          description={previewDraft?.overview}
          footer={
            <>
              <Button variant="outline" onClick={() => setPreviewDraft(null)}>取消</Button>
              <Button
                onClick={() => {
                  if (!previewDraft) return;
                  // 只采用 AI 的 overview/nodes/edges；人工画的地形与内部地图全部保留。
                  const merged: WorldMapData = {
                    ...rootMap,
                    overview: previewDraft.overview,
                    nodes: previewDraft.nodes,
                    edges: previewDraft.edges,
                  };
                  setPreviewDraft(null);
                  save(merged);
                }}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                应用并保存
              </Button>
            </>
          }
        >
          {previewDraft ? (
            <div className="space-y-3">
              <div className="mx-auto w-full max-w-[440px] rounded-xl border border-border bg-muted/20 p-2">
                <MapCanvas
                  map={previewDraft}
                  mode={{ kind: "select" }}
                  selectedNodeId={null}
                  selectedEdgeKey={null}
                  selectedTerrainId={null}
                  draftTerrainPoints={[]}
                  onNodeMove={() => {}}
                  onNodeSelect={() => {}}
                  onEdgeSelect={() => {}}
                  onTerrainSelect={() => {}}
                  onTerrainMove={() => {}}
                  onCanvasClick={() => {}}
                />
              </div>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {previewDraft.nodes.map((node) => {
                  const tone = kindTone(node.kind);
                  return (
                    <li key={node.id} className="flex items-start gap-2 text-sm">
                      <span className={cn("mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full", tone.dot)} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="font-medium">{nodeLabel(node)}</span>
                        <span className="text-muted-foreground">（{tone.label}）</span>
                        {node.summary ? <span className="block text-xs text-muted-foreground">{node.summary}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {rootMap.nodes.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  应用后世界级的地点与连线会被草稿替换（同名地点保留内部地图）；你画的地形分区不受影响。
                </p>
              ) : null}
            </div>
          ) : null}
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
