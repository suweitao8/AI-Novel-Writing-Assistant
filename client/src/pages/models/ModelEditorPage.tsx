import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Crosshair, Loader2, Move3D, RotateCcw, Trash2 } from "lucide-react";

import { getModelLibraryVisibility, hideModelLibraryEntry } from "@/api/modelLibrary";
import { getModelLibraryEntry } from "@/config/modelLibrary";
import {
  getModelUsageAnchorLabel,
  getModelUsageOrientationLabel,
  getModelUsagePlacementLabel,
  getModelUsageSurfaceLabel,
} from "@/config/modelLibraryUsage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AppDialogContent,
  Dialog,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { InspectorComponentSection } from "@/pages/drama/comicDrama/components/editor3d";
import {
  DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  getStudioEnvironmentDiameterPreference,
} from "./modelLibrary3d/studioEnvironmentPresets";
import { formatModelDimension } from "./modelLibrary3d/modelGeometryStats";
import { createModelViewer, type ModelViewer } from "./modelLibrary3d/modelViewerApp";
import { disposeThumbnailStudio } from "./modelLibrary3d/thumbnailStudio";

export default function ModelEditorPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const entry = getModelLibraryEntry(modelId);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<ModelViewer | null>(null);
  const [viewer, setViewer] = useState<ModelViewer | null>(null);
  const [geometryStats, setGeometryStats] = useState<ModelViewer["geometryStats"]>(null);
  const [showBounds, setShowBounds] = useState(false);
  const showBoundsRef = useRef(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [status, setStatus] = useState("正在初始化 3D 视口");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hiddenModelIds, setHiddenModelIds] = useState<ReadonlySet<string> | null>(null);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const visibilityRequestIdRef = useRef(0);

  const loadVisibility = useCallback(async () => {
    const requestId = visibilityRequestIdRef.current + 1;
    visibilityRequestIdRef.current = requestId;
    setHiddenModelIds(null);
    setVisibilityError(null);
    try {
      const response = await getModelLibraryVisibility();
      if (requestId !== visibilityRequestIdRef.current) return;
      if (!response.success || !response.data) {
        throw new Error(response.error ?? response.message ?? "模型库可见性加载失败。");
      }
      setHiddenModelIds(new Set(response.data.hiddenModelIds));
    } catch (error: unknown) {
      if (requestId !== visibilityRequestIdRef.current) return;
      setHiddenModelIds(null);
      setVisibilityError(error instanceof Error ? error.message : "模型库可见性加载失败。");
    }
  }, []);

  useEffect(() => {
    void loadVisibility();
  }, [loadVisibility]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !entry || !hiddenModelIds || hiddenModelIds.has(entry.id) || viewerRef.current) return undefined;
    let cancelled = false;
    showBoundsRef.current = false;
    setShowBounds(false);
    setViewerError(null);
    setGeometryStats(null);
    const start = async () => {
      // React StrictMode 会在同一个同步窗口内执行一次 effect 清理和重建。
      // 先跨过这个窗口，避免第一实例已经被清理后仍创建 WebGL 应用并抢占
      // 同一画布的 HDRI 上下文。
      disposeThumbnailStudio();
      await Promise.resolve();
      if (cancelled) return;
      try {
        const nextViewer = await createModelViewer({
          canvas,
          modelUrl: entry.fileUrl,
          unitScale: entry.unitScale,
          materials: entry.materials,
          environmentPresetId: DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
          environmentDiameterMeters: getStudioEnvironmentDiameterPreference(DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID),
          showBounds: showBoundsRef.current,
          onStatus: (next) => setStatus(next || "就绪"),
        });
        if (cancelled) {
          nextViewer.destroy();
          return;
        }
        viewerRef.current = nextViewer;
        nextViewer.setBoundsVisible(showBoundsRef.current);
        setViewer(nextViewer);
        setGeometryStats(nextViewer.geometryStats);
      } catch (error: unknown) {
        if (!cancelled) {
          setViewerError(error instanceof Error ? error.message : "3D 视口初始化失败。");
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      setViewer(null);
      setGeometryStats(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, hiddenModelIds]);

  const handleCapture = useCallback(() => {
    const current = viewerRef.current;
    if (!current || !entry) return;
    try {
      const blob = current.capturePng();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${entry.id}-snapshot.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("快照已导出。");
    } catch (error) {
      toast.error("快照导出失败。", { description: error instanceof Error ? error.message : undefined });
    }
  }, [entry]);

  const handleDelete = useCallback(async () => {
    if (!entry || deleting) return;
    setDeleting(true);
    try {
      const response = await hideModelLibraryEntry(entry.id);
      if (!response.success) {
        throw new Error(response.error ?? response.message ?? "模型隐藏失败。");
      }
      toast.success("模型已从模型库隐藏。");
      setDeleteOpen(false);
      navigate("/models", { replace: true });
    } catch (error: unknown) {
      toast.error("模型隐藏失败。", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDeleting(false);
    }
  }, [deleting, entry, navigate]);

  if (!entry) {
    return <Navigate to="/models" replace />;
  }

  if (!hiddenModelIds) {
    return (
      <section
        className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-12 text-center"
        data-model-editor-visibility-state={visibilityError ? "error" : "loading"}
      >
        {visibilityError ? (
          <>
            <p className="text-sm text-destructive">{visibilityError}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadVisibility()}>
              重试
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">正在加载模型库</p>
          </>
        )}
      </section>
    );
  }

  if (hiddenModelIds.has(entry.id)) {
    return <Navigate to="/models" replace />;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden" data-model-editor-page={entry.id}>
      <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
        <Button type="button" variant="ghost" size="icon" aria-label="返回模型库" title="返回模型库" asChild>
          <Link to="/models">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <h1 className="min-w-0 truncate text-sm font-semibold">{entry.name}</h1>
        <Badge variant="secondary" className="ml-1 shrink-0">
          {entry.category}
        </Badge>
        <Badge variant="outline" className="shrink-0">
          {entry.source}
        </Badge>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 gap-3 overflow-hidden max-xl:overflow-y-auto xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto max-xl:min-h-[18rem]">
          <InspectorComponentSection title="模型信息">
            <dl className="space-y-1.5 text-xs" data-model-info>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">文件</dt>
                <dd className="truncate font-medium">{entry.fileName}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">格式</dt>
                <dd className="font-medium">GLB</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">大小</dt>
                <dd className="font-medium">{entry.sizeKb} KB</dd>
              </div>
              <div className="flex items-center justify-between gap-2" data-model-geometry-stats>
                <dt className="text-muted-foreground">顶点数量</dt>
                <dd className="font-medium tabular-nums">
                  {geometryStats ? geometryStats.vertexCount.toLocaleString("zh-CN") : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">长</dt>
                <dd className="font-medium tabular-nums">
                  {geometryStats ? formatModelDimension(geometryStats.dimensions.length) : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">宽</dt>
                <dd className="font-medium tabular-nums">
                  {geometryStats ? formatModelDimension(geometryStats.dimensions.width) : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">高</dt>
                <dd className="font-medium tabular-nums">
                  {geometryStats ? formatModelDimension(geometryStats.dimensions.height) : "—"}
                </dd>
              </div>
            </dl>
          </InspectorComponentSection>

          <div data-model-usage>
            <InspectorComponentSection title="使用说明">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" data-model-usage-support-surface={entry.usage.supportSurface}>
                  {getModelUsageSurfaceLabel(entry.usage.supportSurface)}
                </Badge>
                <Badge variant="outline" data-model-usage-placement-mode={entry.usage.placementMode}>
                  {getModelUsagePlacementLabel(entry.usage.placementMode)}
                </Badge>
                <Badge variant="outline" data-model-usage-orientation={entry.usage.orientation}>
                  {getModelUsageOrientationLabel(entry.usage.orientation)}
                </Badge>
              </div>
              <dl className="space-y-1.5 text-xs" data-model-usage-fields>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">定位基准</dt>
                  <dd className="font-medium" data-model-usage-anchor={entry.usage.anchor}>{getModelUsageAnchorLabel(entry.usage.anchor)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">方向要求</dt>
                  <dd className="font-medium" data-model-usage-direction={entry.usage.requiresFacingDirection ? "required" : "not-required"}>
                    {entry.usage.requiresFacingDirection ? "需要指定方向" : "无需指定方向"}
                  </dd>
                </div>
              </dl>
              <p className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs leading-5 text-foreground" data-model-usage-instruction>
                {entry.usage.instruction}
              </p>
            </InspectorComponentSection>
          </div>

          <label
            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 text-sm"
            data-model-bounds-toggle
          >
            <input
              id="model-bounds-visibility"
              type="checkbox"
              checked={showBounds}
              onChange={(event) => {
                const nextVisible = event.target.checked;
                showBoundsRef.current = nextVisible;
                setShowBounds(nextVisible);
                viewerRef.current?.setBoundsVisible(nextVisible);
              }}
              aria-label="显示模型包围盒"
              className="h-4 w-4 accent-primary"
            />
            <span>显示包围盒</span>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => viewer?.fitView()} disabled={!viewer}>
              <Crosshair className="mr-1.5 h-4 w-4" aria-hidden="true" />
              聚焦
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => viewer?.resetView()} disabled={!viewer}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              复位视角
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleCapture} disabled={!viewer}>
              <Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />
              快照
            </Button>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="w-full"
            data-model-delete-trigger="true"
            onClick={() => setDeleteOpen(true)}
            disabled={deleting}
          >
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            删除模型
          </Button>
        </aside>

        <Card className="h-full min-h-0 w-full overflow-hidden">
          <CardContent className="relative h-full min-h-0 w-full p-0">
            <canvas
              ref={canvasRef}
              aria-label={`${entry.name} 3D 视口`}
              aria-busy={!viewer}
              className="block h-full w-full touch-none bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {!viewer && !viewerError ? (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {status}
              </div>
            ) : null}
            {viewerError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center">
                <p className="text-sm text-destructive">{viewerError}</p>
                <Button variant="outline" asChild>
                  <Link to="/models">返回模型库</Link>
                </Button>
              </div>
            ) : null}
            {viewer ? (
              <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
                <Move3D className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />右键旋转视角 · 滚轮缩放 · 中键平移
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open);
        }}
      >
        <AppDialogContent
          title="删除模型？"
          description={`将从模型库中隐藏“${entry.name}”。模型文件和已有分镜引用会保留。`}
          data-model-delete-dialog="true"
          footer={(
            <>
              <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteOpen(false)}>
                取消
              </Button>
              <Button type="button" variant="destructive" disabled={deleting} onClick={() => void handleDelete()}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {deleting ? "删除中..." : "删除"}
              </Button>
            </>
          )}
        >
          <p className="text-sm text-muted-foreground">确认后，该模型会从模型库目录中隐藏。</p>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
