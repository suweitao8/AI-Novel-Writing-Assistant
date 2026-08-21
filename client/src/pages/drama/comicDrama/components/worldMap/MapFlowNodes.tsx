import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { polygonCenter, polygonPointsAttribute, terrainTone } from "./mapData";

// React Flow 画布的自定义节点：场景地点卡片 与 地形背景层。
// 节点数据只带渲染所需字段；交互（选中编辑、拖动坐标）由 MapFlowCanvas 回调上抛。

export type MapNodeKind = string;

export interface MapCardNodeData extends Record<string, unknown> {
  name: string;
  kind: MapNodeKind;
  summary: string;
}

// kind 的卡片视觉语义（与 mapData.KIND_TONES 同一套调色板）：
// 城市=primary（主题主色）、区域=emerald、地点=amber、其余=muted。
const CARD_TONES: Record<string, { bar: string; dot: string }> = {
  city: { bar: "bg-primary/70", dot: "bg-primary" },
  region: { bar: "bg-emerald-500/70", dot: "bg-emerald-500" },
  building: { bar: "bg-amber-500/70", dot: "bg-amber-500" },
  wild: { bar: "bg-muted-foreground/50", dot: "bg-muted-foreground" },
  other: { bar: "bg-muted-foreground/40", dot: "bg-muted-foreground/70" },
};

export function cardTone(kind: string) {
  return CARD_TONES[kind] ?? CARD_TONES.other;
}

// 小地图节点配色（MiniMap 的 nodeColor 需要 CSS 色值，不走 tailwind 类名）。
export const MINIMAP_NODE_COLORS: Record<string, string> = {
  city: "rgba(59, 130, 246, 0.85)",
  region: "rgba(16, 185, 129, 0.85)",
  building: "rgba(245, 158, 11, 0.85)",
  wild: "rgba(120, 120, 120, 0.8)",
  other: "rgba(120, 120, 120, 0.6)",
};

export const MapCardNode = memo(function MapCardNode({ data, selected }: NodeProps) {
  const card = data as MapCardNodeData;
  const tone = cardTone(card.kind);
  return (
    <div
      className={cn(
        "w-[168px] rounded-xl border bg-card/95 shadow-sm backdrop-blur transition-all",
        selected ? "border-ring shadow-md ring-2 ring-ring/30" : "border-border hover:border-border/80 hover:shadow",
      )}
    >
      <div className={cn("h-1.5 rounded-t-[11px]", tone.bar)} />
      <div className="space-y-1 p-2.5">
        <div className="flex items-center gap-1.5">
          <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", tone.dot)} aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-foreground">
            {card.name || "未命名"}
          </p>
        </div>
        {card.summary ? (
          <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">{card.summary}</p>
        ) : null}
      </div>
    </div>
  );
});

export interface TerrainNodeData extends Record<string, unknown> {
  terrain: Array<{ id: string; type: string; label: string; points: Array<{ x: number; y: number }> }>;
}

// 地形背景层：占满整张基准画布的 SVG 多边形组，不可拖动；点击选中后可在画布下方编辑/删除单个地形。
export const TerrainLayerNode = memo(function TerrainLayerNode({ data }: NodeProps) {
  const { terrain } = data as TerrainNodeData;
  return (
    <div className="h-full w-full" style={{ pointerEvents: "none" }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        {terrain.map((item) => {
          const tone = terrainTone(item.type);
          return (
            <g key={item.id}>
              <polygon
                points={polygonPointsAttribute(item.points)}
                className={cn(tone.fill, tone.stroke)}
                strokeWidth={0.35}
              />
              {item.label ? (() => {
                const center = polygonCenter(item.points);
                return (
                  <text
                    x={center.x}
                    y={center.y}
                    textAnchor="middle"
                    className={cn("fill-current", tone.text)}
                    fontSize={2.6}
                    opacity={0.85}
                  >
                    {item.label}
                  </text>
                );
              })() : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
});
