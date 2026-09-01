import { useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Download, ExternalLink, Loader2 } from "lucide-react";
import {
  getDramaEpisodeAssembly,
  startDramaEpisodeAssembly,
  type DramaBatchProgress,
  type DramaEpisodeAssemblyStatus,
} from "@/api/media/drama";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

const ASSEMBLY_PHASE_LABELS: Record<string, string> = {
  prepare: "准备素材",
  audio: "规范化配音",
  render: "生成画面",
  mux: "封装成片",
  done: "已完成",
};

export interface DramaEpisodeAssemblyPanelProps {
  projectId: string;
  order: number;
  hasShots: boolean;
  busy: boolean;
  buttonLabel?: string;
  doneButtonLabel?: string;
  prepare?: () => Promise<void>;
}

export interface DramaEpisodeAssemblyController {
  burnSubtitles: boolean;
  setBurnSubtitles: Dispatch<SetStateAction<boolean>>;
  includeCards: boolean;
  setIncludeCards: Dispatch<SetStateAction<boolean>>;
  status: DramaEpisodeAssemblyStatus | undefined;
  activeJob: DramaEpisodeAssemblyStatus["activeJob"];
  assembled: DramaEpisodeAssemblyStatus["assembled"];
  running: boolean;
  progress: DramaBatchProgress | null;
  progressPhase: string;
  total: number;
  done: number;
  percent: number;
  clips: DramaEpisodeAssemblyStatus["clips"] | undefined;
  renderProfile: NonNullable<DramaEpisodeAssemblyStatus["renderProfile"]>;
  busy: boolean;
  isPending: boolean;
  start: () => void;
}

export function useDramaEpisodeAssembly(props: Omit<DramaEpisodeAssemblyPanelProps, "buttonLabel" | "doneButtonLabel">): DramaEpisodeAssemblyController {
  const queryClient = useQueryClient();
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [includeCards, setIncludeCards] = useState(true);
  const assemblyQuery = useQuery({
    queryKey: queryKeys.drama.episodeAssembly(props.projectId, props.order),
    queryFn: () => getDramaEpisodeAssembly(props.projectId, props.order),
    enabled: props.order > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.data;
      return status?.activeJob || status?.assembled?.status === "assembling" ? 2500 : false;
    },
  });
  const status: DramaEpisodeAssemblyStatus | undefined = assemblyQuery.data?.data;
  const activeJob = status?.activeJob ?? null;
  const assembled = status?.assembled ?? null;
  const running = Boolean(activeJob) || assembled?.status === "assembling";

  const startMutation = useMutation({
    mutationFn: async () => {
      await props.prepare?.();
      return startDramaEpisodeAssembly(props.projectId, props.order, {
        burnSubtitles,
        includeTitleCard: includeCards,
        includeEndCard: includeCards,
      });
    },
    onSuccess: () => {
      toast.success("合成已开始，完成后可直接播放或下载。");
      void queryClient.invalidateQueries({ queryKey: queryKeys.drama.episodeAssembly(props.projectId, props.order) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(props.projectId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || "合成启动失败。");
    },
  });

  const progress = activeJob ? parseBatchProgress(activeJob.progress) : null;
  const progressPhase = progress?.phase ? ASSEMBLY_PHASE_LABELS[progress.phase] ?? progress.phase : "";
  const total = Math.max(0, progress?.total ?? 0);
  const done = Math.max(0, progress?.done ?? 0);
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const clips = status?.clips;
  const renderProfile = status?.renderProfile ?? { id: "720p" as const, width: 1280, height: 720, fps: 24 };

  return {
    burnSubtitles,
    setBurnSubtitles,
    includeCards,
    setIncludeCards,
    status,
    activeJob,
    assembled,
    running,
    progress,
    progressPhase,
    total,
    done,
    percent,
    clips,
    renderProfile,
    busy: props.busy,
    isPending: startMutation.isPending,
    start: () => startMutation.mutate(),
  };
}

export function DramaEpisodeAssemblyButton(props: {
  controller: DramaEpisodeAssemblyController;
  hasShots: boolean;
  buttonLabel?: string;
  doneButtonLabel?: string;
}) {
  const { controller } = props;

  return (
    <Button
      type="button"
      size="sm"
      disabled={controller.busy || controller.running || !props.hasShots || controller.isPending}
      onClick={controller.start}
    >
      {controller.isPending || controller.running ? (
        <Loader2 className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        <Clapperboard className="h-4 w-4" />
      )}
      {controller.isPending
        ? "准备素材中..."
        : controller.running
          ? "合成中..."
          : controller.assembled?.status === "done"
        ? props.doneButtonLabel ?? "合成"
        : props.buttonLabel ?? "合成"}
    </Button>
  );
}

export function DramaEpisodeAssemblyResultPanel(props: {
  controller: DramaEpisodeAssemblyController;
  hasShots: boolean;
  buttonLabel?: string;
  doneButtonLabel?: string;
  showActionButton?: boolean;
}) {
  const { controller } = props;
  const showActionButton = props.showActionButton ?? true;
  const assembled = controller.assembled;
  const assemblyStatus = controller.status;
  const videoReady =
    !controller.running && assembled?.status === "done" && Boolean(assembled.videoUrl);

  const settingsSection = (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">合成设置</h3>
        {showActionButton ? (
          <DramaEpisodeAssemblyButton
            controller={controller}
            hasShots={props.hasShots}
            buttonLabel={props.buttonLabel}
            doneButtonLabel={props.doneButtonLabel}
          />
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 transition hover:border-primary/40 focus-within:ring-2 focus-within:ring-ring">
          <input
            type="checkbox"
            checked={controller.burnSubtitles}
            disabled={controller.running}
            onChange={(event) => controller.setBurnSubtitles(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">字幕写入视频</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">开启后字幕直接显示在画面中；关闭后仍可下载 SRT 字幕文件。</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 transition hover:border-primary/40 focus-within:ring-2 focus-within:ring-ring">
          <input
            type="checkbox"
            checked={controller.includeCards}
            disabled={controller.running}
            onChange={(event) => controller.setIncludeCards(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">片头和片尾</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">加入显示本集标题的片头，以及“敬请期待下集”的片尾。</span>
          </span>
        </label>
      </div>
    </section>
  );

  const overviewSection = assemblyStatus && props.hasShots ? (
    <section>
      <h3 className="text-sm font-semibold text-foreground">合成概览</h3>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
          <div>镜头</div>
          <div className="mt-1 text-sm font-medium text-foreground">{assemblyStatus.shotCount ?? 0} 个</div>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
          <div>视频片段</div>
          <div className="mt-1 text-sm font-medium text-foreground">{controller.clips?.withVideoClip ?? 0} 个</div>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
          <div>分镜画面兜底</div>
          <div className="mt-1 text-sm font-medium text-foreground">{controller.clips?.withKeyframeOnly ?? 0} 个</div>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
          <div>缺少配音</div>
          <div className="mt-1 text-sm font-medium text-foreground">{assemblyStatus.withoutAudioShotCount ?? 0} 镜</div>
        </div>
      </div>
    </section>
  ) : null;

  return (
    <Card className="overflow-hidden rounded-3xl">
      {videoReady && assembled ? (
        <>
          <div className="bg-muted/20 p-2 sm:p-3">
            <div className="overflow-hidden rounded-2xl border border-border bg-background">
              <video controls preload="metadata" src={assembled.videoUrl} className="block aspect-video w-full object-contain" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                时长 <span className="font-medium text-foreground">{formatAsmDuration(assembled.durationSec)}</span>
              </span>
              <span>
                镜头 <span className="font-medium text-foreground">{assembled.shotCount ?? 0} 个</span>
              </span>
              <span>
                字幕 <span className="font-medium text-foreground">{assembled.burnedSubtitles ? "已写入视频" : "独立字幕文件"}</span>
              </span>
              <span>
                生成于{" "}
                <span className="font-medium text-foreground">
                  {assembled.generatedAt ? new Date(assembled.generatedAt).toLocaleString() : "—"}
                </span>
              </span>
              <Badge variant="outline">
                横屏 16:9 · {controller.renderProfile.width}×{controller.renderProfile.height}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {assembled.srtUrl ? (
                <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={assembled.srtUrl}>
                  <Download className="h-4 w-4" />下载字幕（SRT）
                </a>
              ) : null}
              <a
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                href={assembled.videoUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="h-4 w-4" />新窗口打开
              </a>
            </div>
          </div>
          {assembled.warnings?.length ? (
            <div className="mx-4 mb-4 rounded-xl border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
              {assembled.warnings.map((warning, index) => <div key={index}>· {warning}</div>)}
            </div>
          ) : null}
        </>
      ) : (
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-lg">视频合成</CardTitle>
              <CardDescription>为当前章节生成横屏 16:9 视频和字幕文件。</CardDescription>
            </div>
            <Badge variant="outline">
              横屏 16:9 · {controller.renderProfile.width}×{controller.renderProfile.height}
            </Badge>
          </div>
        </CardHeader>
      )}
      <CardContent className="space-y-5">
        {settingsSection}
        {overviewSection}
        {controller.status && props.hasShots && (controller.clips?.withoutVisual || controller.status.withoutAudioShotCount) ? (
          <div className="rounded-xl border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
            点击合成会先补齐缺失画面和配音，再开始生成视频。
          </div>
        ) : null}
        {controller.running ? (
          <section className="rounded-xl border border-border p-4" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">合成进度{controller.progressPhase ? ` · ${controller.progressPhase}` : ""}</h3>
              <Badge variant="outline">{controller.percent}%</Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${controller.percent}%` }} />
            </div>
            {controller.total > 0 ? <div className="mt-2 text-xs text-muted-foreground">{controller.done}/{controller.total} 个片段</div> : null}
            {controller.progress?.failed ? <div className="mt-2 text-xs text-destructive">{controller.progress.failed} 个镜头降级处理，详情见合成结果。</div> : null}
          </section>
        ) : null}
        {!controller.running && controller.assembled?.status === "error" ? (
          <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
            <div className="font-medium">上次合成失败</div>
            <div className="mt-1">{controller.assembled.error || "未知原因"}。可重新合成再试。</div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DramaEpisodeAssemblyPanel(props: DramaEpisodeAssemblyPanelProps) {
  const controller = useDramaEpisodeAssembly(props);
  return (
    <DramaEpisodeAssemblyResultPanel
      controller={controller}
      hasShots={props.hasShots}
      buttonLabel={props.buttonLabel}
      doneButtonLabel={props.doneButtonLabel}
    />
  );
}

function formatAsmDuration(totalSeconds?: number): string {
  const value = Number(totalSeconds);
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.round((value % 60) * 10) / 10;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

function parseBatchProgress(raw: string | null | undefined): DramaBatchProgress {
  if (!raw?.trim()) {
    return { total: 0, done: 0, failed: 0, skipped: 0, failedShotIds: [], errors: [] };
  }
  try {
    return JSON.parse(raw) as DramaBatchProgress;
  } catch {
    return { total: 0, done: 0, failed: 0, skipped: 0, failedShotIds: [], errors: [] };
  }
}
