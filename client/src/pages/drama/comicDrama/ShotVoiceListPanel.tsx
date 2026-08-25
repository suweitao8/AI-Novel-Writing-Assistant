import { memo, type ChangeEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clapperboard,
  ImageIcon,
  Loader2,
  Pause,
  Pencil,
  Play,
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
import {
  DramaEpisodeAssemblyButton,
  useDramaEpisodeAssembly,
} from "../components/DramaEpisodeAssemblyPanel";
import { prepareDramaEpisodeAssets, type DramaEpisodePreparationTask } from "./dramaEpisodePreparation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface ShotVoiceListPanelProps {
  novelId: string;
  projectId: string;
  chapterOrder: number | null;
  toolbarTarget: HTMLDivElement | null;
}

type KeyframeState = { status?: string; version?: number; url?: string; error?: string; generatedAt?: string };
type BlockingSketchState = { status?: "draft" | "confirmed"; version?: number; url?: string; generatedAt?: string };
type PreviewKind = "sketch" | "ai";

function withPreviewCacheBust(url: string | undefined, generatedAt?: string, version?: number): string | null {
  const trimmedUrl = url?.trim();
  if (!trimmedUrl) {
    return null;
  }
  const cacheKey = generatedAt?.trim() || (typeof version === "number" && version > 0 ? String(version) : "");
  if (!cacheKey) {
    return trimmedUrl;
  }
  const separator = trimmedUrl.includes("?") ? "&" : "?";
  return `${trimmedUrl}${separator}v=${encodeURIComponent(cacheKey)}`;
}

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

function hasReadyKeyframe(raw: string | null | undefined): boolean {
  const keyframe = parseKeyframe(raw);
  return keyframe.status === "done" && Boolean(keyframe.url?.trim());
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

function isPreparationBatchJob(job: DramaBatchJob): job is DramaBatchJob & { type: "keyframes" | "tts" } {
  return job.type === "keyframes" || job.type === "tts";
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
  const activeOrder = chapterOrder;
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
  const activeEpisode = episodes.find((episode) => episode.order === activeOrder) ?? null;
  const storyboard = activeEpisode?.storyboards?.[0] ?? null;
  const shots = useMemo(() => storyboard?.shots ?? [], [storyboard]);

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
      if (hasReadyKeyframe(shot.keyframeData)) done += 1;
      else if (status === "generating") generating += 1;
    }
    return { total: shots.length, done, generating, missing: Math.max(0, shots.length - done - generating) };
  }, [shots]);

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

  // 合成可以接管并等待已有的批量画面/配音任务，因此不能把 active batch 当成禁用条件。
  const busy = storyboardMutation.isPending || keyframeOneMutation.isPending || regenerateMutation.isPending;
  const prepareForAssembly = useCallback(async () => {
    if (activeOrder === null || shots.length === 0) {
      return;
    }

    lastTaskActivityAtRef.current = Date.now();
    const [latestProjectResponse, latestSegments] = await Promise.all([
      getDramaProject(projectId),
      listDramaAudioSegments(projectId, activeOrder),
    ]);
    const latestProject = latestProjectResponse.data;
    const latestEpisode = (latestProject?.episodes ?? []).find((episode) => episode.order === activeOrder);
    const latestShots = latestEpisode?.storyboards?.[0]?.shots ?? [];
    if (latestShots.length === 0) {
      throw new Error("当前集还没有可合成的分镜。");
    }

    const missingKeyframeShotIds = latestShots
      .filter((shot) => !hasReadyKeyframe(shot.keyframeData) && parseKeyframe(shot.keyframeData).status !== "generating")
      .map((shot) => shot.id);
    const activeKeyframeJob = (latestProject?.batchJobs ?? []).find((job) =>
      job.episodeId === latestEpisode?.id
      && job.type === "keyframes"
      && isActiveBatch(job),
    );
    const activeTtsJob = (latestProject?.batchJobs ?? []).find((job) =>
      job.episodeId === latestEpisode?.id
      && job.type === "tts"
      && isActiveBatch(job),
    );
    const needsTts = latestShots.some((shot) => Boolean(shot.dialogue?.trim()))
      && (latestSegments.length === 0 || latestSegments.some((segment) => segment.status !== "ready"));

    const tasks: DramaEpisodePreparationTask[] = [];
    if (activeKeyframeJob) {
      tasks.push({ type: "keyframes", jobId: activeKeyframeJob.id });
    } else if (missingKeyframeShotIds.length > 0) {
      tasks.push({
        type: "keyframes",
        start: async () => {
          const response = await createDramaEpisodeBatchJob(projectId, activeOrder, {
            type: "keyframes",
            shotIds: missingKeyframeShotIds,
          });
          const jobId = response.data?.id;
          if (!jobId) {
            throw new Error("分镜画面任务创建失败，请重试。");
          }
          return jobId;
        },
      });
    }
    if (activeTtsJob) {
      tasks.push({ type: "tts", jobId: activeTtsJob.id });
    } else if (needsTts) {
      tasks.push({
        type: "tts",
        start: async () => {
          const response = await createDramaEpisodeBatchJob(projectId, activeOrder, {
            type: "tts",
            force: false,
          });
          const jobId = response.data?.id;
          if (!jobId) {
            throw new Error("配音任务创建失败，请重试。");
          }
          return jobId;
        },
      });
    }

    await prepareDramaEpisodeAssets({
      tasks,
      getJobs: async () => {
        const response = await getDramaProject(projectId);
        const episodeId = (response.data?.episodes ?? []).find((episode) => episode.order === activeOrder)?.id;
        return (response.data?.batchJobs ?? [])
          .filter((job) => job.episodeId === episodeId)
          .filter(isPreparationBatchJob)
          .map(({ id, type, status }) => ({ id, type, status }));
      },
    });
    lastTaskActivityAtRef.current = Date.now();
    invalidateAll();
  }, [activeOrder, invalidateAll, projectId, shots.length]);
  const assemblyController = useDramaEpisodeAssembly({
    projectId,
    order: activeEpisode?.order ?? activeOrder ?? 0,
    hasShots: shots.length > 0,
    busy,
    prepare: prepareForAssembly,
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
            <span>失败 {(keyframeBatchProgress.failedShotIds ?? []).length} 个，可在对应分镜下方重试</span>
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
              keyframeBusy={keyframeShotId === shot.id || parseKeyframe(shot.keyframeData).status === "generating"}
              regenerating={regeneratingShotId === shot.id}
              projectId={projectId}
              onGenerateKeyframe={handleGenerateKeyframe}
              onRegenerate={handleRegenerate}
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
}) {
  const { shot, segments } = props;
  const navigate = useNavigate();
  const [previewKind, setPreviewKind] = useState<PreviewKind>("ai");
  const [aiPreviewError, setAiPreviewError] = useState(false);
  const keyframe = parseKeyframe(shot.keyframeData);
  const blockingSketch = parseBlockingSketch(shot.blockingSketchData);
  const blockingSketchUrl = withPreviewCacheBust(blockingSketch.url, blockingSketch.generatedAt, blockingSketch.version);
  const aiPreviewUrl = withPreviewCacheBust(keyframe.url, keyframe.generatedAt, keyframe.version);
  const hasBlockingSketch = Boolean(blockingSketchUrl);
  const activePreviewKind: PreviewKind = previewKind === "sketch" && hasBlockingSketch ? "sketch" : "ai";
  const previewPanelId = `shot-${shot.id}-preview-panel`;
  const sketchTabId = `shot-${shot.id}-sketch-tab`;
  const aiTabId = `shot-${shot.id}-ai-tab`;
  const blockingSketchNeedsConfirmation = blockingSketch.status === "draft";
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

  useEffect(() => {
    setAiPreviewError(false);
  }, [aiPreviewUrl]);

  const selectPreview = (next: PreviewKind) => {
    if (next === "sketch" && !hasBlockingSketch) return;
    setPreviewKind(next);
  };

  const handlePreviewKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: PreviewKind) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    selectPreview(current === "sketch" ? "ai" : "sketch");
  };

  const renderPreview = () => {
    if (activePreviewKind === "sketch") {
      return blockingSketchUrl ? (
        <LightboxImage
          src={blockingSketchUrl}
          alt={`第 ${shot.order} 镜 3D 草图`}
          className="aspect-video w-full"
          fit="contain"
        />
      ) : null;
    }

    if (keyframe.status === "done" && aiPreviewUrl && !aiPreviewError) {
      return (
        <LightboxImage
          src={aiPreviewUrl}
          alt={`第 ${shot.order} 镜 AI 画面`}
          className="aspect-video w-full"
          fit="cover"
          onError={() => setAiPreviewError(true)}
        />
      );
    }
    if (props.keyframeBusy) {
      return (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={`第 ${shot.order} 镜 AI 画面生成中`}
          className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-primary/60 bg-primary/10 text-[10px] font-medium text-primary shadow-sm ring-2 ring-primary/20"
        >
          <Loader2 className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" />
          生成中
        </div>
      );
    }
    return (
      <div
        className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/10 text-[10px] text-muted-foreground"
        role="status"
        aria-label={`第 ${shot.order} 镜暂无可用 AI 画面`}
      >
        <ImageIcon className="h-4 w-4" aria-hidden="true" />
        {aiPreviewError ? "AI 图不可用，请重新生成" : "暂无 AI 画面"}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 transition hover:border-primary/30 sm:flex-row">
      {/* 预览图与操作栏并排：给分镜图保留完整的 16:9 高度。 */}
      <div className="flex w-full shrink-0 items-stretch gap-2 sm:w-[26rem]">
        <div
          id={previewPanelId}
          role="tabpanel"
          aria-labelledby={activePreviewKind === "sketch" ? sketchTabId : aiTabId}
          tabIndex={0}
          className="min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {renderPreview()}
        </div>
        <div className="flex w-28 shrink-0 flex-col gap-1.5">
          <div
            role="tablist"
            aria-label={`第 ${shot.order} 镜预览类型`}
            aria-orientation="vertical"
            className="grid grid-cols-1 gap-1 rounded-lg border border-border/60 bg-muted/20 p-1"
          >
            <button
              id={sketchTabId}
              type="button"
              role="tab"
              aria-selected={activePreviewKind === "sketch"}
              aria-controls={previewPanelId}
              aria-disabled={!hasBlockingSketch}
              tabIndex={activePreviewKind === "sketch" ? 0 : -1}
              disabled={!hasBlockingSketch}
              onClick={() => selectPreview("sketch")}
              onKeyDown={(event) => handlePreviewKeyDown(event, "sketch")}
              title={hasBlockingSketch ? "查看 3D 图" : "还没有 3D 图"}
              className={cn(
                "inline-flex min-h-8 items-center justify-center rounded-md px-2 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                activePreviewKind === "sketch"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
              )}
            >
              3D图
            </button>
            <button
              id={aiTabId}
              type="button"
              role="tab"
              aria-selected={activePreviewKind === "ai"}
              aria-controls={previewPanelId}
              tabIndex={activePreviewKind === "ai" ? 0 : -1}
              onClick={() => selectPreview("ai")}
              onKeyDown={(event) => handlePreviewKeyDown(event, "ai")}
              title="查看 AI 图"
              className={cn(
                "inline-flex min-h-8 items-center justify-center rounded-md px-2 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activePreviewKind === "ai"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
              )}
            >
              AI图
            </button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-auto min-h-9 w-full justify-center px-2 text-[11px]"
            onClick={() => navigate(`/drama/projects/${encodeURIComponent(props.projectId)}/shots/${encodeURIComponent(shot.id)}/blocking-3d?order=${shot.order}`)}
            title="编辑这一镜的 3D 图"
          >
            <Pencil className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
            编辑3D
          </Button>
          <AiButton
            type="button"
            size="sm"
            variant="outline"
            className="h-auto min-h-9 w-full justify-center px-2 text-[11px]"
            disabled={props.keyframeBusy || blockingSketchNeedsConfirmation}
            onClick={() => props.onGenerateKeyframe(shot.id)}
            title={blockingSketchNeedsConfirmation ? "请先确认 3D 图后再生成 AI 图" : "生成这一镜的 AI 图"}
          >
            {props.keyframeBusy ? (
              <Loader2 className="mr-1 h-3 w-3 shrink-0 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : null}
            {props.keyframeBusy ? "生成中…" : keyframe.status === "done" ? "重新生图" : "生成AI图"}
          </AiButton>
        </div>
      </div>

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
              {props.regenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" /> : null}
              {props.regenerating ? `${audioActionLabel}中…` : audioActionLabel}
            </AiButton>
          </div>
        ) : null}
      </div>
    </div>
  );
});
