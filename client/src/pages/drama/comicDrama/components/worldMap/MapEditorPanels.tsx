import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { WorldMapData, WorldMapNode, WorldMapTerrain } from "@/api/story/storySettings";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  KIND_TONES,
  TERRAIN_TYPES,
  TIER_LABELS,
  coordinateDistance,
  edgeDistanceKm,
  kindTone,
  nodeLabel,
  terrainTone,
  travelEstimates,
} from "./mapData";

// 右侧编辑面板：地点、通路（含距离/耗时换算）、地形分区、地点列表。

export function NodeListCard(props: {
  map: WorldMapData;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onAdd: () => void;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-2 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">地点（{props.map.nodes.length}）</p>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={props.onAdd}>
            添加地点
          </Button>
        </div>
        {props.map.nodes.length === 0 ? (
          <p className="text-xs text-muted-foreground">还没有地点。画好地形后，把城市摆到陆地上。</p>
        ) : (
          <ul className="space-y-1">
            {props.map.nodes.map((node) => {
              const tone = kindTone(node.kind);
              const hasChild = Boolean(props.map.childMaps?.[node.id]);
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      props.selectedNodeId === node.id ? "bg-muted" : "hover:bg-muted/60",
                    )}
                    onClick={() => props.onSelect(node.id)}
                  >
                    <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", tone.dot)} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      {nodeLabel(node)}
                      {hasChild ? <span className="ml-1 text-[10px] text-muted-foreground">有内部地图</span> : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{tone.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function NodeEditorCard(props: {
  node: WorldMapNode;
  hasChildMap: boolean;
  onPatch: (patch: Partial<WorldMapNode>) => void;
  onDelete: () => void;
  onOpenChildMap: () => void;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">编辑地点</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={props.onDelete}
          >
            删除
          </Button>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">名称</span>
          <Input
            value={props.node.name}
            placeholder="例如：临江安全区"
            onChange={(event) => props.onPatch({ name: event.target.value })}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">类型</span>
            <SelectControl
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={props.node.kind}
              onChange={(event) => props.onPatch({ kind: event.target.value })}
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
              value={props.node.tier ?? ""}
              onChange={(event) => props.onPatch({ tier: event.target.value || null })}
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
            className="min-h-[64px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
            placeholder="这个地点是什么、发生过什么、对故事意味着什么。"
            value={props.node.summary}
            onChange={(event) => props.onPatch({ summary: event.target.value })}
          />
        </label>
        <Button variant="outline" size="sm" className="w-full" onClick={props.onOpenChildMap}>
          {props.hasChildMap ? "编辑内部地图" : "创建内部地图"}
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          内部地图用来画这座城/村镇里面的格局：城区、要塞、集市怎么分布。
        </p>
      </CardContent>
    </Card>
  );
}

export function EdgeEditorCard(props: {
  map: WorldMapData;
  edgeIndex: number;
  onPatchLabel: (label: string) => void;
  onDelete: () => void;
}) {
  const edge = props.map.edges[props.edgeIndex];
  if (!edge) return null;
  const from = props.map.nodes.find((node) => node.id === edge.fromId);
  const to = props.map.nodes.find((node) => node.id === edge.toId);
  const fromPoint = from && from.x !== null && from.y !== null ? { x: from.x, y: from.y } : null;
  const toPoint = to && to.x !== null && to.y !== null ? { x: to.x, y: to.y } : null;
  const positioned = Boolean(fromPoint && toPoint);
  const units = positioned && fromPoint && toPoint ? coordinateDistance(fromPoint, toPoint) : null;
  const km = positioned && fromPoint && toPoint ? edgeDistanceKm(fromPoint, toPoint, props.map.scaleKm) : null;
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium">
            {from ? nodeLabel(from) : "？"} ↔ {to ? nodeLabel(to) : "？"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={props.onDelete}
          >
            删除
          </Button>
        </div>
        {positioned && units !== null ? (
          <div className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
            <p>
              图上直线距离 {Math.round(units)} 格
              {km !== null ? `，约 ${km} 公里` : "（设置地图跨度后换算公里）"}
            </p>
            {km !== null ? (
              <p>
                {travelEstimates(km).map((item) => `${item.label}${item.text}`).join(" · ")}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">两端地点都有位置后，这里会显示直线距离与路程估算。</p>
        )}
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">通路说明（可写耗时口径，如「商队半月」）</span>
          <Input
            value={edge.label}
            placeholder="例如：南下商路 / 三日路程"
            onChange={(event) => props.onPatchLabel(event.target.value)}
          />
        </label>
      </CardContent>
    </Card>
  );
}

export function TerrainListCard(props: {
  map: WorldMapData;
  selectedTerrainId: string | null;
  onSelect: (terrainId: string) => void;
  onPatch: (terrainId: string, patch: Partial<Pick<WorldMapTerrain, "type" | "label">>) => void;
  onDelete: (terrainId: string) => void;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-2 p-3 sm:p-4">
        <p className="text-sm font-medium">地形（{props.map.terrain.length}）</p>
        {props.map.terrain.length === 0 ? (
          <p className="text-xs leading-5 text-muted-foreground">
            还没有地形。切到「画地形」，在画布上点出范围：平地、山地、水域。
          </p>
        ) : (
          <ul className="space-y-2">
            {props.map.terrain.map((terrain) => {
              const tone = terrainTone(terrain.type);
              return (
                <li
                  key={terrain.id}
                  className={cn(
                    "space-y-1.5 rounded-lg border border-border p-2",
                    props.selectedTerrainId === terrain.id ? "bg-muted/50" : "bg-muted/20",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-xs font-medium"
                      onClick={() => props.onSelect(terrain.id)}
                    >
                      <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full align-middle", tone.fill)} aria-hidden="true" />
                      {terrain.label || terrainName(terrain)}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      aria-label="删除地形"
                      onClick={() => props.onDelete(terrain.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <SelectControl
                      className="h-7 rounded-md border bg-background px-1.5 text-xs"
                      value={terrain.type}
                      onChange={(event) => props.onPatch(terrain.id, { type: event.target.value as WorldMapTerrain["type"] })}
                    >
                      {TERRAIN_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </SelectControl>
                    <Input
                      className="h-7 text-xs"
                      value={terrain.label}
                      placeholder="名字（如：北境雪原）"
                      onChange={(event) => props.onPatch(terrain.id, { label: event.target.value })}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function terrainName(terrain: WorldMapTerrain) {
  const type = TERRAIN_TYPES.find((item) => item.value === terrain.type)?.label ?? "地形";
  return `未命名${type}`;
}

export function EdgeCreatorCard(props: {
  map: WorldMapData;
  onAdd: (fromId: string, toId: string, label: string) => void;
}) {
  const [fromId, setFromId] = useState(props.map.nodes[0]?.id ?? "");
  const [toId, setToId] = useState(props.map.nodes[1]?.id ?? props.map.nodes[0]?.id ?? "");
  const [label, setLabel] = useState("");
  if (props.map.nodes.length < 2) {
    return (
      <Card className="min-w-0">
        <CardContent className="p-3 sm:p-4">
          <p className="text-sm font-medium">通路与关系（{props.map.edges.length}）</p>
          <p className="mt-2 text-xs text-muted-foreground">至少两个地点才能连线路。</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-2 p-3 sm:p-4">
        <p className="text-sm font-medium">通路与关系（{props.map.edges.length}）</p>
        {props.map.edges.length === 0 ? (
          <p className="text-xs text-muted-foreground">点画布上的虚线可以查看距离与耗时。</p>
        ) : null}
        <div className="space-y-2 border-t border-border pt-2">
          <div className="grid grid-cols-2 gap-2">
            <SelectControl
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={fromId}
              onChange={(event) => setFromId(event.target.value)}
            >
              {props.map.nodes.map((node) => (
                <option key={node.id} value={node.id}>{nodeLabel(node)}</option>
              ))}
            </SelectControl>
            <SelectControl
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={toId}
              onChange={(event) => setToId(event.target.value)}
            >
              {props.map.nodes.map((node) => (
                <option key={node.id} value={node.id}>{nodeLabel(node)}</option>
              ))}
            </SelectControl>
          </div>
          <div className="flex gap-2">
            <Input
              className="h-8"
              value={label}
              placeholder="通路说明（可空）"
              onChange={(event) => setLabel(event.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => {
                if (!fromId || !toId) {
                  toast.error("先选择连线两端的地点。");
                  return;
                }
                if (fromId === toId) {
                  toast.error("连线两端不能是同一个地点。");
                  return;
                }
                props.onAdd(fromId, toId, label.trim());
                setLabel("");
              }}
            >
              连线
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
