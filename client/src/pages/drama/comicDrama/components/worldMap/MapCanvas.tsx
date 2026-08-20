import { useMemo, useRef } from "react";
import type { WorldMapData, WorldMapNode, WorldMapTerrain } from "@/api/story/storySettings";
import { cn } from "@/lib/utils";
import {
  edgeDistanceKm,
  kindTone,
  nodeLabel,
  polygonCenter,
  polygonPointsAttribute,
  terrainTone,
  tierRadius,
} from "./mapData";

// 地图画布：地形多边形铺底，节点圆点与连线浮在上面。
// 交互区分点击与拖拽：按住移动=拖动节点/地形；原地松开=点击（上层用它进入下级或选中编辑）。
// 连线标注附带按所在层内置尺度换算的直线距离（km）。

interface MapCanvasProps {
  map: WorldMapData;
  selectedNodeId: string | null;
  selectedTerrainId: string | null;
  // 所在层内置地理尺度（公里），用于连线距离换算；null 则只显示连线说明。
  levelScaleKm: number | null;
  onNodeMove: (nodeId: string, x: number, y: number) => void;
  onNodeSelect: (nodeId: string) => void;
  onTerrainSelect: (terrainId: string) => void;
  onTerrainMove: (terrainId: string, dx: number, dy: number) => void;
}

// 位移小于该坐标单位视为原地点击（未拖动）。
const CLICK_MOVE_THRESHOLD = 1.5;

export default function MapCanvas(props: MapCanvasProps) {
  const { map } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<
    | { type: "node"; id: string; moved: boolean; origin: { x: number; y: number } }
    | { type: "terrain"; id: string; moved: boolean; last: { x: number; y: number } }
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
      if (!drag.moved && Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) < CLICK_MOVE_THRESHOLD) {
        return;
      }
      drag.moved = true;
      props.onNodeMove(drag.id, point.x, point.y);
    } else {
      if (!drag.moved && Math.hypot(point.x - drag.last.x, point.y - drag.last.y) < CLICK_MOVE_THRESHOLD) {
        return;
      }
      drag.moved = true;
      props.onTerrainMove(drag.id, point.x - drag.last.x, point.y - drag.last.y);
      drag.last = point;
    }
  };

  const endDrag = () => {
    const drag = dragRef.current;
    if (drag && !drag.moved) {
      // 原地松开=点击：选中（上层决定点击是进入下级还是编辑）。
      if (drag.type === "node") {
        props.onNodeSelect(drag.id);
      } else {
        props.onTerrainSelect(drag.id);
      }
    }
    dragRef.current = null;
  };

  const startNodeDrag = (event: React.PointerEvent, node: WorldMapNode) => {
    event.preventDefault();
    event.stopPropagation();
    const point = toSvgPoint(event.clientX, event.clientY);
    if (!point) return;
    dragRef.current = { type: "node", id: node.id, moved: false, origin: point };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const startTerrainDrag = (event: React.PointerEvent, terrain: WorldMapTerrain) => {
    event.preventDefault();
    event.stopPropagation();
    const point = toSvgPoint(event.clientX, event.clientY);
    if (!point) return;
    dragRef.current = { type: "terrain", id: terrain.id, moved: false, last: point };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      className="block h-auto w-full cursor-default select-none text-foreground"
      style={{ touchAction: "none" }}
      role="img"
      aria-label="地图画布"
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
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
            className="cursor-move"
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
        const km = props.levelScaleKm !== null
          ? edgeDistanceKm({ x: from.x, y: from.y }, { x: to.x, y: to.y }, props.levelScaleKm)
          : null;
        const labelText = edge.label
          ? km !== null ? `${edge.label} · ${km}km` : edge.label
          : km !== null ? `${km}km` : "";
        return (
          <g
            key={`${edge.fromId}-${edge.toId}-${index}`}
            className="text-muted-foreground"
          >
            <line
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              className="stroke-current"
              strokeWidth={0.5}
              strokeDasharray="1.6 1.2"
              opacity={0.65}
            />
            {labelText ? (
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2 - 1}
                textAnchor="middle"
                className="fill-current"
                fontSize={2.2}
              >
                {labelText}
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
            className="cursor-grab active:cursor-grabbing"
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
    </svg>
  );
}
