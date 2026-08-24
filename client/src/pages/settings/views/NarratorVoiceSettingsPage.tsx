import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Loader2, Save, WandSparkles } from "lucide-react";
import {
  designGlobalNarratorVoice,
  getGlobalNarratorVoice,
  saveGlobalNarratorVoiceDescription,
} from "@/api/settings";
import { getIndexTTS25VoiceCatalog } from "@/api/audio";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { IndexTTS25VoiceControls } from "@/components/audio/IndexTTS25VoiceControls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { SettingsShell } from "../components/SettingsShell";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export default function NarratorVoiceSettingsPage() {
  const queryClient = useQueryClient();
  const narratorVoiceQuery = useQuery({
    queryKey: queryKeys.settings.narratorVoice,
    queryFn: getGlobalNarratorVoice,
  });
  const catalogQuery = useQuery({
    queryKey: queryKeys.settings.indexTTS25Catalog,
    queryFn: getIndexTTS25VoiceCatalog,
    staleTime: 30_000,
  });
  const [draft, setDraft] = useState("");
  const [speakerDraft, setSpeakerDraft] = useState<string | null>(null);
  const [referenceDraft, setReferenceDraft] = useState<string | null>(null);
  const hasEditedDraft = useRef(false);

  useEffect(() => {
    if (!hasEditedDraft.current && narratorVoiceQuery.data?.data) {
      setDraft(narratorVoiceQuery.data.data.description ?? "");
    }
  }, [narratorVoiceQuery.data?.data]);

  const voice = narratorVoiceQuery.data?.data;
  const speaker = speakerDraft ?? voice?.indexTTS25Speaker ?? catalogQuery.data?.defaultSpeaker ?? "default";
  const referenceAudio = referenceDraft ?? voice?.referenceAudioUrl ?? voice?.sampleAudioUrl ?? "";

  const saveMutation = useMutation({
    mutationFn: () => saveGlobalNarratorVoiceDescription(draft, {
      referenceAudioUrl: referenceAudio,
      indexTTS25Speaker: speaker || undefined,
    }),
    onSuccess: (response) => {
      hasEditedDraft.current = false;
      setSpeakerDraft(null);
      setReferenceDraft(null);
      setDraft(response.data?.description ?? "");
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.narratorVoice });
      toast.success("旁白音色描述已保存。");
    },
    onError: (error) => toast.error(errorMessage(error, "保存旁白音色失败，请重试。")),
  });

  const designMutation = useMutation({
    mutationFn: () => designGlobalNarratorVoice(draft, {
      referenceAudioUrl: referenceAudio,
      indexTTS25Speaker: speaker || undefined,
    }),
    onSuccess: (response) => {
      hasEditedDraft.current = false;
      setSpeakerDraft(null);
      setReferenceDraft(null);
      setDraft(response.data?.description ?? "");
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.narratorVoice });
      toast.success("旁白试听已生成。");
    },
    onError: (error) => toast.error(errorMessage(error, "生成旁白试听失败，请重试。")),
  });

  const displayedVoice = designMutation.data?.data ?? narratorVoiceQuery.data?.data;
  const isBusy = narratorVoiceQuery.isLoading || saveMutation.isPending || designMutation.isPending;
  const canSubmit = draft.trim().length >= 4 && !isBusy;

  return (
    <SettingsShell title="旁白音色" description="试听并设置整个应用统一使用的旁白音色。">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><AudioLines className="h-4 w-4" />系统旁白音色</CardTitle>
          <CardDescription>所有漫剧项目的旁白台词使用这里的描述和试听样本。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {narratorVoiceQuery.isLoading ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">正在读取旁白音色...</div>
          ) : narratorVoiceQuery.isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {errorMessage(narratorVoiceQuery.error, "读取旁白音色失败，请刷新后重试。")}
            </div>
          ) : null}

          <label className="block space-y-2 text-sm font-medium" htmlFor="global-narrator-voice-description">
            <span>音色描述</span>
            <Textarea
              id="global-narrator-voice-description"
              value={draft}
              onChange={(event) => {
                hasEditedDraft.current = true;
                setDraft(event.target.value);
              }}
              placeholder="例如：成年女声旁白，普通话自然清楚，温和沉稳地叙述。"
              rows={4}
              disabled={narratorVoiceQuery.isLoading || saveMutation.isPending || designMutation.isPending}
            />
          </label>

          {displayedVoice?.sampleAudioUrl ? (
            <div className="space-y-2 rounded-md border bg-muted/20 p-4">
              <p className="text-sm font-medium">当前试听样本</p>
              <audio controls preload="metadata" className="w-full" src={displayedVoice.sampleAudioUrl}>
                当前浏览器不支持音频播放。
              </audio>
            </div>
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
            disabled={isBusy}
          />

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!canSubmit}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saveMutation.isPending ? "保存中..." : "保存描述"}
            </Button>
            <AiButton
              type="button"
              disabled={!canSubmit}
              onClick={() => designMutation.mutate()}
            >
              {designMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
              {designMutation.isPending ? "生成中..." : displayedVoice?.sampleAudioUrl ? "重新生成并试听" : "生成并试听"}
            </AiButton>
          </div>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
