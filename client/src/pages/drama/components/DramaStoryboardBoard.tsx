import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, LayoutGrid, Loader2, Maximize2 } from "lucide-react";
import type { DramaShot, DramaShotKeyframeData, DramaStoryboard } from "@/api/media/drama";
import { updateDramaShot } from "@/api/media/drama";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { LightboxOverlay } from "@/components/common/LightboxImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface DramaStoryboardBoardProps {
  projectId: string;
  storyboard: DramaStoryboard;
  onShotUpdated?: () => void;
  busy: boolean;
  keyframePending: boolean;
  imageProviderReady: boolean;
  batchActive: boolean;
  onGenerateKeyframe: (shot: DramaShot) => void;
  onBatchKeyframes: (shotIds: string[]) => void;
}

type BoardZoom = "comfortable" | "large";

const EMPTY_KEYFRAME: DramaShotKeyframeData = { status: "idle" };

function safeJson<T>(input: string | null | undefined, fallback: T): T {
  if (!input) {
    return fallback;
  }
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function parseKeyframe(raw: string | null | undefined): DramaShotKeyframeData {
  return safeJson<DramaShotKeyframeData>(raw, EMPTY_KEYFRAME);
}

function parseCharacterRefs(raw: string | null | undefined): string[] {
  const refs = safeJson<string[]>(raw, []);
  return refs.filter((item) => typeof item === "string" && item.trim()).slice(0, 6);
}

// 每镜角色状态标注（[{name,state}]）：角色在这一镜所处的外观状态
function parseShotStates(raw: string | null | undefined): Map<string, string> {
  const entries = safeJson<Array<{ name?: unknown; state?: unknown }>>(raw, []);
  const map = new Map<string, string>();
  if (!Array.isArray(entries)) {
    return map;
  }
  for (const entry of entries) {
    if (typeof entry?.name === "string" && typeof entry?.state === "string" && entry.state.trim()) {
      map.set(entry.name.trim(), entry.state.trim());
    }
  }
  return map;
}

function formatLocalTime(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function DramaStoryboardBoard(props: DramaStoryboardBoardProps) {
  const shots = props.storyboard.shots ?? [];
  const [zoom, setZoom] = useState<BoardZoom>("comfortable");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionStoryboardIdRef = useRef(props.storyboard.id);
  const [previewShot, setPreviewShot] = useState<DramaShot | null>(null);
  const [gridPreviewOpen, setGridPreviewOpen] = useState(false);

  useEffect(() => {
    if (selectionStoryboardIdRef.current !== props.storyboard.id) {
      selectionStoryboardIdRef.current = props.storyboard.id;
      setSelectedIds(new Set());
      return;
    }
    const currentShotIds = new Set(shots.map((shot) => shot.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((shotId) => currentShotIds.has(shotId)));
      return next.size === current.size ? current : next;
    });
  }, [props.storyboard.id, shots]);

  const shotsWithState = useMemo(
    () => shots.map((shot) => ({ shot, keyframe: parseKeyframe(shot.keyframeData) })),
    [shots],
  );
  const ungeneratedIds = shotsWithState
    .filter((item) => item.keyframe.status !== "done")
    .map((item) => item.shot.id);
  const failedIds = shotsWithState
    .filter((item) => item.keyframe.status === "error")
    .map((item) => item.shot.id);
  const doneShots = shotsWithState.filter((item) => item.keyframe.status === "done" && item.keyframe.url);

  const toggleSelected = (shotId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(shotId)) {
        next.delete(shotId);
      } else {
        next.add(shotId);
      }
      return next;
    });
  };
  const selectIds = (ids: string[]) => setSelectedIds(new Set(ids));

  const generateDisabled = (keyframe: DramaShotKeyframeData) =>
    props.busy || props.keyframePending || !props.imageProviderReady || keyframe.status === "generating";

  const gridClassName = zoom === "large"
    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
    : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" type="button" variant="ghost" onClick={() => selectIds(shots.map((shot) => shot.id))}>
            全选
          </Button>
          <Button
            size="sm"
            type="button"
            variant="ghost"
            disabled={ungeneratedIds.length === 0}
            onClick={() => selectIds(ungeneratedIds)}
          >
            选未生成 ({ungeneratedIds.length})
          </Button>
          <Button
            size="sm"
            type="button"
            variant="ghost"
            disabled={failedIds.length === 0}
            onClick={() => selectIds(failedIds)}
          >
            选失败 ({failedIds.length})
          </Button>
          {selectedIds.size > 0 ? (
            <Button size="sm" type="button" variant="ghost" onClick={() => selectIds([])}>
              清空选择
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">已选 {selectedIds.size} 个镜头</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            type="button"
            variant="outline"
            disabled={doneShots.length === 0}
            onClick={() => setGridPreviewOpen(true)}
          >
            <LayoutGrid className="h-4 w-4" />
            宫格预览
          </Button>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => setZoom((prev) => (prev === "comfortable" ? "large" : "comfortable"))}
          >
            {zoom === "comfortable" ? "大图模式" : "标准模式"}
          </Button>
          <AiButton
            size="sm"
            type="button"
            variant="outline"
            disabled={props.batchActive || props.busy || selectedIds.size === 0 || !props.imageProviderReady}
            onClick={() => props.onBatchKeyframes([...selectedIds])}
          >
            生成所选画面
          </AiButton>
        </div>
      </div>

      {shots.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          当前分镜还没有镜头。
        </div>
      ) : (
        <div className={cn("grid gap-3", gridClassName)}>
          {shotsWithState.map(({ shot, keyframe }) => {
            const characters = parseCharacterRefs(shot.characterRefs);
            const selected = selectedIds.has(shot.id);
            return (
              <div
                key={shot.id}
                className={cn(
                  "flex flex-col overflow-hidden rounded-lg border transition-colors",
                  selected ? "border-primary/50 ring-1 ring-primary/30" : "hover:border-primary/30",
                )}
              >
                <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelected(shot.id)}
                    aria-label={`选择镜头 ${shot.order}`}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="font-medium">镜头 {shot.order}</span>
                  {shot.shotSize ? <Badge variant="secondary">{shot.shotSize}</Badge> : null}
                  {shot.durationSec ? <span className="ml-auto text-xs text-muted-foreground">{shot.durationSec}s</span> : null}
                </label>

                <ShotKeyframeArea
                  shot={shot}
                  keyframe={keyframe}
                  onPreview={() => setPreviewShot(shot)}
                  onGenerate={() => props.onGenerateKeyframe(shot)}
                  generateDisabled={generateDisabled(keyframe)}
                />

                <div className="flex flex-1 flex-col gap-2 p-3">
                  {characters.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        const stateByName = parseShotStates(shot.characterStates);
                        return characters.map((name) => {
                          const state = stateByName.get(name.trim());
                          return state ? (
                            <Badge
                              key={name}
                              className="bg-amber-500/15 text-[11px] text-amber-700 hover:bg-amber-500/25 dark:text-amber-400"
                              title={`${name} 当前处于「${state}」状态`}
                            >
                              {name}·{state}
                            </Badge>
                          ) : (
                            <Badge key={name} variant="secondary" className="text-[11px]">{name}</Badge>
                          );
                        });
                      })()}
                    </div>
                  ) : null}
                  <p className="line-clamp-3 text-sm leading-5 text-foreground/90">{shot.action}</p>
                  {shot.dialogue ? (
                    <p className="line-clamp-1 text-xs text-muted-foreground">「{shot.dialogue}」</p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      type="button"
                      variant={keyframe.status === "done" ? "outline" : "default"}
                      disabled={generateDisabled(keyframe)}
                      onClick={() => props.onGenerateKeyframe(shot)}
                    >
                      {keyframe.status === "generating" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImageIcon className="h-4 w-4" />
                      )}
                      {keyframe.status === "done" ? "重生成画面" : keyframe.status === "generating" ? "生成中" : "生成画面"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ShotPreviewDialog
        shot={previewShot}
        keyframe={previewShot ? parseKeyframe(previewShot.keyframeData) : EMPTY_KEYFRAME}
        projectId={props.projectId}
        onShotUpdated={props.onShotUpdated}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewShot(null);
          }
        }}
        onGenerate={() => {
          if (previewShot) {
            props.onGenerateKeyframe(previewShot);
          }
        }}
        generateDisabled={previewShot ? generateDisabled(parseKeyframe(previewShot.keyframeData)) : true}
      />

      <Dialog open={gridPreviewOpen} onOpenChange={setGridPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>宫格预览</DialogTitle>
            <DialogDescription>已生成分镜画面的镜头总览，点击任意一页可以放大查看。</DialogDescription>
          </DialogHeader>
          {doneShots.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">暂无可预览的画面图。</div>
          ) : (
            <div className="grid max-h-[65vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
              {doneShots.map(({ shot, keyframe }) => (
                <button
                  key={shot.id}
                  type="button"
                  className="group relative overflow-hidden rounded-md border"
                  onClick={() => {
                    setGridPreviewOpen(false);
                    setPreviewShot(shot);
                  }}
                >
                  <img
                    src={keyframe.url}
                    alt={`镜头 ${shot.order} 画面`}
                    className="aspect-video w-full object-cover"
                  />
                  <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1.5 py-0.5 text-[11px] text-foreground">
                    镜头 {shot.order}
                  </span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShotKeyframeArea(props: {
  shot: DramaShot;
  keyframe: DramaShotKeyframeData;
  onPreview: () => void;
  onGenerate: () => void;
  generateDisabled: boolean;
}) {
  const { keyframe } = props;
  const aspectClass = "aspect-video";

  if (keyframe.status === "done" && keyframe.url) {
    return (
      <button type="button" className="group relative block w-full" onClick={props.onPreview} aria-label={`放大查看镜头 ${props.shot.order} 画面`}>
        <img
          src={keyframe.url}
          alt={`镜头 ${props.shot.order} 画面`}
          className={cn("w-full object-cover", aspectClass)}
        />
        <span className="absolute left-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
          v{keyframe.version ?? 1}
        </span>
        <span className="absolute inset-0 flex items-center justify-center bg-background/0 text-transparent transition-colors group-hover:bg-background/20 group-hover:text-foreground">
          <Maximize2 className="h-5 w-5" />
        </span>
      </button>
    );
  }

  if (keyframe.status === "generating") {
    return (
      <div className={cn("flex w-full flex-col items-center justify-center gap-2 bg-muted/40 text-xs text-muted-foreground", aspectClass)}>
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span>画面生成中</span>
      </div>
    );
  }

  if (keyframe.status === "error") {
    return (
      <div className={cn("flex w-full flex-col items-center justify-center gap-2 border-destructive/30 bg-destructive/5 px-3 text-center", aspectClass)}>
        <span className="text-xs font-medium text-destructive">画面生成失败</span>
        {keyframe.error ? <span className="line-clamp-2 text-[11px] text-destructive/80">{keyframe.error}</span> : null}
        <Button size="sm" type="button" variant="outline" disabled={props.generateDisabled} onClick={props.onGenerate}>
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex w-full flex-col items-center justify-center gap-2 border-dashed bg-muted/20 text-xs text-muted-foreground", aspectClass)}>
      <ImageIcon className="h-5 w-5 opacity-60" />
      <span>未生成画面</span>
    </div>
  );
}

function ShotPreviewDialog(props: {
  shot: DramaShot | null;
  keyframe: DramaShotKeyframeData;
  projectId: string;
  onShotUpdated?: () => void;
  onOpenChange: (open: boolean) => void;
  onGenerate: () => void;
  generateDisabled: boolean;
}) {
  const shot = props.shot;
  const characters = shot ? parseCharacterRefs(shot.characterRefs) : [];
  const history = [...(props.keyframe.history ?? [])].sort((left, right) => right.version - left.version);
  const [keyframeLightboxOpen, setKeyframeLightboxOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ action: "", dialogue: "", shotSize: "", location: "", durationSec: "" });
  const queryClient = useQueryClient();

  const startEditing = () => {
    if (!shot) return;
    setDraft({
      action: shot.action ?? "",
      dialogue: shot.dialogue ?? "",
      shotSize: shot.shotSize ?? "",
      location: shot.location ?? "",
      durationSec: shot.durationSec != null ? String(shot.durationSec) : "",
    });
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!shot) throw new Error("镜头不存在。");
      const durationSec = draft.durationSec.trim() ? Number(draft.durationSec) : undefined;
      return updateDramaShot(props.projectId, shot.id, {
        action: draft.action.trim(),
        dialogue: draft.dialogue.trim(),
        shotSize: draft.shotSize.trim(),
        location: draft.location.trim(),
        ...(durationSec !== undefined && Number.isFinite(durationSec) ? { durationSec } : {}),
      });
    },
    onSuccess: async () => {
      toast.success("镜头已更新。台词有改动时，配音工作台会把对应段落标记为需重配。");
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(props.projectId) });
      props.onShotUpdated?.();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存镜头失败，请重试。"),
  });

  return (
    <Dialog open={Boolean(shot)} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>镜头 {shot?.order ?? ""} · {shot?.shotSize || "景别待定"}</DialogTitle>
          <DialogDescription>
            {[shot?.durationSec ? `${shot.durationSec} 秒` : null, shot?.location]
              .filter(Boolean)
              .join(" · ") || "查看画面与提示词详情。"}
          </DialogDescription>
        </DialogHeader>

        {shot ? (
          <div className="space-y-3">
            {props.keyframe.status === "done" && props.keyframe.url ? (
              <button
                type="button"
                title="点击查看大图"
                className="block w-full cursor-zoom-in p-0"
                onClick={() => setKeyframeLightboxOpen(true)}
              >
                <img
                  src={props.keyframe.url}
                  alt={`镜头 ${shot.order} 画面`}
                  className="max-h-[60vh] w-full rounded-md border object-contain"
                />
              </button>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                {props.keyframe.status === "generating" ? "画面生成中" : props.keyframe.status === "error" ? "画面生成失败" : "尚未生成画面"}
              </div>
            )}

            {characters.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {characters.map((name) => (
                  <Badge key={name} variant="secondary">{name}</Badge>
                ))}
              </div>
            ) : null}

            {editing ? (
              <div className="space-y-2.5 rounded-md border bg-muted/20 p-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">动作（这一镜发生了什么）</label>
                  <textarea
                    value={draft.action}
                    onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))}
                    className="min-h-16 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">台词（改过后配音需重配）</label>
                  <textarea
                    value={draft.dialogue}
                    onChange={(event) => setDraft((current) => ({ ...current, dialogue: event.target.value }))}
                    placeholder="无对白的镜头留空"
                    className="min-h-14 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">景别</label>
                    <Input
                      value={draft.shotSize}
                      onChange={(event) => setDraft((current) => ({ ...current, shotSize: event.target.value }))}
                      placeholder="如：近景"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">场景</label>
                    <Input
                      value={draft.location}
                      onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))}
                      placeholder="如：天台"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">时长（秒）</label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={draft.durationSec}
                      onChange={(event) => setDraft((current) => ({ ...current, durationSec: event.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button type="button" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !draft.action.trim()}>
                    {saveMutation.isPending ? "保存中…" : "保存修改"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saveMutation.isPending}>
                    取消
                  </Button>
                </div>
              </div>
            ) : (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm leading-6">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">镜头内容</span>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-xs text-primary underline-offset-4 hover:underline"
                  onClick={startEditing}
                >
                  编辑
                </button>
              </div>
              {shot.action ? <p>{shot.action}</p> : null}
              {shot.dialogue ? <p className="text-muted-foreground">「{shot.dialogue}」</p> : null}
              {shot.visualPrompt ? (
                <div className="text-xs leading-5 text-muted-foreground">
                  <div className="mb-1 font-medium text-foreground">画面提示词</div>
                  {shot.visualPrompt}
                </div>
              ) : null}
              {props.keyframe.status === "error" && props.keyframe.error ? (
                <div className="text-xs text-destructive">{props.keyframe.error}</div>
              ) : null}
            </div>
            )}

            {history.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">历史画面：</span>
                {history.map((item) => item.url ? (
                  <a
                    key={`${item.version}-${item.url}`}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border px-2 py-1 text-primary underline-offset-4 hover:underline"
                    title={formatLocalTime(item.generatedAt)}
                  >
                    v{item.version}
                  </a>
                ) : (
                  <span key={item.version} className="rounded-md border px-2 py-1 text-muted-foreground">v{item.version}</span>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={props.keyframe.status === "done" ? "outline" : "default"}
                disabled={props.generateDisabled}
                onClick={props.onGenerate}
              >
                <ImageIcon className="h-4 w-4" />
                {props.keyframe.status === "done" ? "重生成画面" : "生成画面"}
              </Button>
            </div>
          </div>
        ) : null}
        {props.keyframe.status === "done" && props.keyframe.url ? (
          <LightboxOverlay
            open={keyframeLightboxOpen}
            src={props.keyframe.url}
            alt={`镜头 ${shot?.order ?? ""} 画面`}
            caption={`${shot?.shotSize || ""}${shot?.durationSec ? ` · ${shot.durationSec} 秒` : ""}`}
            onClose={() => setKeyframeLightboxOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
