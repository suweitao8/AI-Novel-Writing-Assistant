import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import {
  DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  STUDIO_ENVIRONMENT_DIAMETER_LIMITS,
  STUDIO_ENVIRONMENT_PRESET_IDS,
  getStudioEnvironmentDiameterPreference,
  getStudioEnvironmentPreset,
  type StudioEnvironmentPresetId,
} from "@/pages/models/modelLibrary3d/studioEnvironmentPresets";
import {
  createStudioEnvironmentPreview,
  type StudioEnvironmentPreview,
} from "@/pages/models/modelLibrary3d/studioEnvironmentPreviewApp";
import { SettingsShell } from "../components/SettingsShell";

function isStudioEnvironmentPresetId(value: string | undefined): value is StudioEnvironmentPresetId {
  return Boolean(value && (STUDIO_ENVIRONMENT_PRESET_IDS as readonly string[]).includes(value));
}

export default function StudioEnvironmentPreviewPage() {
  const { environmentId } = useParams<{ environmentId: string }>();
  const presetId = isStudioEnvironmentPresetId(environmentId)
    ? environmentId
    : DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<StudioEnvironmentPreview | null>(null);
  const [viewer, setViewer] = useState<StudioEnvironmentPreview | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [status, setStatus] = useState("正在初始化 HDRI 预览");
  const [environmentPresetId, setEnvironmentPresetId] = useState<StudioEnvironmentPresetId>(presetId);
  const [environmentDiameterMeters, setEnvironmentDiameterMeters] = useState(
    getStudioEnvironmentDiameterPreference(presetId),
  );
  const [environmentSwitching, setEnvironmentSwitching] = useState(false);
  const environmentRequestRef = useRef(0);
  const activePreset = getStudioEnvironmentPreset(environmentPresetId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    setViewer(null);
    setViewerError(null);
    setStatus("正在初始化 HDRI 预览");
    setEnvironmentPresetId(presetId);
    setEnvironmentDiameterMeters(getStudioEnvironmentDiameterPreference(presetId));
    setEnvironmentSwitching(false);
    void createStudioEnvironmentPreview({
      canvas,
      environmentPresetId: presetId,
      environmentDiameterMeters: getStudioEnvironmentDiameterPreference(presetId),
      onStatus: (next) => {
        if (!cancelled) setStatus(next || "就绪");
      },
    })
      .then((nextViewer) => {
        if (cancelled) {
          nextViewer.destroy();
          return;
        }
        viewerRef.current = nextViewer;
        setViewer(nextViewer);
        setEnvironmentDiameterMeters(nextViewer.getEnvironmentDiameter());
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setViewerError(error instanceof Error ? error.message : "HDRI 预览初始化失败。");
        }
      });
    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      setViewer(null);
    };
  }, [presetId]);

  const handleEnvironmentChange = useCallback(
    async (nextId: StudioEnvironmentPresetId) => {
      const current = viewerRef.current;
      if (!current || environmentSwitching || nextId === environmentPresetId) return;
      const requestId = ++environmentRequestRef.current;
      const previousId = environmentPresetId;
      const previousDiameter = environmentDiameterMeters;
      setEnvironmentPresetId(nextId);
      setEnvironmentSwitching(true);
      try {
        const switched = await current.setEnvironmentPreset(nextId);
        if (requestId !== environmentRequestRef.current) return;
        if (!switched) {
          setEnvironmentPresetId(previousId);
          setEnvironmentDiameterMeters(previousDiameter);
          toast.error("HDRI 环境加载失败。");
        } else {
          setEnvironmentDiameterMeters(current.getEnvironmentDiameter());
        }
      } catch (error) {
        if (requestId !== environmentRequestRef.current) return;
        setEnvironmentPresetId(previousId);
        setEnvironmentDiameterMeters(previousDiameter);
        toast.error("HDRI 环境加载失败。", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        if (requestId === environmentRequestRef.current) setEnvironmentSwitching(false);
      }
    },
    [environmentDiameterMeters, environmentPresetId, environmentSwitching],
  );

  const handleEnvironmentDiameterChange = useCallback(
    async (value: number) => {
      const current = viewerRef.current;
      if (!current) return;
      const requestId = ++environmentRequestRef.current;
      const previousDiameter = environmentDiameterMeters;
      const nextDiameter = Math.min(
        STUDIO_ENVIRONMENT_DIAMETER_LIMITS.max,
        Math.max(STUDIO_ENVIRONMENT_DIAMETER_LIMITS.min, value),
      );
      setEnvironmentDiameterMeters(nextDiameter);
      setEnvironmentSwitching(true);
      try {
        const switched = await current.setEnvironmentDiameter(nextDiameter);
        if (requestId !== environmentRequestRef.current) return;
        if (!switched) {
          setEnvironmentDiameterMeters(previousDiameter);
          toast.error("HDRI 环境加载失败。");
        } else {
          setEnvironmentDiameterMeters(current.getEnvironmentDiameter());
        }
      } catch (error) {
        if (requestId !== environmentRequestRef.current) return;
        setEnvironmentDiameterMeters(previousDiameter);
        toast.error("HDRI 环境加载失败。", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        if (requestId === environmentRequestRef.current) setEnvironmentSwitching(false);
      }
    },
    [environmentDiameterMeters],
  );

  if (environmentId && !isStudioEnvironmentPresetId(environmentId)) {
    return <Navigate to={`/settings/narrator-voice/hdri/${DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID}`} replace />;
  }

  return (
    <SettingsShell title="HDRI 3D 预览" description="查看通用 HDRI 环境的投影效果，并调整半球直径。">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" asChild>
          <Link to="/settings/narrator-voice">
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
            返回通用资产
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">{activePreset.label}</span>
      </div>

      <div className="grid min-h-[min(72vh,48rem)] min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]" data-hdri-preview-page={presetId}>
        <Card className="min-h-[30rem] min-w-0 overflow-hidden">
          <CardContent className="relative h-full min-h-[30rem] w-full p-0">
            <canvas
              ref={canvasRef}
              aria-label={`${activePreset.label} HDRI 3D 预览`}
              aria-busy={!viewer}
              className="block h-full min-h-[30rem] w-full touch-none bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {!viewer && !viewerError ? (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {status}
              </div>
            ) : null}
            {viewerError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center">
                <p role="alert" className="text-sm text-destructive">{viewerError}</p>
                <Button variant="outline" onClick={() => window.location.reload()}>重新加载</Button>
              </div>
            ) : null}
            {viewer ? (
              <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
                左键拖动旋转 · 中键或右键平移 · 滚轮缩放
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">预览环境</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>HDRI 场景</span>
              <SelectControl
                value={environmentPresetId}
                onChange={(event) => {
                  void handleEnvironmentChange(event.target.value as StudioEnvironmentPresetId);
                }}
                disabled={!viewer || environmentSwitching}
                aria-label="HDRI 场景"
                className="h-9 w-full bg-background text-sm"
              >
                {STUDIO_ENVIRONMENT_PRESET_IDS.map((id) => {
                  const environment = getStudioEnvironmentPreset(id);
                  return (
                    <option key={id} value={id}>
                      {environment.label}
                    </option>
                  );
                })}
              </SelectControl>
            </label>

            <label className="block space-y-2 text-xs text-muted-foreground" htmlFor="hdri-preview-diameter">
              <span className="flex items-center justify-between gap-2">
                <span>半球直径</span>
                <output className="tabular-nums text-foreground">{environmentDiameterMeters} 米</output>
              </span>
              <input
                id="hdri-preview-diameter"
                type="range"
                min={STUDIO_ENVIRONMENT_DIAMETER_LIMITS.min}
                max={STUDIO_ENVIRONMENT_DIAMETER_LIMITS.max}
                step={1}
                value={environmentDiameterMeters}
                disabled={!viewer}
                aria-label="HDRI 半球直径"
                onChange={(event) => {
                  void handleEnvironmentDiameterChange(Number(event.target.value));
                }}
                className="w-full accent-primary"
              />
              <span className="flex justify-between tabular-nums text-[11px]">
                <span>{STUDIO_ENVIRONMENT_DIAMETER_LIMITS.min} 米</span>
                <span>{STUDIO_ENVIRONMENT_DIAMETER_LIMITS.max} 米</span>
              </span>
            </label>

            {environmentSwitching ? (
              <span role="status" className="block text-xs text-muted-foreground">正在加载 HDRI 环境…</span>
            ) : null}

            <Button type="button" variant="outline" className="w-full" onClick={() => viewer?.resetView()} disabled={!viewer || environmentSwitching}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              复位视角
            </Button>
          </CardContent>
        </Card>
      </div>
    </SettingsShell>
  );
}
