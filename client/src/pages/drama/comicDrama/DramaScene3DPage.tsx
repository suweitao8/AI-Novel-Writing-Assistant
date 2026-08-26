import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MapPin, Move3D, WandSparkles } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  analyzeStoryScene3dMarkers,
  getStorySettingsScene,
  updateStorySettingsScene,
  type StorySettingsScene,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import { buildStateImageSrc } from "@/components/storyAssets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AiButton from "@/components/common/AiButton";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  isStoryScene3DMarkerSetCurrent,
  STORY_SCENE_3D_MARKER_KIND_LABELS,
} from "@ai-novel/shared/types/comicDrama";
import {
  createBlocking3dViewer,
  DEFAULT_BLOCKING_3D_ENVIRONMENT,
  type Blocking3dEnvironmentSettings,
  type Blocking3dViewer,
} from "./components/blocking3d/blocking3dViewerApp";
import { resolveStudioReturnPath } from "./navigation/studioNavigation";

const REFERENCE_ACTOR_HEIGHT_METERS = 1.7;
const REFERENCE_ACTOR_LABEL = "比例参照（约1.7m）";

function resolveSceneState(scene: StorySettingsScene, stateId?: string): StorySettingsScene["states"][number] | null {
  if (stateId?.trim()) {
    return scene.states.find((state) => state.id === stateId) ?? null;
  }
  return scene.states[0] ?? null;
}

function resolveSceneEnvironmentUrl(state: StorySettingsScene["states"][number] | null): string | null {
  if (state?.image?.url?.trim()) {
    return buildStateImageSrc(state.image.url, state.image.generatedAt);
  }
  return null;
}

export default function DramaScene3DPage() {
  const { novelId = "", sceneId = "", stateId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<Blocking3dViewer | null>(null);
  const [viewer, setViewer] = useState<Blocking3dViewer | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [status, setStatus] = useState("准备场景预览");
  const [environmentSettings, setEnvironmentSettings] = useState<Blocking3dEnvironmentSettings>({
    ...DEFAULT_BLOCKING_3D_ENVIRONMENT,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzingMarkers, setAnalyzingMarkers] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const leavingRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  const sceneQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsScene(novelId, sceneId),
    queryFn: () => getStorySettingsScene(novelId, sceneId),
    enabled: Boolean(novelId && sceneId),
    staleTime: 0,
  });
  const scene = sceneQuery.data?.data ?? null;
  const selectedState = useMemo(() => (scene ? resolveSceneState(scene, stateId) : null), [scene, stateId]);
  const environmentUrl = useMemo(() => resolveSceneEnvironmentUrl(selectedState), [selectedState]);
  const returnPath = resolveStudioReturnPath(novelId, searchParams.toString());
  const sceneMarkersAreCurrent = useMemo(
    () => isStoryScene3DMarkerSetCurrent(selectedState?.scene3dMarkers, environmentSettings),
    [environmentSettings, selectedState?.scene3dMarkers],
  );
  const visibleSceneMarkers = useMemo(
    () => sceneMarkersAreCurrent ? selectedState?.scene3dMarkers?.markers ?? [] : [],
    [sceneMarkersAreCurrent, selectedState?.scene3dMarkers],
  );

  useEffect(() => {
    if (!scene || !selectedState) return;
    setEnvironmentSettings({ ...DEFAULT_BLOCKING_3D_ENVIRONMENT, ...scene.scene3dEnvironment });
    setDirty(false);
  }, [scene, selectedState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene || !selectedState) return undefined;

    let cancelled = false;
    let unsubscribeChange: (() => void) | undefined;
    let unsubscribeMarkerSelection: (() => void) | undefined;
    setViewerError(null);
    void createBlocking3dViewer({
      canvas,
      environmentUrl,
      sceneMarkers: visibleSceneMarkers,
      onStatus: setStatus,
    }).then((nextViewer) => {
      if (cancelled) {
        nextViewer.destroy();
        return;
      }
      viewerRef.current = nextViewer;
      setViewer(nextViewer);
      nextViewer.addActor(REFERENCE_ACTOR_LABEL, 0, REFERENCE_ACTOR_HEIGHT_METERS, [0, 0, 0]);
      nextViewer.setActorMovementEnabled(false);
      nextViewer.setEnvironmentSettings(scene.scene3dEnvironment);
      nextViewer.fitView();
      unsubscribeChange = nextViewer.onChange(() => {
        setEnvironmentSettings(nextViewer.getEnvironmentSettings());
      });
      unsubscribeMarkerSelection = nextViewer.onMarkerSelection(setSelectedMarkerId);
    }).catch((error: unknown) => {
      if (!cancelled) {
        setViewerError(error instanceof Error ? error.message : "场景 3D 预览加载失败。");
      }
    });

    return () => {
      cancelled = true;
      unsubscribeChange?.();
      unsubscribeMarkerSelection?.();
      viewerRef.current?.destroy();
      viewerRef.current = null;
      setViewer(null);
    };
  }, [environmentUrl, scene, selectedState, visibleSceneMarkers]);

  useEffect(() => {
    if (!viewer) return;
    viewer.setSceneMarkers(visibleSceneMarkers);
    if (!sceneMarkersAreCurrent) setSelectedMarkerId(null);
  }, [sceneMarkersAreCurrent, viewer, visibleSceneMarkers]);

  useEffect(() => {
    viewer?.setInteractionEnabled(!sceneQuery.isFetching && !saving);
  }, [saving, sceneQuery.isFetching, viewer]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty || saving || sceneQuery.isFetching) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving, sceneQuery.isFetching]);

  const saveScene = useCallback(async (): Promise<boolean> => {
    if (savePromiseRef.current) return savePromiseRef.current;
    if (!viewer || !scene) return false;
    const snapshot = {
      projectionCenterHeight: environmentSettings.projectionCenterHeight,
      domeRadius: environmentSettings.domeRadius,
    };
    const promise = (async () => {
      setSaving(true);
      viewer.setInteractionEnabled(false);
      try {
        const response = await updateStorySettingsScene(novelId, sceneId, {
          scene3dEnvironment: snapshot,
        });
        const savedEnvironment = response.data?.scene3dEnvironment;
        if (savedEnvironment) {
          setEnvironmentSettings(savedEnvironment);
          viewer.setEnvironmentSettings(savedEnvironment);
        }
        setDirty(false);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScene(novelId, sceneId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScenes(novelId) }),
        ]);
        setStatus("场景参数已保存");
        toast.success("场景参数已保存。");
        return true;
      } catch (error) {
        toast.error("场景参数保存失败。", { description: error instanceof Error ? error.message : undefined });
        return false;
      } finally {
        viewer.setInteractionEnabled(true);
        setSaving(false);
      }
    })();
    savePromiseRef.current = promise;
    void promise.finally(() => {
      if (savePromiseRef.current === promise) savePromiseRef.current = null;
    });
    return promise;
  }, [environmentSettings.domeRadius, environmentSettings.projectionCenterHeight, novelId, queryClient, scene, sceneId, viewer]);

  const analyzeMarkers = useCallback(async () => {
    if (!selectedState || analyzingMarkers || saving) return;
    setAnalyzingMarkers(true);
    try {
      if (dirty && !(await saveScene())) return;
      const response = await analyzeStoryScene3dMarkers(novelId, sceneId, selectedState.id);
      if (response.data) {
        queryClient.setQueryData(queryKeys.novels.storySettingsScene(novelId, sceneId), response);
      }
      const count = response.data?.states.find((state) => state.id === selectedState.id)?.scene3dMarkers?.markers.length ?? 0;
      toast.success("空间标记识别完成。", { description: `已识别 ${count} 个固定物体。` });
    } catch (error) {
      toast.error("空间标记识别失败。", { description: error instanceof Error ? error.message : "请稍后重试。" });
    } finally {
      setAnalyzingMarkers(false);
    }
  }, [analyzingMarkers, dirty, novelId, queryClient, saveScene, saving, sceneId, selectedState]);

  const focusMarker = useCallback((markerId: string) => {
    if (!viewer) return;
    viewer.focusMarker(markerId);
    setSelectedMarkerId(markerId);
  }, [viewer]);

  const updateEnvironmentSetting = useCallback((key: "projectionCenterHeight" | "domeRadius", value: number) => {
    const next = {
      ...environmentSettings,
      [key]: value,
      yawDeg: 0,
      intensity: 1,
    } satisfies Blocking3dEnvironmentSettings;
    setEnvironmentSettings(next);
    viewer?.setEnvironmentSettings(next);
    setDirty(true);
  }, [environmentSettings, viewer]);

  const saveBeforeExit = useCallback(async (): Promise<boolean> => {
    if (savePromiseRef.current) return savePromiseRef.current;
    if (dirty) return saveScene();
    return true;
  }, [dirty, saveScene]);

  const goBack = async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    if (!(await saveBeforeExit())) {
      leavingRef.current = false;
      return;
    }
    if (returnPath) {
      navigate(returnPath, { replace: true });
    } else {
      navigate(-1);
    }
  };

  if (sceneQuery.isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />载入场景资产
      </div>
    );
  }

  if (sceneQuery.isError || !scene) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-destructive">场景资产载入失败。</p>
        <Button variant="outline" onClick={() => void sceneQuery.refetch()}>重新载入</Button>
      </div>
    );
  }

  if (!selectedState) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-destructive">状态资产不存在。</p>
        <Button variant="outline" onClick={goBack}>返回场景资产</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="ghost" size="icon" aria-label="返回场景资产" title="返回场景资产" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">场景资产 · 3D 场景编辑</h1>
            <p className="truncate text-sm text-muted-foreground">{scene.name} · {selectedState.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground" role="status">{saving ? "保存中" : dirty ? "有未保存修改" : "已保存"}</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">{status}</span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Card className="w-full self-start overflow-hidden">
          <CardContent className="relative aspect-video w-full p-0">
            <canvas
              ref={canvasRef}
              aria-label={`${scene.name} 3D 场景预览`}
              aria-busy={!viewer || saving}
              className="block h-full w-full touch-none bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {!viewer && !viewerError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />初始化场景预览
              </div>
            ) : null}
            {viewerError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center">
                <p className="text-sm text-destructive">{viewerError}</p>
                <Button variant="outline" onClick={goBack}>返回场景资产</Button>
              </div>
            ) : null}
            {!environmentUrl && !viewerError ? (
              <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm">
                场景默认状态图生成后会显示环境贴图
              </div>
            ) : null}
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
              <Move3D className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />参照角色固定 · 右键旋转 · 滚轮缩放 · 中键平移
            </div>
          </CardContent>
        </Card>

        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">场景资产 HDRI</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <label className="block space-y-1.5 text-xs text-muted-foreground">
                <span className="flex items-center justify-between gap-2">
                  <span>投射中心高度</span>
                  <output className="tabular-nums text-foreground">{environmentSettings.projectionCenterHeight.toFixed(1)}</output>
                </span>
                    <input type="range" aria-label="投射中心高度" min="1" max="10" step="0.1" value={environmentSettings.projectionCenterHeight} disabled={!viewer || saving} onChange={(event) => updateEnvironmentSetting("projectionCenterHeight", Number(event.target.value))} className="w-full accent-primary" />
              </label>
              <label className="block space-y-1.5 text-xs text-muted-foreground">
                <span className="flex items-center justify-between gap-2">
                  <span>半球直径</span>
                  <output className="tabular-nums text-foreground">{environmentSettings.domeRadius.toFixed(0)}</output>
                </span>
                    <input type="range" aria-label="半球直径" min="5" max="30" step="1" value={environmentSettings.domeRadius} disabled={!viewer || saving} onChange={(event) => updateEnvironmentSetting("domeRadius", Number(event.target.value))} className="w-full accent-primary" />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-sm">空间标记</CardTitle>
              <AiButton
                type="button"
                variant="outline"
                size="sm"
                disabled={!environmentUrl || saving || analyzingMarkers}
                onClick={() => void analyzeMarkers()}
                title="识别当前场景状态图中的固定空间物体"
              >
                {analyzingMarkers ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <WandSparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                {analyzingMarkers ? "识别中" : selectedState.scene3dMarkers ? "重新识别" : "识别空间"}
              </AiButton>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {!sceneMarkersAreCurrent && selectedState.scene3dMarkers ? (
                <p className="text-xs text-amber-700 dark:text-amber-300" role="status">场景投射参数已改变，请重新识别空间标记。</p>
              ) : null}
              {sceneMarkersAreCurrent && visibleSceneMarkers.length ? visibleSceneMarkers.map((marker) => {
                const selected = marker.id === selectedMarkerId;
                return (
                  <button
                    key={marker.id}
                    type="button"
                    className={cn("flex min-h-9 w-full items-center justify-between gap-2 rounded-md border px-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected && "border-primary bg-accent")}
                    aria-pressed={selected}
                    onClick={() => focusMarker(marker.id)}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate">{marker.label}</span><span className="shrink-0 text-xs text-muted-foreground">{STORY_SCENE_3D_MARKER_KIND_LABELS[marker.kind]}</span></span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{Math.round(marker.confidence * 100)}%</span>
                  </button>
                );
              }) : sceneMarkersAreCurrent ? <p className="text-xs text-muted-foreground">尚未识别空间标记。</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">比例参照</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className={cn("rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-medium")}>{REFERENCE_ACTOR_LABEL}</div>
              <p className="text-xs text-muted-foreground">用于对照场景尺度，不保存到分镜。</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
