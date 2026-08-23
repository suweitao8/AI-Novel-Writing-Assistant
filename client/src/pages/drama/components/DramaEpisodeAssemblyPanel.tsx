import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Download, ExternalLink } from "lucide-react";
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
}

export function DramaEpisodeAssemblyPanel(props: DramaEpisodeAssemblyPanelProps) {
  const queryClient = useQueryClient();
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [includeCards, setIncludeCards] = useState(true);
  const assemblyQuery = useQuery({
    queryKey: queryKeys.drama.episodeAssembly(props.projectId, props.order),
    queryFn: () => getDramaEpisodeAssembly(props.projectId, props.order),
    enabled: true,
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
    mutationFn: () => startDramaEpisodeAssembly(props.projectId, props.order, {
      burnSubtitles,
      includeTitleCard: includeCards,
      includeEndCard: includeCards,
    }),
    onSuccess: () => {
      toast.success("合成已开始，完成后可直接在下方播放或下载。");
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
  const renderProfile = status?.renderProfile ?? { width: 1280, height: 720 };

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-lg">整集合成</CardTitle>
        <CardDescription>生成横屏 16:9 成片和配套字幕。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">当前输出：横屏 16:9 · {renderProfile.width}×{renderProfile.height}</div>
        {status && props.hasShots ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>共 {status.shotCount} 个镜头</span>
            {clips?.withVideoClip ? <span>视频片段 {clips.withVideoClip}</span> : null}
            {clips?.withKeyframeOnly ? <span>首帧图兜底 {clips.withKeyframeOnly}</span> : null}
            {clips?.withoutVisual ? <span>占位画面 {clips.withoutVisual}</span> : null}
            {status.withoutAudioShotCount ? <span>缺配音 {status.withoutAudioShotCount}（将静音）</span> : null}
          </div>
        ) : null}
        {status && props.hasShots && (clips?.withoutVisual || status.withoutAudioShotCount) ? (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            缺少的画面或配音会在合成时自动补齐。
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={burnSubtitles}
              disabled={running}
              onChange={(event) => setBurnSubtitles(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>字幕烧进画面</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeCards}
              disabled={running}
              onChange={(event) => setIncludeCards(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>片头片尾卡</span>
          </label>
          <Button
            type="button"
            disabled={props.busy || running || !props.hasShots || startMutation.isPending}
            onClick={() => startMutation.mutate()}
          >
            <Clapperboard className="h-4 w-4" />
            {assembled?.status === "done"
              ? props.doneButtonLabel ?? "重新合成整集"
              : props.buttonLabel ?? "合成整集"}
          </Button>
        </div>

        {running ? (
          <div className="rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">正在合成{progressPhase ? ` · ${progressPhase}` : ""}</div>
              <Badge variant="outline">{percent}%</Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            {total > 0 ? <div className="mt-2 text-xs text-muted-foreground">{done}/{total} 个片段</div> : null}
            {progress?.failed ? <div className="mt-2 text-xs text-destructive">{progress.failed} 个镜头降级处理，详情见合成结果。</div> : null}
          </div>
        ) : null}

        {!running && assembled?.status === "error" ? (
          <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            上次合成失败：{assembled.error || "未知原因"}。可重新合成再试。
          </div>
        ) : null}

        {!running && assembled?.status === "done" && assembled.videoUrl ? (
          <div className="space-y-3">
            <video controls preload="metadata" src={assembled.videoUrl} className="mx-auto aspect-video w-full max-w-3xl rounded-md border object-contain" />
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>时长 {formatAsmDuration(assembled.durationSec)}</span>
              {assembled.shotCount ? <span>{assembled.shotCount} 个镜头</span> : null}
              <span>{assembled.burnedSubtitles ? "字幕已烧录" : "字幕外挂"}</span>
              {assembled.generatedAt ? <span>生成于 {new Date(assembled.generatedAt).toLocaleString()}</span> : null}
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
            {assembled.warnings?.length ? (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                {assembled.warnings.map((warning, index) => <div key={index}>· {warning}</div>)}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
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
