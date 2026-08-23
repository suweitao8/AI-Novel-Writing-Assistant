import { memo, type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clapperboard,
  ImageIcon,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Volume2,
} from "lucide-react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  createDramaEpisodeBatchJob,
  generateDramaShotKeyframe,
  generateDramaStoryboard,
  getDramaProject,
  type DramaBatchJob,
  type DramaBatchProgress,
  type DramaShot,
} from "@/api/media/drama";
import { listDramaAudioSegments, regenerateDramaShotAudio, type DramaAudioSegment } from "@/api/media/comicDrama";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { LightboxImage } from "@/components/common/LightboxImage";
import ShotBlockingSketchDialog from "./components/ShotBlockingSketchDialog";
import {
  DramaEpisodeAssemblyButton,
  useDramaEpisodeAssembly,
} from "../components/DramaEpisodeAssemblyPanel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface ShotVoiceListPanelProps {
  novelId: string;
  projectId: string;
  chapterOrder: number | null;
  toolbarTarget: HTMLDivElement | null;
}

type KeyframeState = { status?: string; url?: string; error?: string };
type BlockingSketchState = { status?: "draft" | "confirmed"; url?: string };

function parseKeyframe(raw: string | null | undefined): KeyframeState {
  if (!raw?.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw) as KeyframeState;
  } catch {
    return {};
  }
}

function parseBlockingSketch(raw: string | null | undefined): BlockingSketchState {
  if (!raw?.trim()) return {};
  try {
    return JSON.parse(raw) as BlockingSketchState;
  } catch {
    return {};
  }
}

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

function parseBatchProgress(raw: string | null | undefined): DramaBatchProgress {
  return safeJson<DramaBatchProgress>(raw, {
    total: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    failedShotIds: [],
    errors: [],
  });
}

function isActiveBatch(job: DramaBatchJob | null): boolean {
  return job?.status === "pending" || job?.status === "running";
}

function batchStatusLabel(status: DramaBatchJob["status"]): string {
  const labels: Record<DramaBatchJob["status"], string> = {
    pending: "等待生成",
    running: "生成中",
    paused: "已暂停",
    done: "已完成",
    failed: "有失败项",
  };
  return labels[status] ?? status;
}

function audioSegmentLabel(segment: DramaAudioSegment): string {
  return segment.type === "dialogue" ? segment.speaker ?? "角色" : "旁白";
}

function formatAudioTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "--:--";
  }
  const wholeSeconds = Math.floor(value);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

// 轮询宽限窗：任务派发后服务端可能稍晚才把状态翻成 generating（异步任务），
// 只看当前状态会漏掉「首次轮询前已完成」的窗口，导致结果永远不刷新。
const POLL_GRACE_MS = 30_000;

// 一行 = 一个分镜 + 它的配音：分镜与配音强相关，合并成一个列表逐镜对照。
// 深度操作（圈选批量、宫格预览、导出）仍在独立分镜工作台。
export default function ShotVoiceListPanel({ novelId, projectId, chapterOrder, toolbarTarget }: ShotVoiceListPanelProps) {
  const queryClient = useQueryClient();
  const [regeneratingShotId, setRegeneratingShotId] = useState<string | null>(null);
  const [keyframeShotId, setKeyframeShotId] = useState<string | null>(null);
  const [optimisticKeyframeShotIds, setOptimisticKeyframeShotIds] = useState<Set<string>>(() => new Set());
  const lastTaskActivityAtRef = useRef(0);
  const inTaskGraceWindow = () => Date.now() - lastTaskActivityAtRef.current < POLL_GRACE_MS;

  const projectQuery = useQuery({
    queryKey: queryKeys.drama.project(projectId),
    queryFn: () => getDramaProject(projectId),
    refetchInterval: (query) => {
      const project = query.state.data?.data;
      if (!project) {
        return false;
      }
      if (inTaskGraceWindow()) {
        return 3000;
      }
      const currentEpisodeId = (project.episodes ?? []).find((episode) => episode.order === activeOrder)?.id;
      const hasTtsJob = (project.batchJobs ?? []).some((job) =>
        job.episodeId === currentEpisodeId
        && job.type === "tts"
        && (job.status === "pending" || job.status === "running"),
      );
      const hasKeyframeWork = (project.episodes ?? []).some((episode) =>
        (episode.storyboards ?? []).some((board) =>
          (board.shots ?? []).some((shot) => parseKeyframe(shot.keyframeData).status === "generating"),
        ),
      );
      return hasTtsJob || hasKeyframeWork ? 3000 : false;
    },
  });
  const project = projectQuery.data?.data;
  const episodes = project?.episodes ?? [];
  const activeOrder = chapterOrder;
  const activeEpisode = episodes.find((episode) => episode.order === activeOrder) ?? null;
  const storyboard = activeEpisode?.storyboards?.[0] ?? null;
  const shots = useMemo(() => storyboard?.shots ?? [], [storyboard]);

  useEffect(() => {
    setOptimisticKeyframeShotIds(new Set());
  }, [activeEpisode?.id]);

  const ttsJob = useMemo(() => {
    return (project?.batchJobs ?? []).find((job) =>
      job.episodeId === activeEpisode?.id
      && job.type === "tts"
      && (job.status === "pending" || job.status === "running"),
    ) ?? null;
  }, [activeEpisode?.id, project?.batchJobs]);
  const jobRunning = Boolean(ttsJob);

  const keyframeBatchJob = useMemo(() => {
    return (project?.batchJobs ?? []).find((job) => job.episodeId === activeEpisode?.id && job.type === "keyframes") ?? null;
  }, [activeEpisode?.id, project?.batchJobs]);
  const keyframeBatchActive = isActiveBatch(keyframeBatchJob);
  const keyframeBatchProgress = parseBatchProgress(keyframeBatchJob?.progress);

  const segmentsQuery = useQuery({
    queryKey: queryKeys.comicDrama.audioSegments(projectId, activeOrder ?? 0),
    queryFn: () => listDramaAudioSegments(projectId, activeOrder as number),
    enabled: activeOrder !== null,
    refetchInterval: () => (jobRunning || inTaskGraceWindow() ? 3000 : false),
  });
  const segments = segmentsQuery.data ?? [];

  // 配音段按镜头归组：一行分镜挂它自己的段（对白行 + 旁白行）。
  // 无段的镜共用同一个空数组常量，避免每次渲染产生新引用击穿行组件 memo。
  const segmentsByShotId = useMemo(() => {
    const map = new Map<string, DramaAudioSegment[]>();
    for (const segment of segments) {
      const list = map.get(segment.shotId) ?? [];
      list.push(segment);
      map.set(segment.shotId, list);
    }
    return map;
  }, [segments]);

  const summary = useMemo(() => {
    let ready = 0;
    let pending = 0;
    for (const segment of segments) {
      if (segment.status === "ready") ready += 1;
      else pending += 1;
    }
    return { total: segments.length, ready, pending };
  }, [segments]);

  const keyframeSummary = useMemo(() => {
    let done = 0;
    let generating = 0;
    for (const shot of shots) {
      const status = parseKeyframe(shot.keyframeData).status;
      if (status === "done") done += 1;
      else if (status === "generating" || optimisticKeyframeShotIds.has(shot.id)) generating += 1;
    }
    return { total: shots.length, done, generating, missing: Math.max(0, shots.length - done - generating) };
  }, [optimisticKeyframeShotIds, shots]);

  const keyframeTargetShotIds = useMemo(() => {
    return shots
      .filter((shot) => !["done", "generating"].includes(parseKeyframe(shot.keyframeData).status ?? ""))
      .map((shot) => shot.id);
  }, [shots]);
  const hasDialogue = useMemo(
    () => shots.some((shot) => Boolean(shot.dialogue?.trim())),
    [shots],
  );
  const shouldForceTts = summary.total > 0 && summary.pending === 0;
  const canRunTts = shouldForceTts || summary.pending > 0 || (summary.total === 0 && hasDialogue);

  const invalidateAll = () => {
    if (activeOrder !== null) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.audioSegments(projectId, activeOrder) });
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.overview(novelId) });
  };

  const storyboardMutation = useMutation({
    mutationFn: () => generateDramaStoryboard(projectId, activeOrder as number),
    onSuccess: () => {
      toast.success(`第 ${activeOrder} 集分镜已生成。`);
      invalidateAll();
    },
    onError: (error: Error) => toast.error("生成分镜失败", { description: error.message }),
  });

  const keyframeBatchMutation = useMutation({
    mutationFn: (input: { shotIds?: string[]; failedShotIds?: string[] }) =>
      createDramaEpisodeBatchJob(projectId, activeOrder as number, { type: "keyframes", ...input }),
    onMutate: (input) => {
      const targetShotIds = input.shotIds ?? input.failedShotIds ?? [];
      lastTaskActivityAtRef.current = Date.now();
      setOptimisticKeyframeShotIds((current) => new Set([...current, ...targetShotIds]));
      return { targetShotIds };
    },
    onSuccess: () => {
      toast.success("分镜画面已进入并发生成队列。", { description: "生成中的分镜会在左侧缩略图中高亮显示。" });
      invalidateAll();
    },
    onError: (error: Error, _input, mutationContext) => {
      const targetShotIds = mutationContext?.targetShotIds ?? [];
      if (targetShotIds.length > 0) {
        setOptimisticKeyframeShotIds((current) => {
          const next = new Set(current);
          for (const shotId of targetShotIds) next.delete(shotId);
          return next;
        });
      }
      toast.error("创建分镜画面任务失败", { description: error.message });
    },
  });

  const keyframeOneMutation = useMutation({
    mutationFn: (shotId: string) => generateDramaShotKeyframe(projectId, shotId),
    onMutate: (shotId) => {
      lastTaskActivityAtRef.current = Date.now();
      setKeyframeShotId(shotId);
    },
    onSuccess: () => {
      lastTaskActivityAtRef.current = Date.now();
      toast.success("分镜画面任务已开始。");
      invalidateAll();
    },
    onError: (error: Error) => toast.error("生成分镜画面失败", { description: error.message }),
    onSettled: () => setKeyframeShotId(null),
  });

  useEffect(() => {
    if (optimisticKeyframeShotIds.size === 0) {
      return;
    }
    if (keyframeBatchMutation.isPending || keyframeBatchActive || inTaskGraceWindow()) {
      return;
    }
    const generatingShotIds = new Set(
      shots
        .filter((shot) => parseKeyframe(shot.keyframeData).status === "generating")
        .map((shot) => shot.id),
    );
    setOptimisticKeyframeShotIds((current) => {
      const next = new Set([...current].filter((shotId) => generatingShotIds.has(shotId)));
      return next.size === current.size ? current : next;
    });
  }, [keyframeBatchActive, keyframeBatchMutation.isPending, optimisticKeyframeShotIds.size, shots]);

  const ttsBatchMutation = useMutation({
    mutationFn: (force: boolean) =>
      createDramaEpisodeBatchJob(projectId, activeOrder as number, { type: "tts", force }),
    onSuccess: () => {
      lastTaskActivityAtRef.current = Date.now();
      toast.success("配音任务已开始", { description: "完成后每一行的配音会变成可播放状态。" });
      invalidateAll();
    },
    onError: (error: Error) => toast.error("创建配音任务失败", { description: error.message }),
  });

  const regenerateMutation = useMutation({
    mutationFn: ({ shot, force }: { shot: DramaShot; force: boolean }) => {
      return regenerateDramaShotAudio(projectId, shot.id, { force });
    },
    onMutate: ({ shot }) => setRegeneratingShotId(shot.id),
    onSuccess: () => {
      toast.success("这一镜的配音已更新");
      invalidateAll();
    },
    onError: (error: Error) => toast.error("重配失败", { description: error.message }),
    onSettled: () => setRegeneratingShotId(null),
  });

  const busy = storyboardMutation.isPending || keyframeBatchMutation.isPending || keyframeBatchActive || ttsBatchMutation.isPending;
  const assemblyController = useDramaEpisodeAssembly({
    projectId,
    order: activeEpisode?.order ?? activeOrder ?? 0,
    hasShots: shots.length > 0,
    busy,
  });

  const { mutate: mutateKeyframeOne } = keyframeOneMutation;
  const { mutate: mutateRegenerate } = regenerateMutation;
  // 稳定回调供行组件 memo：只传 shotId/shot，不在 map 里逐行新建闭包。
  const handleGenerateKeyframe = useCallback((shotId: string) => {
    mutateKeyframeOne(shotId);
  }, [mutateKeyframeOne]);
  const handleRegenerate = useCallback((shot: DramaShot, force: boolean) => {
    mutateRegenerate({ shot, force });
  }, [mutateRegenerate]);

  const storyboardToolbar = storyboard && toolbarTarget
    ? createPortal(
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || keyframeSummary.generating > 0 || keyframeSummary.missing === 0}
            onClick={() => keyframeBatchMutation.mutate({ shotIds: keyframeTargetShotIds })}
          >
            生成分镜
          </Button>
          <Button
            size="sm"
            onClick={() => ttsBatchMutation.mutate(shouldForceTts)}
            disabled={busy || jobRunning || !canRunTts}
          >
            {jobRunning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            {jobRunning ? `${shouldForceTts ? "重新配音" : "生成配音"}中...` : shouldForceTts ? "重新配音" : "生成配音"}
          </Button>
          <DramaEpisodeAssemblyButton
            controller={assemblyController}
            hasShots={shots.length > 0}
            buttonLabel="合成"
            doneButtonLabel="合成"
          />
        </>,
        toolbarTarget,
      )
    : null;

  return (
    <>
      {storyboardToolbar}
      <div className="space-y-3">

        {keyframeBatchJob && keyframeBatchJob.status !== "done" ? (
        <div
          role={keyframeBatchActive ? "status" : "alert"}
          aria-live="polite"
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs",
            keyframeBatchActive
              ? "border-primary/40 bg-primary/5 text-primary"
              : "border-destructive/40 bg-destructive/5 text-destructive",
          )}
        >
          {keyframeBatchActive ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />}
          <span className="font-medium">分镜画面{batchStatusLabel(keyframeBatchJob.status)}</span>
          {keyframeBatchProgress.total > 0 ? (
            <span>{Math.min(keyframeBatchProgress.total, keyframeBatchProgress.done)}/{keyframeBatchProgress.total} 已处理</span>
          ) : null}
          {keyframeBatchProgress.concurrency ? <span>并发 {keyframeBatchProgress.concurrency} 路</span> : null}
          {(keyframeBatchProgress.failedShotIds ?? []).length > 0 ? (
            <span>失败 {(keyframeBatchProgress.failedShotIds ?? []).length} 个，可点击上方按钮重试</span>
          ) : null}
        </div>
        ) : null}

      {/* 状态摘要 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {storyboard ? (
          <span>
            共 {shots.length} 镜 · 画面 {keyframeSummary.done}/{shots.length}
            {keyframeSummary.generating > 0 ? `（生成中 ${keyframeSummary.generating}）` : ""}
          </span>
        ) : null}
        {summary.total > 0 ? (
          <span>配音 {summary.ready}/{summary.total} 行就绪</span>
        ) : null}
        <Link
          to={`/drama/projects/${projectId}`}
          className="ml-auto text-primary underline-offset-4 hover:underline"
        >
          打开完整分镜工作台
        </Link>
      </div>

      {/* 主体：一行一镜，左分镜右配音 */}
      {episodes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-10 text-center text-sm text-muted-foreground">
          还没有分集。先在完整分镜工作台生成分集大纲。
        </div>
      ) : activeOrder === null ? (
        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-10 text-center text-sm text-muted-foreground">
          请先在右上方选择章节。
        </div>
      ) : !storyboard ? (
        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">第 {activeOrder} 集还没有分镜。</p>
          <Button className="mt-3" size="sm" disabled={busy} onClick={() => storyboardMutation.mutate()}>
            {storyboardMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Clapperboard className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            生成分镜
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {shots.map((shot) => (
            <ShotVoiceRow
              key={shot.id}
              shot={shot}
              segments={segmentsByShotId.get(shot.id) ?? EMPTY_SEGMENTS}
              keyframeBusy={keyframeShotId === shot.id || optimisticKeyframeShotIds.has(shot.id) || parseKeyframe(shot.keyframeData).status === "generating"}
              regenerating={regeneratingShotId === shot.id}
              projectId={projectId}
              onGenerateKeyframe={handleGenerateKeyframe}
              onRegenerate={handleRegenerate}
              onBlockingSketchSaved={invalidateAll}
            />
          ))}
        </div>
      )}
      </div>
    </>
  );
}

const EMPTY_SEGMENTS: DramaAudioSegment[] = [];

function AudioSegmentPlayer({ src, label }: { src: string; label: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setCurrentTime(audio.duration);
      setPlaying(false);
    };
    const onPause = () => setPlaying(false);

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.load();
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
    };
  }, [src]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };

  const seek = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.currentTarget.value);
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextTime)) {
      return;
    }
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        onClick={togglePlayback}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${playing ? "暂停" : "播放"}${label}`}
        title={`${playing ? "暂停" : "播放"}${label}`}
      >
        {playing ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground" aria-live="off">
        {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
      </span>
      <input
        type="range"
        min={0}
        max={duration > 0 ? duration : 0}
        step={0.01}
        value={duration > 0 ? Math.min(currentTime, duration) : 0}
        onChange={seek}
        disabled={duration <= 0}
        aria-label={`${label}进度`}
        aria-valuetext={`${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`}
        className="h-1.5 min-w-0 flex-1 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
      <audio ref={audioRef} preload="metadata" src={src} aria-label={`${label}音频`} className="sr-only" />
    </div>
  );
}

const ShotVoiceRow = memo(function ShotVoiceRow(props: {
  shot: DramaShot;
  segments: DramaAudioSegment[];
  keyframeBusy: boolean;
  regenerating: boolean;
  projectId: string;
  onGenerateKeyframe: (shotId: string) => void;
  onRegenerate: (shot: DramaShot, force: boolean) => void;
  onBlockingSketchSaved: () => void;
}) {
  const { shot, segments } = props;
  const navigate = useNavigate();
  const keyframe = parseKeyframe(shot.keyframeData);
  const blockingSketch = parseBlockingSketch(shot.blockingSketchData);
  const [blockingSketchOpen, setBlockingSketchOpen] = useState(false);
  const readySegments = segments.filter(
    (segment): segment is DramaAudioSegment & { status: "ready"; audioUrl: string } =>
      segment.status === "ready" && Boolean(segment.audioUrl),
  );
  const hasReadyAudio = readySegments.length > 0;
  const pendingCount = segments.filter((segment) => segment.status !== "ready" || !segment.audioUrl).length;
  const shouldForceRegenerate = segments.length > 0 && pendingCount === 0;
  const audioActionLabel = shouldForceRegenerate ? "重新生成" : "生成配音";
  const shotMeta = [shot.shotSize]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-background p-3 transition hover:border-primary/30">
      {/* 分镜画面缩略图：就绪可放大，未生成可就地点生成 */}
      <div className="w-32 shrink-0 space-y-1.5 sm:w-40">
        {keyframe.status === "done" && keyframe.url ? (
          <LightboxImage src={keyframe.url} alt={`第 ${shot.order} 镜画面`} className="aspect-video w-full" fit="cover" />
        ) : props.keyframeBusy ? (
          <button
            type="button"
            disabled
            aria-live="polite"
            aria-busy="true"
            aria-label={`第 ${shot.order} 镜画面生成中`}
            className="flex aspect-video w-full cursor-wait flex-col items-center justify-center gap-1 rounded-lg border border-primary/60 bg-primary/10 text-[10px] font-medium text-primary shadow-sm ring-2 ring-primary/20"
          >
            <Loader2 className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" />
            生成中
          </button>
        ) : (
          <button
            type="button"
            onClick={() => props.onGenerateKeyframe(shot.id)}
            title="生成这一镜的分镜画面"
            className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/10 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            生成画面
          </button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 w-full px-2 text-[11px]"
          onClick={() => navigate(`/drama/projects/${encodeURIComponent(props.projectId)}/shots/${encodeURIComponent(shot.id)}/blocking-3d?order=${shot.order}`)}
        >
          {blockingSketch.status === "draft" ? "继续 3D 摆位" : "3D 摆位台"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-full px-2 text-[11px]"
          onClick={() => setBlockingSketchOpen(true)}
        >
          2D 草图
        </Button>
      </div>

      <ShotBlockingSketchDialog
        open={blockingSketchOpen}
        onOpenChange={setBlockingSketchOpen}
        projectId={props.projectId}
        shot={shot}
        onSaved={props.onBlockingSketchSaved}
      />

      {/* 分镜信息 + 配音段 */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold tabular-nums text-foreground">第 {shot.order} 镜</span>
          {shotMeta ? <span className="text-[11px] text-muted-foreground">{shotMeta}</span> : null}
        </div>

        {segments.length > 0 ? (
          <div className="space-y-0.5">
            {segments.map((segment) => (
              <p key={`${segment.shotId}-${segment.lineIndex}`} className="line-clamp-2 text-sm leading-6 text-foreground">
                <span className="font-medium text-muted-foreground">{audioSegmentLabel(segment)}：</span>
                {segment.text}
              </p>
            ))}
          </div>
        ) : shot.dialogue || shot.action ? (
          <p className="line-clamp-2 text-sm leading-6 text-foreground">
            {shot.dialogue ? `「${shot.dialogue}」` : shot.action}
          </p>
        ) : null}

        {segments.length > 0 ? (
          <div className={cn(
            "mt-2 flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-muted/10 p-2",
            hasReadyAudio ? "sm:flex-row sm:items-center" : "justify-end",
          )}>
            {hasReadyAudio ? (
              <div className="min-w-0 flex-1 space-y-1.5">
                {readySegments.map((segment) => (
                  <div key={`${segment.shotId}-${segment.lineIndex}`} className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                      {audioSegmentLabel(segment)}
                      {segment.type === "dialogue" && segment.emotion ? (
                        <span className="ml-1 font-normal text-muted-foreground/70">（{segment.emotion}）</span>
                      ) : null}
                    </span>
                    <AudioSegmentPlayer src={segment.audioUrl} label={`${audioSegmentLabel(segment)}试听`} />
                  </div>
                ))}
              </div>
            ) : null}
            <AiButton
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-8 shrink-0 self-start px-2.5 text-xs sm:self-center",
                !hasReadyAudio && "ml-auto",
              )}
              disabled={props.regenerating}
              onClick={() => props.onRegenerate(shot, shouldForceRegenerate)}
              title={`${audioActionLabel}这一镜的配音`}
            >
              {props.regenerating ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
              ) : shouldForceRegenerate ? (
                <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
              ) : (
                <Volume2 className="mr-1 h-3 w-3" aria-hidden="true" />
              )}
              {props.regenerating ? `${audioActionLabel}中…` : audioActionLabel}
            </AiButton>
          </div>
        ) : null}
      </div>
    </div>
  );
});
