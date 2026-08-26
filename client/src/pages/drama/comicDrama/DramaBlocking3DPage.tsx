import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Loader2,
  Minus,
  Move3D,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  WandSparkles,
} from "lucide-react";

import {
  autoPlanDramaShotBlockingSketch,
  confirmDramaShotBlockingSketch,
  getDramaShotBlockingSketch,
  saveDramaShotBlockingSketch,
  uploadDramaShotBlockingSketchPng,
  type DramaShotBlockingSketch3DLayout,
  type DramaShotBlockingSketchData,
  type DramaShotBlockingSketchEditorContext,
  type DramaShotBlockingSketchPose,
} from "@/api/media/drama";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import SelectControl from "@/components/common/SelectControl";
import AiButton from "@/components/common/AiButton";
import { toast } from "@/components/ui/toast";
import { STORY_SCENE_3D_MARKER_KIND_LABELS } from "@ai-novel/shared/types/comicDrama";
import {
  BLOCKING_3D_POSES,
  BLOCKING_3D_POSE_LABELS,
  DEFAULT_BLOCKING_3D_CAMERA,
  projectBlocking3dActorToLegacy,
} from "./components/blocking3d/blocking3dMath";
import {
  createBlocking3dViewer,
  type Blocking3dViewer,
} from "./components/blocking3d/blocking3dViewerApp";
import {
  Drama3DEditorShell,
  Drama3DObjectPanel,
  type Drama3DObjectItem,
} from "./components/editor3d";

function initialLayout(context: DramaShotBlockingSketchEditorContext): DramaShotBlockingSketch3DLayout {
  if (!context.scene) throw new Error("当前镜头没有可用的场景状态图。");
  if (context.sketch?.layout3d) {
    return { ...context.sketch.layout3d, environment: context.scene.environment };
  }
  return {
    schemaVersion: 1,
    engine: "playcanvas",
    camera: { ...DEFAULT_BLOCKING_3D_CAMERA, focalPoint: [...DEFAULT_BLOCKING_3D_CAMERA.focalPoint] },
    environment: context.scene.environment,
    actors: [],
  };
}

function buildSketchData(
  context: DramaShotBlockingSketchEditorContext,
  viewer: Blocking3dViewer,
  currentCompositionNote: string,
): DramaShotBlockingSketchData {
  if (!context.scene) throw new Error("当前镜头没有可用的场景状态图。");
  const { environment: _shotEnvironment, ...layout3d } = viewer.exportLayout();
  const sourceByName = new Map(context.actors.map((actor) => [actor.characterName, actor]));
  const actors = layout3d.actors.map((actor, index) => {
    const source = sourceByName.get(actor.characterName);
    return {
      ...projectBlocking3dActorToLegacy(actor, index),
      ...(source?.assetId ? { assetId: source.assetId } : {}),
      ...(source?.stateId ? { stateId: source.stateId } : {}),
      ...(source?.imageUrl ? { imageUrl: source.imageUrl } : {}),
    };
  });
  const scene = context.sketch?.scene ?? {
    assetId: context.scene.assetId,
    stateId: context.scene.stateId,
    imageUrl: context.scene.imageUrl,
    yawDeg: 0,
    pitchDeg: 0,
    fovDeg: 78,
  };
  return {
    status: "draft",
    version: (context.sketch?.version ?? 0) + 1,
    ...(currentCompositionNote.trim() ? { compositionNote: currentCompositionNote.trim() } : {}),
    scene,
    actors,
    layout3d,
  };
}

function formatVec3(value: [number, number, number] | undefined): string {
  if (!value) return "—";
  return value.map((item) => item.toFixed(2)).join(" / ");
}

function formatHeight(heightMeters: number | undefined): string {
  return typeof heightMeters === "number" && Number.isFinite(heightMeters)
    ? `约 ${heightMeters.toFixed(1)} 米`
    : "—";
}

type RgbColor = [number, number, number];

function rgbToHex(color: RgbColor | null): string {
  if (!color) return "#000000";
  return `#${color.map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(value: string): RgbColor | null {
  if (!/^#[\da-f]{6}$/i.test(value)) return null;
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset + 1, offset + 3), 16) / 255) as RgbColor;
}

const SCENE_OBJECT_ID = "scene";

type BlockingObjectSelectionId = typeof SCENE_OBJECT_ID | `actor:${string}` | `marker:${string}`;

function actorObjectId(name: string): `actor:${string}` {
  return `actor:${name}`;
}

function markerObjectId(markerId: string): `marker:${string}` {
  return `marker:${markerId}`;
}

export default function DramaBlocking3DPage() {
  const { id: projectId = "", shotId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const shotOrder = searchParams.get("order");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<Blocking3dViewer | null>(null);
  const [viewer, setViewer] = useState<Blocking3dViewer | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [status, setStatus] = useState("准备 3D 草图");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<BlockingObjectSelectionId>(SCENE_OBJECT_ID);
  const [selectedPose, setSelectedPose] = useState<DramaShotBlockingSketchPose | null>(null);
  const [selectedColor, setSelectedColor] = useState<RgbColor | null>(null);
  const [selectedTransform, setSelectedTransform] = useState<ReturnType<Blocking3dViewer["getSelectedTransform"]>>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoPlanning, setAutoPlanning] = useState(false);
  const [compositionNote, setCompositionNote] = useState("");
  const [savedData, setSavedData] = useState<DramaShotBlockingSketchData | null>(null);
  const [cameraState, setCameraState] = useState(DEFAULT_BLOCKING_3D_CAMERA);
  const leavingRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  const contextQuery = useQuery({
    queryKey: ["drama-shot-blocking-sketch", projectId, shotId],
    queryFn: () => getDramaShotBlockingSketch(projectId, shotId),
    enabled: Boolean(projectId && shotId),
    staleTime: 0,
  });
  const context = contextQuery.data?.data ?? null;

  useEffect(() => {
    setCompositionNote(context?.sketch?.compositionNote ?? "");
  }, [context?.sketch?.compositionNote]);

  const syncSelection = useCallback((nextViewer: Blocking3dViewer) => {
    const nextSelectedName = nextViewer.getSelectedActor();
    setSelectedName(nextSelectedName);
    setSelectedObjectId(nextSelectedName ? actorObjectId(nextSelectedName) : SCENE_OBJECT_ID);
    setSelectedPose(nextViewer.getSelectedPose());
    setSelectedColor(nextViewer.getSelectedColor());
    setSelectedTransform(nextViewer.getSelectedTransform());
    setCameraState(nextViewer.getCameraState());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !context?.scene || viewerRef.current) return undefined;
    let cancelled = false;
    let unsubscribeSelection: (() => void) | undefined;
    let unsubscribeMarkerSelection: (() => void) | undefined;
    let unsubscribeChange: (() => void) | undefined;
    setViewerError(null);
    void createBlocking3dViewer({
      canvas,
      environmentUrl: context.scene.imageUrl,
      sceneMarkers: context.scene.markers,
      onStatus: setStatus,
    }).then((nextViewer) => {
      if (cancelled) {
        nextViewer.destroy();
        return;
      }
      viewerRef.current = nextViewer;
      setViewer(nextViewer);
      const sources = context.actors ?? [];
      sources.forEach((actor, index) => nextViewer.addActor(actor.characterName, index, actor.heightMeters));
      const layout = initialLayout(context);
      if (layout.actors.length > 0) nextViewer.loadLayout(layout);
      else nextViewer.fitView();
      syncSelection(nextViewer);
      unsubscribeSelection = nextViewer.onSelectionChange(() => syncSelection(nextViewer));
      unsubscribeMarkerSelection = nextViewer.onMarkerSelection((markerId) => {
        setSelectedObjectId(markerId ? markerObjectId(markerId) : SCENE_OBJECT_ID);
      });
      unsubscribeChange = nextViewer.onChange(() => {
        setDirty(true);
        syncSelection(nextViewer);
      });
      nextViewer.selectActor(null);
      nextViewer.fitView();
    }).catch((error: unknown) => {
      if (!cancelled) setViewerError(error instanceof Error ? error.message : "3D 草图加载失败。");
    });
    return () => {
      cancelled = true;
      unsubscribeSelection?.();
      unsubscribeMarkerSelection?.();
      unsubscribeChange?.();
      viewerRef.current?.destroy();
      viewerRef.current = null;
      setViewer(null);
    };
  }, [context, syncSelection]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty || saving) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving]);

  const placedNames = new Set(viewer?.getActorLabels() ?? []);
  const selectedActorContext = context?.actors.find((actor) => actor.characterName === selectedName);

  const focusMarker = useCallback((markerId: string) => {
    if (!viewer) return;
    viewer.focusMarker(markerId);
    setSelectedObjectId(markerObjectId(markerId));
  }, [viewer]);

  const applyViewerAction = useCallback((action: (nextViewer: Blocking3dViewer) => boolean) => {
    if (!viewer || saving || autoPlanning) return;
    if (!action(viewer)) return;
    setDirty(true);
    syncSelection(viewer);
  }, [autoPlanning, saving, syncSelection, viewer]);

  const selectObject = useCallback((objectId: BlockingObjectSelectionId) => {
    if (!viewer || saving || autoPlanning) return;
    if (objectId === SCENE_OBJECT_ID) {
      viewer.selectActor(null);
      setSelectedObjectId(SCENE_OBJECT_ID);
      return;
    }
    if (objectId.startsWith("marker:")) {
      focusMarker(objectId.slice("marker:".length));
      return;
    }
    const actorName = objectId.slice("actor:".length);
    if (placedNames.has(actorName)) {
      viewer.selectActor(actorName);
      setSelectedObjectId(objectId);
      return;
    }
    const actorIndex = context?.actors.findIndex((actor) => actor.characterName === actorName) ?? -1;
    const actor = actorIndex >= 0 ? context?.actors[actorIndex] : undefined;
    if (!actor) return;
    applyViewerAction((nextViewer) => nextViewer.addActor(actor.characterName, actorIndex, actor.heightMeters));
    viewer.selectActor(actorName);
    setSelectedObjectId(objectId);
  }, [applyViewerAction, autoPlanning, context?.actors, focusMarker, placedNames, saving, viewer]);

  const saveSketch = useCallback(async (): Promise<boolean> => {
    if (savePromiseRef.current) return savePromiseRef.current;
    if (!viewer || !context?.scene) return false;
    const promise = (async () => {
      setSaving(true);
      viewer.setInteractionEnabled(false);
      try {
        const draft = buildSketchData(context, viewer, compositionNote);
        const saved = await saveDramaShotBlockingSketch(projectId, shotId, draft);
        if (!saved.data) throw new Error("保存没有返回草图数据。");
        const png = viewer.capturePng();
        const uploaded = await uploadDramaShotBlockingSketchPng(projectId, shotId, png);
        if (!uploaded.data) throw new Error("保存没有返回草图图片。");
        const confirmed = await confirmDramaShotBlockingSketch(projectId, shotId);
        if (!confirmed.data) throw new Error("确认没有返回草图数据。");
        setSavedData(confirmed.data);
        setDirty(false);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(projectId), refetchType: "all" }),
          queryClient.invalidateQueries({ queryKey: ["comic-drama"], refetchType: "all" }),
        ]);
        setStatus("3D 草图已保存");
        toast.success("3D 草图已保存。", {
          description: "分镜生成会使用最新的草图参考图。",
        });
        return true;
      } catch (error) {
        toast.error("保存 3D 草图失败", {
          description: error instanceof Error ? error.message : "请稍后重试。",
        });
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
  }, [compositionNote, context, projectId, queryClient, shotId, viewer]);

  const handleAutoPlan = useCallback(async () => {
    if (!viewer || !context?.scene || autoPlanning || saving) return;
    setAutoPlanning(true);
    viewer.setInteractionEnabled(false);
    try {
      const result = await autoPlanDramaShotBlockingSketch(projectId, shotId);
      if (!result.data?.layout) throw new Error("自动构图没有返回可用的 3D 布局。");
      viewer.loadLayout(result.data.layout);
      syncSelection(viewer);
      setCompositionNote(result.data.compositionNote ?? "");
      setDirty(true);
      setStatus("AI 构图完成，有未保存修改");
      toast.success("AI 已完成本镜构图。", {
        description: result.data.compositionNote || "角色位置、相机和景深已应用到 3D 草图。",
      });
    } catch (error) {
      toast.error("AI 自动构图失败", {
        description: error instanceof Error ? error.message : "请稍后重试，原有布局已保留。",
      });
    } finally {
      viewer.setInteractionEnabled(true);
      setAutoPlanning(false);
    }
  }, [autoPlanning, context, projectId, saving, shotId, syncSelection, viewer]);

  const saveBeforeExit = useCallback(async (): Promise<boolean> => {
    if (savePromiseRef.current) return savePromiseRef.current;
    if (dirty) return saveSketch();
    return true;
  }, [dirty, saveSketch]);

  const goBack = async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    if (!(await saveBeforeExit())) {
      leavingRef.current = false;
      return;
    }
    navigate(-1);
  };

  const currentStatus = savedData?.status ?? context?.sketch?.status ?? "draft";

  if (contextQuery.isPending) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />载入 3D 草图数据</div>;
  }
  if (contextQuery.isError || !context) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-destructive">草图数据载入失败。</p>
        <Button variant="outline" onClick={() => void contextQuery.refetch()}>重新载入</Button>
      </div>
    );
  }
  if (!context.scene) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">当前镜头没有可用的场景状态图。</p>
        <Button variant="outline" onClick={goBack}><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />返回分镜</Button>
      </div>
    );
  }

  const selectedMarker = selectedObjectId.startsWith("marker:")
    ? context.scene.markers.find((marker) => marker.id === selectedObjectId.slice("marker:".length)) ?? null
    : null;
  const objectItems: Drama3DObjectItem[] = [
    {
      id: SCENE_OBJECT_ID,
      label: "世界",
      kind: "scene",
      selected: selectedObjectId === SCENE_OBJECT_ID,
      onSelect: () => selectObject(SCENE_OBJECT_ID),
    },
    ...context.actors.map((actor, index) => {
      const id = actorObjectId(actor.characterName);
      return {
        id,
        label: actor.characterName,
        kind: "actor" as const,
        selected: selectedObjectId === id,
        onSelect: () => selectObject(id),
      };
    }),
    ...context.scene.markers.map((marker) => {
      const id = markerObjectId(marker.id);
      return {
        id,
        label: marker.label,
        kind: "marker" as const,
        selected: selectedObjectId === id,
        onSelect: () => selectObject(id),
      };
    }),
  ];

  const cameraActions = (
    <div className="space-y-3 border-t border-border/60 pt-4">
      <div className="text-xs font-medium">相机</div>
      <div className="grid grid-cols-2 gap-1.5">
        <Button type="button" variant="outline" size="sm" className="h-9" disabled={saving || autoPlanning || !viewer} onClick={() => viewer?.fitView()}>
          <Move3D className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />聚焦角色
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-9" disabled={saving || autoPlanning || !viewer} onClick={() => viewer?.resetCamera()}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />复位视角
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <dt>视野角</dt><dd className="text-right tabular-nums">{cameraState.fovDeg.toFixed(0)}°</dd>
        <dt>景深</dt><dd className="text-right">{cameraState.depthOfFieldEnabled ? "开启" : "关闭"}</dd>
        <dt>焦点距离</dt><dd className="text-right tabular-nums">{cameraState.focusDistance.toFixed(2)}</dd>
        <dt>清晰范围</dt><dd className="text-right tabular-nums">{cameraState.focusRange.toFixed(2)}</dd>
        <dt>模糊半径</dt><dd className="text-right tabular-nums">{cameraState.blurRadius.toFixed(2)}</dd>
      </dl>
    </div>
  );

  return (
    <Drama3DEditorShell
      header={
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <Button type="button" variant="ghost" size="icon" aria-label="返回分镜" title="返回分镜" disabled={saving || autoPlanning} onClick={() => void goBack()}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold">{shotOrder ? `第 ${shotOrder} 镜 3D 草图` : "3D 草图"}</h1>
                <Badge variant={!dirty && currentStatus === "confirmed" ? "default" : "secondary"}>
                  {saving ? "保存中" : dirty ? "有未保存修改" : currentStatus === "confirmed" ? "已保存" : "草稿"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">左键拖动角色，右键旋转视角，滚轮缩放视角；在对象列表选择对象后调整属性。</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline" role="status">{status}</span>
          </div>
        </div>
      }
      viewport={
        <Card className="h-full min-h-0 w-full overflow-hidden">
          <CardContent className="relative h-full min-h-0 w-full p-0">
            <canvas ref={canvasRef} aria-label="3D 草图视口" aria-busy={saving || autoPlanning} className="block h-full w-full touch-none bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            {!viewer && !viewerError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />初始化 3D 草图</div>
            ) : null}
            {viewerError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center">
                <p className="text-sm text-destructive">{viewerError}</p>
                <p className="text-xs text-muted-foreground">请确认浏览器支持 WebGL，并重新打开 3D 草图。</p>
                <Button variant="outline" onClick={() => void goBack()}>返回分镜</Button>
              </div>
            ) : null}
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
              <Move3D className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />左键拖角色 · 右键旋转 · 滚轮缩放视角 · 中键平移
            </div>
            <div className="pointer-events-none absolute right-3 top-3">
              <Badge variant="secondary" className="shadow-sm">镜头预览</Badge>
            </div>
          </CardContent>
        </Card>
      }
      objects={<Drama3DObjectPanel items={objectItems} />}
      actions={
        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 px-3 pb-2 pt-2.5">
            <CardTitle className="text-sm">属性面板</CardTitle>
            <Badge variant="outline">
              {selectedObjectId === SCENE_OBJECT_ID ? "世界" : selectedObjectId.startsWith("actor:") ? "角色" : selectedMarker ? "空间标记" : "对象"}
            </Badge>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {selectedObjectId === SCENE_OBJECT_ID ? (
              <>
                <div className="text-xs font-medium">镜头设计</div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">镜头</dt>
                  <dd className="text-right">第 {context.shot.order} 镜</dd>
                  <dt className="text-muted-foreground">景别</dt>
                  <dd className="text-right">{context.shot.shotSize || "未设置"}</dd>
                  <dt className="text-muted-foreground">运镜</dt>
                  <dd className="text-right">{context.shot.cameraMove || "未设置"}</dd>
                  <dt className="text-muted-foreground">时长</dt>
                  <dd className="text-right tabular-nums">{context.shot.durationSec == null ? "未设置" : `${context.shot.durationSec} 秒`}</dd>
                </dl>
                <div className="space-y-1.5 border-t border-border/60 pt-4 text-xs">
                  <div className="text-muted-foreground">动作</div>
                  <p className="whitespace-pre-wrap leading-5">{context.shot.action || "未设置"}</p>
                  {context.shot.dialogue ? (
                    <>
                      <div className="pt-1 text-muted-foreground">对白</div>
                      <p className="whitespace-pre-wrap leading-5">{context.shot.dialogue}</p>
                    </>
                  ) : null}
                </div>
                <div className="space-y-2 border-t border-border/60 pt-4 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-muted-foreground">AI 构图说明</div>
                    <AiButton type="button" variant="outline" size="sm" disabled={!viewer || saving || autoPlanning || context.actors.length === 0} onClick={() => void handleAutoPlan()} title="按本镜角色、动作和场景自动规划 3D 构图">
                      {autoPlanning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <WandSparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                      {autoPlanning ? "自动构图中" : context.sketch?.layout3d ? "重新构图" : "AI 构图"}
                    </AiButton>
                  </div>
                  <p className="whitespace-pre-wrap leading-5 text-foreground">{compositionNote || "尚未生成构图说明。"}</p>
                </div>
                {cameraActions}
              </>
            ) : selectedMarker ? (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">名称</dt><dd className="text-right">{selectedMarker.label}</dd>
                  <dt className="text-muted-foreground">类型</dt><dd className="text-right">{STORY_SCENE_3D_MARKER_KIND_LABELS[selectedMarker.kind]}</dd>
                  <dt className="text-muted-foreground">置信度</dt><dd className="text-right tabular-nums">{Math.round(selectedMarker.confidence * 100)}%</dd>
                  <dt className="text-muted-foreground">位置</dt><dd className="text-right tabular-nums">{formatVec3(selectedMarker.position)}</dd>
                  <dt className="text-muted-foreground">尺寸</dt><dd className="text-right tabular-nums">{formatVec3(selectedMarker.size)}</dd>
                </dl>
                <Button type="button" variant="outline" className="w-full" disabled={!viewer || saving || autoPlanning} onClick={() => focusMarker(selectedMarker.id)}>
                  <Move3D className="mr-1.5 h-4 w-4" aria-hidden="true" />聚焦空间标记
                </Button>
                {cameraActions}
              </>
            ) : selectedActorContext ? (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">角色</dt><dd className="text-right">{selectedActorContext.characterName}</dd>
                  <dt className="text-muted-foreground">身高</dt><dd className="text-right tabular-nums">{formatHeight(selectedActorContext.heightMeters)}</dd>
                  <dt className="text-muted-foreground">状态</dt><dd className="text-right">{placedNames.has(selectedActorContext.characterName) ? "已加入镜头" : "未加入镜头"}</dd>
                </dl>
                <Button type="button" variant="outline" className="w-full" disabled={saving || autoPlanning || !placedNames.has(selectedActorContext.characterName)} onClick={() => applyViewerAction((nextViewer) => nextViewer.removeActor(selectedActorContext.characterName))}>
                  <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />从本镜移除
                </Button>
                <div className="space-y-3 border-t border-border/60 pt-4">
                  <div className="text-xs font-medium">静态姿势</div>
                  <label className="block space-y-1.5 text-xs text-muted-foreground">
                    <span>姿势</span>
                    <SelectControl aria-label="角色姿势" value={selectedPose ?? ""} disabled={saving || autoPlanning || !selectedName} onChange={(event) => applyViewerAction((nextViewer) => nextViewer.setSelectedPose(event.target.value as DramaShotBlockingSketchPose))} className="h-9 w-full">
                      <option value="" disabled>选择姿势</option>
                      {BLOCKING_3D_POSES.map((pose) => <option key={pose} value={pose}>{BLOCKING_3D_POSE_LABELS[pose]}</option>)}
                    </SelectControl>
                  </label>
                </div>
                <div className="space-y-3 border-t border-border/60 pt-4">
                  <div className="text-xs font-medium">模型外观</div>
                  <label className="block space-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center justify-between gap-2"><span>模型颜色</span><span className="font-mono text-[11px] uppercase">{selectedColor ? rgbToHex(selectedColor) : "—"}</span></span>
                    <Input type="color" aria-label="模型颜色" value={rgbToHex(selectedColor)} disabled={saving || autoPlanning || !selectedName} onChange={(event) => { const color = hexToRgb(event.target.value); if (color) applyViewerAction((nextViewer) => nextViewer.setSelectedColor(color)); }} className="h-10 cursor-pointer p-1" />
                  </label>
                </div>
                <div className="space-y-3 border-t border-border/60 pt-4">
                  <div className="text-xs font-medium">空间摆放</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="角色向左移动" title="向左移动" disabled={saving || autoPlanning || !selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.nudgeSelected(-0.2, 0, 0))}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Button>
                    <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="角色向前移动" title="向前移动" disabled={saving || autoPlanning || !selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.nudgeSelected(0, 0, -0.2))}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
                    <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="角色向右移动" title="向右移动" disabled={saving || autoPlanning || !selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.nudgeSelected(0.2, 0, 0))}><ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
                    <span />
                    <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="角色向后移动" title="向后移动" disabled={saving || autoPlanning || !selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.nudgeSelected(0, 0, 0.2))}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
                    <span />
                    <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="角色升高" title="升高" disabled={saving || autoPlanning || !selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.nudgeSelected(0, 0.2, 0))}><Plus className="h-4 w-4" aria-hidden="true" /></Button>
                    <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="角色降低" title="降低" disabled={saving || autoPlanning || !selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.nudgeSelected(0, -0.2, 0))}><Minus className="h-4 w-4" aria-hidden="true" /></Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-2 text-xs" disabled={saving || autoPlanning || !selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.groundSelected())}>落地</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="向左旋转角色" title="向左旋转" disabled={saving || autoPlanning || !selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.rotateSelected(-15))}><RotateCcw className="h-4 w-4" aria-hidden="true" /></Button>
                    <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="向右旋转角色" title="向右旋转" disabled={saving || autoPlanning || !selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.rotateSelected(15))}><RotateCw className="h-4 w-4" aria-hidden="true" /></Button>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <dt>位置</dt><dd className="text-right tabular-nums">{formatVec3(selectedTransform?.position)}</dd>
                    <dt>旋转</dt><dd className="text-right tabular-nums">{selectedTransform ? `${selectedTransform.yawDeg.toFixed(0)}°` : "—"}</dd>
                    <dt>大小</dt><dd className="text-right tabular-nums">{formatVec3(selectedTransform?.scale)}</dd>
                    <dt>身高</dt><dd className="text-right tabular-nums">{formatHeight(selectedActorContext.heightMeters)}</dd>
                  </dl>
                </div>
                {cameraActions}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">从上方对象列表选择世界、角色或空间标记。</p>
            )}
          </CardContent>
        </Card>
      }
    />
  );
}
