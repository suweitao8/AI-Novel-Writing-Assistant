import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, MapPin, Sparkles } from "lucide-react";
import {
  annotateWorldMap,
  getStorySettingsWorld,
  updateStorySettingsWorld,
  type WorldMapData,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import MapFlowCanvas from "./worldMap/MapFlowCanvas";
import { NodeEditorCard, TerrainEditorCard } from "./worldMap/MapEditorPanels";
import {
  LEVEL_SCALE_KM,
  MAP_LEVELS,
  createEmptyMap,
  mapAtPath,
  normalizeMapShape,
  withMapAtPath,
} from "./worldMap/mapData";

// 漫剧「设定 · 地图」画布工作面：国家/城市两级切换 + 点击下钻（塞尔达式大地图）。
// 画布是 React Flow（@xyflow/react，沿用旧项目 mydrama 画布的体验）：点阵背景、滚轮缩放、拖拽平移、
// 右下小地图（带地名）、卡片式节点；画布铺满剩余高度，当前级内容可搜索（不匹配的卡片淡出）。
// 「生成地图」：空地图时依据书名/世界观生成基础的国家+城市+地形分区（平原/山地/海洋）；
// 有未标注场景时把场景放置到地图上（无法定位的标记后跳过）。改动自动保存。

const AUTOSAVE_DELAY_MS = 1500;

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
  const [searchQuery, setSearchQuery] = useState("");

  const worldQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsWorld(novelId),
    queryFn: () => getStorySettingsWorld(novelId),
  });
  const world = worldQuery.data?.data;

  const countries = rootMap.nodes;
  // 两级切换：世界层=国家级别；国家层与城市下钻层都算城市级别视图。
  const activeTab: "country" | "city" = activePath.length === 0 ? "country" : "city";
  const currentMap = useMemo(() => mapAtPath(rootMap, activePath), [rootMap, activePath]) ?? createEmptyMap(20);
  const level = MAP_LEVELS[Math.min(activePath.length, MAP_LEVELS.length - 1)];
  const levelScaleKm = LEVEL_SCALE_KM[Math.min(activePath.length, LEVEL_SCALE_KM.length - 1)];
  const activeCountryId = activePath[0] ?? null;
  const activeCityNode = activePath.length >= 2
    ? mapAtPath(rootMap, activePath.slice(0, 1))?.nodes.find((node) => node.id === activePath[1]) ?? null
    : null;

  const applyMap = (map: WorldMapData) => {
    const normalized = normalizeMapShape(map);
    setRootMap(normalized);
    setActivePath([]);
    setSelectedNodeId(null);
    setSelectedTerrainId(null);
    setSavedSnapshot(JSON.stringify(normalized));
  };

  useEffect(() => {
    if (!world || hydrated) return;
    setHydrated(true);
    applyMap(world.map ?? createEmptyMap(1000));
  }, [hydrated, world]);

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

  // 自动保存：改动后延时提交；成功只更新基线（不打断当前浏览层级），失败报错（继续编辑会再次触发）。
  const saveMutation = useMutation({
    mutationFn: (map: WorldMapData) => updateStorySettingsWorld(novelId, { map }),
    onSuccess: async (_result, submitted) => {
      setSavedSnapshot(JSON.stringify(submitted));
      await invalidate();
    },
    onError: (error: Error) => {
      toast.error("地图保存失败。", { description: error.message });
    },
  });

  // AI 生成/标注地图：服务端落库后返回新地图（空地图→生成基础国家+城市；有未标注场景→放置场景）。
  const generateMutation = useMutation({
    mutationFn: () => annotateWorldMap(novelId),
    onSuccess: async (result) => {
      if (result.data) {
        applyMap(result.data.map);
      }
      const placed = result.data?.assignments.length ?? 0;
      const skipped = result.data?.unplaceable.length ?? 0;
      const countryCount = result.data?.map.nodes.length ?? 0;
      const summary = placed > 0
        ? `已标注 ${placed} 个场景${skipped > 0 ? `，${skipped} 个无法定位已标记（下次不再处理）` : ""}。`
        : `已生成 ${countryCount} 个国家的基础地图。`;
      toast.success(summary);
      await invalidate();
    },
    onError: (error: Error) => {
      toast.error("生成地图失败", { description: error.message });
    },
  });

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

  useEffect(() => {
    if (!dirty || saveMutation.isPending) return;
    const timer = setTimeout(() => {
      saveMutation.mutate(sanitizeMap(rootMap));
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // sanitizeMap 是组件内稳定纯函数；saveMutation.isPending 已在依赖里。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, rootMap]);

  // ---- 层级切换与下钻 ----

  const clearSelection = () => {
    setSelectedNodeId(null);
    setSelectedTerrainId(null);
  };

  const switchTab = (tab: "country" | "city") => {
    if (tab === activeTab) return;
    clearSelection();
    if (tab === "country") {
      setActivePath([]);
      return;
    }
    // 城市级别需要先有一个国家：沿用当前选中的，否则进第一个。
    const countryId = activeCountryId ?? countries[0]?.id;
    if (!countryId) return;
    setActivePath([countryId]);
  };

  const switchCountry = (countryId: string) => {
    clearSelection();
    setActivePath([countryId]);
  };

  const openChildMap = (nodeId: string) => {
    updateCurrentMap((map) => {
      if (map.childMaps?.[nodeId]) return map;
      return { ...map, childMaps: { ...(map.childMaps ?? {}), [nodeId]: createEmptyMap(20) } };
    });
    setActivePath((prev) => [...prev, nodeId]);
    clearSelection();
  };

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

  const removeNode = (nodeId: string) => {
    const node = currentMap.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const childLabel = level.childLevelLabel ? `它的${level.childLevelLabel}会一起删除。` : "";
    const message = `删除${level.levelLabel}「${node.name || "未命名"}」？${childLabel}`.trim();
    if (!window.confirm(message)) return;
    updateCurrentMap((map) => ({
      ...map,
      nodes: map.nodes.filter((item) => item.id !== nodeId),
      edges: map.edges.filter((edge) => edge.fromId !== nodeId && edge.toId !== nodeId),
      childMaps: Object.fromEntries(Object.entries(map.childMaps ?? {}).filter(([key]) => key !== nodeId)),
    }));
    setSelectedNodeId(null);
  };

  // 画布点击节点：国家/城市=进入下级（塞尔达式），地点=选中编辑。
  const handleNodeClick = (nodeId: string) => {
    if (level.childLevelLabel) {
      openChildMap(nodeId);
      return;
    }
    setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId);
    setSelectedTerrainId(null);
  };

  // ---- 地形编辑（仅编辑已有地形，画布上不再提供新建入口；点击地形所在区域选中它） ----

  const patchTerrain = (terrainId: string, patch: Partial<{ type: WorldMapData["terrain"][number]["type"]; label: string }>) => {
    updateCurrentMap((map) => ({
      ...map,
      terrain: map.terrain.map((item) => (item.id === terrainId ? { ...item, ...patch } : item)),
    }));
  };

  const removeTerrain = (terrainId: string) => {
    updateCurrentMap((map) => ({ ...map, terrain: map.terrain.filter((item) => item.id !== terrainId) }));
    if (selectedTerrainId === terrainId) setSelectedTerrainId(null);
  };

  if (worldQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">正在加载地图...</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 层级切换条：国家 / 城市；城市时旁边选国家 + 当前级搜索 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1 text-sm transition-colors",
              activeTab === "country" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => switchTab("country")}
          >
            国家
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1 text-sm transition-colors",
              activeTab === "city" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            disabled={activeTab === "country" && countries.length === 0}
            onClick={() => switchTab("city")}
          >
            城市
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "city" && countries.length > 0 ? (
            <SelectControl
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              value={activeCountryId ?? ""}
              onChange={(event) => switchCountry(event.target.value)}
            >
              {countries.map((country) => (
                <option key={country.id} value={country.id}>{country.name || "未命名国家"}</option>
              ))}
            </SelectControl>
          ) : null}
          <Input
            className="h-9 w-44 rounded-md border border-border bg-background px-3 text-sm"
            placeholder={`搜索${level.levelLabel}`}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <AiButton
            variant="outline"
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            title="还没有地图时依据书名与世界观生成基础地图；有未标注的场景时把它们放置到地图上"
          >
            {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generateMutation.isPending ? "生成中..." : "生成地图"}
          </AiButton>
        </div>
      </div>

      {/* 城市下钻的回退面包屑：国家 › 城市 */}
      {activePath.length >= 2 ? (
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => setActivePath((prev) => prev.slice(0, 1))}
          >
            {countries.find((node) => node.id === activePath[0])?.name ?? "国家"}
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="rounded-md px-2 py-1 font-medium text-foreground">
            {activeCityNode?.name ?? "城市"}
          </span>
        </div>
      ) : null}

      {/* 画布铺满剩余高度；点选的编辑卡收在画布下方，未选中时不占位 */}
      {currentMap.nodes.length === 0 && currentMap.terrain.length === 0 ? (
        <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
          <MapPin className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {activeTab === "country"
              ? "还没有国家。"
              : activePath.length === 1
                ? "这个国家还没有城市。"
                : "这座城市还没有地点。"}
          </p>
          {activeTab === "country" ? (
            <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generateMutation.isPending ? "生成中..." : "生成地图"}
            </Button>
          ) : null}
        </div>
      ) : (
        <MapFlowCanvas
          map={currentMap}
          childLevelLabel={level.childLevelLabel}
          selectedNodeId={selectedNodeId}
          levelScaleKm={levelScaleKm}
          filterQuery={searchQuery.trim()}
          className="min-h-[420px] flex-1"
          onNodeMove={moveNode}
          onNodeSelect={handleNodeClick}
          onTerrainSelect={(terrainId) => {
            setSelectedTerrainId(terrainId);
            setSelectedNodeId(null);
          }}
        />
      )}

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
      ) : null}
    </div>
  );
}
