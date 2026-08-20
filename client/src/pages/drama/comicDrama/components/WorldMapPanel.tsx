import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Plus, Save, Trash2 } from "lucide-react";
import {
  getStorySettingsWorld,
  previewWorldMap,
  updateStorySettingsWorld,
  type WorldMapData,
  type WorldMapEdge,
  type WorldMapNode,
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

// 漫剧「设定 · 世界地图」工作面：
// 地图是结构化数据（地点 + 平面坐标 + 连线）渲染出来的 SVG——不是一张图片，
// AI 生成的是数据草稿，人工可拖拽摆位、增删地点与连线，保存进 NovelSettingsWorld.mapJson。

const KIND_TONES: Record<string, { stroke: string; fill: string; dot: string; label: string }> = {
  city: { stroke: "stroke-primary", fill: "fill-primary/15", dot: "bg-primary", label: "城市" },
  region: { stroke: "stroke-emerald-600 dark:stroke-emerald-400", fill: "fill-emerald-500/15", dot: "bg-emerald-500", label: "区域" },
  building: { stroke: "stroke-amber-600 dark:stroke-amber-400", fill: "fill-amber-500/15", dot: "bg-amber-500", label: "建筑" },
  wild: { stroke: "stroke-muted-foreground", fill: "fill-muted", dot: "bg-muted-foreground", label: "荒野" },
  other: { stroke: "stroke-foreground/50", fill: "fill-muted/60", dot: "bg-muted-foreground/60", label: "其他" },
};

const TIER_LABELS: Record<string, { label: string; radius: number }> = {
  capital: { label: "世界中心", radius: 4.6 },
  city: { label: "重镇", radius: 3.6 },
  town: { label: "据点", radius: 2.8 },
  landmark: { label: "地标", radius: 2.4 },
};

function kindTone(kind: string) {
  return KIND_TONES[kind] ?? KIND_TONES.other;
}

function tierRadius(tier: string | null) {
  return (tier && TIER_LABELS[tier]?.radius) || 2.6;
}

function nodeLabel(node: WorldMapNode) {
  return node.name.trim() || "未命名地点";
}

function edgeKey(edge: Pick<WorldMapEdge, "fromId" | "toId">) {
  return [edge.fromId, edge.toId].sort().join("\u0000");
}

// 无坐标的旧节点回落环形布局，拖一下即可落位。
function ringPosition(index: number, total: number): { x: number; y: number } {
  const angle = (2 * Math.PI * index) / Math.max(total, 1) - Math.PI / 2;
  return { x: 50 + 36 * Math.cos(angle), y: 50 + 36 * Math.sin(angle) };
}

function MapCanvasSvg(props: {
  nodes: WorldMapNode[];
  edges: WorldMapEdge[];
  selectedNodeId?: string | null;
  interactive?: boolean;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  onNodePointerDown?: (event: React.PointerEvent, node: WorldMapNode) => void;
  onPointerMove?: (event: React.PointerEvent) => void;
  onPointerEnd?: () => void;
}) {
  const { nodes, edges, selectedNodeId, interactive = false } = props;
  const positioned = useMemo(() => {
    return nodes.map((node, index) => {
      const fallback = ringPosition(index, nodes.length);
      return {
        node,
        x: node.x ?? fallback.x,
        y: node.y ?? fallback.y,
        r: tierRadius(node.tier),
      };
    });
  }, [nodes]);
  const nodeById = useMemo(() => new Map(positioned.map((item) => [item.node.id, item])), [positioned]);

  return (
    <svg
      ref={props.svgRef}
      viewBox="0 0 100 100"
      className={cn("block h-auto w-full select-none text-foreground", interactive && "cursor-grab")}
      style={interactive ? { touchAction: "none" } : undefined}
      role="img"
      aria-label="世界地图"
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerEnd}
      onPointerLeave={props.onPointerEnd}
      onPointerCancel={props.onPointerEnd}
    >
      <g className="stroke-border" strokeWidth={0.2} opacity={0.55}>
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((tick) => (
          <line key={`v-${tick}`} x1={tick} y1={0} x2={tick} y2={100} />
        ))}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((tick) => (
          <line key={`h-${tick}`} x1={0} y1={tick} x2={100} y2={tick} />
        ))}
      </g>
      {edges.map((edge, index) => {
        const from = nodeById.get(edge.fromId);
        const to = nodeById.get(edge.toId);
        if (!from || !to) return null;
        return (
          <g key={`${edge.fromId}-${edge.toId}-${index}`} className="text-muted-foreground">
            <line
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              className="stroke-current"
              strokeWidth={0.5}
              strokeDasharray="1.6 1.2"
              opacity={0.65}
            />
            {edge.label ? (
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2 - 1}
                textAnchor="middle"
                className="fill-current"
                fontSize={2.2}
              >
                {edge.label}
              </text>
            ) : null}
          </g>
        );
      })}
      {positioned.map(({ node, x, y, r }) => {
        const tone = kindTone(node.kind);
        const selected = selectedNodeId === node.id;
        return (
          <g
            key={node.id}
            onPointerDown={interactive ? (event) => props.onNodePointerDown?.(event, node) : undefined}
            className={interactive ? "cursor-grab active:cursor-grabbing" : undefined}
          >
            {selected ? (
              <circle cx={x} cy={y} r={r + 1.6} fill="none" className="stroke-ring" strokeWidth={0.5} strokeDasharray="1 1" />
            ) : null}
            <circle cx={x} cy={y} r={r} className={cn(tone.stroke, tone.fill)} strokeWidth={selected ? 1.1 : 0.6} />
            <text
              x={x}
              y={y + r + 3.2}
              textAnchor="middle"
              className={cn("fill-current", selected ? "font-semibold" : undefined)}
              fontSize={3}
            >
              {nodeLabel(node)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface WorldMapPanelProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

export default function WorldMapPanel({ novelId, onChanged }: WorldMapPanelProps) {
  const queryClient = useQueryClient();
  const [overview, setOverview] = useState("");
  const [nodes, setNodes] = useState<WorldMapNode[]>([]);
  const [edges, setEdges] = useState<WorldMapEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [previewDraft, setPreviewDraft] = useState<WorldMapData | null>(null);
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  const [edgeLabel, setEdgeLabel] = useState("");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const worldQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsWorld(novelId),
    queryFn: () => getStorySettingsWorld(novelId),
  });
  const world = worldQuery.data?.data;

  const applyMap = (map: WorldMapData) => {
    setOverview(map.overview ?? "");
    setNodes(map.nodes.map((node) => ({ ...node })));
    setEdges(map.edges.map((edge) => ({ ...edge })));
    setSavedSnapshot(JSON.stringify({
      overview: map.overview ?? "",
      nodes: map.nodes,
      edges: map.edges,
    }));
  };

  useEffect(() => {
    if (!world || hydrated) return;
    setHydrated(true);
    applyMap(world.map ?? { overview: "", nodes: [], edges: [] });
    if (world.map?.nodes?.length) {
      setEdgeFrom(world.map.nodes[0]?.id ?? "");
      setEdgeTo(world.map.nodes[1]?.id ?? world.map.nodes[0]?.id ?? "");
    }
  }, [hydrated, world]);

  const currentSnapshot = useMemo(
    () => JSON.stringify({ overview, nodes, edges }),
    [overview, nodes, edges],
  );
  const dirty = hydrated && currentSnapshot !== savedSnapshot;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;

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
      setSelectedNodeId(null);
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
      setPreviewDraft(result.data ?? null);
    },
    onError: (error: Error) => {
      toast.error("生成地图失败", { description: error.message });
    },
  });

  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.round(Math.min(97, Math.max(3, ((clientX - rect.left) / rect.width) * 100)) * 10) / 10,
      y: Math.round(Math.min(91, Math.max(3, ((clientY - rect.top) / rect.height) * 100)) * 10) / 10,
    };
  };

  const handleNodePointerDown = (event: React.PointerEvent, node: WorldMapNode) => {
    event.preventDefault();
    setSelectedNodeId(node.id);
    dragIdRef.current = node.id;
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const dragId = dragIdRef.current;
    if (!dragId) return;
    const point = toSvgPoint(event.clientX, event.clientY);
    if (!point) return;
    setNodes((prev) => prev.map((node) => (node.id === dragId ? { ...node, x: point.x, y: point.y } : node)));
  };

  const handlePointerEnd = () => {
    dragIdRef.current = null;
  };

  const addNode = () => {
    const angle = (nodes.length * 137.5 * Math.PI) / 180;
    const node: WorldMapNode = {
      id: crypto.randomUUID(),
      name: "",
      kind: "other",
      summary: "",
      x: Math.round((50 + 30 * Math.cos(angle)) * 10) / 10,
      y: Math.round((50 + 30 * Math.sin(angle)) * 10) / 10,
      tier: null,
    };
    setNodes((prev) => [...prev, node]);
    setSelectedNodeId(node.id);
  };

  const removeNode = (node: WorldMapNode) => {
    const name = nodeLabel(node);
    const linked = edges.filter((edge) => edge.fromId === node.id || edge.toId === node.id).length;
    const message = linked > 0
      ? `删除地点「${name}」？它的 ${linked} 条连线会一起删除。`
      : `删除地点「${name}」？`;
    if (!window.confirm(message)) return;
    setNodes((prev) => prev.filter((item) => item.id !== node.id));
    setEdges((prev) => prev.filter((edge) => edge.fromId !== node.id && edge.toId !== node.id));
    if (selectedNodeId === node.id) setSelectedNodeId(null);
  };

  const patchNode = (id: string, patch: Partial<WorldMapNode>) => {
    setNodes((prev) => prev.map((node) => (node.id === id ? { ...node, ...patch } : node)));
  };

  const addEdge = () => {
    if (!edgeFrom || !edgeTo) {
      toast.error("先选择连线两端的地点。");
      return;
    }
    if (edgeFrom === edgeTo) {
      toast.error("连线两端不能是同一个地点。");
      return;
    }
    const key = edgeKey({ fromId: edgeFrom, toId: edgeTo });
    if (edges.some((edge) => edgeKey(edge) === key)) {
      toast.error("这两个地点之间已经有连线了。");
      return;
    }
    setEdges((prev) => [...prev, { fromId: edgeFrom, toId: edgeTo, label: edgeLabel.trim() }]);
    setEdgeLabel("");
  };

  const nodeName = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    return node ? nodeLabel(node) : "已删除地点";
  };

  const buildMapPayload = (): WorldMapData => ({
    overview: overview.trim(),
    nodes: nodes.map((node) => ({
      ...node,
      name: node.name.trim() || "未命名地点",
      summary: node.summary.trim(),
      tier: node.tier ?? null,
    })),
    edges: edges.map((edge) => ({ ...edge, label: edge.label.trim() })),
  });

  const save = (map: WorldMapData) => {
    if (map.nodes.length === 0) {
      toast.error("至少要有一个地点才能保存地图。");
      return;
    }
    if (map.nodes.some((node) => !node.name.trim())) {
      toast.error("还有地点没有命名，命名后再保存。");
      return;
    }
    saveMutation.mutate(map);
  };

  if (worldQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">正在加载世界地图...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          用一张地图讲清这个世界的格局：地点、方位与通路。AI 会按世界观生成草稿，你可以拖动地点、增删连线后再保存。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={addNode}>
            <Plus className="h-4 w-4" />添加地点
          </Button>
          <AiButton
            variant="outline"
            size="sm"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
          >
            {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            {previewMutation.isPending ? "生成中..." : nodes.length > 0 ? "AI 补充地图" : "AI 生成地图"}
          </AiButton>
          <Button size="sm" onClick={() => save(buildMapPayload())} disabled={saveMutation.isPending || !dirty}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saveMutation.isPending ? "保存中..." : dirty ? "保存地图" : "已保存"}
          </Button>
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">地图总述</span>
        <textarea
          rows={2}
          className="min-h-[56px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
          placeholder="一段话讲清整体格局：方位关系、势力分布、危险区域在哪。"
          value={overview}
          onChange={(event) => setOverview(event.target.value)}
        />
      </label>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="min-w-0 border-border/70">
          <CardContent className="p-3 sm:p-4">
            {nodes.length === 0 ? (
              <div className="flex aspect-square max-h-[520px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
                <MapPin className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">还没有地图地点。</p>
                <p className="text-xs text-muted-foreground">点「AI 生成地图」按世界观规划，或「添加地点」手动起一张图。</p>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-[540px]">
                <MapCanvasSvg
                  nodes={nodes}
                  edges={edges}
                  selectedNodeId={selectedNodeId}
                  interactive
                  svgRef={svgRef}
                  onNodePointerDown={handleNodePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerEnd={handlePointerEnd}
                />
              </div>
            )}
            {nodes.length > 0 ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">拖动圆点调整位置，点击选中后在右侧编辑。</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="min-w-0">
            <CardContent className="space-y-2 p-3 sm:p-4">
              <p className="text-sm font-medium">地点（{nodes.length}）</p>
              {nodes.length === 0 ? (
                <p className="text-xs text-muted-foreground">还没有地点。</p>
              ) : (
                <ul className="space-y-1">
                  {nodes.map((node) => {
                    const tone = kindTone(node.kind);
                    return (
                      <li key={node.id}>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            selectedNodeId === node.id ? "bg-muted" : "hover:bg-muted/60",
                          )}
                          onClick={() => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)}
                        >
                          <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", tone.dot)} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{nodeLabel(node)}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{tone.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {selectedNode ? (
            <Card className="min-w-0">
              <CardContent className="space-y-3 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">编辑地点</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => removeNode(selectedNode)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />删除
                  </Button>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">名称</span>
                  <Input
                    value={selectedNode.name}
                    placeholder="例如：临江安全区"
                    onChange={(event) => patchNode(selectedNode.id, { name: event.target.value })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">类型</span>
                    <SelectControl
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={selectedNode.kind}
                      onChange={(event) => patchNode(selectedNode.id, { kind: event.target.value })}
                    >
                      {Object.entries(KIND_TONES).map(([value, tone]) => (
                        <option key={value} value={value}>{tone.label}</option>
                      ))}
                    </SelectControl>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">规模</span>
                    <SelectControl
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={selectedNode.tier ?? ""}
                      onChange={(event) => patchNode(selectedNode.id, { tier: event.target.value || null })}
                    >
                      <option value="">普通</option>
                      {Object.entries(TIER_LABELS).map(([value, tier]) => (
                        <option key={value} value={value}>{tier.label}</option>
                      ))}
                    </SelectControl>
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">说明</span>
                  <textarea
                    rows={3}
                    className="min-h-[64px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
                    placeholder="这个地点是什么、发生过什么、对故事意味着什么。"
                    value={selectedNode.summary}
                    onChange={(event) => patchNode(selectedNode.id, { summary: event.target.value })}
                  />
                </label>
              </CardContent>
            </Card>
          ) : null}

          <Card className="min-w-0">
            <CardContent className="space-y-2 p-3 sm:p-4">
              <p className="text-sm font-medium">通路与关系（{edges.length}）</p>
              {nodes.length < 2 ? (
                <p className="text-xs text-muted-foreground">至少两个地点才能连线路。</p>
              ) : (
                <>
                  {edges.length === 0 ? (
                    <p className="text-xs text-muted-foreground">还没有连线，例如「南下商路」「隔离防线」。</p>
                  ) : (
                    <ul className="space-y-1">
                      {edges.map((edge, index) => (
                        <li
                          key={`${edge.fromId}-${edge.toId}-${index}`}
                          className="flex items-center gap-2 rounded-md px-2 py-1 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {nodeName(edge.fromId)} ↔ {nodeName(edge.toId)}
                            {edge.label ? <span className="text-muted-foreground">（{edge.label}）</span> : null}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                            aria-label="删除连线"
                            onClick={() => setEdges((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="space-y-2 border-t border-border pt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <SelectControl
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={edgeFrom}
                        onChange={(event) => setEdgeFrom(event.target.value)}
                      >
                        {nodes.map((node) => (
                          <option key={node.id} value={node.id}>{nodeLabel(node)}</option>
                        ))}
                      </SelectControl>
                      <SelectControl
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={edgeTo}
                        onChange={(event) => setEdgeTo(event.target.value)}
                      >
                        {nodes.map((node) => (
                          <option key={node.id} value={node.id}>{nodeLabel(node)}</option>
                        ))}
                      </SelectControl>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        className="h-8"
                        value={edgeLabel}
                        placeholder="通路说明（可空）"
                        onChange={(event) => setEdgeLabel(event.target.value)}
                      />
                      <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={addEdge}>
                        <Plus className="h-3.5 w-3.5" />连线
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={previewDraft !== null} onOpenChange={(open) => { if (!open) setPreviewDraft(null); }}>
        <AppDialogContent
          title="AI 生成的世界地图"
          description={previewDraft?.overview}
          footer={
            <>
              <Button variant="outline" onClick={() => setPreviewDraft(null)}>取消</Button>
              <Button
                onClick={() => {
                  if (!previewDraft) return;
                  setPreviewDraft(null);
                  save(previewDraft);
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
                <MapCanvasSvg nodes={previewDraft.nodes} edges={previewDraft.edges} />
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
              {nodes.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  应用后会覆盖当前 {nodes.length} 个地点的地图；同名地点会保留原有挂接的场景。
                </p>
              ) : null}
            </div>
          ) : null}
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
