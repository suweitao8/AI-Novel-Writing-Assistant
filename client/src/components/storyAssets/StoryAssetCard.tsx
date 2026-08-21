import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StoryAssetPresentation } from "./storyAssetPresentation";

export interface StoryAssetCardProps {
  asset: StoryAssetPresentation;
  compact?: boolean;
  onOpen: () => void;
  actions?: ReactNode;
  className?: string;
}

export function StoryAssetCard({ asset, compact = false, onOpen, actions, className }: StoryAssetCardProps) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardContent className={cn("space-y-2", compact ? "p-3" : "py-4")}>
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 rounded-md text-left outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onOpen}
            aria-label={`查看${asset.typeLabel}「${asset.name}」详情`}
          >
            <span className="flex min-w-0 items-start gap-2">
              <Badge variant="outline" className="shrink-0">{asset.typeLabel}</Badge>
              <span className="min-w-0 truncate font-medium text-foreground">{asset.name}</span>
            </span>
            <p className={cn("mt-2 text-xs leading-5 text-muted-foreground", compact ? "line-clamp-2" : "line-clamp-3")}>
              {asset.summary}
            </p>
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              {asset.badges.map((badge) => (
                <Badge key={badge} variant="secondary" className="text-[11px]">{badge}</Badge>
              ))}
              <Badge variant="secondary" className="text-[11px]">
                {asset.states.length > 0 ? `${asset.states.length} 个状态` : "暂无状态"}
              </Badge>
            </span>
          </button>
          {actions ? (
            <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
              {actions}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
