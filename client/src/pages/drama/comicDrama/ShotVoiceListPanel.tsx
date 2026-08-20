import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clapperboard,
  ImageIcon,
  Loader2,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  createDramaEpisodeBatchJob,
  generateDramaShotKeyframe,
  generateDramaStoryboard,
  getDramaProject,
  listDramaTTSProviders,
  type DramaShot,
} from "@/api/media/drama";
import { listDramaAudioSegments, regenerateDramaShotAudio, type DramaAudioSegment } from "@/api/media/comicDrama";
import { queryKeys } from "@/api/queryKeys";
import SelectControl from "@/components/common/SelectControl";
import { LightboxImage } from "@/components/common/LightboxImage";
import { CharacterVoiceCard, NarratorVoiceCard, SegmentStatusDot } from "./VoiceStagePanel";
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

// 一行 = 一个分镜 + 它的配音：分镜与配音强相关，合并成一个列表逐镜对照。
// 深度操作（圈选批量、宫格预览、视频提示词、导出）仍在独立分镜工作台。
export default function ShotVoiceListPanel({ novelId, projectId }: ShotVoiceListPanelProps) {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [provider, setProvider] = useState("voxcpm2");
  const [regeneratingShotId, setRegeneratingShotId] = useState<string | null>(null);
  const [keyframeShotId, setKeyframeShotId] = useState<string | null>(null);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);

  const projectQuery = useQuery({
    queryKey: queryKeys.drama.project(projectId),
    queryFn: () => getDramaProject(projectId),
    refetchInterval: (query) => {
      const project = query.state.data?.data;
      if (!project) {
        return false;
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
  const providersQuery = useQuery({
    queryKey: ["drama", "tts-providers"],
    queryFn: () => listDramaTTSProviders(),
  });

  const project = projectQuery.data?.data;
  const episodes = project?.episodes ?? [];
  const characters = project?.characters ?? [];
  const providers = providersQuery.data?.data ?? [];
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
    refetchInterval: () => (jobRunning ? 2500 : false),
  });
  const segments = segmentsQuery.data ?? [];

  // 配音段按镜头归组：一行分镜挂它自己的段（对白行 + 旁白行）。
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
      toast.success("首帧任务已开始，完成后每一行会显示画面。");
      invalidateAll();
    },
    onError: (error: Error) => toast.error("创建首帧任务失败", { description: error.message }),
  });

  const keyframeOneMutation = useMutation({
    mutationFn: (shotId: string) => generateDramaShotKeyframe(projectId, shotId),
    onMutate: (shotId) => setKeyframeShotId(shotId),
    onSuccess: () => {
      toast.success("首帧任务已开始。");
      invalidateAll();
    },
    onError: (error: Error) => toast.error("生成首帧失败", { description: error.message }),
    onSettled: () => setKeyframeShotId(null),
  });

  const ttsBatchMutation = useMutation({
    mutationFn: (force: boolean) =>
      createDramaEpisodeBatchJob(projectId, activeOrder as number, { type: "tts", provider, force }),
    onSuccess: () => {
      toast.success("配音任务已开始", { description: "完成后每一行的配音会变成可播放状态。" });
      invalidateAll();
    },
    onError: (error: Error) => toast.error("创建配音任务失败", { description: error.message }),
  });

  const regenerateMutation = useMutation({
    mutationFn: (shot: DramaShot) => {
      const shotSegments = segmentsByShotId.get(shot.id) ?? [];
      // 未变化的行自动复用已有音频，只重配这一镜里变化或缺失的行
      const anyReady = shotSegments.some((segment) => segment.status === "ready");
      return regenerateDramaShotAudio(projectId, shot.id, { provider, force: anyReady });
    },
    onMutate: (shot) => setRegeneratingShotId(shot.id),
    onSuccess: () => {
      toast.success("这一镜的配音已更新");
      invalidateAll();
    },
    onError: (error: Error) => toast.error("重配失败", { description: error.message }),
    onSettled: () => setRegeneratingShotId(null),
  });

  const busy = storyboardMutation.isPending || keyframeBatchMutation.isPending || ttsBatchMutation.isPending;

  return (
    <div className="space-y-3">
      {/* 工具行：集 / 语音服务 / 批量操作 / 音色设置 */}
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
        <SelectControl
          className="h-9 min-w-[140px] rounded-md border bg-background px-2 text-sm"
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
          disabled={providers.length === 0}
        >
          {providers.map((item) => (
            <option key={item.provider} value={item.provider}>
              {item.label}
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
                生成缺失首帧（{keyframeSummary.missing}）
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
            共 {shots.length} 镜 · 首帧 {keyframeSummary.done}/{shots.length}
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
            生成分镜
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {shots.map((shot) => (
            <ShotVoiceRow
              key={shot.id}
              shot={shot}
              segments={segmentsByShotId.get(shot.id) ?? []}
              keyframeBusy={keyframeShotId === shot.id || parseKeyframe(shot.keyframeData).status === "generating"}
              regenerating={regeneratingShotId === shot.id}
              onGenerateKeyframe={() => keyframeOneMutation.mutate(shot.id)}
              onRegenerate={() => regenerateMutation.mutate(shot)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShotVoiceRow(props: {
  shot: DramaShot;
  segments: DramaAudioSegment[];
  keyframeBusy: boolean;
  regenerating: boolean;
  onGenerateKeyframe: () => void;
  onRegenerate: () => void;
}) {
  const { shot, segments } = props;
  const keyframe = parseKeyframe(shot.keyframeData);
  const readyCount = segments.filter((segment) => segment.status === "ready").length;
  const pendingCount = segments.length - readyCount;
  const shotMeta = [shot.shotSize, shot.cameraMove, shot.durationSec != null ? `${shot.durationSec} 秒` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-background p-3 transition hover:border-primary/30">
      {/* 首帧缩略图：就绪可放大，未生成可就地点生成 */}
      <div className="w-20 shrink-0 sm:w-24">
        {keyframe.status === "done" && keyframe.url ? (
          <LightboxImage src={keyframe.url} alt={`第 ${shot.order} 镜首帧`} className="h-28 w-full sm:h-32" fit="cover" />
        ) : props.keyframeBusy ? (
          <button
            type="button"
            disabled
            className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted/20 text-[10px] text-muted-foreground sm:h-32"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            生成中
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onGenerateKeyframe}
            title="生成这一镜的首帧图"
            className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/10 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground sm:h-32"
          >
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            生成首帧
          </button>
        )}
      </div>

      {/* 分镜信息 + 配音段 */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold tabular-nums text-foreground">第 {shot.order} 镜</span>
          {shotMeta ? <span className="text-[11px] text-muted-foreground">{shotMeta}</span> : null}
          {segments.length > 0 ? (
            <span className={cn("text-[11px]", pendingCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
              配音 {readyCount}/{segments.length}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">无台词行</span>
          )}
          {segments.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2 text-xs"
              disabled={props.regenerating}
              onClick={props.onRegenerate}
              title="未变化的行会自动复用已有音频"
            >
              {props.regenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />}
              重配此镜
            </Button>
          ) : null}
        </div>

        {shot.dialogue || shot.action ? (
          <p className="line-clamp-2 text-sm leading-6 text-foreground">
            {shot.dialogue ? `「${shot.dialogue}」` : shot.action}
          </p>
        ) : null}

        {segments.length > 0 ? (
          <div className="space-y-1">
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
                  <audio controls preload="none" src={segment.audioUrl} className="h-7 w-44 shrink-0 sm:w-56" />
                ) : (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {segment.status === "stale" ? "需重配" : "未生成"}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
