import { useMemo, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorldMapData, WorldMapTerrain } from "@/api/story/storySettings";
import { edgeDistanceKm } from "./mapData";
import {
  MapCardNode,
  MINIMAP_NODE_COLORS,
  TerrainLayerNode,
} from "./MapFlowNodes";

// 地图画布（React Flow 版，沿用旧项目 mydrama 画布的体验）：
// 点阵背景 + 滚轮缩放 + 拖拽平移 + 右下小地图，节点是卡片、连线带公里数标注。
// 数据模型不变：坐标仍是 0-100 平面百分比，这里按基准画布边长换算成 React Flow 像素坐标，
// 拖动结束再把像素坐标换回百分比上抛（node.origin [0.5,0.5] 让节点 position 即中心点）。

const CANVAS_SIZE = 1600;

const nodeTypes: NodeTypes = {
  mapCard: MapCardNode,
  terrainLayer: TerrainLayerNode,
};

const percentFromPx = (px: number): number => Math.round(Math.min(100, Math.max(0, (px / CANVAS_SIZE) * 100)) * 10) / 10;

// 射线法：点是否在地形多边形内（用于点击空白处选中地形）。
function pointInTerrainPolygon(px: number, py: number, points: WorldMapTerrain["points"]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersects = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

interface MapFlowCanvasProps {
  map: WorldMapData;
  // 层级语义：有 childLevelLabel 时点卡片=进入下级（由上层决定），否则点卡片=选中编辑。
  childLevelLabel: string | null;
  selectedNodeId: string | null;
  levelScaleKm: number | null;
  onNodeMove: (nodeId: string, x: number, y: number) => void;
  onNodeSelect: (nodeId: string) => void;
  onTerrainSelect: (terrainId: string) => void;
}

export default function MapFlowCanvas(props: MapFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <MapFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function MapFlowCanvasInner(props: MapFlowCanvasProps) {
  const { map, levelScaleKm } = props;
  const { screenToFlowPosition } = useReactFlow();

  const hasTerrain = (map.terrain ?? []).length > 0;

  const nodes = useMemo<Node[]>(() => {
    const list: Node[] = [];
    if (hasTerrain) {
      list.push({
        id: "__terrain__",
        type: "terrainLayer",
        position: { x: 0, y: 0 },
        data: { terrain: map.terrain },
        draggable: false,
        selectable: false,
        zIndex: 0,
        style: { width: CANVAS_SIZE, height: CANVAS_SIZE },
      });
    }
    (map.nodes ?? []).forEach((node, index) => {
      const angle = (2 * Math.PI * index) / Math.max(map.nodes.length, 1) - Math.PI / 2;
      const x = node.x ?? 50 + 36 * Math.cos(angle);
      const y = node.y ?? 50 + 36 * Math.sin(angle);
      list.push({
        id: node.id,
        type: "mapCard",
        position: { x: (x / 100) * CANVAS_SIZE, y: (y / 100) * CANVAS_SIZE },
        origin: [0.5, 0.5],
        data: {
          name: node.name,
          kind: node.kind,
          summary: node.summary,
          childLabel: props.childLevelLabel,
          childCount: map.childMaps?.[node.id]?.nodes.length ?? 0,
        },
        selected: props.selectedNodeId === node.id,
        zIndex: 1,
      });
    });
    return list;
  }, [map, hasTerrain, props.childLevelLabel, props.selectedNodeId]);

  const edges = useMemo<Edge[]>(() => {
    const nodeById = new Map((map.nodes ?? []).map((node) => [node.id, node]));
    return (map.edges ?? []).map((edge, index) => {
      const from = nodeById.get(edge.fromId);
      const to = nodeById.get(edge.toId);
      const km = from && to && from.x !== null && from.y !== null && to.x !== null && to.y !== null && levelScaleKm !== null
        ? edgeDistanceKm({ x: from.x, y: from.y }, { x: to.x, y: to.y }, levelScaleKm)
        : null;
      const label = edge.label
        ? km !== null ? `${edge.label} · ${km}km` : edge.label
        : km !== null ? `${km}km` : undefined;
      return {
        id: `edge-${edge.fromId}-${edge.toId}-${index}`,
        source: edge.fromId,
        target: edge.toId,
        label,
        type: "default",
        style: { stroke: "hsl(var(--muted-foreground) / 0.45)", strokeWidth: 1.5 },
        labelStyle: { fill: "hsl(var(--muted-foreground))", fontSize: 11 },
        labelBgStyle: { fill: "hsl(var(--card))", fillOpacity: 0.85 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        interactionWidth: 0,
      };
    });
  }, [map.edges, map.nodes, levelScaleKm]);

  const handleNodeClick = useCallback<NodeMouseHandler>((_event, node) => {
    if (node.id === "__terrain__") return;
    props.onNodeSelect(node.id);
  }, [props]);

  const handleNodeDragStop = useCallback<OnNodeDrag>((_event, node) => {
    if (node.id === "__terrain__") return;
    props.onNodeMove(node.id, percentFromPx(node.position.x), percentFromPx(node.position.y));
  }, [props]);

  // 地形层 pointer-events 关闭，点击落到 pane：换算成画布坐标后做射线命中，点中地形即选中它。
  const handlePaneClick = useCallback((event: ReactMouseEvent) => {
    if (!hasTerrain) return;
    const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const px = (flow.x / CANVAS_SIZE) * 100;
    const py = (flow.y / CANVAS_SIZE) * 100;
    for (let i = map.terrain.length - 1; i >= 0; i -= 1) {
      if (pointInTerrainPolygon(px, py, map.terrain[i].points)) {
        props.onTerrainSelect(map.terrain[i].id);
        return;
      }
    }
  }, [map.terrain, hasTerrain, props, screenToFlowPosition]);

  return (
    <div className="h-[560px] w-full overflow-hidden rounded-xl border border-border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={handlePaneClick}
        minZoom={0.15}
        maxZoom={4}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1.4 }}
        nodesConnectable={false}
        elevateNodesOnSelect={false}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} color="hsl(var(--border))" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          maskColor="hsl(var(--background) / 0.7)"
          className="!bottom-4 !right-4 !rounded-lg !border !border-border !bg-card/95"
          nodeColor={(node) => (node.type === "terrainLayer"
            ? "transparent"
            : MINIMAP_NODE_COLORS[String((node.data as { kind?: string }).kind ?? "other")] ?? MINIMAP_NODE_COLORS.other)}
          nodeStrokeWidth={0}
        />
      </ReactFlow>
    </div>
  );
}
