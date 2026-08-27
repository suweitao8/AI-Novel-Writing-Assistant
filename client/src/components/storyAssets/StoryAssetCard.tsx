import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StoryAssetPreview } from "./StoryAssetPreview";
import type { StoryAssetImageStatus, StoryAssetPresentation } from "./storyAssetPresentation";

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

function AssetImageStatusBadge({
  status,
  error,
}: {
  status: StoryAssetImageStatus | null;
  error: string;
}) {
  if (status === "generating") {
    return (
      <Badge variant="outline" className="gap-1 border-primary/50 bg-primary/10 text-[11px] text-primary">
        <LoaderCircle aria-hidden="true" className="h-3 w-3 animate-spin" />
        生成中
      </Badge>
    );
  }

  if (status === "error" && error) {
    return (
      <Badge
        variant="outline"
        title={error}
        className="border-destructive/50 bg-destructive/10 text-[11px] text-destructive"
      >
        生成失败
      </Badge>
    );
  }

  return null;
}

export function StoryAssetCard({
  asset,
  compact = false,
  onOpen,
  actions,
  className,
}: StoryAssetCardProps) {
  const tone = KIND_TONES[asset.kind];
  const defaultState = asset.states.find((state) => state.label.trim() === "默认") ?? asset.states[0];
  const imageStatus = defaultState?.imageStatus === "error" && !defaultState?.imageError
    ? null
    : defaultState?.imageStatus ?? null;
  const stateLabel = defaultState?.label.trim() || "暂无状态";
  const stateCountLabel = asset.states.length > 0 ? `${asset.states.length} 个状态` : "暂无状态";
  return (
    <Card className={cn("min-w-0", tone.card, className)}>
      <CardContent className="p-2.5">
        <div className={cn(compact ? "flex items-start gap-2" : "relative")}>
          <button
            type="button"
            className={cn(
              compact
                ? "flex min-w-0 flex-1 items-stretch gap-3 rounded-md text-left outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                : "group block w-full rounded-lg text-left outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring",
            )}
            onClick={onOpen}
            aria-label={`查看${asset.typeLabel}「${asset.name}」详情`}
          >
            <StoryAssetPreview
              preview={asset.preview}
              status={imageStatus}
              className={compact ? "w-24 shrink-0" : "w-full"}
            />
            {compact ? (
              <span className="min-w-0 flex-1 py-1">
                <span className="flex min-w-0 items-start gap-2">
                  <Badge variant="outline" className={cn("shrink-0", tone.badge)}>{asset.typeLabel}</Badge>
                  <span className="min-w-0 truncate font-medium text-foreground">{asset.name}</span>
                </span>
                {/* 侧栏卡片只保留图片、名称、状态数与少量概要标签（2026-08-26 用户要求） */}
                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[11px]">{stateCountLabel}</Badge>
                  {asset.badges.map((badge) => (
                    <Badge key={badge} variant="secondary" className="text-[11px]">{badge}</Badge>
                  ))}
                  <AssetImageStatusBadge status={imageStatus} error={defaultState?.imageError ?? ""} />
                </span>
              </span>
            ) : (
              <span className="mt-2 block min-w-0">
                <span className="block truncate font-medium text-foreground">{asset.name}</span>
                <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate">{stateLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">{stateCountLabel}</span>
                  <AssetImageStatusBadge status={imageStatus} error={defaultState?.imageError ?? ""} />
                </span>
              </span>
            )}
          </button>
          {actions ? (
            <div
              className={cn(
                "flex shrink-0 items-center gap-1",
                !compact && "absolute right-1.5 top-1.5 rounded-md bg-background/80 p-0.5 backdrop-blur-sm",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              {actions}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
