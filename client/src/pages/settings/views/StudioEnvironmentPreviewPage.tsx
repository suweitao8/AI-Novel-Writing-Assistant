import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Layers3, Loader2, RotateCcw } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";

import { STORY_SCENE_3D_ENVIRONMENT_LIMITS } from "@ai-novel/shared/types/comicDrama";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import {
  createBlocking3dViewer,
  DEFAULT_BLOCKING_3D_ENVIRONMENT,
  type Blocking3dEnvironmentSettings,
  type Blocking3dViewer,
} from "@/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp";
import {
  Drama3DEditorShell,
  Drama3DObjectPanel,
  InspectorComponentSection,
  InspectorGameObjectCard,
  type Drama3DObjectItem,
} from "@/pages/drama/comicDrama/components/editor3d";
import {
  DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  STUDIO_ENVIRONMENT_DIAMETER_LIMITS,
  STUDIO_ENVIRONMENT_PRESET_IDS,
  getStudioEnvironmentDiameterMeters,
  getStudioEnvironmentDiameterPreference,
  getStudioEnvironmentPreset,
  getStudioEnvironmentRadiusMeters,
  saveStudioEnvironmentDiameterPreference,
  type StudioEnvironmentPresetId,
} from "@/pages/models/modelLibrary3d/studioEnvironmentPresets";
import { getStudioEnvironmentSourceUrl } from "@/pages/models/modelLibrary3d/studioEnvironmentAssetSource";
import { useSettingsSectionsRow } from "../components/SettingsShell";

const WORLD_OBJECT_ID = "world";

function isStudioEnvironmentPresetId(value: string | undefined): value is StudioEnvironmentPresetId {
  return Boolean(value && (STUDIO_ENVIRONMENT_PRESET_IDS as readonly string[]).includes(value));
}

function buildPresetEnvironmentSettings(
  presetId: StudioEnvironmentPresetId,
  diameterMeters: number,
): Blocking3dEnvironmentSettings {
  const preset = getStudioEnvironmentPreset(presetId);
  const diameter = getStudioEnvironmentDiameterMeters(diameterMeters);
  const radius = getStudioEnvironmentRadiusMeters(diameter);
  const projectionCenterHeightRatio = Math.min(
    STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.max,
    Math.max(
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.min,
      preset.projectionCenterHeightMeters / radius,
    ),
  );
  return {
    ...DEFAULT_BLOCKING_3D_ENVIRONMENT,
    projectionCenterHeight: Math.round(radius * projectionCenterHeightRatio * 100) / 100,
    projectionCenterHeightRatio,
    radiusMeters: radius,
    panoramaHorizonV: preset.panoramaHorizonV,
  };
}

export default function StudioEnvironmentPreviewPage() {
  const { environmentId } = useParams<{ environmentId: string }>();
  const presetId = isStudioEnvironmentPresetId(environmentId)
    ? environmentId
    : DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<Blocking3dViewer | null>(null);
  const [viewer, setViewer] = useState<Blocking3dViewer | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [status, setStatus] = useState("正在初始化 HDRI 预览");
  const [environmentPresetId, setEnvironmentPresetId] = useState<StudioEnvironmentPresetId>(presetId);
  const [environmentDiameterMeters, setEnvironmentDiameterMeters] = useState(
    getStudioEnvironmentDiameterPreference(presetId),
  );
  const [environmentSettings, setEnvironmentSettings] = useState<Blocking3dEnvironmentSettings>(() => (
    buildPresetEnvironmentSettings(presetId, getStudioEnvironmentDiameterPreference(presetId))
  ));
  const [environmentSwitching, setEnvironmentSwitching] = useState(false);
  const environmentRequestRef = useRef(0);
  const activePreset = getStudioEnvironmentPreset(environmentPresetId);
  useSettingsSectionsRow();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    let unsubscribeChange: (() => void) | undefined;
    let unsubscribeStatus: (() => void) | undefined;
    const initialDiameter = getStudioEnvironmentDiameterPreference(presetId);
    setViewer(null);
    setViewerError(null);
    setStatus("正在初始化 HDRI 预览");
    setEnvironmentPresetId(presetId);
    setEnvironmentDiameterMeters(initialDiameter);
    setEnvironmentSettings(buildPresetEnvironmentSettings(presetId, initialDiameter));
    setEnvironmentSwitching(false);

    void (async () => {
      const generatedSource = await getStudioEnvironmentSourceUrl(presetId);
      return createBlocking3dViewer({
        canvas,
        environmentUrl: generatedSource ?? getStudioEnvironmentPreset(presetId).sourceUrl,
        loadProxyActor: false,
        showShotCameraHelpers: false,
        onStatus: (next) => {
          if (!cancelled) setStatus(next || "就绪");
        },
      });
    })()
      .then((nextViewer) => {
        if (cancelled) {
          nextViewer.destroy();
          return;
        }
        const initialSettings = buildPresetEnvironmentSettings(presetId, initialDiameter);
        nextViewer.setEnvironmentSettings(initialSettings);
        nextViewer.fitView();
        viewerRef.current = nextViewer;
        setViewer(nextViewer);
        setEnvironmentSettings(nextViewer.getEnvironmentSettings());
        unsubscribeChange = nextViewer.onChange(() => {
          setEnvironmentSettings(nextViewer.getEnvironmentSettings());
        });
        unsubscribeStatus = nextViewer.onStatus((next) => {
          if (!cancelled) setStatus(next || "就绪");
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setViewerError(error instanceof Error ? error.message : "HDRI 预览初始化失败。");
        }
      });

    return () => {
      cancelled = true;
      unsubscribeChange?.();
      unsubscribeStatus?.();
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
      const previousSettings = environmentSettings;
      const nextPreset = getStudioEnvironmentPreset(nextId);
      const nextDiameter = getStudioEnvironmentDiameterPreference(nextId);
      setEnvironmentPresetId(nextId);
      setEnvironmentDiameterMeters(nextDiameter);
      setEnvironmentSwitching(true);
      try {
        const generatedSource = await getStudioEnvironmentSourceUrl(nextId);
        await current.setEnvironment(generatedSource ?? nextPreset.sourceUrl);
        if (requestId !== environmentRequestRef.current) return;
        current.setEnvironmentSettings(buildPresetEnvironmentSettings(nextId, nextDiameter));
        setEnvironmentSettings(current.getEnvironmentSettings());
        saveStudioEnvironmentDiameterPreference(nextId, nextDiameter);
      } catch (error) {
        if (requestId !== environmentRequestRef.current) return;
        setEnvironmentPresetId(previousId);
        current.setEnvironmentSettings(previousSettings);
        setEnvironmentDiameterMeters(previousSettings.radiusMeters * 2);
        setEnvironmentSettings(previousSettings);
        toast.error("HDRI 环境加载失败。", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        if (requestId === environmentRequestRef.current) setEnvironmentSwitching(false);
      }
    },
    [environmentPresetId, environmentSettings, environmentSwitching],
  );

  const handleEnvironmentDiameterChange = useCallback((value: number) => {
    const current = viewerRef.current;
    if (!current) return;
    const nextDiameter = Math.min(
      STUDIO_ENVIRONMENT_DIAMETER_LIMITS.max,
      Math.max(STUDIO_ENVIRONMENT_DIAMETER_LIMITS.min, value),
    );
    current.setEnvironmentSettings({
      ...current.getEnvironmentSettings(),
      radiusMeters: getStudioEnvironmentRadiusMeters(nextDiameter),
    });
    const nextSettings = current.getEnvironmentSettings();
    setEnvironmentDiameterMeters(nextSettings.radiusMeters * 2);
    setEnvironmentSettings(nextSettings);
    saveStudioEnvironmentDiameterPreference(environmentPresetId, nextSettings.radiusMeters * 2);
  }, [environmentPresetId]);

  const updateEnvironmentSetting = useCallback(
    (key: "projectionCenterHeightRatio" | "radiusMeters" | "panoramaHorizonV", value: number) => {
      const current = viewerRef.current;
      if (!current) return;
      current.setEnvironmentSettings({
        ...current.getEnvironmentSettings(),
        [key]: value,
      });
      const nextSettings = current.getEnvironmentSettings();
      setEnvironmentSettings(nextSettings);
      if (key === "radiusMeters") {
        setEnvironmentDiameterMeters(nextSettings.radiusMeters * 2);
        saveStudioEnvironmentDiameterPreference(environmentPresetId, nextSettings.radiusMeters * 2);
      }
    },
    [environmentPresetId],
  );

  const sceneObjectItems = useMemo<Drama3DObjectItem[]>(() => ([
    {
      id: WORLD_OBJECT_ID,
      label: activePreset.label,
      kind: "scene",
      selected: true,
      onSelect: () => undefined,
    },
  ]), [activePreset.label]);

  if (environmentId && !isStudioEnvironmentPresetId(environmentId)) {
    return <Navigate to={`/settings/narrator-voice/hdri/${DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID}`} replace />;
  }

  return (
    <div className="h-full min-h-0 min-w-0" data-hdri-preview-page={presetId}>
      <Drama3DEditorShell
        header={
          <div data-editor-header="primary" className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <Button type="button" variant="ghost" size="icon" asChild>
              <Link to="/settings/narrator-voice" aria-label="返回通用资产" title="返回通用资产">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <h1 className="min-w-0 truncate text-sm font-semibold">HDRI 3D 预览 · {activePreset.label}</h1>
          </div>
        }
        viewport={
          <Card className="h-full min-h-0 w-full overflow-hidden">
            <CardContent className="relative h-full min-h-0 w-full p-0">
              <canvas
                ref={canvasRef}
                aria-label={`${activePreset.label} HDRI 3D 预览`}
                aria-busy={!viewer || environmentSwitching}
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
                  <p role="alert" className="text-sm text-destructive">{viewerError}</p>
                  <Button variant="outline" onClick={() => window.location.reload()}>重新加载</Button>
                </div>
              ) : null}
              {viewer ? (
                <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
                  左键旋转 · 中键平移 · 滚轮缩放
                </p>
              ) : null}
            </CardContent>
          </Card>
        }
        objects={<Drama3DObjectPanel items={sceneObjectItems} />}
        actions={
          <Card className="flex h-full min-h-0 flex-col overflow-hidden">
            <CardContent className="h-full min-h-0 flex-1 space-y-4 overflow-y-auto pt-4">
              <InspectorGameObjectCard icon={<Layers3 className="h-4 w-4" aria-hidden="true" />} name={activePreset.label} />
              <InspectorComponentSection title="环境预设">
                <SelectControl
                  value={environmentPresetId}
                  onChange={(event) => {
                    void handleEnvironmentChange(event.target.value as StudioEnvironmentPresetId);
                  }}
                  disabled={!viewer || environmentSwitching}
                  aria-label="HDRI 场景"
                  className="h-9 w-full bg-background text-sm"
                >
                  {STUDIO_ENVIRONMENT_PRESET_IDS.map((id) => (
                    <option key={id} value={id}>{getStudioEnvironmentPreset(id).label}</option>
                  ))}
                </SelectControl>
                {environmentSwitching ? (
                  <p className="text-xs text-muted-foreground" role="status">正在加载 HDRI 环境…</p>
                ) : null}
              </InspectorComponentSection>
              <InspectorComponentSection title="场景环境">
                <div className="space-y-4">
                  <label className="block space-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center justify-between gap-2">
                      <span>投射中心高度</span>
                      <output className="tabular-nums text-foreground">{Math.round(environmentSettings.projectionCenterHeightRatio * 100)}% · {environmentSettings.projectionCenterHeight.toFixed(2)} 米</output>
                    </span>
                    <input
                      type="range"
                      aria-label="投射中心高度占比"
                      min={STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.min * 100}
                      max={STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.max * 100}
                      step="0.5"
                      value={Math.round(environmentSettings.projectionCenterHeightRatio * 1000) / 10}
                      disabled={!viewer || environmentSwitching}
                      onChange={(event) => updateEnvironmentSetting("projectionCenterHeightRatio", Number(event.target.value) / 100)}
                      className="w-full accent-primary"
                    />
                  </label>
                  <label className="block space-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center justify-between gap-2">
                      <span>半球直径</span>
                      <output className="tabular-nums text-foreground">{environmentDiameterMeters} 米</output>
                    </span>
                    <input
                      type="range"
                      aria-label="半球直径"
                      min={STUDIO_ENVIRONMENT_DIAMETER_LIMITS.min}
                      max={STUDIO_ENVIRONMENT_DIAMETER_LIMITS.max}
                      step="1"
                      value={environmentDiameterMeters}
                      disabled={!viewer || environmentSwitching}
                      onChange={(event) => handleEnvironmentDiameterChange(Number(event.target.value))}
                      className="w-full accent-primary"
                    />
                    <span className="flex justify-between tabular-nums text-[11px]">
                      <span>{STUDIO_ENVIRONMENT_DIAMETER_LIMITS.min} 米</span>
                      <span>{STUDIO_ENVIRONMENT_DIAMETER_LIMITS.max} 米</span>
                    </span>
                  </label>
                  <label className="block space-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center justify-between gap-2">
                      <span>分界线</span>
                      <output className="tabular-nums text-foreground">{Math.round(environmentSettings.panoramaHorizonV * 100)}%</output>
                    </span>
                    <input
                      type="range"
                      aria-label="分界线"
                      min={STORY_SCENE_3D_ENVIRONMENT_LIMITS.panoramaHorizonV.min * 100}
                      max={STORY_SCENE_3D_ENVIRONMENT_LIMITS.panoramaHorizonV.max * 100}
                      step="1"
                      value={Math.round(environmentSettings.panoramaHorizonV * 100)}
                      disabled={!viewer || environmentSwitching}
                      onChange={(event) => updateEnvironmentSetting("panoramaHorizonV", Number(event.target.value) / 100)}
                      className="w-full accent-primary"
                    />
                  </label>
                </div>
              </InspectorComponentSection>
              <Button type="button" variant="outline" className="w-full" onClick={() => viewer?.resetCamera()} disabled={!viewer || environmentSwitching}>
                <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                复位视角
              </Button>
            </CardContent>
          </Card>
        }
      />
    </div>
  );
}
