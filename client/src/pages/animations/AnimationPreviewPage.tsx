import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  Crosshair,
  Loader2,
  Move3D,
  Pause,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { getAnimationLibraryEntry } from "@/config/animationLibrary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import {
  clearAnimationKeyframe,
  getAnimationKeyframe,
  setAnimationKeyframe,
  type AnimationKeyframe,
} from "./animationPreviewStorage";
import { openAnimationPreview, type AnimationPreview } from "./animationPreviewApp";

function formatTime(timeSeconds: number): string {
  return `${Math.max(0, timeSeconds).toFixed(2)} 秒`;
}

export default function AnimationPreviewPage() {
  const { animationId } = useParams<{ animationId: string }>();
  const entry = getAnimationLibraryEntry(animationId);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<AnimationPreview | null>(null);
  const [viewer, setViewer] = useState<AnimationPreview | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [status, setStatus] = useState("正在初始化 3D 视口");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(entry?.durationSeconds ?? 0);
  const [playing, setPlaying] = useState(false);
  const [keyframe, setKeyframe] = useState<AnimationKeyframe | null>(null);
  const [savingKeyframe, setSavingKeyframe] = useState(false);
  const [viewerAttempt, setViewerAttempt] = useState(0);

  useEffect(() => {
    if (!entry) {
      setKeyframe(null);
      return undefined;
    }
    setKeyframe(getAnimationKeyframe(entry.id));
    setCurrentTime(0);
    setDuration(entry.durationSeconds);
    return undefined;
  }, [entry?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !entry) return undefined;

    let cancelled = false;
    const initialKeyframe = getAnimationKeyframe(entry.id);
    setViewer(null);
    viewerRef.current = null;
    setViewerError(null);
    setStatus("正在加载动作与 HDR 场景");

    const handle = openAnimationPreview({
      canvas,
      glbUrl: entry.fileUrl,
      clipName: entry.clipName,
      initialTimeSeconds: initialKeyframe?.timeSeconds,
      onStatus: (next) => setStatus(next || "就绪"),
      onTimeChange: (nextTime, nextDuration, nextPlaying) => {
        if (cancelled) return;
        setCurrentTime(nextTime);
        setDuration(nextDuration || entry.durationSeconds);
        setPlaying(nextPlaying);
      },
      onError: (message) => {
        if (!cancelled) toast.error("动作预览失败", { description: message });
      },
    });

    handle.ready
      .then((nextViewer) => {
        if (cancelled) {
          nextViewer.destroy();
          return;
        }
        viewerRef.current = nextViewer;
        setViewer(nextViewer);
        setDuration(nextViewer.getDuration() || entry.durationSeconds);
        setCurrentTime(nextViewer.getTime());
        setPlaying(nextViewer.isPlaying());
        setStatus("就绪");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus("");
        setViewerError(error instanceof Error ? error.message : "3D 预览初始化失败。");
      });

    return () => {
      cancelled = true;
      handle.cancel();
      viewerRef.current = null;
      setViewer(null);
    };
  }, [entry?.id, viewerAttempt]);

  if (!entry) {
    return <Navigate to="/animations" replace />;
  }

  const displayDuration = duration > 0 ? duration : entry.durationSeconds;
  const timelineValue = Math.min(Math.max(currentTime, 0), displayDuration);

  const handleSetPreviewFrame = () => {
    const currentViewer = viewerRef.current;
    if (!currentViewer || savingKeyframe) return;
    setSavingKeyframe(true);
    try {
      const saved = setAnimationKeyframe(
        entry.id,
        currentViewer.capturePreviewFrame(),
        currentViewer.getTime(),
      );
      setKeyframe(saved);
      toast.success("预览帧已保存。", { description: `${formatTime(saved.timeSeconds)} 将用于动画卡片。` });
    } catch (error) {
      toast.error("预览帧保存失败。", {
        description: error instanceof Error ? error.message : "无法保存当前画面。",
      });
    } finally {
      setSavingKeyframe(false);
    }
  };

  const handleClearPreviewFrame = () => {
    clearAnimationKeyframe(entry.id);
    setKeyframe(null);
    toast.success("已恢复默认预览图。", { description: "动画卡片会重新使用自动生成的画面。" });
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden" data-animation-preview-page={entry.id}>
      <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
        <Button type="button" variant="ghost" size="icon" aria-label="返回动画库" title="返回动画库" asChild>
          <Link to="/animations">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <h1 className="min-w-0 truncate text-sm font-semibold">{entry.name}</h1>
        <Badge variant="secondary" className="ml-1 shrink-0">
          {entry.classificationLabel}
        </Badge>
        <Badge variant="outline" className="shrink-0">
          {entry.groupLabel}
        </Badge>
        <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
          {entry.packLabel}
        </Badge>
        {keyframe ? <Badge className="shrink-0">已设置预览帧</Badge> : null}
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 gap-3 overflow-hidden max-xl:overflow-y-auto xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto max-xl:min-h-[18rem]">
          <Card>
            <CardContent className="p-4">
              <dl className="space-y-2 text-xs" data-animation-info>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">文件</dt>
                  <dd className="truncate font-medium">{entry.fileUrl.split("/").at(-1)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">格式</dt>
                  <dd className="font-medium">GLB</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">时长</dt>
                  <dd className="font-medium">{formatTime(displayDuration)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">套装</dt>
                  <dd className="truncate font-medium">{entry.packLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">分类</dt>
                  <dd className="truncate font-medium">{entry.classificationLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">姿态</dt>
                  <dd className="font-medium">{entry.postureLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">演员</dt>
                  <dd className="font-medium">{entry.actorKindLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">武器</dt>
                  <dd className="font-medium">{entry.weaponTypeLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">来源</dt>
                  <dd className="font-medium">{entry.sourceLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">当前帧</dt>
                  <dd className="font-medium" data-animation-current-time>{formatTime(currentTime)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">卡片预览帧</h2>
                {keyframe ? <span className="text-[11px] text-muted-foreground">{formatTime(keyframe.timeSeconds)}</span> : null}
              </div>
              <div className="aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted" data-animation-keyframe-preview>
                {keyframe ? (
                  <img src={keyframe.dataUrl} alt={`${entry.name} 关键帧`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
                    使用时间轴选择一帧
                  </div>
                )}
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={handleSetPreviewFrame}
                disabled={!viewer || savingKeyframe}
                data-animation-set-keyframe
              >
                {savingKeyframe ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
                设为预览帧
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleClearPreviewFrame}
                disabled={!keyframe || savingKeyframe}
                data-animation-clear-keyframe
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                恢复默认预览图
              </Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => viewer?.fitView()} disabled={!viewer}>
              <Crosshair className="mr-1.5 h-4 w-4" aria-hidden="true" />
              聚焦
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => viewer?.resetView()} disabled={!viewer}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              复位视角
            </Button>
          </div>
        </aside>

        <Card className="h-full min-h-0 w-full overflow-hidden">
          <CardContent className="flex h-full min-h-0 w-full flex-col p-0">
            <div className="relative min-h-[22rem] min-w-0 flex-1">
              <canvas
                ref={canvasRef}
                aria-label={`${entry.name} 3D 预览`}
                aria-busy={!viewer}
                className="block h-full w-full touch-none bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-animation-preview-canvas
              />
              {!viewer && !viewerError ? (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {status}
                </div>
              ) : null}
              {viewerError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center">
                  <p className="text-sm text-destructive">{viewerError}</p>
                  <Button type="button" variant="outline" onClick={() => setViewerAttempt((attempt) => attempt + 1)}>
                    重新加载
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/animations">返回动画库</Link>
                  </Button>
                </div>
              ) : null}
              {viewer ? (
                <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
                  <Move3D className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />右键旋转 · 滚轮缩放
                </p>
              ) : null}
            </div>

            <div className="shrink-0 space-y-2 border-t border-border bg-card p-3" data-animation-timeline-panel>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => (playing ? viewer?.pause() : viewer?.play())}
                  disabled={!viewer}
                  aria-label={playing ? "暂停动画" : "播放动画"}
                  title={playing ? "暂停动画" : "播放动画"}
                  data-animation-play-toggle
                >
                  {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                </Button>
                <input
                  type="range"
                  min="0"
                  max={displayDuration}
                  step="0.01"
                  value={timelineValue}
                  onChange={(event) => viewer?.setTime(Number(event.target.value))}
                  disabled={!viewer || displayDuration <= 0}
                  aria-label={`${entry.name} 时间轴`}
                  className="h-2 min-w-0 flex-1 accent-primary"
                  data-animation-timeline
                />
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground" data-animation-duration>
                  {formatTime(currentTime)} / {formatTime(displayDuration)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>拖动时间轴选择关键帧</span>
                <span>{playing ? "播放中" : "已暂停"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
