import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Loader2,
  MapPin,
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
import { cn } from "@/lib/utils";
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

export default function DramaBlocking3DPage() {
  const { id: projectId = "", shotId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const shotOrder = searchParams.get("order");
  const autoPlanRequested = searchParams.get("autoPlan") === "1";
  const autoPlanMode = autoPlanRequested ? "requested" : "initial";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<Blocking3dViewer | null>(null);
  const [viewer, setViewer] = useState<Blocking3dViewer | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [status, setStatus] = useState("准备 3D 草图");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedPose, setSelectedPose] = useState<DramaShotBlockingSketchPose | null>(null);
  const [selectedColor, setSelectedColor] = useState<RgbColor | null>(null);
  const [selectedTransform, setSelectedTransform] = useState<ReturnType<Blocking3dViewer["getSelectedTransform"]>>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoPlanning, setAutoPlanning] = useState(false);
  const [savedData, setSavedData] = useState<DramaShotBlockingSketchData | null>(null);
  const [cameraState, setCameraState] = useState(DEFAULT_BLOCKING_3D_CAMERA);
  const leavingRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const autoPlanKeyRef = useRef<string | null>(null);

  const contextQuery = useQuery({
    queryKey: ["drama-shot-blocking-sketch", projectId, shotId],
    queryFn: () => getDramaShotBlockingSketch(projectId, shotId),
    enabled: Boolean(projectId && shotId),
    staleTime: 0,
  });
  const context = contextQuery.data?.data ?? null;

  const syncSelection = useCallback((nextViewer: Blocking3dViewer) => {
    setSelectedName(nextViewer.getSelectedActor());
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
      unsubscribeMarkerSelection = nextViewer.onMarkerSelection(setSelectedMarkerId);
      unsubscribeChange = nextViewer.onChange(() => {
        setDirty(true);
        syncSelection(nextViewer);
      });
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
    setSelectedMarkerId(markerId);
  }, [viewer]);

  const applyViewerAction = useCallback((action: (nextViewer: Blocking3dViewer) => boolean) => {
    if (!viewer || saving || autoPlanning) return;
    if (!action(viewer)) return;
    setDirty(true);
    syncSelection(viewer);
  }, [autoPlanning, saving, syncSelection, viewer]);

  const saveSketch = useCallback(async (): Promise<boolean> => {
    if (savePromiseRef.current) return savePromiseRef.current;
    if (!viewer || !context?.scene) return false;
    const promise = (async () => {
      setSaving(true);
      viewer.setInteractionEnabled(false);
      try {
        const draft = buildSketchData(context, viewer);
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
  }, [context, projectId, queryClient, shotId, viewer]);

  const handleAutoPlan = useCallback(async () => {
    if (!viewer || !context?.scene || autoPlanning || saving) return;
    setAutoPlanning(true);
    viewer.setInteractionEnabled(false);
    try {
      const result = await autoPlanDramaShotBlockingSketch(projectId, shotId);
      if (!result.data?.layout) throw new Error("自动构图没有返回可用的 3D 布局。");
      viewer.loadLayout(result.data.layout);
      syncSelection(viewer);
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

  useEffect(() => {
    if (!viewer || !context?.scene || context.actors.length === 0) return;
    const shouldAutoPlan = autoPlanRequested || !context.sketch?.layout3d;
    if (!shouldAutoPlan) return;
    const key = `${projectId}:${shotId}:${autoPlanMode}`;
    if (autoPlanKeyRef.current === key) return;
    autoPlanKeyRef.current = key;
    void handleAutoPlan();
  }, [autoPlanMode, context, handleAutoPlan, projectId, viewer]);

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

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
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
                <p className="text-xs text-muted-foreground">左键拖动角色，右键旋转视角，滚轮缩放视角；右侧调整静态姿势和位置。</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:inline" role="status">{status}</span>
              <AiButton type="button" variant="outline" disabled={!viewer || saving || autoPlanning || context.actors.length === 0} onClick={() => void handleAutoPlan()} title="按本镜角色、动作和场景自动规划 3D 构图">
                {autoPlanning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <WandSparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                {autoPlanning ? "自动构图中" : context.sketch?.layout3d ? "重新自动构图" : "AI 自动构图"}
              </AiButton>
            </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="w-full self-start overflow-hidden">
          <CardContent className="relative aspect-video w-full p-0">
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
          </CardContent>
        </Card>

        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">本镜角色</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {context.actors.length ? context.actors.map((actor, index) => {
                const placed = placedNames.has(actor.characterName);
                const selected = actor.characterName === selectedName;
                return (
                  <div key={actor.characterName} className={cn("flex items-center gap-1.5 rounded-md border px-1.5 py-1", selected && "border-primary bg-accent")}>
                    <button type="button" disabled={saving} className="min-h-9 min-w-0 flex-1 truncate px-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" aria-pressed={selected} onClick={() => placed ? viewer?.selectActor(actor.characterName) : applyViewerAction((nextViewer) => nextViewer.addActor(actor.characterName, index, actor.heightMeters))}>
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="truncate">{actor.characterName}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatHeight(actor.heightMeters)}</span>
                      </span>
                    </button>
                    {placed ? <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={saving} aria-label={`移除${actor.characterName}`} title="移除角色" onClick={() => applyViewerAction((nextViewer) => nextViewer.removeActor(actor.characterName))}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button> : <span className="px-1 text-[11px] text-muted-foreground">加入</span>}
                  </div>
                );
              }) : <p className="text-xs text-muted-foreground">本镜没有已识别角色。</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">场景空间标记</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {context.scene.markers.length ? context.scene.markers.map((marker) => {
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
              }) : <p className="text-xs text-muted-foreground">当前场景没有已识别标记。</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">静态姿势</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {selectedName ? <p className="text-sm font-medium">{selectedName}</p> : <p className="text-xs text-muted-foreground">先选择一个角色。</p>}
              <label className="block space-y-1.5 text-xs text-muted-foreground">
                <span>姿势</span>
                <SelectControl aria-label="角色姿势" value={selectedPose ?? ""} disabled={saving || !selectedName} onChange={(event) => applyViewerAction((nextViewer) => nextViewer.setSelectedPose(event.target.value as DramaShotBlockingSketchPose))} className="h-9 w-full">
                  <option value="" disabled>选择姿势</option>
                  {BLOCKING_3D_POSES.map((pose) => <option key={pose} value={pose}>{BLOCKING_3D_POSE_LABELS[pose]}</option>)}
                </SelectControl>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">模型外观</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {selectedName ? <p className="text-sm font-medium">{selectedName}</p> : <p className="text-xs text-muted-foreground">先选择一个角色。</p>}
              <label className="block space-y-1.5 text-xs text-muted-foreground">
                <span className="flex items-center justify-between gap-2">
                  <span>模型颜色</span>
                  <span className="font-mono text-[11px] uppercase">{selectedColor ? rgbToHex(selectedColor) : "—"}</span>
                </span>
                <Input
                  type="color"
                  aria-label="模型颜色"
                  value={rgbToHex(selectedColor)}
                  disabled={saving || autoPlanning || !selectedName}
                  onChange={(event) => {
                    const color = hexToRgb(event.target.value);
                    if (color) applyViewerAction((nextViewer) => nextViewer.setSelectedColor(color));
                  }}
                  className="h-10 cursor-pointer p-1"
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">空间摆放</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-1.5">
                <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="角色向左移动" title="向左移动" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.nudgeSelected(-0.2, 0, 0))}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Button>
                <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="角色向前移动" title="向前移动" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.nudgeSelected(0, 0, -0.2))}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
                <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="角色向右移动" title="向右移动" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.nudgeSelected(0.2, 0, 0))}><ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
                <span />
                <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="角色向后移动" title="向后移动" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.nudgeSelected(0, 0, 0.2))}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
                <span />
                <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="角色升高" title="升高" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.nudgeSelected(0, 0.2, 0))}><Plus className="h-4 w-4" aria-hidden="true" /></Button>
                <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="角色降低" title="降低" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.nudgeSelected(0, -0.2, 0))}><Minus className="h-4 w-4" aria-hidden="true" /></Button>
                <Button type="button" variant="outline" size="sm" className="h-9 px-2 text-xs" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.groundSelected())}>落地</Button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="向左旋转角色" title="向左旋转" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.rotateSelected(-15))}><RotateCcw className="h-4 w-4" aria-hidden="true" /></Button>
                <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="向右旋转角色" title="向右旋转" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.rotateSelected(15))}><RotateCw className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <dt>位置</dt><dd className="text-right tabular-nums">{formatVec3(selectedTransform?.position)}</dd>
                <dt>旋转</dt><dd className="text-right tabular-nums">{selectedTransform ? `${selectedTransform.yawDeg.toFixed(0)}°` : "—"}</dd>
                <dt>身高</dt><dd className="text-right tabular-nums">{formatHeight(selectedActorContext?.heightMeters)}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">相机</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-9" disabled={saving || autoPlanning || !viewer} onClick={() => viewer?.fitView()}><Move3D className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />聚焦角色</Button>
                  <Button type="button" variant="outline" size="sm" className="h-9" disabled={saving || autoPlanning || !viewer} onClick={() => viewer?.resetCamera()}><RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />复位视角</Button>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <dt>视野角</dt><dd className="text-right tabular-nums">{cameraState.fovDeg.toFixed(0)}°</dd>
                  <dt>景深</dt><dd className="text-right">{cameraState.depthOfFieldEnabled ? "开启" : "关闭"}</dd>
                  <dt>焦点距离</dt><dd className="text-right tabular-nums">{cameraState.focusDistance.toFixed(2)}</dd>
                  <dt>清晰范围</dt><dd className="text-right tabular-nums">{cameraState.focusRange.toFixed(2)}</dd>
                  <dt>模糊半径</dt><dd className="text-right tabular-nums">{cameraState.blurRadius.toFixed(2)}</dd>
                </dl>
              </CardContent>
          </Card>

        </aside>
      </div>
    </div>
  );
}
