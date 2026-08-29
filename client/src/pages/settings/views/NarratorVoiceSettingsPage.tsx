import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Image, Loader2, Save, WandSparkles } from "lucide-react";
import {
  designGlobalNarratorVoice,
  getGlobalNarratorVoice,
  saveGlobalNarratorVoiceDescription,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  STUDIO_ENVIRONMENT_PRESET_IDS,
  getStudioEnvironmentPreset,
} from "@/pages/models/modelLibrary3d/studioEnvironmentPresets";
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
  const [draft, setDraft] = useState("");
  const hasEditedDraft = useRef(false);

  useEffect(() => {
    if (!hasEditedDraft.current && narratorVoiceQuery.data?.data) {
      setDraft(narratorVoiceQuery.data.data.description ?? "");
    }
  }, [narratorVoiceQuery.data?.data]);

  const saveMutation = useMutation({
    mutationFn: () => saveGlobalNarratorVoiceDescription(draft),
    onSuccess: (response) => {
      hasEditedDraft.current = false;
      setDraft(response.data?.description ?? "");
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.narratorVoice });
      toast.success("旁白音色描述已保存。");
    },
    onError: (error) => toast.error(errorMessage(error, "保存旁白音色失败，请重试。")),
  });

  const designMutation = useMutation({
    mutationFn: () => designGlobalNarratorVoice(draft),
    onSuccess: (response) => {
      hasEditedDraft.current = false;
      setDraft(response.data?.description ?? "");
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.narratorVoice });
      toast.success("旁白试听已生成。");
    },
    onError: (error) => toast.error(errorMessage(error, "生成旁白试听失败，请重试。")),
  });

  const voice = designMutation.data?.data ?? narratorVoiceQuery.data?.data;
  const isBusy = narratorVoiceQuery.isLoading || saveMutation.isPending || designMutation.isPending;
  const canSubmit = draft.trim().length >= 4 && !isBusy;

  return (
    <SettingsShell title="资产预设" description="管理创作统一使用的旁白音色与模型预览环境。">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AudioLines className="h-4 w-4" />
            旁白音色预设
          </CardTitle>
        </CardHeader>
        <CardContent>
          {narratorVoiceQuery.isError ? (
            <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {errorMessage(narratorVoiceQuery.error, "读取旁白音色失败，请刷新后重试。")}
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">旁白音色预设</caption>
              <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-36 px-4 py-3 font-medium">资产</th>
                  <th scope="col" className="min-w-[360px] px-4 py-3 font-medium">音色描述</th>
                  <th scope="col" className="min-w-[250px] px-4 py-3 font-medium">试听</th>
                  <th scope="col" className="w-48 px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {narratorVoiceQuery.isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">正在读取旁白音色…</td>
                  </tr>
                ) : (
                  <tr className="align-top">
                    <th scope="row" className="px-4 py-4 text-left font-medium text-foreground">旁白音色</th>
                    <td className="px-4 py-4">
                      <label htmlFor="global-narrator-voice-description">
                        <span className="sr-only">旁白音色描述</span>
                        <Textarea
                          id="global-narrator-voice-description"
                          value={draft}
                          onChange={(event) => {
                            hasEditedDraft.current = true;
                            setDraft(event.target.value);
                          }}
                          placeholder="输入旁白的年龄、音质、语速和情绪。"
                          rows={4}
                          disabled={isBusy}
                        />
                      </label>
                    </td>
                    <td className="px-4 py-4">
                      {voice?.sampleAudioUrl ? (
                        <audio controls preload="metadata" className="w-full" src={voice.sampleAudioUrl}>
                          当前浏览器不支持音频播放。
                        </audio>
                      ) : (
                        <span className="text-muted-foreground">暂无试听</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" disabled={!canSubmit} onClick={() => saveMutation.mutate()}>
                          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {saveMutation.isPending ? "保存中…" : "保存"}
                        </Button>
                        <AiButton type="button" disabled={!canSubmit} onClick={() => designMutation.mutate()}>
                          {designMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                          {designMutation.isPending ? "生成中…" : voice?.sampleAudioUrl ? "重新生成" : "生成试听"}
                        </AiButton>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Image className="h-4 w-4" />
            模型与动画 HDRI 预设
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">模型与动画 HDRI 预设</caption>
              <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-44 px-4 py-3 font-medium">资产</th>
                  <th scope="col" className="w-52 px-4 py-3 font-medium">用途</th>
                  <th scope="col" className="min-w-[180px] px-4 py-3 font-medium">中心到边界半径</th>
                  <th scope="col" className="min-w-[250px] px-4 py-3 font-medium">资源</th>
                </tr>
              </thead>
              <tbody>
                {STUDIO_ENVIRONMENT_PRESET_IDS.map((id) => {
                  const preset = getStudioEnvironmentPreset(id);
                  return (
                    <tr key={id} className="border-t border-border align-middle">
                      <th scope="row" className="px-4 py-4 text-left font-medium text-foreground">{preset.label}</th>
                      <td className="px-4 py-4 text-muted-foreground">模型与动画预览</td>
                      <td className="px-4 py-4">
                        <output className="tabular-nums text-foreground">{preset.radiusMeters} 米</output>
                      </td>
                      <td className="px-4 py-4">
                        <code className="break-all text-xs text-muted-foreground">{preset.sourceUrl}</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
