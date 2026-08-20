import { useMemo, useRef } from "react";
import type { WorldMapData, WorldMapEdge, WorldMapNode, WorldMapTerrain, WorldMapTerrainType } from "@/api/story/storySettings";
import { cn } from "@/lib/utils";
import {
  kindTone,
  nodeLabel,
  polygonCenter,
  polygonPointsAttribute,
  terrainTone,
  tierRadius,
} from "./mapData";

// 地图画布：地形多边形铺底，地点圆点与连线浮在上面。
// 两种交互模式：select（拖地点/选中元素）与 terrain（点击落顶点圈出地形范围）。

export type CanvasSelectionMode = {
  kind: "select";
};

export type CanvasTerrainMode = {
  kind: "terrain";
  terrainType: WorldMapTerrainType;
};

export type CanvasMode = CanvasSelectionMode | CanvasTerrainMode;

interface MapCanvasProps {
  map: WorldMapData;
  mode: CanvasMode;
  selectedNodeId: string | null;
  selectedEdgeKey: string | null;
  selectedTerrainId: string | null;
  draftTerrainPoints: Array<{ x: number; y: number }>;
  onNodeMove: (nodeId: string, x: number, y: number) => void;
  onNodeSelect: (nodeId: string) => void;
  onEdgeSelect: (edge: WorldMapEdge) => void;
  onTerrainSelect: (terrainId: string) => void;
  onTerrainMove: (terrainId: string, dx: number, dy: number) => void;
  onCanvasClick: (point: { x: number; y: number }) => void;
}

function edgeKeyOf(edge: Pick<WorldMapEdge, "fromId" | "toId">) {
  return [edge.fromId, edge.toId].sort().join("\u0000");
}

export default function MapCanvas(props: MapCanvasProps) {
  const { map, mode } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<
    | { type: "node"; id: string }
    | { type: "terrain"; id: string; last: { x: number; y: number } }
    | null
  >(null);

  const positioned = useMemo(() => {
    return map.nodes.map((node, index) => {
      const angle = (2 * Math.PI * index) / Math.max(map.nodes.length, 1) - Math.PI / 2;
      return {
        node,
        x: node.x ?? 50 + 36 * Math.cos(angle),
        y: node.y ?? 50 + 36 * Math.sin(angle),
        r: tierRadius(node.tier),
      };
    });
  }, [map.nodes]);
  const nodeById = useMemo(() => new Map(positioned.map((item) => [item.node.id, item])), [positioned]);

  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.round(Math.min(97, Math.max(3, ((clientX - rect.left) / rect.width) * 100)) * 10) / 10,
      y: Math.round(Math.min(91, Math.max(3, ((clientY - rect.top) / rect.height) * 100)) * 10) / 10,
    };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = toSvgPoint(event.clientX, event.clientY);
    if (!point) return;
    if (drag.type === "node") {
      props.onNodeMove(drag.id, point.x, point.y);
    } else {
      props.onTerrainMove(drag.id, point.x - drag.last.x, point.y - drag.last.y);
      drag.last = point;
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const startNodeDrag = (event: React.PointerEvent, node: WorldMapNode) => {
    if (mode.kind === "terrain") return;
    event.preventDefault();
    event.stopPropagation();
    props.onNodeSelect(node.id);
    dragRef.current = { type: "node", id: node.id };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const startTerrainDrag = (event: React.PointerEvent, terrain: WorldMapTerrain) => {
    if (mode.kind === "terrain") return;
    const point = toSvgPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    props.onTerrainSelect(terrain.id);
    dragRef.current = { type: "terrain", id: terrain.id, last: point };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const drawing = mode.kind === "terrain";

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      className={cn(
        "block h-auto w-full select-none text-foreground",
        drawing ? "cursor-crosshair" : "cursor-default",
      )}
      style={{ touchAction: "none" }}
      role="img"
      aria-label="地图画布"
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
      onClick={(event) => {
        if (!drawing) return;
        const point = toSvgPoint(event.clientX, event.clientY);
        if (point) props.onCanvasClick(point);
      }}
    >
      <rect x={0} y={0} width={100} height={100} className="fill-background" />
      <g className="stroke-border" strokeWidth={0.2} opacity={0.55}>
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((tick) => (
          <line key={`v-${tick}`} x1={tick} y1={0} x2={tick} y2={100} />
        ))}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((tick) => (
          <line key={`h-${tick}`} x1={0} y1={tick} x2={100} y2={tick} />
        ))}
      </g>

      {map.terrain.map((terrain) => {
        const tone = terrainTone(terrain.type);
        const selected = props.selectedTerrainId === terrain.id;
        const center = polygonCenter(terrain.points);
        return (
          <g
            key={terrain.id}
            onPointerDown={(event) => startTerrainDrag(event, terrain)}
            className={drawing ? undefined : "cursor-move"}
          >
            <polygon
              points={polygonPointsAttribute(terrain.points)}
              className={cn(tone.fill, tone.stroke)}
              strokeWidth={selected ? 0.7 : 0.35}
              strokeDasharray={selected ? "1.4 1" : undefined}
            />
            {terrain.label ? (
              <text
                x={center.x}
                y={center.y}
                textAnchor="middle"
                className={cn("fill-current", tone.text)}
                fontSize={2.6}
                opacity={0.85}
              >
                {terrain.label}
              </text>
            ) : null}
          </g>
        );
      })}

      {map.edges.map((edge, index) => {
        const from = nodeById.get(edge.fromId);
        const to = nodeById.get(edge.toId);
        if (!from || !to) return null;
        const selected = props.selectedEdgeKey === edgeKeyOf(edge);
        return (
          <g
            key={`${edge.fromId}-${edge.toId}-${index}`}
            className="text-muted-foreground"
            onClick={(event) => {
              if (drawing) return;
              event.stopPropagation();
              props.onEdgeSelect(edge);
            }}
          >
            <line
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              className="stroke-current"
              strokeWidth={selected ? 0.9 : 0.5}
              strokeDasharray="1.6 1.2"
              opacity={selected ? 0.95 : 0.65}
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
        const selected = props.selectedNodeId === node.id;
        const hasChild = Boolean(map.childMaps?.[node.id]);
        return (
          <g
            key={node.id}
            onPointerDown={(event) => startNodeDrag(event, node)}
            className={drawing ? undefined : "cursor-grab active:cursor-grabbing"}
          >
            {selected ? (
              <circle cx={x} cy={y} r={r + 1.6} fill="none" className="stroke-ring" strokeWidth={0.5} strokeDasharray="1 1" />
            ) : null}
            <circle cx={x} cy={y} r={r} className={cn(tone.stroke, tone.fill)} strokeWidth={selected ? 1.1 : 0.6} />
            {hasChild ? (
              <circle cx={x} cy={y} r={Math.max(0.9, r - 1.3)} className="fill-background stroke-current text-foreground" strokeWidth={0.35} />
            ) : null}
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

      {drawing && props.draftTerrainPoints.length > 0 ? (
        <g className="pointer-events-none">
          <polygon
            points={polygonPointsAttribute(props.draftTerrainPoints)}
            className="fill-muted/40 stroke-muted-foreground"
            strokeWidth={0.4}
            strokeDasharray="1.2 1"
          />
        </g>
      ) : null}
    </svg>
  );
}
