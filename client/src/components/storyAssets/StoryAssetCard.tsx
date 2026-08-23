import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StoryAssetPreview } from "./StoryAssetPreview";
import type { StoryAssetPresentation } from "./storyAssetPresentation";

export interface StoryAssetCardProps {
  asset: StoryAssetPresentation;
  compact?: boolean;
  onOpen: () => void;
  actions?: ReactNode;
  className?: string;
}

// 类型配色（2026-08-23 用户要求：资产卡不要统一白色，按类型区分）：
// 与脚本页的实体色一致——角色蓝、场景绿、道具黄；卡片边框与徽标同色系淡染。
const KIND_TONES: Record<StoryAssetPresentation["kind"], { card: string; badge: string }> = {
  character: {
    card: "border-sky-500/30 bg-sky-500/[0.06]",
    badge: "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  scene: {
    card: "border-emerald-500/30 bg-emerald-500/[0.06]",
    badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  prop: {
    card: "border-amber-500/30 bg-amber-500/[0.06]",
    badge: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
};

export function StoryAssetCard({
  asset,
  compact = false,
  onOpen,
  actions,
  className,
}: StoryAssetCardProps) {
  const tone = KIND_TONES[asset.kind];
  return (
    <Card className={cn("min-w-0", tone.card, className)}>
      <CardContent className={cn("p-3", compact && "p-2.5")}>
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-stretch gap-3 rounded-md text-left outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onOpen}
            aria-label={`查看${asset.typeLabel}「${asset.name}」详情`}
          >
            <StoryAssetPreview
              preview={asset.preview}
              className={cn("w-24 shrink-0", !compact && "sm:w-36")}
            />
            <span className="min-w-0 flex-1 py-1">
              <span className="flex min-w-0 items-start gap-2">
                <Badge variant="outline" className={cn("shrink-0", tone.badge)}>{asset.typeLabel}</Badge>
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
