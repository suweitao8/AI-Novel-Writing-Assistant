import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Box, Image, Loader2, Save, WandSparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type {
  StudioEnvironmentAsset,
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
  tweakStudioEnvironmentStateImagePrompt,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import {
  buildEnvironmentAssetPresentation,
  StoryAssetCard,
} from "@/components/storyAssets";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  STUDIO_ENVIRONMENT_PRESET_IDS,
  getStudioEnvironmentPreset,
  type StudioEnvironmentPresetId,
} from "@/pages/models/modelLibrary3d/studioEnvironmentPresets";
import {
  AssetStatesEditor,
  normalizeStatesForSave,
} from "@/pages/novels/components/storySettings/assetForms";
import { SettingsShell } from "../components/SettingsShell";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/** 环境卡片与场景资产同一套预览：生成全景优先，未生成时回落内置 HDR 预览图。 */
function environmentCardAsset(id: StudioEnvironmentPresetId, asset: StudioEnvironmentAsset) {
  const presentation = buildEnvironmentAssetPresentation(asset);
  if (!presentation.preview) {
    presentation.preview = {
      url: getStudioEnvironmentPreset(id).previewImageUrl,
      alt: `${asset.label}内置环境预览`,
      mode: "center-square",
    };
  }
  return presentation;
}

/** 环境编辑弹窗：与场景资产的编辑弹窗同构（AppDialogContent + 状态编辑器），状态部分完全复用 AssetStatesEditor。 */
function StudioEnvironmentEditorDialog({
  environment,
  onClose,
}: {
  environment: StudioEnvironmentAsset;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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

  const isBusy = saveMutation.isPending;
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
    // 未生成图的状态回落内置环境全景：与卡片预览、3D 编辑的实际生效画面保持一致。
    stateImageFallbackUrl: getStudioEnvironmentPreset(environment.id).previewImageUrl,
    // 编辑器内提供与场景资产一致的 3D编辑 入口。
    renderExtraImageAction: () => (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 px-2 text-xs shadow-sm"
        aria-label={`编辑${environment.label}的 3D 环境`}
        onClick={() => navigate(`/settings/narrator-voice/hdri/${environment.id}`)}
      >
        <Box className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        3D编辑
      </Button>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [environment, statesDraft, isBusy]);

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <AppDialogContent
        className="max-w-6xl"
        title={`编辑环境 · ${environment.label}`}
        description="管理环境描述，以及每个状态的全景提示词与生成图。"
        footer={
          <>
            <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>取消</Button>
            <Button
              onClick={async () => {
                try {
                  await saveMutation.mutateAsync();
                  onClose();
                } catch {
                  // 保存失败提示已由 toast 呈现，弹窗保持打开。
                }
              }}
              disabled={isBusy}
            >
              {saveMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </>
        }
      >
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
        </div>
      </AppDialogContent>
    </Dialog>
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
          {environmentAssetsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">正在加载环境...</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {STUDIO_ENVIRONMENT_PRESET_IDS.map((id) => {
                const asset = environmentAssets?.environments?.[id];
                if (!asset) return null;
                return (
                  <StoryAssetCard
                    key={id}
                    asset={environmentCardAsset(id, asset)}
                    onOpen={() => setEditingEnvironmentId(id)}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {editingEnvironment ? (
        <StudioEnvironmentEditorDialog
          environment={editingEnvironment}
          onClose={() => setEditingEnvironmentId(null)}
        />
      ) : null}
    </SettingsShell>
  );
}
