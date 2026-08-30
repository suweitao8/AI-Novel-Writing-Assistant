import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Box, CircleCheck, Image, Loader2, Pencil, Save, WandSparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  StudioEnvironmentAsset,
  StudioEnvironmentAssetState,
} from "@ai-novel/shared/types/studioEnvironmentAssets";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";
import {
  cancelStudioEnvironmentStateImage,
  designGlobalNarratorVoice,
  dismissStudioEnvironmentStateImageError,
  generateStudioEnvironmentStateImage,
  getGlobalNarratorVoice,
  getStudioEnvironmentAssets,
  saveGlobalNarratorVoiceDescription,
  saveStudioEnvironmentAsset,
  setActiveStudioEnvironmentState,
  tweakStudioEnvironmentStateImagePrompt,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { buildStateImageSrc } from "@/components/storyAssets";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  STUDIO_ENVIRONMENT_DIAMETER_LIMITS,
  STUDIO_ENVIRONMENT_PRESET_IDS,
  getStudioEnvironmentDiameterPreferences,
  getStudioEnvironmentPreset,
  saveStudioEnvironmentDiameterPreference,
  type StudioEnvironmentPresetId,
} from "@/pages/models/modelLibrary3d/studioEnvironmentPresets";
import { resolveStudioEnvironmentSourceUrl } from "@/pages/models/modelLibrary3d/studioEnvironmentAssetSource";
import {
  AssetStatesEditor,
  normalizeStatesForSave,
} from "@/pages/novels/components/storySettings/assetForms";
import { SettingsShell } from "../components/SettingsShell";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function activeStateImageSrc(asset: StudioEnvironmentAsset | undefined): string | null {
  const states = asset?.states ?? [];
  const active = states.find((state) => state.id === asset?.activeStateId) ?? states[0];
  const image = active?.image;
  if (!image || image.status !== "done" || !image.url) return null;
  return buildStateImageSrc(image.url, image.generatedAt);
}

function StudioEnvironmentPanoramaPreview({
  label,
  imageUrl,
}: {
  label: string;
  imageUrl: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="group h-20 w-36 overflow-hidden rounded-md border border-border p-0 hover:bg-muted"
          aria-label={`${label} 2D 全景预览`}
        >
          <img src={imageUrl} alt={`${label} 全景图`} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl border-border bg-background/95">
        <DialogTitle>{label} 2D 全景预览</DialogTitle>
        <DialogDescription className="sr-only">查看当前 HDRI 的平面全景图。</DialogDescription>
        <div className="overflow-hidden rounded-lg border border-border bg-muted">
          <img src={imageUrl} alt={`${label} 全景图大图`} className="block max-h-[75vh] w-full object-contain" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 环境编辑弹窗：环境描述 + 与场景资产完全同一套 AssetStatesEditor（注入设置域后端）。 */
function StudioEnvironmentEditorDialog({
  environment,
  onClose,
}: {
  environment: StudioEnvironmentAsset;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [descriptionDraft, setDescriptionDraft] = useState(environment.description ?? "");
  const [statesDraft, setStatesDraft] = useState<StoryAssetState[]>(environment.states);
  const descriptionDirtyRef = useRef(false);
  const statesDirtyRef = useRef(false);
  const descriptionSyncKey = `${environment.id}:${environment.description ?? ""}`;
  const statesSyncKey = `${environment.id}:${environment.states.map((state) => `${state.id}:${state.image?.status ?? "idle"}:${state.image?.generatedAt ?? ""}`).join("|")}`;

  useEffect(() => {
    if (!descriptionDirtyRef.current) {
      setDescriptionDraft(environment.description ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptionSyncKey]);

  // 服务端变化（生成完成/切换活跃状态）且本地无未保存编辑时，跟随服务端。
  useEffect(() => {
    if (!statesDirtyRef.current) {
      setStatesDraft(environment.states);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesSyncKey]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.settings.environmentAssets });
  };

  const saveMutation = useMutation({
    mutationFn: () => saveStudioEnvironmentAsset(environment.id, {
      description: descriptionDraft.trim() || null,
      states: normalizeStatesForSave(statesDraft),
    }),
    onSuccess: (response) => {
      descriptionDirtyRef.current = false;
      statesDirtyRef.current = false;
      setDescriptionDraft(response.data?.description ?? "");
      if (response.data?.states?.length) setStatesDraft(response.data.states);
      invalidate();
      toast.success("环境资料已保存。");
    },
    onError: (error) => toast.error(errorMessage(error, "保存环境资料失败，请重试。")),
  });

  const ensureSaved = async () => {
    if (!descriptionDirtyRef.current && !statesDirtyRef.current) return;
    await saveMutation.mutateAsync();
  };

  const handleStatesChange = (next: StoryAssetState[]) => {
    // 服务端同步会原样传入 environment.states 引用，只有用户编辑产生的新数组才算脏。
    statesDirtyRef.current = next !== environment.states;
    setStatesDraft(next);
  };

  const activeStateMutation = useMutation({
    mutationFn: async (stateId: string) => {
      await ensureSaved();
      return setActiveStudioEnvironmentState(environment.id, stateId);
    },
    onSuccess: () => {
      invalidate();
      toast.success("当前全景已切换。");
    },
    onError: (error) => toast.error(errorMessage(error, "切换当前全景失败，请重试。")),
  });

  const isBusy = saveMutation.isPending || activeStateMutation.isPending;
  const ops = useMemo(() => ({
    generateImage: async (stateId: string) => {
      await ensureSaved();
      const response = await generateStudioEnvironmentStateImage(environment.id, stateId);
      statesDirtyRef.current = false;
      return response;
    },
    cancelImage: async (stateId: string) => {
      const response = await cancelStudioEnvironmentStateImage(environment.id, stateId);
      statesDirtyRef.current = false;
      return response;
    },
    dismissImageError: async (stateId: string, expectedError: string, expectedAttemptId?: string) => {
      const response = await dismissStudioEnvironmentStateImageError(environment.id, stateId, expectedError, expectedAttemptId);
      statesDirtyRef.current = false;
      return response;
    },
    tweakImagePrompt: async ({ stateId, instruction }: { stateId: string; instruction: string }) => {
      const state = statesDraft.find((item) => item.id === stateId);
      const response = await tweakStudioEnvironmentStateImagePrompt(environment.id, {
        stateLabel: state?.label?.trim() || undefined,
        imagePrompt: state?.imagePrompt?.trim() || undefined,
        instruction,
      });
      return response.data?.imagePrompt ?? "";
    },
    serverStates: environment.states,
    refreshServerStates: invalidate,
    renderExtraImageAction: (state: StudioEnvironmentAssetState | StoryAssetState | null) => (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8"
        disabled={isBusy || !state || state.id === environment.activeStateId}
        aria-label="设为当前全景"
        onClick={() => {
          if (state) activeStateMutation.mutate(state.id);
        }}
      >
        <CircleCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        设为当前全景
      </Button>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [environment, statesDraft, isBusy]);

  return (
    <DialogContent className="max-h-[85vh] max-w-6xl overflow-y-auto border-border bg-background">
      <DialogTitle>编辑环境 · {environment.label}</DialogTitle>
      <DialogDescription className="sr-only">管理环境的描述、状态与全景图生成。</DialogDescription>
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-xs font-medium">环境描述</span>
          <Textarea
            value={descriptionDraft}
            rows={2}
            disabled={isBusy}
            aria-label="环境描述"
            placeholder="描述这个环境的基础画面。"
            onChange={(event) => {
              descriptionDirtyRef.current = true;
              setDescriptionDraft(event.target.value);
            }}
          />
        </label>
        <AssetStatesEditor
          states={statesDraft}
          onChange={handleStatesChange}
          kind="scene"
          novelId=""
          assetName={environment.label}
          ops={ops}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            保存资料
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>完成</Button>
        </div>
      </div>
    </DialogContent>
  );
}

export default function NarratorVoiceSettingsPage() {
  const queryClient = useQueryClient();
  const narratorVoiceQuery = useQuery({
    queryKey: queryKeys.settings.narratorVoice,
    queryFn: getGlobalNarratorVoice,
  });
  const environmentAssetsQuery = useQuery({
    queryKey: queryKeys.settings.environmentAssets,
    queryFn: getStudioEnvironmentAssets,
    refetchInterval: (query) => {
      const environments = query.state.data?.data?.environments;
      const anyGenerating = Object.values(environments ?? {}).some((asset) => (
        asset?.states.some((state) => state.image?.status === "generating") ?? false
      ));
      return anyGenerating ? 3000 : false;
    },
  });
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<StudioEnvironmentPresetId | null>(null);
  const [draft, setDraft] = useState("");
  const [environmentDiameters, setEnvironmentDiameters] = useState(
    getStudioEnvironmentDiameterPreferences,
  );
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
  const updateEnvironmentDiameter = (id: StudioEnvironmentPresetId, value: number) => {
    const diameterMeters = saveStudioEnvironmentDiameterPreference(id, value);
    setEnvironmentDiameters((current) => ({ ...current, [id]: diameterMeters }));
  };
  const environmentAssets = environmentAssetsQuery.data?.data ?? null;
  const editingEnvironment = editingEnvironmentId ? environmentAssets?.environments?.[editingEnvironmentId] : undefined;

  return (
    <SettingsShell title="通用资产" description="管理网站统一使用的旁白音色与 HDRI 环境。">
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
            <table className="w-full min-w-[760px] text-sm">
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
          {environmentAssetsQuery.isError ? (
            <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {errorMessage(environmentAssetsQuery.error, "读取环境资产失败，请刷新后重试。")}
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">模型与动画 HDRI 预设</caption>
              <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-44 px-4 py-3 font-medium">资产</th>
                  <th scope="col" className="w-44 px-4 py-3 font-medium">2D 全景</th>
                  <th scope="col" className="min-w-[220px] px-4 py-3 font-medium">半球直径</th>
                  <th scope="col" className="w-56 px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {STUDIO_ENVIRONMENT_PRESET_IDS.map((id) => {
                  const preset = getStudioEnvironmentPreset(id);
                  const diameterMeters = environmentDiameters[id];
                  const asset = environmentAssets?.environments?.[id];
                  const panoramaUrl = activeStateImageSrc(asset)
                    ?? resolveStudioEnvironmentSourceUrl(id, environmentAssets)
                    ?? preset.previewImageUrl;
                  return (
                    <tr key={id} className="border-t border-border align-middle">
                      <th scope="row" className="px-4 py-4 text-left font-medium text-foreground">{preset.label}</th>
                      <td className="px-4 py-4">
                        <StudioEnvironmentPanoramaPreview label={preset.label} imageUrl={panoramaUrl} />
                      </td>
                      <td className="px-4 py-4">
                        <label className="block space-y-2" htmlFor={`studio-environment-diameter-${id}`}>
                          <span className="flex items-center justify-between gap-3">
                            <span className="sr-only">{preset.label}半球直径</span>
                            <span className="text-xs text-muted-foreground">{STUDIO_ENVIRONMENT_DIAMETER_LIMITS.min}–{STUDIO_ENVIRONMENT_DIAMETER_LIMITS.max} 米</span>
                            <output className="tabular-nums text-foreground">{diameterMeters} 米</output>
                          </span>
                          <input
                            id={`studio-environment-diameter-${id}`}
                            type="range"
                            min={STUDIO_ENVIRONMENT_DIAMETER_LIMITS.min}
                            max={STUDIO_ENVIRONMENT_DIAMETER_LIMITS.max}
                            step={1}
                            value={diameterMeters}
                            aria-label={`${preset.label}半球直径`}
                            onChange={(event) => updateEnvironmentDiameter(id, Number(event.target.value))}
                            className="w-full accent-primary"
                          />
                        </label>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!asset}
                            onClick={() => setEditingEnvironmentId(id)}
                          >
                            <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            编辑环境
                          </Button>
                          <Button asChild type="button" variant="outline" size="sm">
                            <Link to={`/settings/narrator-voice/hdri/${id}`}>
                              <Box className="mr-1.5 h-4 w-4" aria-hidden="true" />
                              3D 预览
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(editingEnvironmentId && editingEnvironment)}
        onOpenChange={(open) => { if (!open) setEditingEnvironmentId(null); }}
      >
        {editingEnvironment ? (
          <StudioEnvironmentEditorDialog
            environment={editingEnvironment}
            onClose={() => setEditingEnvironmentId(null)}
          />
        ) : null}
      </Dialog>
    </SettingsShell>
  );
}
