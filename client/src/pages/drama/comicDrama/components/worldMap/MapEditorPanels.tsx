import type { WorldMapData, WorldMapNode, WorldMapTerrain } from "@/api/story/storySettings";
import { Trash2 } from "lucide-react";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TERRAIN_TYPES, nodeLabel, terrainTone } from "./mapData";

// 右侧编辑面板：当前层导航列表（世界层=国家 / 国家层=城市 / 城市层=地点）、节点编辑、地形编辑。

// 当前层的导航列表：国家/城市点击进入下一层，地点点击选中。
export function LevelListCard(props: {
  map: WorldMapData;
  levelLabel: string;
  childLevelLabel: string | null;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onOpenChild: (nodeId: string) => void;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-2 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{props.levelLabel}（{props.map.nodes.length}）</p>
        </div>
        {props.map.nodes.length === 0 ? (
          <p className="text-xs leading-5 text-muted-foreground">
            还没有{props.levelLabel}。
          </p>
        ) : (
          <ul className="space-y-1">
            {props.map.nodes.map((node) => {
              const childCount = props.map.childMaps?.[node.id]?.nodes.length ?? 0;
              const canDrill = props.childLevelLabel !== null;
              return (
                <li key={node.id}>
                  <div
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      props.selectedNodeId === node.id ? "bg-muted" : "hover:bg-muted/60",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left"
                      onClick={() => props.onSelect(node.id)}
                    >
                      {nodeLabel(node)}
                    </button>
                    {canDrill ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                        onClick={() => props.onOpenChild(node.id)}
                      >
                        {props.childLevelLabel}（{childCount}）
                      </button>
                    ) : null}
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

export function NodeEditorCard(props: {
  node: WorldMapNode;
  childLevelLabel: string | null;
  onPatch: (patch: Partial<WorldMapNode>) => void;
  onDelete: () => void;
  onOpenChildMap: () => void;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">编辑{props.childLevelLabel ? props.childLevelLabel === "城市" ? "国家" : "城市" : "地点"}</p>
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
            placeholder={props.childLevelLabel === "城市" ? "例如：大梁国" : props.childLevelLabel === "地点" ? "例如：云京城" : "例如：林家老宅"}
            onChange={(event) => props.onPatch({ name: event.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">说明</span>
          <textarea
            rows={3}
            className="min-h-[64px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
            placeholder="这个地方是什么、发生过什么、对故事意味着什么。"
            value={props.node.summary}
            onChange={(event) => props.onPatch({ summary: event.target.value })}
          />
        </label>
        {props.childLevelLabel ? (
          <Button variant="outline" size="sm" className="w-full" onClick={props.onOpenChildMap}>
            进入{props.childLevelLabel}分布
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TerrainEditorCard(props: {
  terrain: WorldMapTerrain;
  onPatch: (patch: Partial<Pick<WorldMapTerrain, "type" | "label">>) => void;
  onDelete: () => void;
}) {
  const tone = terrainTone(props.terrain.type);
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">编辑地形</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            aria-label="删除地形"
            onClick={props.onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">名字</span>
          <Input
            value={props.terrain.label}
            placeholder="如：北境雪原"
            onChange={(event) => props.onPatch({ label: event.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">类型</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={props.terrain.type}
            onChange={(event) => props.onPatch({ type: event.target.value as WorldMapTerrain["type"] })}
          >
            {TERRAIN_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </SelectControl>
          <p className={cn("text-xs", tone.text)}>在画布上拖动可调整位置。</p>
        </label>
      </CardContent>
    </Card>
  );
}
