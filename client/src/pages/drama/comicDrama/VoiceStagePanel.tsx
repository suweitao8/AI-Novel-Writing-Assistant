import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  Loader2,
  Mic,
  RefreshCw,
  User,
  Wand2,
} from "lucide-react";
import {
  designDramaCharacterVoice,
  designDramaNarratorVoice,
  getDramaNarratorVoice,
  listDramaAudioSegments,
  regenerateDramaShotAudio,
  updateDramaNarratorVoice,
  type DramaAudioSegment,
} from "@/api/media/comicDrama";
import { createDramaEpisodeBatchJob, getDramaProject, listDramaTTSProviders } from "@/api/media/drama";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import SelectControl from "@/components/common/SelectControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// 漫剧配音工作面（分段显示模型沿自旧项目 mydrama 的 voice-stage）：
// 分镜台词逐行展示——有说话人是「对白」、没有是「旁白」；每行三种状态：
// 就绪（可播放）/ 已过期（文本或音色改过，需重配）/ 未生成。
// 批量任务只重合成缺失或过期的行，未变化的行直接复用已有音频。

interface VoiceStagePanelProps {
  novelId: string;
  projectId: string;
}

function parseVoiceProfile(raw: string | null | undefined): {
  voicePrompt?: string;
  sampleAudioUrl?: string;
} {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      voicePrompt: typeof parsed.voicePrompt === "string" ? parsed.voicePrompt : undefined,
      sampleAudioUrl: typeof parsed.sampleAudioUrl === "string" ? parsed.sampleAudioUrl : undefined,
    };
  } catch {
    return {};
  }
}

function SegmentStatusDot({ status }: { status: DramaAudioSegment["status"] }) {
  const tone =
    status === "ready" ? "bg-emerald-500"
      : status === "stale" ? "bg-amber-500"
        : "bg-muted-foreground/30";
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", tone)} aria-hidden="true" />;
}

function SegmentCard({
  segment,
  onRegenerate,
  regenerating,
}: {
  segment: DramaAudioSegment;
  onRegenerate: (segment: DramaAudioSegment) => void;
  regenerating: boolean;
}) {
  const statusText =
    segment.status === "ready" ? "已配音"
      : segment.status === "stale" ? "已过期：台词或音色修改过，需要重新配音"
        : "未生成";
  return (
    <div className="rounded-xl border border-border bg-background p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentStatusDot status={segment.status} />
        {segment.type === "dialogue" ? (
          <Badge variant="secondary" className="gap-1 border-0">
            <User className="h-3 w-3" aria-hidden="true" />
            {segment.speaker ?? "未知角色"}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <AudioLines className="h-3 w-3" aria-hidden="true" />
            旁白
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">第 {segment.shotOrder} 镜</span>
        <span
          className={cn(
            "text-xs",
            segment.status === "stale" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          {statusText}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2 text-xs"
          disabled={regenerating}
          onClick={() => onRegenerate(segment)}
        >
          {regenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />}
          重配此镜
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{segment.text}</p>
      {segment.status === "ready" && segment.audioUrl ? (
        <audio controls preload="none" src={segment.audioUrl} className="h-8 w-full max-w-md" />
      ) : null}
    </div>
  );
}

function NarratorVoiceCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const narratorQuery = useQuery({
    queryKey: queryKeys.comicDrama.narratorVoice(projectId),
    queryFn: () => getDramaNarratorVoice(projectId),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const description = draft ?? narratorQuery.data?.description ?? "";

  const designMutation = useMutation({
    mutationFn: () => designDramaNarratorVoice(projectId, description),
    onSuccess: () => {
      toast.success("旁白音色试听已生成");
      void queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.narratorVoice(projectId) });
      void queryClient.invalidateQueries({ queryKey: ["comic-drama", "audio-segments", projectId] });
    },
    onError: (error: Error) => {
      toast.error("生成旁白音色失败", { description: error.message });
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => updateDramaNarratorVoice(projectId, description),
    onSuccess: () => {
      toast.success("旁白音色描述已保存");
      void queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.narratorVoice(projectId) });
    },
    onError: (error: Error) => {
      toast.error("保存旁白音色描述失败", { description: error.message });
    },
  });

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <AudioLines className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">旁白音色</span>
        {narratorQuery.data?.sampleAudioUrl ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">已配置</span>
        ) : (
          <span className="text-xs text-muted-foreground">未配置（使用语音服务默认旁白）</span>
        )}
      </div>
      <textarea
        className="min-h-[64px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
        placeholder="描述旁白的声音，例如：成年男声旁白，普通话自然清楚，平直直接地叙述。"
        value={description}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <AiButton
          variant="outline"
          size="sm"
          onClick={() => designMutation.mutate()}
          disabled={designMutation.isPending || description.trim().length < 4}
        >
          {designMutation.isPending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />生成中...
            </>
          ) : (
            <>
              <Wand2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />生成音色并试听
            </>
          )}
        </AiButton>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || draft === null}
        >
          只保存描述
        </Button>
      </div>
      {narratorQuery.data?.sampleAudioUrl ? (
        <audio controls preload="none" src={narratorQuery.data.sampleAudioUrl} className="h-8 w-full" />
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground">
        分镜台词里没有说话人的行会用旁白音色配音；改过描述后，已有旁白会标记为「已过期」，需要重新配音。
      </p>
    </div>
  );
}

function CharacterVoiceCard({ projectId, character }: { projectId: string; character: { id: string; name: string; voiceProfile?: string | null } }) {
  const queryClient = useQueryClient();
  const profile = parseVoiceProfile(character.voiceProfile);
  const [prompt, setPrompt] = useState(profile.voicePrompt ?? "");

  const designMutation = useMutation({
    mutationFn: () => designDramaCharacterVoice(projectId, character.id, prompt),
    onSuccess: (result) => {
      toast.success(`${character.name} 的音色试听已生成`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(projectId) });
    },
    onError: (error: Error) => {
      toast.error(`生成 ${character.name} 的音色失败`, { description: error.message });
    },
  });

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">{character.name}</span>
        <span
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            profile.sampleAudioUrl ? "bg-emerald-500" : prompt.trim() ? "bg-amber-500" : "bg-muted-foreground/30",
          )}
          aria-hidden="true"
        />
        <span className="text-xs text-muted-foreground">
          {profile.sampleAudioUrl ? "音色已就绪" : prompt.trim() ? "有描述，待生成试听" : "未配置"}
        </span>
      </div>
      <textarea
        className="min-h-[56px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
        placeholder={`描述 ${character.name} 的声音，例如：青年男声，低沉平静，说话偏慢。`}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <AiButton
          variant="outline"
          size="sm"
          onClick={() => designMutation.mutate()}
          disabled={designMutation.isPending || prompt.trim().length < 4}
        >
          {designMutation.isPending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />生成中...
            </>
          ) : (
            <>
              <Mic className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />生成音色并试听
            </>
          )}
        </AiButton>
      </div>
      {profile.sampleAudioUrl ? (
        <audio controls preload="none" src={profile.sampleAudioUrl} className="h-8 w-full" />
      ) : null}
    </div>
  );
}

export default function VoiceStagePanel({ novelId, projectId }: VoiceStagePanelProps) {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [provider, setProvider] = useState("voxcpm2");
  const [regeneratingShotId, setRegeneratingShotId] = useState<string | null>(null);

  const projectQuery = useQuery({
    queryKey: queryKeys.drama.project(projectId),
    queryFn: () => getDramaProject(projectId),
  });
  const episodes = projectQuery.data?.data?.episodes ?? [];
  const characters = projectQuery.data?.data?.characters ?? [];
  const activeOrder = selectedOrder ?? episodes[0]?.order ?? null;

  const providersQuery = useQuery({
    queryKey: ["drama", "tts-providers"],
    queryFn: () => listDramaTTSProviders(),
  });
  const providers = providersQuery.data?.data ?? [];

  const ttsJob = useMemo(() => {
    const jobs = projectQuery.data?.data?.batchJobs ?? [];
    return jobs.find((job) => job.type === "tts" && (job.status === "pending" || job.status === "running")) ?? null;
  }, [projectQuery.data]);
  const jobRunning = Boolean(ttsJob);
  const jobProgress = useMemo(() => {
    if (!ttsJob) return null;
    try {
      return JSON.parse(ttsJob.progress) as { total?: number; done?: number; failed?: number; skipped?: number };
    } catch {
      return null;
    }
  }, [ttsJob]);

  const segmentsQuery = useQuery({
    queryKey: queryKeys.comicDrama.audioSegments(projectId, activeOrder ?? 0),
    queryFn: () => listDramaAudioSegments(projectId, activeOrder as number),
    enabled: activeOrder !== null,
    refetchInterval: () => (jobRunning ? 2500 : false),
  });
  const segments = segmentsQuery.data ?? [];

  const summary = useMemo(() => {
    let ready = 0;
    let stale = 0;
    let missing = 0;
    let narration = 0;
    let dialogue = 0;
    for (const segment of segments) {
      if (segment.status === "ready") ready += 1;
      else if (segment.status === "stale") stale += 1;
      else missing += 1;
      if (segment.type === "narration") narration += 1;
      else dialogue += 1;
    }
    return { total: segments.length, ready, stale, missing, narration, dialogue };
  }, [segments]);

  const invalidateAll = () => {
    if (activeOrder !== null) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.audioSegments(projectId, activeOrder) });
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.overview(novelId) });
  };

  const batchMutation = useMutation({
    mutationFn: (force: boolean) =>
      createDramaEpisodeBatchJob(projectId, activeOrder as number, { type: "tts", provider, force }),
    onSuccess: () => {
      toast.success("配音任务已开始", { description: "完成后这里的每一行会自动变成可播放状态。" });
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error("创建配音任务失败", { description: error.message });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: (segment: DramaAudioSegment) => {
      // 未变化的行会自动复用已有音频，只重配这一镜里变化或缺失的行
      return regenerateDramaShotAudio(projectId, segment.shotId, {
        provider,
        force: segment.status === "ready",
      });
    },
    onMutate: (segment) => {
      setRegeneratingShotId(segment.shotId);
    },
    onSuccess: () => {
      toast.success("这一镜的配音已更新");
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error("重配失败", { description: error.message });
    },
    onSettled: () => {
      setRegeneratingShotId(null);
    },
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <SelectControl
            className="h-9 min-w-[140px] rounded-md border bg-background px-2 text-sm"
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
            className="h-9 min-w-[150px] rounded-md border bg-background px-2 text-sm"
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
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => batchMutation.mutate(false)}
              disabled={batchMutation.isPending || jobRunning || activeOrder === null || summary.missing + summary.stale === 0}
            >
              {jobRunning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              生成缺失配音（{summary.missing + summary.stale} 行）
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => batchMutation.mutate(true)}
              disabled={batchMutation.isPending || jobRunning || activeOrder === null || summary.total === 0}
            >
              全部重新配音
            </Button>
          </div>
        </div>

        {jobRunning && jobProgress ? (
          <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            正在合成配音：{((jobProgress.done ?? 0) + (jobProgress.skipped ?? 0))} / {jobProgress.total ?? summary.total} 镜
            {jobProgress.failed ? ` · 失败 ${jobProgress.failed} 镜` : ""}
          </div>
        ) : null}

        <p className="text-xs leading-5 text-muted-foreground">
          共 {summary.total} 行台词 · 已就绪 {summary.ready} · 需重配 {summary.stale + summary.missing}
          （对白 {summary.dialogue} · 旁白 {summary.narration}）
        </p>

        {segmentsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">正在读取台词分镜...</p>
        ) : null}
        {!segmentsQuery.isLoading && summary.total === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            这一集还没有台词分镜。先在「分镜」阶段生成或同步分镜，台词会出现在这里。
          </div>
        ) : null}
        <div className="space-y-2">
          {segments.map((segment) => (
            <SegmentCard
              key={`${segment.shotId}-${segment.lineIndex}`}
              segment={segment}
              regenerating={regeneratingShotId === segment.shotId}
              onRegenerate={(item) => regenerateMutation.mutate(item)}
            />
          ))}
        </div>
      </div>

      <aside className="space-y-3">
        <NarratorVoiceCard projectId={projectId} />
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">角色音色</p>
          <p className="text-xs leading-5 text-muted-foreground">
            每个角色用一句话描述声音（年龄、性别、语气、节奏），生成试听后该角色的所有台词都会用这个声音。
          </p>
          {characters.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
              还没有角色。分镜生成后角色会出现在这里。
            </p>
          ) : (
            characters.map((character) => (
              <CharacterVoiceCard key={character.id} projectId={projectId} character={character} />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
