import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Sparkles } from "lucide-react";
import {
  annotateWorldMap,
  getStorySettingsWorld,
  updateStorySettingsWorld,
  type WorldMapData,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import MapFlowCanvas from "./worldMap/MapFlowCanvas";
import { NodeEditorCard, TerrainEditorCard } from "./worldMap/MapEditorPanels";
import { createEmptyMap, normalizeMapShape } from "./worldMap/mapData";

// 漫剧「设定 · 地图」画布工作面：单层平面地图，节点就是场景资产按相互位置关系摆出来的地点。
// 画布是 React Flow（@xyflow/react，沿用旧项目 mydrama 画布的体验）：点阵背景、滚轮缩放、拖拽平移、
// 右下小地图（带地名）、卡片式节点；画布铺满剩余高度，可按名字搜索（不匹配的卡片淡出）。
// 「生成地图」：把还没放上画布的场景交给 AI 估算相对位置后摆上来（地图还没有地形时顺便生成地形分区），
// 无法定位的场景标记后跳过。改动自动保存。

const AUTOSAVE_DELAY_MS = 1500;

interface WorldMapPanelProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

export default function WorldMapPanel({ novelId, onChanged }: WorldMapPanelProps) {
  const queryClient = useQueryClient();
  const [rootMap, setRootMap] = useState<WorldMapData>(() => createEmptyMap(null));
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

  const applyMap = (map: WorldMapData) => {
    const normalized = normalizeMapShape(map);
    setRootMap(normalized);
    setSelectedNodeId(null);
    setSelectedTerrainId(null);
    setSavedSnapshot(JSON.stringify(normalized));
  };

  useEffect(() => {
    if (!world || hydrated) return;
    setHydrated(true);
    applyMap(world.map ?? createEmptyMap(null));
  }, [hydrated, world]);

  const dirty = useMemo(
    () => hydrated && JSON.stringify(rootMap) !== savedSnapshot,
    [hydrated, rootMap, savedSnapshot],
  );
  const selectedNode = rootMap.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedTerrain = rootMap.terrain.find((item) => item.id === selectedTerrainId) ?? null;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsWorld(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    ]);
    await onChanged?.();
  };

  // 自动保存：改动后延时提交；成功只更新基线，失败报错（继续编辑会再次触发）。
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

  // AI 标注地图：服务端落库后返回新地图（把未放置的场景摆上来；还没有地形时补地形分区）。
  const generateMutation = useMutation({
    mutationFn: () => annotateWorldMap(novelId),
    onSuccess: async (result) => {
      if (result.data) {
        applyMap(result.data.map);
      }
      const placed = result.data?.assignments.length ?? 0;
      const skipped = result.data?.unplaceable.length ?? 0;
      const summary = `已放置 ${placed} 个场景${skipped > 0 ? `，${skipped} 个无法定位已标记（下次不再处理）` : ""}。`;
      toast.success(summary);
      await invalidate();
    },
    onError: (error: Error) => {
      toast.error("生成地图失败", { description: error.message });
    },
  });

  const sanitizeMap = (map: WorldMapData): WorldMapData => {
    const childMaps: Record<string, WorldMapData> = {};
    // childMaps 是旧版层级数据的兼容字段：只透传已保存的内容，不再产生新层级。
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
      // 状态先收敛到提交形态（sanitize 会补默认名/裁空白），再提交同一份数据：
      // 否则基线记的是 sanitize 后的 JSON、状态还是原始值，dirty 永远为 true，自动保存会无限重发。
      const sanitized = sanitizeMap(rootMap);
      setRootMap(sanitized);
      saveMutation.mutate(sanitized);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // sanitizeMap 是组件内稳定纯函数；saveMutation.isPending 已在依赖里。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, rootMap]);

  // ---- 编辑操作（单层根图） ----

  const patchNode = (nodeId: string, patch: Partial<WorldMapData["nodes"][number]>) => {
    setRootMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
    }));
  };

  const moveNode = (nodeId: string, x: number, y: number) => patchNode(nodeId, { x, y });

  const removeNode = (nodeId: string) => {
    const node = rootMap.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    if (!window.confirm(`删除地点「${node.name || "未命名"}」？`)) return;
    setRootMap((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((item) => item.id !== nodeId),
      edges: prev.edges.filter((edge) => edge.fromId !== nodeId && edge.toId !== nodeId),
      childMaps: Object.fromEntries(Object.entries(prev.childMaps ?? {}).filter(([key]) => key !== nodeId)),
    }));
    setSelectedNodeId(null);
  };

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId);
    setSelectedTerrainId(null);
  };

  // ---- 地形编辑（仅编辑已有地形，画布上不再提供新建入口；点击地形所在区域选中它） ----

  const patchTerrain = (terrainId: string, patch: Partial<{ type: WorldMapData["terrain"][number]["type"]; label: string }>) => {
    setRootMap((prev) => ({
      ...prev,
      terrain: prev.terrain.map((item) => (item.id === terrainId ? { ...item, ...patch } : item)),
    }));
  };

  const removeTerrain = (terrainId: string) => {
    setRootMap((prev) => ({ ...prev, terrain: prev.terrain.filter((item) => item.id !== terrainId) }));
    if (selectedTerrainId === terrainId) setSelectedTerrainId(null);
  };

  if (worldQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">正在加载地图...</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          className="h-9 w-44 rounded-md border border-border bg-background px-3 text-sm"
          placeholder="搜索场景"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <AiButton
          variant="outline"
          size="sm"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          title="把还没放上地图的场景按位置关系摆上来；地图还没有地形时会顺便生成地形分区"
        >
          {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generateMutation.isPending ? "生成中..." : "生成地图"}
        </AiButton>
      </div>

      {/* 画布铺满剩余高度；点选的编辑卡收在画布下方，未选中时不占位 */}
      {rootMap.nodes.length === 0 && rootMap.terrain.length === 0 ? (
        <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
          <MapPin className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">地图还是空的。</p>
          <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generateMutation.isPending ? "生成中..." : "生成地图"}
          </Button>
        </div>
      ) : (
        <MapFlowCanvas
          map={rootMap}
          selectedNodeId={selectedNodeId}
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
          onPatch={(patch) => patchNode(selectedNode.id, patch)}
          onDelete={() => removeNode(selectedNode.id)}
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
