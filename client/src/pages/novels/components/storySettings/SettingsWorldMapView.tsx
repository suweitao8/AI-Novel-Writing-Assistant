import { useMemo } from "react";
import type { StorySettingsWorld } from "@/api/story/storySettings";

// 世界观地图：多数地点有保存坐标（0-100）时按坐标换算到画布，其余（旧数据）回落环形布局；
// 连线表示地点间的通路与关系。只用语义 token 与 currentColor，自动适配明暗主题。
export default function SettingsWorldMapView({ map }: { map: StorySettingsWorld["map"] }) {
  const layout = useMemo(() => {
    const positionedCount = map.nodes.filter((node) => node.x !== null && node.y !== null).length;
    const useStored = positionedCount >= Math.max(2, Math.ceil(map.nodes.length / 2));
    const unpositioned = map.nodes.filter((node) => node.x === null || node.y === null);
    const ringAt = (index: number, total: number) => {
      const angle = (2 * Math.PI * index) / Math.max(total, 1) - Math.PI / 2;
      return { x: 160 + 130 * Math.cos(angle), y: 120 + 95 * Math.sin(angle) };
    };
    const nodes = map.nodes.map((node) => {
      if (!useStored) {
        const fallback = ringAt(map.nodes.indexOf(node), map.nodes.length);
        return { ...node, x: fallback.x, y: fallback.y };
      }
      if (node.x !== null && node.y !== null) {
        return { ...node, x: node.x * 3.2, y: node.y * 2.4 };
      }
      const fallback = ringAt(unpositioned.indexOf(node), unpositioned.length);
      return { ...node, x: fallback.x, y: fallback.y };
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edges = map.edges
      .map((edge) => ({
        edge,
        from: nodeById.get(edge.fromId),
        to: nodeById.get(edge.toId),
      }))
      .filter((item): item is {
        edge: StorySettingsWorld["map"]["edges"][number];
        from: NonNullable<ReturnType<typeof nodeById.get>>;
        to: NonNullable<ReturnType<typeof nodeById.get>>;
      } => Boolean(item.from && item.to));
    return { nodes, edges };
  }, [map]);

  if (map.nodes.length === 0) {
    return <div className="text-sm text-muted-foreground">还没有地图地点，可以点上面的「AI 生成世界观」来创建。</div>;
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <svg
        viewBox="0 0 320 240"
        className="h-auto w-full min-w-[320px] max-w-xl text-muted-foreground"
        role="img"
        aria-label="世界观地图"
      >
        {layout.edges.map(({ edge, from, to }, index) => (
          <g key={`${edge.fromId}-${edge.toId}-${index}`}>
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="4 3"
              className="opacity-60"
            />
            <text
              x={(from.x + to.x) / 2}
              y={(from.y + to.y) / 2 - 3}
              textAnchor="middle"
              className="fill-current text-[7px]"
            >
              {edge.label}
            </text>
          </g>
        ))}
        {layout.nodes.map((node) => (
          <g key={node.id}>
            <circle
              cx={node.x}
              cy={node.y}
              r={5}
              className="fill-primary stroke-background"
              strokeWidth={2}
            />
            <text
              x={node.x}
              y={node.y - 9}
              textAnchor="middle"
              className="fill-current text-[9px] font-medium text-foreground"
            >
              {node.name}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {map.nodes.map((node) => (
          <div key={node.id} className="rounded-md border border-border bg-card px-3 py-2 text-xs leading-5">
            <span className="font-medium text-foreground">{node.name}</span>
            {node.summary ? <span className="text-muted-foreground">：{node.summary}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
