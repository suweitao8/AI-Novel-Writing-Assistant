import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  Loader2,
  Mic,
  User,
  Wand2,
} from "lucide-react";
import {
  designDramaCharacterVoice,
  designDramaNarratorVoice,
  getDramaNarratorVoice,
  saveDramaCharacterVoiceSource,
  updateDramaNarratorVoice,
  type DramaAudioSegment,
} from "@/api/media/comicDrama";
import { getIndexTTS25VoiceCatalog } from "@/api/audio";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { IndexTTS25VoiceControls } from "@/components/audio/IndexTTS25VoiceControls";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// 漫剧配音共享组件：状态点 / 旁白音色卡 / 角色音色卡。
// 「分镜」页签的合并列表（ShotVoiceListPanel）消费这些组件；音色改动会让已生成的配音标记过期。


function parseVoiceProfile(raw: string | null | undefined): {
  voicePrompt?: string;
  sampleAudioUrl?: string;
  referenceAudioUrl?: string;
  indexTTS25Speaker?: string;
} {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sampleAudioUrl = typeof parsed.sampleAudioUrl === "string" ? parsed.sampleAudioUrl : undefined;
    return {
      voicePrompt: typeof parsed.voicePrompt === "string" ? parsed.voicePrompt : undefined,
      sampleAudioUrl,
      referenceAudioUrl: typeof parsed.referenceAudioUrl === "string" ? parsed.referenceAudioUrl : sampleAudioUrl,
      indexTTS25Speaker: typeof parsed.indexTTS25Speaker === "string" ? parsed.indexTTS25Speaker : undefined,
    };
  } catch {
    return {};
  }
}

export function SegmentStatusDot({ status }: { status: DramaAudioSegment["status"] }) {
  const tone =
    status === "ready" ? "bg-emerald-500"
      : status === "stale" ? "bg-amber-500"
        : "bg-muted-foreground/30";
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", tone)} aria-hidden="true" />;
}

export function NarratorVoiceCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const narratorQuery = useQuery({
    queryKey: queryKeys.comicDrama.narratorVoice(projectId),
    queryFn: () => getDramaNarratorVoice(projectId),
  });
  const catalogQuery = useQuery({
    queryKey: queryKeys.settings.indexTTS25Catalog,
    queryFn: getIndexTTS25VoiceCatalog,
    staleTime: 30_000,
  });
  const [draft, setDraft] = useState<string | null>(null);
  const [speakerDraft, setSpeakerDraft] = useState<string | null>(null);
  const [referenceDraft, setReferenceDraft] = useState<string | null>(null);
  const description = draft ?? narratorQuery.data?.description ?? "";
  const speaker = speakerDraft ?? narratorQuery.data?.indexTTS25Speaker ?? catalogQuery.data?.defaultSpeaker ?? "default";
  const referenceAudio = referenceDraft ?? narratorQuery.data?.referenceAudioUrl ?? "";

  const designMutation = useMutation({
    mutationFn: () => designDramaNarratorVoice(projectId, description, {
      referenceAudioUrl: referenceAudio,
      indexTTS25Speaker: speaker || undefined,
    }),
    onSuccess: () => {
      toast.success("旁白音色试听已生成");
      // 丢弃本地草稿跟随服务端：设计成功后服务端描述已是权威值，旧草稿再保存会覆盖它。
      setDraft(null);
      setSpeakerDraft(null);
      setReferenceDraft(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.narratorVoice(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.audioSegmentsAll(projectId) });
    },
    onError: (error: Error) => {
      toast.error("生成旁白音色失败", { description: error.message });
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => updateDramaNarratorVoice(projectId, description, {
      referenceAudioUrl: referenceAudio,
      indexTTS25Speaker: speaker || undefined,
    }),
    onSuccess: () => {
      toast.success("旁白音色描述已保存");
      setSpeakerDraft(null);
      setReferenceDraft(null);
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
          disabled={saveMutation.isPending || (draft === null && speakerDraft === null && referenceDraft === null)}
        >
          保存描述和音色来源
        </Button>
      </div>
      {narratorQuery.data?.sampleAudioUrl ? (
        <audio controls preload="metadata" src={narratorQuery.data.sampleAudioUrl} className="h-8 w-full" />
      ) : null}
      <IndexTTS25VoiceControls
        catalog={catalogQuery.data}
        catalogLoading={catalogQuery.isLoading}
        catalogError={catalogQuery.error instanceof Error ? catalogQuery.error : null}
        speaker={speaker}
        referenceAudio={referenceAudio}
        onSpeakerChange={setSpeakerDraft}
        onReferenceAudioChange={setReferenceDraft}
        onRefresh={() => void catalogQuery.refetch()}
        disabled={designMutation.isPending || saveMutation.isPending}
      />
      <p className="text-xs leading-5 text-muted-foreground">
        分镜台词里没有说话人的行会用旁白音色配音；改过描述后，已有旁白会标记为「已过期」，需要重新配音。
      </p>
    </div>
  );
}

export function CharacterVoiceCard({ projectId, character }: { projectId: string; character: { id: string; name: string; voiceProfile?: string | null } }) {
  const queryClient = useQueryClient();
  const profile = parseVoiceProfile(character.voiceProfile);
  const [prompt, setPrompt] = useState(profile.voicePrompt ?? "");
  const [speaker, setSpeaker] = useState(profile.indexTTS25Speaker ?? "default");
  const [referenceAudio, setReferenceAudio] = useState(profile.referenceAudioUrl ?? "");
  // 本地未改动时跟随服务端音色描述：音色设计完成后轮询会带回新值，不同步会一直显示旧文案。
  const lastServerPromptRef = useRef(profile.voicePrompt ?? "");
  const lastServerSourceRef = useRef({
    speaker: profile.indexTTS25Speaker ?? "default",
    referenceAudio: profile.referenceAudioUrl ?? "",
  });
  const catalogQuery = useQuery({
    queryKey: queryKeys.settings.indexTTS25Catalog,
    queryFn: getIndexTTS25VoiceCatalog,
    staleTime: 30_000,
  });
  useEffect(() => {
    const serverPrompt = profile.voicePrompt ?? "";
    if (prompt === lastServerPromptRef.current) {
      setPrompt(serverPrompt);
    }
    lastServerPromptRef.current = serverPrompt;
  }, [profile.voicePrompt, prompt]);
  useEffect(() => {
    const serverSpeaker = profile.indexTTS25Speaker ?? "default";
    const serverReferenceAudio = profile.referenceAudioUrl ?? "";
    if (speaker === lastServerSourceRef.current.speaker) {
      setSpeaker(serverSpeaker);
    }
    if (referenceAudio === lastServerSourceRef.current.referenceAudio) {
      setReferenceAudio(serverReferenceAudio);
    }
    lastServerSourceRef.current = { speaker: serverSpeaker, referenceAudio: serverReferenceAudio };
  }, [profile.indexTTS25Speaker, profile.referenceAudioUrl, referenceAudio, speaker]);

  const designMutation = useMutation({
    mutationFn: () => designDramaCharacterVoice(projectId, character.id, prompt, {
      referenceAudioUrl: referenceAudio,
      indexTTS25Speaker: speaker || undefined,
    }),
    onSuccess: (result) => {
      toast.success(`${character.name} 的音色试听已生成`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.audioSegmentsAll(projectId) });
    },
    onError: (error: Error) => {
      toast.error(`生成 ${character.name} 的音色失败`, { description: error.message });
    },
  });

  const saveSourceMutation = useMutation({
    mutationFn: () => saveDramaCharacterVoiceSource(projectId, character.id, {
      referenceAudioUrl: referenceAudio,
      indexTTS25Speaker: speaker || undefined,
    }),
    onSuccess: () => {
      toast.success(`${character.name} 的音色来源已保存`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.audioSegmentsAll(projectId) });
    },
    onError: (error: Error) => {
      toast.error(`保存 ${character.name} 的音色来源失败`, { description: error.message });
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => saveSourceMutation.mutate()}
          disabled={designMutation.isPending || saveSourceMutation.isPending}
        >
          {saveSourceMutation.isPending ? "保存中..." : "保存音色来源"}
        </Button>
      </div>
      <IndexTTS25VoiceControls
        catalog={catalogQuery.data}
        catalogLoading={catalogQuery.isLoading}
        catalogError={catalogQuery.error instanceof Error ? catalogQuery.error : null}
        speaker={speaker}
        referenceAudio={referenceAudio}
        onSpeakerChange={setSpeaker}
        onReferenceAudioChange={setReferenceAudio}
        onRefresh={() => void catalogQuery.refetch()}
        disabled={designMutation.isPending || saveSourceMutation.isPending}
      />
      {profile.sampleAudioUrl ? (
        <audio controls preload="metadata" src={profile.sampleAudioUrl} className="h-8 w-full" />
      ) : null}
    </div>
  );
}
