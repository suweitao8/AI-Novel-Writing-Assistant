import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import type { StoryAssetPresentation, StoryAssetStatePresentation } from "./storyAssetPresentation";

export interface StoryAssetDetailDialogProps {
  asset: StoryAssetPresentation | null;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}

function StateRow({ state }: { state: StoryAssetStatePresentation }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/30 p-3">
      {state.imageUrl ? (
        <img
          src={state.imageUrl}
          alt={`${state.label} 状态图`}
          className="h-16 w-24 shrink-0 rounded-md border border-border object-cover"
        />
      ) : null}
      <div className="min-w-0 space-y-1.5 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">{state.label}</span>
          {state.ageLabel ? <Badge variant="secondary" className="text-[11px]">{state.ageLabel}</Badge> : null}
          {state.sceneTypeLabel ? <Badge variant="secondary" className="text-[11px]">{state.sceneTypeLabel}</Badge> : null}
          {state.timeOfDayLabel ? <Badge variant="secondary" className="text-[11px]">{state.timeOfDayLabel}</Badge> : null}
          {state.weatherLabel ? <Badge variant="secondary" className="text-[11px]">{state.weatherLabel}</Badge> : null}
          {state.chapterLabel ? <span className="text-xs text-muted-foreground">{state.chapterLabel}</span> : null}
        </div>
        {state.description ? <p className="whitespace-pre-wrap leading-5 text-muted-foreground">{state.description}</p> : null}
        {state.imagePrompt ? <DetailRow label="画面提示词" value={state.imagePrompt} /> : null}
        {state.voicePrompt ? <DetailRow label="音色提示词" value={state.voicePrompt} /> : null}
        {state.voiceSampleUrl ? (
          <audio controls preload="none" className="h-8 max-w-full" aria-label={`${state.label} 音色试听`}>
            <source src={state.voiceSampleUrl} />
          </audio>
        ) : null}
      </div>
    </div>
  );
}

export function StoryAssetDetailDialog({
  asset,
  onOpenChange,
  onEdit,
  onDelete,
  deleting = false,
}: StoryAssetDetailDialogProps) {
  return (
    <Dialog open={asset !== null} onOpenChange={onOpenChange}>
      {asset ? (
        <AppDialogContent
          className="max-w-5xl"
          title={asset.name}
          description={asset.typeLabel}
          bodyClassName="space-y-5"
          footer={(
            <>
              {onDelete ? (
                <Button type="button" variant="destructive" size="sm" onClick={onDelete} disabled={deleting}>
                  {deleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                  {deleting ? "删除中..." : "删除"}
                </Button>
              ) : null}
              {onEdit ? (
                <Button type="button" variant="outline" size="sm" onClick={onEdit} disabled={deleting}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />编辑
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={deleting}>关闭</Button>
            </>
          )}
          footerClassName="gap-2"
        >
          <div className="flex flex-wrap gap-1.5">
            {asset.badges.map((badge) => <Badge key={badge} variant="secondary">{badge}</Badge>)}
            <Badge variant="outline">{asset.states.length > 0 ? `${asset.states.length} 个状态` : "暂无状态"}</Badge>
          </div>

          {asset.media ? (
            <div className="rounded-lg border border-border bg-muted/20 p-2">
              <img src={asset.media.url} alt={asset.media.alt} className="max-h-64 w-full rounded-md object-contain" />
            </div>
          ) : null}

          {asset.details.length > 0 ? (
            <section className="space-y-3" aria-label="资产基础信息">
              <h3 className="text-sm font-semibold text-foreground">基础信息</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {asset.details.map((detail) => <DetailRow key={`${detail.label}-${detail.value}`} {...detail} />)}
              </div>
            </section>
          ) : null}

          <section className="space-y-3" aria-label="资产状态">
            <h3 className="text-sm font-semibold text-foreground">外观状态</h3>
            {asset.states.length > 0 ? (
              <div className="space-y-2">{asset.states.map((state) => <StateRow key={state.id} state={state} />)}</div>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">暂无状态信息</p>
            )}
          </section>
        </AppDialogContent>
      ) : null}
    </Dialog>
  );
}
