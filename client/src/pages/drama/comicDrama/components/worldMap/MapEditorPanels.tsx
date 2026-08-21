import type { WorldMapNode, WorldMapTerrain } from "@/api/story/storySettings";
import { Trash2 } from "lucide-react";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { KIND_TONES, TERRAIN_TYPES, terrainTone } from "./mapData";

// 地图编辑卡：选中地点（名称/类型/说明/删除）与选中地形（名字/类型/删除），显示在画布下方。

export function NodeEditorCard(props: {
  node: WorldMapNode;
  onPatch: (patch: Partial<WorldMapNode>) => void;
  onDelete: () => void;
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
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">名称</span>
            <Input
              value={props.node.name}
              placeholder="例如：林家老宅"
              onChange={(event) => props.onPatch({ name: event.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">类型</span>
            <SelectControl
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={KIND_TONES[props.node.kind] ? props.node.kind : "other"}
              onChange={(event) => props.onPatch({ kind: event.target.value })}
            >
              {Object.entries(KIND_TONES).map(([value, tone]) => (
                <option key={value} value={value}>{tone.label}</option>
              ))}
            </SelectControl>
          </label>
        </div>
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
            placeholder="如：望海湾"
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
          <p className={cn("text-xs", tone.text)}>点地图上的地形区域可选中编辑。</p>
        </label>
      </CardContent>
    </Card>
  );
}
