import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Move3D, WandSparkles } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import AiButton from "@/components/common/AiButton";
import { toast } from "@/components/ui/toast";
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
import {
  Drama3DEditorShell,
  Drama3DObjectPanel,
  type Drama3DObjectItem,
} from "./components/editor3d";
import { resolveStudioReturnPath } from "./navigation/studioNavigation";

const REFERENCE_ACTOR_HEIGHT_METERS = 1.7;
const REFERENCE_ACTOR_LABEL = "参考角色（约1.7m）";
const SCENE_OBJECT_ID = "scene";
const REFERENCE_OBJECT_ID = "reference";

type SceneObjectSelectionId = typeof SCENE_OBJECT_ID | typeof REFERENCE_OBJECT_ID | `marker:${string}`;

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

function markerObjectId(markerId: string): `marker:${string}` {
  return `marker:${markerId}`;
}

function formatVector(value: readonly number[]): string {
  return value.map((item) => item.toFixed(2)).join(" / ");
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
  const [environmentSettings, setEnvironmentSettings] = useState<Blocking3dEnvironmentSettings>({
    ...DEFAULT_BLOCKING_3D_ENVIRONMENT,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzingMarkers, setAnalyzingMarkers] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<SceneObjectSelectionId>(SCENE_OBJECT_ID);
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
  // 环境滑块拖动会翻转标记的“当前有效”状态；3D 视图只能跟随环境图重建，
  // 标记显隐必须走 viewer.setSceneMarkers 增量更新，否则每次拖动都会整图重载。
  const visibleSceneMarkersRef = useRef(visibleSceneMarkers);
  visibleSceneMarkersRef.current = visibleSceneMarkers;

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
    let unsubscribeSelection: (() => void) | undefined;
    let unsubscribeMarkerSelection: (() => void) | undefined;
    setViewerError(null);
    void createBlocking3dViewer({
      canvas,
      environmentUrl,
      sceneMarkers: visibleSceneMarkersRef.current,
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
      unsubscribeChange = nextViewer.onChange(() => {
        setEnvironmentSettings(nextViewer.getEnvironmentSettings());
      });
      unsubscribeSelection = nextViewer.onSelectionChange((label) => {
        if (label === REFERENCE_ACTOR_LABEL) {
          setSelectedObjectId(REFERENCE_OBJECT_ID);
        } else if (!label) {
          setSelectedObjectId(SCENE_OBJECT_ID);
        }
      });
      unsubscribeMarkerSelection = nextViewer.onMarkerSelection((markerId) => {
        setSelectedObjectId(markerId ? markerObjectId(markerId) : SCENE_OBJECT_ID);
      });
      nextViewer.selectActor(null);
      nextViewer.fitView();
    }).catch((error: unknown) => {
      if (!cancelled) {
        setViewerError(error instanceof Error ? error.message : "场景 3D 预览加载失败。");
      }
    });

    return () => {
      cancelled = true;
      unsubscribeChange?.();
      unsubscribeSelection?.();
      unsubscribeMarkerSelection?.();
      viewerRef.current?.destroy();
      viewerRef.current = null;
      setViewer(null);
    };
  }, [environmentUrl, scene, selectedState]);

  useEffect(() => {
    if (!viewer) return;
    viewer.setSceneMarkers(visibleSceneMarkers);
    if (!sceneMarkersAreCurrent) {
      setSelectedObjectId(SCENE_OBJECT_ID);
      viewer.selectActor(null);
    }
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
      panoramaHorizonV: environmentSettings.panoramaHorizonV,
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
  }, [environmentSettings.domeRadius, environmentSettings.panoramaHorizonV, environmentSettings.projectionCenterHeight, novelId, queryClient, scene, sceneId, viewer]);

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
    setSelectedObjectId(markerObjectId(markerId));
  }, [viewer]);

  const selectObject = useCallback((objectId: SceneObjectSelectionId) => {
    if (!viewer) return;
    if (objectId === SCENE_OBJECT_ID) {
      viewer.selectActor(null);
      setSelectedObjectId(SCENE_OBJECT_ID);
      return;
    }
    if (objectId === REFERENCE_OBJECT_ID) {
      viewer.selectActor(REFERENCE_ACTOR_LABEL);
      setSelectedObjectId(REFERENCE_OBJECT_ID);
      return;
    }
    focusMarker(objectId.slice("marker:".length));
  }, [focusMarker, viewer]);

  const updateEnvironmentSetting = useCallback((key: "projectionCenterHeight" | "domeRadius" | "panoramaHorizonV", value: number) => {
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

  const selectedMarker = selectedObjectId.startsWith("marker:")
    ? visibleSceneMarkers.find((marker) => marker.id === selectedObjectId.slice("marker:".length)) ?? null
    : null;
  const sceneObjectItems: Drama3DObjectItem[] = [
    {
      id: SCENE_OBJECT_ID,
      label: "世界",
      kind: "scene",
      selected: selectedObjectId === SCENE_OBJECT_ID,
      onSelect: () => selectObject(SCENE_OBJECT_ID),
    },
    ...visibleSceneMarkers.map((marker) => ({
      id: markerObjectId(marker.id),
      label: marker.label,
      kind: "marker" as const,
      selected: selectedObjectId === markerObjectId(marker.id),
      onSelect: () => selectObject(markerObjectId(marker.id)),
    })),
    {
      id: REFERENCE_OBJECT_ID,
      label: "参考角色",
      kind: "reference" as const,
      selected: selectedObjectId === REFERENCE_OBJECT_ID,
      onSelect: () => selectObject(REFERENCE_OBJECT_ID),
    },
  ];

  return (
    <Drama3DEditorShell
      header={
        <div data-editor-header="primary" className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
          <Button type="button" variant="ghost" size="icon" aria-label="返回场景资产" title="返回场景资产" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <h1 className="min-w-0 truncate text-sm font-semibold">{scene.name}</h1>
        </div>
      }
      viewport={
        <Card className="h-full min-h-0 w-full overflow-hidden">
          <CardContent className="relative h-full min-h-0 w-full p-0">
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
              <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-xs text-muted-foreground">
                场景默认状态图生成后会显示环境贴图
              </div>
            ) : null}
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
              <Move3D className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />参考角色固定 · 右键旋转 · 滚轮缩放 · 中键平移
            </div>
          </CardContent>
        </Card>
      }
      objects={<Drama3DObjectPanel items={sceneObjectItems} />}
      actions={
        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <CardContent className="h-full min-h-0 flex-1 space-y-4 overflow-y-auto">
            {selectedObjectId === SCENE_OBJECT_ID ? (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">世界</dt>
                  <dd className="text-right">{scene.name}</dd>
                  <dt className="text-muted-foreground">当前状态</dt>
                  <dd className="text-right">{selectedState.label}</dd>
                  <dt className="text-muted-foreground">环境贴图</dt>
                  <dd className="text-right">{environmentUrl ? "已加载" : "未生成"}</dd>
                  <dt className="text-muted-foreground">空间标记</dt>
                  <dd className="text-right">{sceneMarkersAreCurrent ? `${visibleSceneMarkers.length} 个` : "需要重新识别"}</dd>
                </dl>

                <div className="space-y-4 border-t border-border/60 pt-4">
                  <div className="text-xs font-medium">场景环境</div>
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
                  <label className="block space-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center justify-between gap-2">
                      <span>分界线</span>
                      <output className="tabular-nums text-foreground">{Math.round(environmentSettings.panoramaHorizonV * 100)}%</output>
                    </span>
                    <input type="range" aria-label="分界线" min="40" max="65" step="1" value={Math.round(environmentSettings.panoramaHorizonV * 100)} disabled={!viewer || saving} onChange={(event) => updateEnvironmentSetting("panoramaHorizonV", Number(event.target.value) / 100)} className="w-full accent-primary" />
                  </label>
                </div>

                <div className="space-y-2 border-t border-border/60 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium">空间标记</div>
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
                  </div>
                  {!sceneMarkersAreCurrent && selectedState.scene3dMarkers ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300" role="status">场景投射参数已改变，请重新识别空间标记。</p>
                  ) : null}
                  {sceneMarkersAreCurrent ? (
                    <p className="text-xs text-muted-foreground">{visibleSceneMarkers.length ? `对象列表中有 ${visibleSceneMarkers.length} 个固定物体。` : "尚未识别空间标记。"}</p>
                  ) : null}
                </div>
              </>
            ) : selectedObjectId === REFERENCE_OBJECT_ID ? (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">对象</dt>
                  <dd className="text-right">参考角色</dd>
                  <dt className="text-muted-foreground">高度</dt>
                  <dd className="text-right tabular-nums">约 {REFERENCE_ACTOR_HEIGHT_METERS.toFixed(1)} 米</dd>
                  <dt className="text-muted-foreground">用途</dt>
                  <dd className="text-right">校准场景尺度</dd>
                </dl>
                <p className="border-t border-border/60 pt-4 text-xs leading-5 text-muted-foreground">固定在场景原点，只用于校准投射中心和半球直径，不会保存到分镜。</p>
                <Button type="button" variant="outline" className="w-full" disabled={!viewer || saving} onClick={() => { viewer?.selectActor(REFERENCE_ACTOR_LABEL); viewer?.fitView(); }}>
                  <Move3D className="mr-1.5 h-4 w-4" aria-hidden="true" />聚焦参考角色
                </Button>
              </>
            ) : selectedMarker ? (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">名称</dt>
                  <dd className="text-right">{selectedMarker.label}</dd>
                  <dt className="text-muted-foreground">类型</dt>
                  <dd className="text-right">{STORY_SCENE_3D_MARKER_KIND_LABELS[selectedMarker.kind]}</dd>
                  <dt className="text-muted-foreground">置信度</dt>
                  <dd className="text-right tabular-nums">{Math.round(selectedMarker.confidence * 100)}%</dd>
                  <dt className="text-muted-foreground">位置</dt>
                  <dd className="text-right tabular-nums">{formatVector(selectedMarker.position)}</dd>
                  <dt className="text-muted-foreground">尺寸</dt>
                  <dd className="text-right tabular-nums">{formatVector(selectedMarker.size)}</dd>
                </dl>
                <Button type="button" variant="outline" className="w-full" disabled={!viewer || saving} onClick={() => focusMarker(selectedMarker.id)}>
                  <Move3D className="mr-1.5 h-4 w-4" aria-hidden="true" />聚焦空间标记
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">对象已从当前场景状态移除。</p>
            )}
          </CardContent>
        </Card>
      }
    />
  );
}
