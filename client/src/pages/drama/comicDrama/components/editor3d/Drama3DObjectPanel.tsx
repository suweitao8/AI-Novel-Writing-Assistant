import { Layers3, MapPin, Ruler, UserRound } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Drama3DObjectKind = "scene" | "actor" | "marker" | "reference";

export interface Drama3DObjectItem {
  id: string;
  label: string;
  kind: Drama3DObjectKind;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface Drama3DObjectPanelProps {
  items: Drama3DObjectItem[];
  className?: string;
}

function ObjectIcon({ kind }: { kind: Drama3DObjectKind }) {
  const Icon = kind === "scene"
    ? Layers3
    : kind === "actor"
      ? UserRound
      : kind === "marker"
        ? MapPin
        : Ruler;
  return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

export function Drama3DObjectPanel({ items, className }: Drama3DObjectPanelProps) {
  return (
    <Card className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
      {/* Unity Hierarchy 式表头：对象列表 + 数量。 */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-xs font-medium text-foreground">对象列表</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{items.length}</span>
      </div>
      <CardContent className="h-full min-h-0 flex-1 overflow-y-auto p-2">
        {items.length ? (
          <div role="list" aria-label="场景对象列表" className="space-y-1">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                aria-pressed={item.selected}
                data-object-id={item.id}
                data-object-kind={item.kind}
                data-object-selected={item.selected}
                onClick={item.onSelect}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-md border border-transparent px-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                  item.selected && "border-primary bg-accent",
                )}
              >
                <ObjectIcon kind={item.kind} />
                <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex min-h-20 items-center justify-center rounded-md border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
            场景中暂无可选择对象。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
