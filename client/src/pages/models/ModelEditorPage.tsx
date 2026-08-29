import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Crosshair, Loader2, Move3D, RotateCcw } from "lucide-react";

import SelectControl from "@/components/common/SelectControl";
import { getModelLibraryEntry } from "@/config/modelLibrary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import {
  InspectorComponentSection,
  InspectorTransformSection,
  TransformToolToolbar,
  type InspectorTransformValue,
} from "@/pages/drama/comicDrama/components/editor3d";
import {
  DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  STUDIO_ENVIRONMENT_DIAMETER_LIMITS,
  STUDIO_ENVIRONMENT_PRESET_IDS,
  getStudioEnvironmentDiameterPreference,
  getStudioEnvironmentPreset,
  type StudioEnvironmentPresetId,
} from "./modelLibrary3d/studioEnvironmentPresets";
import { createModelViewer, type ModelViewer, type ModelViewerTool } from "./modelLibrary3d/modelViewerApp";

export default function ModelEditorPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const entry = getModelLibraryEntry(modelId);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<ModelViewer | null>(null);
  const [viewer, setViewer] = useState<ModelViewer | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [status, setStatus] = useState("正在初始化 3D 视口");
  const [tool, setTool] = useState<ModelViewerTool | null>("translate");
  const [transform, setTransform] = useState<InspectorTransformValue>({
    position: [0, 0, 0],
    yawDeg: 0,
    scale: 1,
  });
  const [environmentPresetId, setEnvironmentPresetId] = useState<StudioEnvironmentPresetId>(
    DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  );
  const [environmentDiameterMeters, setEnvironmentDiameterMeters] = useState(
    getStudioEnvironmentDiameterPreference(DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID),
  );
  const [environmentSwitching, setEnvironmentSwitching] = useState(false);
  const environmentDiameterRequestRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !entry || viewerRef.current) return undefined;
    let cancelled = false;
    setViewerError(null);
    setEnvironmentPresetId(DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID);
    setEnvironmentDiameterMeters(getStudioEnvironmentDiameterPreference(DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID));
    setEnvironmentSwitching(false);
    void createModelViewer({
      canvas,
      modelUrl: entry.fileUrl,
      unitScale: entry.unitScale,
      materials: entry.materials,
      environmentPresetId: DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
      environmentDiameterMeters: getStudioEnvironmentDiameterPreference(DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID),
      onStatus: (next) => setStatus(next || "就绪"),
      onTransformLive: () => setTransform(viewerRef.current?.getTransform() ?? transform),
      onTransformCommit: () => setTransform(viewerRef.current?.getTransform() ?? transform),
    })
      .then((nextViewer) => {
        if (cancelled) {
          nextViewer.destroy();
          return;
        }
        viewerRef.current = nextViewer;
        setViewer(nextViewer);
        setTransform(nextViewer.getTransform());
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setViewerError(error instanceof Error ? error.message : "3D 视口初始化失败。");
        }
      });
    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      setViewer(null);
    };
    // transform 只用于回退读数，不参与视口生命周期。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  useEffect(() => {
    viewer?.setTransformTool(tool);
  }, [tool, viewer]);

  const commitTransform = useCallback(
    (patch: Partial<InspectorTransformValue>) => {
      if (!viewerRef.current?.setTransform(patch)) return;
      setTransform(viewerRef.current.getTransform());
    },
    [],
  );

  const handleEnvironmentChange = useCallback(
    async (nextId: StudioEnvironmentPresetId) => {
      const current = viewerRef.current;
      if (!current || environmentSwitching || nextId === environmentPresetId) return;
      const previousId = environmentPresetId;
      setEnvironmentPresetId(nextId);
      setEnvironmentSwitching(true);
      try {
        const switched = await current.setEnvironmentPreset(nextId);
        if (!switched) {
          setEnvironmentPresetId(previousId);
          toast.error("HDRI 环境加载失败。");
        } else {
          setEnvironmentDiameterMeters(current.getEnvironmentDiameter());
        }
      } catch (error) {
        setEnvironmentPresetId(previousId);
        toast.error("HDRI 环境加载失败。", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setEnvironmentSwitching(false);
      }
    },
    [environmentPresetId, environmentSwitching],
  );

  const handleEnvironmentDiameterChange = useCallback(
    async (value: number) => {
      const current = viewerRef.current;
      if (!current) return;
      const requestId = ++environmentDiameterRequestRef.current;
      const previousDiameter = environmentDiameterMeters;
      const nextDiameter = Math.min(
        STUDIO_ENVIRONMENT_DIAMETER_LIMITS.max,
        Math.max(STUDIO_ENVIRONMENT_DIAMETER_LIMITS.min, value),
      );
      setEnvironmentDiameterMeters(nextDiameter);
      setEnvironmentSwitching(true);
      try {
        const switched = await current.setEnvironmentDiameter(nextDiameter);
        if (requestId !== environmentDiameterRequestRef.current) return;
        if (!switched) {
          setEnvironmentDiameterMeters(previousDiameter);
          toast.error("HDRI 环境加载失败。");
        } else {
          setEnvironmentDiameterMeters(current.getEnvironmentDiameter());
        }
      } catch (error) {
        if (requestId !== environmentDiameterRequestRef.current) return;
        setEnvironmentDiameterMeters(previousDiameter);
        toast.error("HDRI 环境加载失败。", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        if (requestId !== environmentDiameterRequestRef.current) return;
        setEnvironmentSwitching(false);
      }
    },
    [environmentDiameterMeters],
  );

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

  if (!entry) {
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
            </dl>
          </InspectorComponentSection>

          <InspectorComponentSection title="预览环境">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>HDRI 场景</span>
              <SelectControl
                value={environmentPresetId}
                onChange={(event) => {
                  void handleEnvironmentChange(event.target.value as StudioEnvironmentPresetId);
                }}
                disabled={!viewer || environmentSwitching}
                aria-label="模型预览 HDRI 场景"
                className="h-9 w-full bg-background text-sm"
              >
                {STUDIO_ENVIRONMENT_PRESET_IDS.map((id) => {
                  const preset = getStudioEnvironmentPreset(id);
                  const label = `${preset.label}（直径 ${preset.diameterMeters} 米）`;
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </SelectControl>
            </label>
            <label className="mt-3 block space-y-1 text-xs text-muted-foreground" htmlFor="model-environment-diameter">
              <span className="flex items-center justify-between gap-2">
                <span>半球直径</span>
                <output className="tabular-nums text-foreground">{environmentDiameterMeters} 米</output>
              </span>
              <input
                id="model-environment-diameter"
                type="range"
                min={STUDIO_ENVIRONMENT_DIAMETER_LIMITS.min}
                max={STUDIO_ENVIRONMENT_DIAMETER_LIMITS.max}
                step={1}
                value={environmentDiameterMeters}
                disabled={!viewer}
                aria-label="模型预览半球直径"
                onChange={(event) => {
                  void handleEnvironmentDiameterChange(Number(event.target.value));
                }}
                className="w-full accent-primary"
              />
            </label>
            {environmentSwitching ? (
              <span role="status" className="text-xs text-muted-foreground">
                环境加载中…
              </span>
            ) : null}
          </InspectorComponentSection>

          <InspectorTransformSection value={transform} onCommit={commitTransform} />

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
        </aside>

        <Card className="h-full min-h-0 w-full overflow-hidden">
          <CardContent className="relative h-full min-h-0 w-full p-0">
            <canvas
              ref={canvasRef}
              aria-label={`${entry.name} 3D 视口`}
              aria-busy={!viewer}
              className="block h-full w-full touch-none bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {viewer ? (
              <TransformToolToolbar tool={tool} onToolChange={setTool} className="z-10" />
            ) : null}
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
                <Move3D className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />拖动手柄变换模型 · 右键旋转 · 滚轮缩放 · 中键平移
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
