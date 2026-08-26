import type { ReactNode } from "react";
import { Box, Layers3, MapPin, Ruler, UserRound } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Drama3DObjectKind = "scene" | "actor" | "marker" | "reference";

export interface Drama3DObjectItem {
  id: string;
  label: string;
  kind: Drama3DObjectKind;
  meta?: ReactNode;
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
    <Card className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <CardHeader className="shrink-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Box className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          场景对象
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto p-2">
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
                onClick={item.onSelect}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-md border border-transparent px-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item.selected && "border-primary bg-accent",
                  item.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <ObjectIcon kind={item.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.label}</span>
                  {item.meta ? <span className="block truncate text-xs text-muted-foreground">{item.meta}</span> : null}
                </span>
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
