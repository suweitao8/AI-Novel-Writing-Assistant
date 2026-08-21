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
import type { CSSProperties } from "react";
import type { WorldMapData, WorldMapTerrain } from "@/api/story/storySettings";
import { cn } from "@/lib/utils";
import {
  MapCardNode,
  MINIMAP_NODE_COLORS,
  TerrainLayerNode,
} from "./MapFlowNodes";

// 地图画布（React Flow 版，沿用旧项目 mydrama 画布的体验）：
// 点阵背景 + 滚轮缩放 + 拖拽平移 + 右下小地图（带地名），节点是场景地点卡片。
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
  selectedNodeId: string | null;
  // 搜索：非空时名字不匹配的卡片淡出。
  filterQuery?: string;
  className?: string;
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
  const { map } = props;
  const { screenToFlowPosition } = useReactFlow();

  const hasTerrain = (map.terrain ?? []).length > 0;
  const query = (props.filterQuery ?? "").trim().toLowerCase();
  const matches = (name: string) => query === "" || name.toLowerCase().includes(query);

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
      const dimmed = !matches(node.name);
      list.push({
        id: node.id,
        type: "mapCard",
        position: { x: (x / 100) * CANVAS_SIZE, y: (y / 100) * CANVAS_SIZE },
        origin: [0.5, 0.5],
        data: {
          name: node.name,
          kind: node.kind,
          summary: node.summary,
        },
        selected: props.selectedNodeId === node.id,
        zIndex: 1,
        style: dimmed ? { opacity: 0.15 } : undefined,
      });
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, hasTerrain, props.selectedNodeId, query]);

  // 连线是旧版编辑数据，AI 不再产出；仅兼容渲染。
  const edges = useMemo<Edge[]>(() => {
    const nodeById = new Map((map.nodes ?? []).map((node) => [node.id, node]));
    return (map.edges ?? []).map((edge, index) => {
      const from = nodeById.get(edge.fromId);
      const to = nodeById.get(edge.toId);
      return {
        id: `edge-${edge.fromId}-${edge.toId}-${index}`,
        source: edge.fromId,
        target: edge.toId,
        label: edge.label || undefined,
        type: "default",
        style: {
          stroke: "hsl(var(--muted-foreground) / 0.45)",
          strokeWidth: 1.5,
          ...((from && !matches(from.name)) || (to && !matches(to.name)) ? { opacity: 0.12 } : {}),
        },
        labelStyle: { fill: "hsl(var(--muted-foreground))", fontSize: 11 },
        labelBgStyle: { fill: "hsl(var(--card))", fillOpacity: 0.85 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        interactionWidth: 0,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.edges, map.nodes, query]);

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

  // 小地图节点带地名：闭包持有 id→名字映射（依赖变化时重建组件引用）。
  const nameById = useMemo(() => new Map((map.nodes ?? []).map((node) => [node.id, node.name])), [map.nodes]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const miniMapNodeComponent = useMemo(() => {
    const MiniMapLabelNode = (node: {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      color?: string;
      borderRadius?: number;
      strokeWidth?: number;
      className?: string;
      style?: CSSProperties;
      shapeRendering?: string;
      selected?: boolean;
    }) => {
      const label = nameById.get(node.id);
      return (
        <g>
          <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            fill={node.color ?? "rgba(120,120,120,0.8)"}
            rx={node.borderRadius ?? 3}
          />
          {label ? (
            <text
              x={node.x + node.width / 2}
              y={node.y + node.height + 44}
              textAnchor="middle"
              fontSize={40}
              fill="hsl(var(--foreground) / 0.8)"
              stroke="none"
            >
              {label}
            </text>
          ) : null}
        </g>
      );
    };
    return MiniMapLabelNode;
  }, [nameById]);

  return (
    <div className={cn("h-[560px] min-h-[420px] w-full overflow-hidden rounded-xl border border-border bg-background", props.className)}>
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
          nodeComponent={miniMapNodeComponent}
        />
      </ReactFlow>
    </div>
  );
}
