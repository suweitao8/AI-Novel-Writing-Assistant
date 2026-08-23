import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clapperboard,
  ImageIcon,
  Loader2,
  RefreshCw,
  Settings2,
  Volume2,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  createDramaEpisodeBatchJob,
  generateDramaShotKeyframe,
  generateDramaStoryboard,
  getDramaProject,
  type DramaShot,
} from "@/api/media/drama";
import { listDramaAudioSegments, regenerateDramaShotAudio, type DramaAudioSegment } from "@/api/media/comicDrama";
import { queryKeys } from "@/api/queryKeys";
import SelectControl from "@/components/common/SelectControl";
import AiButton from "@/components/common/AiButton";
import { LightboxImage } from "@/components/common/LightboxImage";
import { CharacterVoiceCard, NarratorVoiceCard, SegmentStatusDot } from "./VoiceStagePanel";
import {
  DramaEpisodeAssemblyButton,
  DramaEpisodeAssemblyResultPanel,
  useDramaEpisodeAssembly,
} from "../components/DramaEpisodeAssemblyPanel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface ShotVoiceListPanelProps {
  novelId: string;
  projectId: string;
}

type KeyframeState = { status?: string; url?: string; error?: string };

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

// 轮询宽限窗：任务派发后服务端可能稍晚才把状态翻成 generating（异步任务），
// 只看当前状态会漏掉「首次轮询前已完成」的窗口，导致结果永远不刷新。
const POLL_GRACE_MS = 30_000;

// 一行 = 一个分镜 + 它的配音：分镜与配音强相关，合并成一个列表逐镜对照。
// 深度操作（圈选批量、宫格预览、导出）仍在独立分镜工作台。
export default function ShotVoiceListPanel({ novelId, projectId }: ShotVoiceListPanelProps) {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [regeneratingShotId, setRegeneratingShotId] = useState<string | null>(null);
  const [keyframeShotId, setKeyframeShotId] = useState<string | null>(null);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
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
      const hasTtsJob = (project.batchJobs ?? []).some((job) => job.type === "tts" && (job.status === "pending" || job.status === "running"));
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
  const characters = project?.characters ?? [];
  const activeOrder = selectedOrder ?? episodes[0]?.order ?? null;
  const activeEpisode = episodes.find((episode) => episode.order === activeOrder) ?? null;
  const storyboard = activeEpisode?.storyboards?.[0] ?? null;
  const shots = useMemo(() => storyboard?.shots ?? [], [storyboard]);

  const ttsJob = useMemo(() => {
    return (project?.batchJobs ?? []).find((job) => job.type === "tts" && (job.status === "pending" || job.status === "running")) ?? null;
  }, [project]);
  const jobRunning = Boolean(ttsJob);

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
      else if (status === "generating") generating += 1;
    }
    return { total: shots.length, done, generating, missing: shots.length - done - generating };
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

  const keyframeBatchMutation = useMutation({
    mutationFn: (input: { shotIds?: string[]; failedShotIds?: string[] }) =>
      createDramaEpisodeBatchJob(projectId, activeOrder as number, { type: "keyframes", ...input }),
    onSuccess: () => {
      toast.success("分镜画面任务已开始，完成后每一行会显示画面。");
      invalidateAll();
    },
    onError: (error: Error) => toast.error("创建分镜画面任务失败", { description: error.message }),
  });

  const keyframeOneMutation = useMutation({
    mutationFn: (shotId: string) => generateDramaShotKeyframe(projectId, shotId),
    onMutate: (shotId) => setKeyframeShotId(shotId),
    onSuccess: () => {
      lastTaskActivityAtRef.current = Date.now();
      toast.success("分镜画面任务已开始。");
      invalidateAll();
    },
    onError: (error: Error) => toast.error("生成分镜画面失败", { description: error.message }),
    onSettled: () => setKeyframeShotId(null),
  });

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

  const busy = storyboardMutation.isPending || keyframeBatchMutation.isPending || ttsBatchMutation.isPending;
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

  return (
    <div className="space-y-3">
      {/* 工具行：集 / 批量操作 / 音色设置 */}
      <div className="flex flex-wrap items-center gap-2">
        <SelectControl
          className="h-9 min-w-[130px] rounded-md border bg-background px-2 text-sm"
          value={activeOrder === null ? "" : String(activeOrder)}
          onChange={(event) => setSelectedOrder(Number(event.target.value) || null)}
          disabled={episodes.length === 0}
        >
          {episodes.length === 0 ? <option value="">还没有分集</option> : null}
          {episodes.map((episode) => (
            <option key={episode.id} value={episode.order}>
              第 {episode.order} 集{episode.title ? ` · ${episode.title}` : ""}
            </option>
          ))}
        </SelectControl>
        {storyboard ? (
          <div className="ml-auto flex flex-wrap gap-2">
            {keyframeSummary.missing > 0 ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || keyframeSummary.generating > 0}
                onClick={() => keyframeBatchMutation.mutate({
                  shotIds: shots
                    .filter((shot) => !["done", "generating"].includes(parseKeyframe(shot.keyframeData).status ?? ""))
                    .map((shot) => shot.id),
                })}
              >
                <ImageIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                生成缺失画面（{keyframeSummary.missing}）
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => ttsBatchMutation.mutate(false)}
              disabled={busy || jobRunning || summary.pending === 0}
            >
              {jobRunning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              生成缺失配音（{summary.pending} 行）
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => ttsBatchMutation.mutate(true)}
              disabled={busy || jobRunning || summary.total === 0}
            >
              全部重新配音
            </Button>
            <DramaEpisodeAssemblyButton
              controller={assemblyController}
              hasShots={shots.length > 0}
              buttonLabel="合成"
              doneButtonLabel="合成"
            />
          </div>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className={cn(voiceSettingsOpen && "text-primary")}
          onClick={() => setVoiceSettingsOpen((open) => !open)}
        >
          <Settings2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />音色设置
        </Button>
      </div>

      {voiceSettingsOpen ? (
        <div className="grid gap-3 rounded-2xl border border-border bg-muted/10 p-3 lg:grid-cols-2">
          <NarratorVoiceCard projectId={projectId} />
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">角色音色</p>
            {characters.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
                还没有角色，分镜生成后会从小说带出。
              </p>
            ) : (
              characters.map((character) => (
                <CharacterVoiceCard key={character.id} projectId={projectId} character={character} />
              ))
            )}
          </div>
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
      ) : !storyboard ? (
        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">第 {activeOrder} 集还没有分镜。</p>
          <Button className="mt-3" size="sm" disabled={busy} onClick={() => storyboardMutation.mutate()}>
            {storyboardMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Clapperboard className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            生成
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
              onGenerateKeyframe={handleGenerateKeyframe}
              onRegenerate={handleRegenerate}
            />
          ))}
          <DramaEpisodeAssemblyResultPanel
            controller={assemblyController}
            hasShots={shots.length > 0}
            buttonLabel="合成"
            doneButtonLabel="合成"
            showActionButton={false}
          />
        </div>
      )}
    </div>
  );
}

const EMPTY_SEGMENTS: DramaAudioSegment[] = [];

const ShotVoiceRow = memo(function ShotVoiceRow(props: {
  shot: DramaShot;
  segments: DramaAudioSegment[];
  keyframeBusy: boolean;
  regenerating: boolean;
  onGenerateKeyframe: (shotId: string) => void;
  onRegenerate: (shot: DramaShot, force: boolean) => void;
}) {
  const { shot, segments } = props;
  const keyframe = parseKeyframe(shot.keyframeData);
  const readyCount = segments.filter((segment) => segment.status === "ready").length;
  const pendingCount = segments.length - readyCount;
  const shouldForceRegenerate = pendingCount === 0;
  const audioActionLabel = shouldForceRegenerate ? "重新生成" : "生成配音";
  const shotMeta = [shot.shotSize, shot.cameraMove, shot.durationSec != null ? `${shot.durationSec} 秒` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-background p-3 transition hover:border-primary/30">
      {/* 分镜画面缩略图：就绪可放大，未生成可就地点生成 */}
      <div className="w-32 shrink-0 sm:w-40">
        {keyframe.status === "done" && keyframe.url ? (
          <LightboxImage src={keyframe.url} alt={`第 ${shot.order} 镜画面`} className="aspect-video w-full" fit="cover" />
        ) : props.keyframeBusy ? (
          <button
            type="button"
            disabled
            className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted/20 text-[10px] text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
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
      </div>

      {/* 分镜信息 + 配音段 */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold tabular-nums text-foreground">第 {shot.order} 镜</span>
          {shotMeta ? <span className="text-[11px] text-muted-foreground">{shotMeta}</span> : null}
        </div>

        {segments.length === 0 && (
          shot.dialogue || shot.action ? (
            <p className="line-clamp-2 text-sm leading-6 text-foreground">
              {shot.dialogue ? `「${shot.dialogue}」` : shot.action}
            </p>
          ) : null
        )}

        {segments.length > 0 ? (
          <div className="mt-2 rounded-lg border border-border/60 bg-muted/10 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">音频</span>
              <span className={cn("text-[11px]", pendingCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                配音 {readyCount}/{segments.length}
              </span>
              <AiButton
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto h-8 shrink-0 px-2.5 text-xs"
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
            <div className="mt-1.5 space-y-1">
              {segments.map((segment) => (
                <div key={`${segment.shotId}-${segment.lineIndex}`} className="flex min-w-0 items-center gap-2">
                  <SegmentStatusDot status={segment.status} />
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                    {segment.type === "dialogue" ? segment.speaker ?? "角色" : "旁白"}
                    {segment.type === "dialogue" && segment.emotion ? (
                      <span className="ml-1 font-normal text-muted-foreground/70">（{segment.emotion}）</span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={segment.text}>
                    {segment.text}
                  </span>
                  {segment.status === "ready" && segment.audioUrl ? (
                    <audio
                      controls
                      preload="metadata"
                      src={segment.audioUrl}
                      aria-label={`${segment.type === "dialogue" ? segment.speaker ?? "角色" : "旁白"}试听`}
                      className="h-7 w-44 shrink-0 sm:w-56"
                    />
                  ) : (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {segment.status === "stale" ? "需重配" : "未生成"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});
