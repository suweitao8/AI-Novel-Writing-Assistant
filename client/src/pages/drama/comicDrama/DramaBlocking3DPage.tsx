import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Loader2,
  Minus,
  Move3D,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
} from "lucide-react";

import {
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
import SelectControl from "@/components/common/SelectControl";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  BLOCKING_3D_POSES,
  BLOCKING_3D_POSE_LABELS,
  DEFAULT_BLOCKING_3D_CAMERA,
  projectBlocking3dActorToLegacy,
} from "./components/blocking3d/blocking3dMath";
import { createBlocking3dViewer, type Blocking3dViewer } from "./components/blocking3d/blocking3dViewerApp";

function initialLayout(context: DramaShotBlockingSketchEditorContext): DramaShotBlockingSketch3DLayout {
  if (context.sketch?.layout3d) return context.sketch.layout3d;
  const actors = context.sketch?.actors ?? [];
  return {
    schemaVersion: 1,
    engine: "playcanvas",
    camera: { ...DEFAULT_BLOCKING_3D_CAMERA, focalPoint: [...DEFAULT_BLOCKING_3D_CAMERA.focalPoint] },
    actors: actors.map((actor, index) => ({
      characterName: actor.characterName,
      position: [(actor.x - 0.5) * 10, 0, (index - actors.length / 2) * 0.35] as [number, number, number],
      yawDeg: actor.flipX ? 0 : 180,
      scale: [actor.scale / 0.4, actor.scale / 0.4, actor.scale / 0.4] as [number, number, number],
      pose: "standing" as const,
      actionPlaying: true,
    })),
  };
}

function buildSketchData(
  context: DramaShotBlockingSketchEditorContext,
  viewer: Blocking3dViewer,
): DramaShotBlockingSketchData {
  if (!context.scene) throw new Error("当前镜头没有可用的场景状态图。");
  const layout3d = viewer.exportLayout();
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
  const [status, setStatus] = useState("准备 3D 摆位台");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedPose, setSelectedPose] = useState<DramaShotBlockingSketchPose | null>(null);
  const [selectedActionPlaying, setSelectedActionPlaying] = useState<boolean | null>(null);
  const [selectedTransform, setSelectedTransform] = useState<ReturnType<Blocking3dViewer["getSelectedTransform"]>>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedData, setSavedData] = useState<DramaShotBlockingSketchData | null>(null);

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
    setSelectedActionPlaying(nextViewer.getSelectedActionPlaying());
    setSelectedTransform(nextViewer.getSelectedTransform());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !context?.scene || viewerRef.current) return undefined;
    let cancelled = false;
    let unsubscribeSelection: (() => void) | undefined;
    let unsubscribeChange: (() => void) | undefined;
    setViewerError(null);
    void createBlocking3dViewer({
      canvas,
      backgroundUrl: context.scene.imageUrl,
      onStatus: setStatus,
    }).then((nextViewer) => {
      if (cancelled) {
        nextViewer.destroy();
        return;
      }
      viewerRef.current = nextViewer;
      setViewer(nextViewer);
      const sources = context.actors ?? [];
      sources.forEach((actor, index) => nextViewer.addActor(actor.characterName, index));
      const layout = initialLayout(context);
      if (layout.actors.length > 0) nextViewer.loadLayout(layout);
      else nextViewer.fitView();
      syncSelection(nextViewer);
      unsubscribeSelection = nextViewer.onSelectionChange(() => syncSelection(nextViewer));
      unsubscribeChange = nextViewer.onChange(() => {
        setDirty(true);
        syncSelection(nextViewer);
      });
    }).catch((error: unknown) => {
      if (!cancelled) setViewerError(error instanceof Error ? error.message : "3D 摆位台加载失败。");
    });
    return () => {
      cancelled = true;
      unsubscribeSelection?.();
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

  const applyViewerAction = useCallback((action: (nextViewer: Blocking3dViewer) => boolean) => {
    if (!viewer || saving) return;
    if (!action(viewer)) return;
    setDirty(true);
    syncSelection(viewer);
  }, [saving, syncSelection, viewer]);

  const handleSave = async (confirmAfterSave: boolean) => {
    if (!viewer || !context?.scene || saving) return;
    setSaving(true);
    viewer.setInteractionEnabled(false);
    try {
      const draft = buildSketchData(context, viewer);
      const saved = await saveDramaShotBlockingSketch(projectId, shotId, draft);
      if (!saved.data) throw new Error("保存后没有返回摆位数据。");
      const png = viewer.capturePng();
      const uploaded = await uploadDramaShotBlockingSketchPng(projectId, shotId, png);
      const result = confirmAfterSave
        ? await confirmDramaShotBlockingSketch(projectId, shotId)
        : uploaded;
      if (!result.data) throw new Error("摆位图片上传后没有返回结果。");
      setSavedData(result.data);
      setDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(projectId) }),
        queryClient.invalidateQueries({ queryKey: ["comic-drama"] }),
      ]);
      toast.success(confirmAfterSave ? "3D 摆位已确认。" : "3D 摆位已保存。", {
        description: "分镜生成会使用这张摆位参考图。",
      });
    } catch (error) {
      toast.error(confirmAfterSave ? "确认 3D 摆位失败" : "保存 3D 摆位失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      viewer.setInteractionEnabled(true);
      setSaving(false);
    }
  };

  const goBack = () => {
    if (dirty && !window.confirm("当前 3D 摆位还有未保存修改，确定离开吗？")) return;
    navigate(-1);
  };

  const currentStatus = savedData?.status ?? context?.sketch?.status ?? "draft";

  if (contextQuery.isPending) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />载入 3D 摆位数据</div>;
  }
  if (contextQuery.isError || !context) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-destructive">摆位数据载入失败。</p>
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
          <Button type="button" variant="ghost" size="icon" aria-label="返回分镜" title="返回分镜" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{shotOrder ? `第 ${shotOrder} 镜 3D 摆位` : "3D 摆位台"}</h1>
              <Badge variant={!dirty && currentStatus === "confirmed" ? "default" : "secondary"}>
                {dirty ? "未保存" : currentStatus === "confirmed" ? "已确认" : "草稿"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">左键拖动角色，右键旋转视角，滚轮缩放；右侧可调整姿势和动作。</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline" role="status">{status}</span>
          <Button type="button" variant="outline" disabled={!viewer || saving} onClick={() => void handleSave(false)}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            保存摆位
          </Button>
          <Button type="button" disabled={!viewer || saving} onClick={() => void handleSave(true)}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            确认摆位
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="min-h-0 overflow-hidden">
          <CardContent className="relative aspect-video w-full p-0">
            <canvas ref={canvasRef} aria-label="3D 摆位视口" aria-busy={saving} className="block h-full w-full touch-none bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            {!viewer && !viewerError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />初始化 3D 摆位台</div>
            ) : null}
            {viewerError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center">
                <p className="text-sm text-destructive">{viewerError}</p>
                <p className="text-xs text-muted-foreground">请确认浏览器支持 WebGL，并重新打开摆位台。</p>
                <Button variant="outline" onClick={goBack}>返回分镜</Button>
              </div>
            ) : null}
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
              <Move3D className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />左键拖角色 · 右键旋转 · 滚轮缩放 · 中键平移
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
                    <button type="button" disabled={saving} className="min-h-9 min-w-0 flex-1 truncate px-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" aria-pressed={selected} onClick={() => placed ? viewer?.selectActor(actor.characterName) : applyViewerAction((nextViewer) => nextViewer.addActor(actor.characterName, index))}>
                      {actor.characterName}
                    </button>
                    {placed ? <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={saving} aria-label={`移除${actor.characterName}`} title="移除角色" onClick={() => applyViewerAction((nextViewer) => nextViewer.removeActor(actor.characterName))}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button> : <span className="px-1 text-[11px] text-muted-foreground">加入</span>}
                  </div>
                );
              }) : <p className="text-xs text-muted-foreground">本镜没有已识别角色。</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">姿势与动作</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {selectedName ? <p className="text-sm font-medium">{selectedName}</p> : <p className="text-xs text-muted-foreground">先选择一个角色。</p>}
              <label className="block space-y-1.5 text-xs text-muted-foreground">
                <span>姿势</span>
                <SelectControl aria-label="角色姿势" value={selectedPose ?? ""} disabled={saving || !selectedName} onChange={(event) => applyViewerAction((nextViewer) => nextViewer.setSelectedPose(event.target.value as DramaShotBlockingSketchPose))} className="h-9 w-full">
                  <option value="" disabled>选择姿势</option>
                  {BLOCKING_3D_POSES.map((pose) => <option key={pose} value={pose}>{BLOCKING_3D_POSE_LABELS[pose]}</option>)}
                </SelectControl>
              </label>
              <Button type="button" variant="outline" className="w-full" disabled={saving || !selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.setSelectedActionPlaying(!selectedActionPlaying))}>
                {selectedActionPlaying ? <Pause className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                {selectedActionPlaying ? "暂停动作" : "播放动作"}
              </Button>
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
              <div className="grid grid-cols-4 gap-1.5">
                <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="向左旋转角色" title="向左旋转" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.rotateSelected(-15))}><RotateCcw className="h-4 w-4" aria-hidden="true" /></Button>
                <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="向右旋转角色" title="向右旋转" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.rotateSelected(15))}><RotateCw className="h-4 w-4" aria-hidden="true" /></Button>
                <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="缩小角色" title="缩小" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.scaleSelected(0.9))}><Minus className="h-4 w-4" aria-hidden="true" /></Button>
                <Button type="button" variant="outline" size="icon" className="h-9 w-full" aria-label="放大角色" title="放大" disabled={!selectedName} onClick={() => applyViewerAction((nextViewer) => nextViewer.scaleSelected(1.1))}><Plus className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <dt>位置</dt><dd className="text-right tabular-nums">{formatVec3(selectedTransform?.position)}</dd>
                <dt>旋转</dt><dd className="text-right tabular-nums">{selectedTransform ? `${selectedTransform.yawDeg.toFixed(0)}°` : "—"}</dd>
                <dt>缩放</dt><dd className="text-right tabular-nums">{formatVec3(selectedTransform?.scale)}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">相机</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-1.5">
              <Button type="button" variant="outline" size="sm" className="h-9" disabled={saving || !viewer} onClick={() => viewer?.fitView()}><Move3D className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />聚焦角色</Button>
              <Button type="button" variant="outline" size="sm" className="h-9" disabled={saving || !viewer} onClick={() => viewer?.resetCamera()}><RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />复位视角</Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
