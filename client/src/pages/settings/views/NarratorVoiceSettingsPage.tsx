import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Box, CircleCheck, Image, Loader2, Pencil, Plus, Save, Trash2, WandSparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  StudioEnvironmentAsset,
  StudioEnvironmentAssetState,
} from "@ai-novel/shared/types/studioEnvironmentAssets";
import {
  STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
  STORY_SCENE_3D_PANORAMA_SKY_V,
} from "@ai-novel/shared/types/comicDrama";
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
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { SettingsShell } from "../components/SettingsShell";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function stateImageSrc(state: StudioEnvironmentAssetState | undefined): string | null {
  const image = state?.image;
  if (!image || image.status !== "done" || !image.url) return null;
  return image.generatedAt ? `${image.url}${image.url.includes("?") ? "&" : "?"}v=${encodeURIComponent(image.generatedAt)}` : image.url;
}

/** 场景全景构图参考线（50% 地平线 / 70% 天空分界），契约常量与场景资产一致。 */
function EnvironmentPanoramaGuides() {
  return (
    <>
      {[
        { v: STORY_SCENE_3D_PANORAMA_SKY_V, label: "70%" },
        { v: STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V, label: "50%" },
      ].map((guide) => (
        <div
          key={guide.label}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-foreground/80"
          style={{ top: `${guide.v * 100}%` }}
        >
          <span className="absolute right-1.5 -top-2.5 rounded-sm bg-background/90 px-1 text-[10px] font-medium leading-4 text-foreground shadow-sm">
            {guide.label}
          </span>
        </div>
      ))}
    </>
  );
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
        <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
          <img src={imageUrl} alt={`${label} 全景图大图`} className="block max-h-[75vh] w-full object-contain" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface EnvironmentStateDraft {
  id: string;
  label: string;
  description: string;
  imagePrompt: string;
  referenceStateId: string;
}

interface EnvironmentDraft {
  description: string;
  activeStateId: string;
  states: EnvironmentStateDraft[];
  selectedStateId: string;
}

function draftFromEnvironment(environment: StudioEnvironmentAsset): EnvironmentDraft {
  return {
    description: environment.description ?? "",
    activeStateId: environment.activeStateId,
    selectedStateId: environment.activeStateId,
    states: environment.states.map((state) => ({
      id: state.id,
      label: state.label,
      description: state.description ?? "",
      imagePrompt: state.imagePrompt ?? "",
      referenceStateId: state.referenceStateId ?? "",
    })),
  };
}

function normalizeDraftPayload(draft: EnvironmentDraft) {
  return {
    description: draft.description.trim() || null,
    states: draft.states.map((state) => ({
      id: state.id,
      label: state.label.trim() || "未命名状态",
      description: state.description.trim() || undefined,
      imagePrompt: state.imagePrompt.trim() || undefined,
      referenceStateId: state.referenceStateId.trim() || undefined,
    })),
  };
}

function StudioEnvironmentStatesEditor({
  environment,
  onOpenChange,
}: {
  environment: StudioEnvironmentAsset;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EnvironmentDraft>(() => draftFromEnvironment(environment));
  const dirtyRef = useRef(false);
  const environmentKey = `${environment.id}:${environment.states.map((state) => `${state.id}:${state.image?.status ?? "idle"}:${state.image?.generatedAt ?? ""}`).join("|")}:${environment.activeStateId}`;

  useEffect(() => {
    // 服务端数据变化（生成完成/切活跃状态）且本地无未保存编辑时，跟随服务端。
    if (!dirtyRef.current) {
      setDraft(draftFromEnvironment(environment));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environmentKey]);

  const updateDraft = (mutate: (current: EnvironmentDraft) => EnvironmentDraft) => {
    dirtyRef.current = true;
    setDraft((current) => mutate(current));
  };

  const isDraftClean = useMemo(() => {
    const server = draftFromEnvironment(environment);
    return JSON.stringify(normalizeDraftPayload(draft)) === JSON.stringify(normalizeDraftPayload(server));
  }, [draft, environment]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.settings.environmentAssets });
  };

  const saveMutation = useMutation({
    mutationFn: () => saveStudioEnvironmentAsset(environment.id, normalizeDraftPayload(draft)),
    onSuccess: () => {
      dirtyRef.current = false;
      invalidate();
      toast.success("环境资料已保存。");
    },
    onError: (error) => toast.error(errorMessage(error, "保存环境资料失败，请重试。")),
  });

  const activeMutation = useMutation({
    mutationFn: async () => {
      if (!isDraftClean) await saveMutation.mutateAsync();
      return setActiveStudioEnvironmentState(environment.id, draft.selectedStateId);
    },
    onSuccess: () => {
      invalidate();
      toast.success("当前全景已切换。");
    },
    onError: (error) => toast.error(errorMessage(error, "切换当前全景失败，请重试。")),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!isDraftClean) await saveMutation.mutateAsync();
      return generateStudioEnvironmentStateImage(environment.id, draft.selectedStateId);
    },
    onSuccess: () => {
      invalidate();
      toast.success("环境全景已生成。");
    },
    onError: (error) => {
      invalidate();
      toast.error(errorMessage(error, "生成环境全景失败，请重试。"));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelStudioEnvironmentStateImage(environment.id, draft.selectedStateId),
    onSuccess: () => {
      invalidate();
      toast.success("已终止生成。");
    },
    onError: (error) => toast.error(errorMessage(error, "终止生成失败，请重试。")),
  });

  const dismissMutation = useMutation({
    mutationFn: () => dismissStudioEnvironmentStateImageError(environment.id, draft.selectedStateId),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(errorMessage(error, "清除失败提示出错，请重试。")),
  });

  const selectedDraft = draft.states.find((state) => state.id === draft.selectedStateId) ?? draft.states[0];
  const serverStateById = useMemo(
    () => new Map(environment.states.map((state) => [state.id, state])),
    [environment],
  );
  const selectedServerState = serverStateById.get(selectedDraft?.id ?? "");
  const selectedImage = selectedServerState?.image;
  const isGenerating = selectedImage?.status === "generating" || generateMutation.isPending;
  const isBusy = isGenerating || saveMutation.isPending || activeMutation.isPending || cancelMutation.isPending;

  const addState = () => {
    const template = selectedServerState;
    updateDraft((current) => {
      const id = `state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const referenceId = template?.image?.status === "done" ? template.id : "";
      const next: EnvironmentStateDraft = {
        id,
        label: template ? `${template.label} 变体` : `状态 ${current.states.length + 1}`,
        description: template?.description ?? "",
        imagePrompt: template?.imagePrompt ?? "",
        referenceStateId: referenceId,
      };
      return { ...current, states: [...current.states, next], selectedStateId: id };
    });
  };

  const removeState = (stateId: string) => {
    if (draft.states.length <= 1) return;
    updateDraft((current) => {
      const states = current.states.filter((state) => state.id !== stateId);
      const selectedStateId = current.selectedStateId === stateId ? states[0].id : current.selectedStateId;
      const activeStateId = current.activeStateId === stateId ? states[0].id : current.activeStateId;
      return {
        ...current,
        states,
        selectedStateId,
        activeStateId,
      };
    });
  };

  const selectedReferenceOptions = draft.states.filter((state) => state.id !== selectedDraft?.id);

  return (
    <DialogContent className="max-w-5xl border-border bg-background">
      <DialogTitle>编辑环境 · {environment.label}</DialogTitle>
      <DialogDescription className="sr-only">管理环境的描述、状态与全景图生成。</DialogDescription>
      <div className="grid max-h-[75vh] gap-4 overflow-y-auto pr-1 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">环境状态</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy || draft.states.length >= 12}
              onClick={addState}
            >
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              添加
            </Button>
          </div>
          <ul className="space-y-2" aria-label="环境状态列表">
            {draft.states.map((state) => {
              const serverState = serverStateById.get(state.id);
              const thumbnail = stateImageSrc(serverState);
              const isActive = state.id === draft.activeStateId;
              return (
                <li key={state.id}>
                  <div
                    className={`flex items-center gap-2 rounded-md border p-2 ${
                      state.id === draft.selectedStateId ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setDraft((current) => ({ ...current, selectedStateId: state.id }))}
                    >
                      <span className="h-9 w-14 shrink-0 overflow-hidden rounded border border-border bg-muted">
                        {thumbnail ? (
                          <img src={thumbnail} alt={`${state.label} 全景图`} className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm text-foreground">{state.label}</span>
                        {isActive ? (
                          <span className="flex items-center gap-1 text-[11px] text-primary">
                            <CircleCheck className="h-3 w-3" aria-hidden="true" />
                            当前全景
                          </span>
                        ) : serverState?.image?.status === "generating" ? (
                          <span className="text-[11px] text-muted-foreground">生成中…</span>
                        ) : null}
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`删除状态 ${state.label}`}
                      disabled={isBusy || draft.states.length <= 1}
                      onClick={() => removeState(state.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">环境描述</span>
            <Textarea
              value={draft.description}
              rows={2}
              disabled={isBusy}
              aria-label={`${environment.label} 环境描述`}
              placeholder="描述这个环境的基础画面。"
              onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </label>

          {selectedDraft ? (
            <div className="space-y-4 rounded-lg border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <div className="relative overflow-hidden rounded-md border border-border bg-muted">
                  {stateImageSrc(selectedServerState) ? (
                    <img
                      src={stateImageSrc(selectedServerState) as string}
                      alt={`${selectedDraft.label} 全景图`}
                      className="block aspect-[2/1] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[2/1] w-full items-center justify-center text-xs text-muted-foreground">
                      {selectedImage?.status === "error" ? "生成失败" : "尚未生成全景"}
                    </div>
                  )}
                  <EnvironmentPanoramaGuides />
                </div>
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs text-muted-foreground">状态名称</span>
                    <Input
                      value={selectedDraft.label}
                      disabled={isBusy}
                      aria-label="状态名称"
                      onChange={(event) => updateDraft((current) => ({
                        ...current,
                        states: current.states.map((state) => (
                          state.id === selectedDraft.id ? { ...state, label: event.target.value } : state
                        )),
                      }))}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs text-muted-foreground">状态描述</span>
                    <Textarea
                      value={selectedDraft.description}
                      rows={2}
                      disabled={isBusy}
                      aria-label="状态描述"
                      placeholder="这个状态与默认画面的差异，例如时间、天气、氛围。"
                      onChange={(event) => updateDraft((current) => ({
                        ...current,
                        states: current.states.map((state) => (
                          state.id === selectedDraft.id ? { ...state, description: event.target.value } : state
                        )),
                      }))}
                    />
                  </label>
                </div>
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs text-muted-foreground">图片提示词</span>
                <Textarea
                  value={selectedDraft.imagePrompt}
                  rows={3}
                  disabled={isBusy}
                  aria-label="图片提示词"
                  placeholder="补充全景画面的内容要点；360° 全景与 2:1 画幅由系统契约保证。"
                  onChange={(event) => updateDraft((current) => ({
                    ...current,
                    states: current.states.map((state) => (
                      state.id === selectedDraft.id ? { ...state, imagePrompt: event.target.value } : state
                    )),
                  }))}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-muted-foreground">参考状态</span>
                <SelectControl
                  value={selectedDraft.referenceStateId}
                  disabled={isBusy}
                  aria-label="参考状态"
                  className="h-9 w-full bg-background text-sm"
                  onChange={(event) => updateDraft((current) => ({
                    ...current,
                    states: current.states.map((state) => (
                      state.id === selectedDraft.id ? { ...state, referenceStateId: event.target.value } : state
                    )),
                  }))}
                >
                  <option value="">不参考，全新生成</option>
                  {selectedReferenceOptions.map((state) => {
                    const serverState = serverStateById.get(state.id);
                    return (
                      <option key={state.id} value={state.id} disabled={serverState?.image?.status !== "done"}>
                        {state.label}{serverState?.image?.status === "done" ? "" : "（尚未生成图）"}
                      </option>
                    );
                  })}
                </SelectControl>
              </label>
              {selectedImage?.status === "error" && selectedImage.error ? (
                <div className="flex items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive" role="alert">
                  <span className="min-w-0 break-words">{selectedImage.error}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    disabled={isBusy}
                    onClick={() => dismissMutation.mutate()}
                  >
                    关闭
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <AiButton
                  type="button"
                  disabled={isBusy}
                  onClick={() => generateMutation.mutate()}
                >
                  {isGenerating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <WandSparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                  {isGenerating ? "生成中…" : stateImageSrc(selectedServerState) ? "重新生成" : "生成全景"}
                </AiButton>
                {selectedImage?.status === "generating" ? (
                  <Button type="button" variant="outline" size="sm" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
                    终止
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy || selectedDraft.id === draft.activeStateId}
                  onClick={() => activeMutation.mutate()}
                >
                  <CircleCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  设为当前全景
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy || isDraftClean}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                  保存资料
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>完成</Button>
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
                  const activeState = asset?.states.find((state) => state.id === asset.activeStateId) ?? asset?.states[0];
                  const panoramaUrl = stateImageSrc(activeState) ?? resolveStudioEnvironmentSourceUrl(id, environmentAssets) ?? preset.previewImageUrl;
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

      <Dialog open={Boolean(editingEnvironmentId && editingEnvironment)} onOpenChange={(open) => { if (!open) setEditingEnvironmentId(null); }}>
        {editingEnvironment ? (
          <StudioEnvironmentStatesEditor
            environment={editingEnvironment}
            onOpenChange={(open) => { if (!open) setEditingEnvironmentId(null); }}
          />
        ) : null}
      </Dialog>
    </SettingsShell>
  );
}
