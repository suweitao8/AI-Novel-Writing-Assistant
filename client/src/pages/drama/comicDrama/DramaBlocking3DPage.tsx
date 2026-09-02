import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  Layers3,
  MapPin,
  Move3D,
  RotateCcw,
  RotateCw,
  UserRound,
  Video,
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
import { STORY_SCENE_3D_MARKERS_ENABLED } from "@ai-novel/shared/utils/scene3dMarkers";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import SelectControl from "@/components/common/SelectControl";
import AiButton from "@/components/common/AiButton";
import { toast } from "@/components/ui/toast";
import {
  BLOCKING_3D_POSE_LABELS,
  DEFAULT_BLOCKING_3D_CAMERA,
  projectBlocking3dActorToLegacy,
} from "./components/blocking3d/blocking3dMath";
import {
  createBlocking3dViewer,
  type Blocking3dTransformTool,
  type Blocking3dViewer,
} from "./components/blocking3d/blocking3dViewerApp";
import {
  Drama3DEditorShell,
  Drama3DObjectPanel,
  type Drama3DObjectItem,
  InspectorComponentSection,
  InspectorGameObjectCard,
  InspectorNumberField,
  InspectorPropertyList,
  InspectorTransformSection,
  InspectorVector3Field,
  TransformToolToolbar,
} from "./components/editor3d";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import {
  usePageNavActionsSlot,
  useRegisterPageTabs,
} from "@/components/layout/PageTabsContext";
import { buildStudioNavStageRow } from "./navigation/studioTabRows";
import {
  buildStudioNavigationPath,
  type StudioStage,
} from "./navigation/studioNavigation";

function initialLayout(
  context: DramaShotBlockingSketchEditorContext,
): DramaShotBlockingSketch3DLayout {
  if (!context.scene) throw new Error("当前镜头没有可用的场景状态图。");
  if (context.sketch?.layout3d) {
    return {
      ...context.sketch.layout3d,
      environment: context.scene.environment,
    };
  }
  return {
    schemaVersion: 1,
    engine: "playcanvas",
    camera: {
      ...DEFAULT_BLOCKING_3D_CAMERA,
      focalPoint: [...DEFAULT_BLOCKING_3D_CAMERA.focalPoint],
    },
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
  const sourceByName = new Map(
    context.actors.map((actor) => [actor.characterName, actor]),
  );
  const actors = layout3d.actors.map((actor, index) => {
    const source = sourceByName.get(actor.characterName);
    return {
      ...projectBlocking3dActorToLegacy(actor, index),
      ...(source?.assetId ? { assetId: source.assetId } : {}),
      ...(source?.stateId ? { stateId: source.stateId } : {}),
      ...(source?.imageUrl ? { imageUrl: source.imageUrl } : {}),
    };
  });
  const scene = {
    ...(context.sketch?.scene ?? { yawDeg: 0, pitchDeg: 0, fovDeg: 78 }),
    // 每次保存都以当前场景状态刷新身份与版本标记：编辑器渲染的就是当前
    // 场景图，草图背景版本必须跟着本次保存走，过期检测才有基准。
    assetId: context.scene.assetId,
    stateId: context.scene.stateId,
    imageUrl: context.scene.imageUrl,
    ...(context.scene.imageUpdatedAt ? { imageUpdatedAt: context.scene.imageUpdatedAt } : {}),
  };
  return {
    status: "draft",
    version: (context.sketch?.version ?? 0) + 1,
    ...(currentCompositionNote.trim()
      ? { compositionNote: currentCompositionNote.trim() }
      : {}),
    scene,
    actors,
    layout3d,
  };
}

function formatHeight(heightMeters: number | undefined): string {
  return typeof heightMeters === "number" && Number.isFinite(heightMeters)
    ? `约 ${heightMeters.toFixed(1)} 米`
    : "—";
}

type RgbColor = [number, number, number];

function rgbToHex(color: RgbColor | null): string {
  if (!color) return "#000000";
  return `#${color
    .map((channel) =>
      Math.round(Math.max(0, Math.min(1, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function hexToRgb(value: string): RgbColor | null {
  if (!/^#[\da-f]{6}$/i.test(value)) return null;
  return [0, 2, 4].map(
    (offset) => Number.parseInt(value.slice(offset + 1, offset + 3), 16) / 255,
  ) as RgbColor;
}

const SCENE_OBJECT_ID = "scene";
const CAMERA_OBJECT_ID = "camera";

type BlockingObjectSelectionId =
  | typeof SCENE_OBJECT_ID
  | typeof CAMERA_OBJECT_ID
  | `actor:${string}`
  | `marker:${string}`;

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
  const navActionsSlot = usePageNavActionsSlot();
  const [searchParams] = useSearchParams();
  const shotOrder = searchParams.get("order");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<Blocking3dViewer | null>(null);
  const [viewer, setViewer] = useState<Blocking3dViewer | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] =
    useState<BlockingObjectSelectionId>(SCENE_OBJECT_ID);
  const [selectedPose, setSelectedPose] =
    useState<DramaShotBlockingSketchPose | null>(null);
  const [selectedColor, setSelectedColor] = useState<RgbColor | null>(null);
  const [selectedTransform, setSelectedTransform] =
    useState<ReturnType<Blocking3dViewer["getSelectedTransform"]>>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoPlanning, setAutoPlanning] = useState(false);
  const [compositionNote, setCompositionNote] = useState("");
  const [savedData, setSavedData] =
    useState<DramaShotBlockingSketchData | null>(null);
  const [cameraState, setCameraState] = useState(DEFAULT_BLOCKING_3D_CAMERA);
  const [cameraSelected, setCameraSelected] = useState(false);
  // 场景摄像机的独立机位（世界坐标位置 + 朝向），与编辑视角解耦。
  const [shotCameraPose, setShotCameraPoseState] = useState<{
    position: [number, number, number];
    yawDeg: number;
    pitchDeg: number;
  }>({ position: [0, 0, 0], yawDeg: 0, pitchDeg: 0 });
  // 镜头取景辅助：机位 gizmo + 右下角取景画中画（默认关，构图完成后自动打开）。
  const [shotPreviewOn, setShotPreviewOn] = useState(false);
  // Unity 场景视图工具：移动 / 旋转 / 缩放手柄，作用于选中的角色。
  const [transformTool, setTransformTool] =
    useState<Blocking3dTransformTool | null>("translate");
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

  useEffect(() => {
    // 取景画中画在「镜头取景」开关打开或选中摄像机时显示（Unity camera preview）。
    viewer?.setShotCameraHelpersVisible(shotPreviewOn || cameraSelected);
  }, [shotPreviewOn, cameraSelected, viewer]);

  useEffect(() => {
    viewer?.setTransformTool(transformTool);
  }, [transformTool, viewer]);

  const syncSelection = useCallback((nextViewer: Blocking3dViewer) => {
    const nextCameraSelected = nextViewer.isCameraSelected();
    const nextSelectedName = nextViewer.getSelectedActor();
    setSelectedName(nextSelectedName);
    setCameraSelected(nextCameraSelected);
    setSelectedObjectId(
      nextCameraSelected
        ? CAMERA_OBJECT_ID
        : nextSelectedName
          ? actorObjectId(nextSelectedName)
          : SCENE_OBJECT_ID,
    );
    setSelectedPose(nextViewer.getSelectedPose());
    setSelectedColor(nextViewer.getSelectedColor());
    setSelectedTransform(nextViewer.getSelectedTransform());
    setCameraState(nextViewer.getCameraState());
    setShotCameraPoseState(nextViewer.getShotCameraPose());
  }, []);

  // 编辑期间 context 会因保存后的失效刷新等后台 refetch 换对象身份：viewer
  // 只随场景环境图（HDRI 来源）重建，其余 refetch 一律保留正在编辑的视口，
  // 否则未保存的 AI 构图/手动摆位会被旧快照静默覆盖。
  const contextRef = useRef(context);
  contextRef.current = context;
  const sceneEnvironmentUrl = context?.scene?.imageUrl ?? null;
  useEffect(() => {
    const canvas = canvasRef.current;
    const currentContext = contextRef.current;
    if (!canvas || !currentContext?.scene || !sceneEnvironmentUrl) return undefined;
    let cancelled = false;
    let unsubscribeSelection: (() => void) | undefined;
    let unsubscribeMarkerSelection: (() => void) | undefined;
    let unsubscribeCameraSelection: (() => void) | undefined;
    let unsubscribeChange: (() => void) | undefined;
    setViewerError(null);
    void createBlocking3dViewer({
      canvas,
      environmentUrl: sceneEnvironmentUrl,
      sceneMarkers: currentContext.scene.markers,
    })
      .then((nextViewer) => {
        if (cancelled) {
          nextViewer.destroy();
          return;
        }
        try {
          const sources = currentContext.actors ?? [];
          sources.forEach((actor, index) =>
            nextViewer.addActor(actor.characterName, index, actor.heightMeters),
          );
          const layout = initialLayout(currentContext);
          if (layout.actors.length > 0) nextViewer.loadLayout(layout);
          else nextViewer.fitView();
          viewerRef.current = nextViewer;
          setViewer(nextViewer);
          syncSelection(nextViewer);
          unsubscribeSelection = nextViewer.onSelectionChange(() =>
            syncSelection(nextViewer),
          );
          unsubscribeMarkerSelection = nextViewer.onMarkerSelection(
            (markerId) => {
              setSelectedObjectId(
                markerId ? markerObjectId(markerId) : SCENE_OBJECT_ID,
              );
            },
          );
          unsubscribeCameraSelection = nextViewer.onCameraSelection(
            (selected) => {
              setCameraSelected(selected);
              setSelectedObjectId(
                selected ? CAMERA_OBJECT_ID : SCENE_OBJECT_ID,
              );
              setCameraState(nextViewer.getCameraState());
              setShotCameraPoseState(nextViewer.getShotCameraPose());
            },
          );
          unsubscribeChange = nextViewer.onChange(() => {
            setDirty(true);
            syncSelection(nextViewer);
          });
          nextViewer.selectActor(null);
          nextViewer.fitView();
        } catch (error) {
          // Loading a legacy layout can still fail for unrelated malformed data;
          // never leave the just-created WebGL viewer alive behind the error UI.
          nextViewer.destroy();
          throw error;
        }
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setViewerError(
            error instanceof Error ? error.message : "3D 草图加载失败。",
          );
      });
    return () => {
      cancelled = true;
      unsubscribeSelection?.();
      unsubscribeMarkerSelection?.();
      unsubscribeCameraSelection?.();
      unsubscribeChange?.();
      viewerRef.current?.destroy();
      viewerRef.current = null;
      setViewer(null);
    };
  }, [sceneEnvironmentUrl, syncSelection]);

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
  const availablePoses = viewer?.getAvailablePoses() ?? [];
  const selectedActorContext = context?.actors.find(
    (actor) => actor.characterName === selectedName,
  );

  const focusMarker = useCallback(
    (markerId: string) => {
      if (!viewer) return;
      viewer.focusMarker(markerId);
      setSelectedObjectId(markerObjectId(markerId));
    },
    [viewer],
  );

  const applyViewerAction = useCallback(
    (action: (nextViewer: Blocking3dViewer) => boolean) => {
      if (!viewer || saving || autoPlanning) return;
      if (!action(viewer)) return;
      setDirty(true);
      syncSelection(viewer);
    },
    [autoPlanning, saving, syncSelection, viewer],
  );

  const selectObject = useCallback(
    (objectId: BlockingObjectSelectionId) => {
      if (!viewer || saving || autoPlanning) return;
      if (objectId === SCENE_OBJECT_ID) {
        viewer.selectActor(null);
        viewer.selectCamera(false);
        setSelectedObjectId(SCENE_OBJECT_ID);
        return;
      }
      if (objectId === CAMERA_OBJECT_ID) {
        viewer.selectCamera(true);
        setSelectedObjectId(CAMERA_OBJECT_ID);
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
      const actorIndex =
        context?.actors.findIndex(
          (actor) => actor.characterName === actorName,
        ) ?? -1;
      const actor = actorIndex >= 0 ? context?.actors[actorIndex] : undefined;
      if (!actor) return;
      applyViewerAction((nextViewer) =>
        nextViewer.addActor(
          actor.characterName,
          actorIndex,
          actor.heightMeters,
        ),
      );
      viewer.selectActor(actorName);
      setSelectedObjectId(objectId);
    },
    [
      applyViewerAction,
      autoPlanning,
      context?.actors,
      focusMarker,
      placedNames,
      saving,
      viewer,
    ],
  );

  const saveSketch = useCallback(async (): Promise<boolean> => {
    if (savePromiseRef.current) return savePromiseRef.current;
    if (!viewer || !context?.scene) return false;
    const promise = (async () => {
      setSaving(true);
      viewer.setInteractionEnabled(false);
      try {
        const draft = buildSketchData(context, viewer, compositionNote);
        const saved = await saveDramaShotBlockingSketch(
          projectId,
          shotId,
          draft,
        );
        if (!saved.data) throw new Error("保存没有返回草图数据。");
        const png = viewer.capturePng();
        const uploaded = await uploadDramaShotBlockingSketchPng(
          projectId,
          shotId,
          png,
        );
        if (!uploaded.data) throw new Error("保存没有返回草图图片。");
        const confirmed = await confirmDramaShotBlockingSketch(
          projectId,
          shotId,
        );
        if (!confirmed.data) throw new Error("确认没有返回草图数据。");
        setSavedData(confirmed.data);
        setDirty(false);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.drama.project(projectId),
            refetchType: "all",
          }),
          queryClient.invalidateQueries({
            queryKey: ["comic-drama"],
            refetchType: "all",
          }),
        ]);
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
      if (!result.data?.layout)
        throw new Error("自动构图没有返回可用的 3D 布局。");
      viewer.loadLayout(result.data.layout);
      syncSelection(viewer);
      setCompositionNote(result.data.compositionNote ?? "");
      setDirty(true);
      // 构图完成即打开镜头取景：让用户立刻看到镜头里的实际画面效果。
      setShotPreviewOn(true);
      toast.success("AI 已完成本镜构图。", {
        description:
          result.data.compositionNote ||
          "角色位置、相机和景深已应用到 3D 草图。",
      });
    } catch (error) {
      toast.error("AI 自动构图失败", {
        description:
          error instanceof Error
            ? error.message
            : "请稍后重试，原有布局已保留。",
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

  // 顶部导航栏常驻工作室页签（2026-08-27 用户要求）：进入 3D 草图编辑不掉页签。
  // 二级=角色/场景/道具/参考/提取/脚本/分镜/视频/设定（active=分镜）；
  // 点击先保存当前摆位，再跳回工作室对应页签。保存失败留在本页。
  const isMobileViewport = useIsMobileViewport();
  const studioTabNavigateRef = useRef(false);
  const novelId = context?.novelId ?? null;
  const leaveToStudio = useCallback(
    async (stage: StudioStage) => {
      if (studioTabNavigateRef.current) return;
      studioTabNavigateRef.current = true;
      try {
        if (!(await saveBeforeExit())) return;
        navigate(buildStudioNavigationPath(novelId ?? "", { stage }));
      } finally {
        studioTabNavigateRef.current = false;
      }
    },
    [navigate, novelId, saveBeforeExit],
  );
  useRegisterPageTabs(!isMobileViewport && Boolean(novelId), [
    buildStudioNavStageRow("storyboard", (stage) => {
      void leaveToStudio(stage);
    }),
  ]);

  if (contextQuery.isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        载入 3D 草图数据
      </div>
    );
  }
  if (contextQuery.isError || !context) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-destructive">草图数据载入失败。</p>
        <Button variant="outline" onClick={() => void contextQuery.refetch()}>
          重新载入
        </Button>
      </div>
    );
  }
  if (!context.scene) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          当前镜头没有可用的场景状态图。
        </p>
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          返回分镜
        </Button>
      </div>
    );
  }

  const renderAutoCompositionButton = () => (
    <AiButton
      type="button"
      data-ai-composition-button="true"
      variant="outline"
      size="sm"
      disabled={
        !viewer || saving || autoPlanning || context.actors.length === 0
      }
      onClick={() => void handleAutoPlan()}
      title="按本镜角色、动作和场景自动规划 3D 构图"
    >
      {autoPlanning ? (
        <Loader2
          className="mr-1.5 h-3.5 w-3.5 animate-spin"
          aria-hidden="true"
        />
      ) : (
        <WandSparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
      )}
      {autoPlanning
        ? "自动构图中"
        : context.sketch?.layout3d
          ? "重新构图"
          : "AI 构图"}
    </AiButton>
  );
  const autoCompositionNavPortal =
    !isMobileViewport && navActionsSlot
      ? createPortal(
          <div
            data-ai-composition-action="true"
            className="flex shrink-0 items-center"
          >
            {renderAutoCompositionButton()}
          </div>,
          navActionsSlot,
        )
      : null;

  const selectedMarker = selectedObjectId.startsWith("marker:")
    ? (context.scene.markers.find(
        (marker) => marker.id === selectedObjectId.slice("marker:".length),
      ) ?? null)
    : null;
  const objectItems: Drama3DObjectItem[] = [
    {
      id: SCENE_OBJECT_ID,
      label: "世界",
      kind: "scene",
      selected: selectedObjectId === SCENE_OBJECT_ID,
      onSelect: () => selectObject(SCENE_OBJECT_ID),
    },
    {
      id: CAMERA_OBJECT_ID,
      label: "摄像机",
      kind: "camera",
      selected: selectedObjectId === CAMERA_OBJECT_ID,
      onSelect: () => selectObject(CAMERA_OBJECT_ID),
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
    ...(STORY_SCENE_3D_MARKERS_ENABLED
      ? context.scene.markers.map((marker) => {
          const id = markerObjectId(marker.id);
          return {
            id,
            label: marker.label,
            kind: "marker" as const,
            selected: selectedObjectId === id,
            onSelect: () => selectObject(id),
          };
        })
      : []),
  ];

  const cameraActions = (
    <div className="space-y-3 border-t border-border/60 pt-4">
      <div className="text-xs font-medium">相机</div>
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={saving || autoPlanning || !viewer}
          onClick={() => viewer?.fitView()}
        >
          <Move3D className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          聚焦角色
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={saving || autoPlanning || !viewer}
          onClick={() => viewer?.resetCamera()}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          复位视角
        </Button>
        <Button
          type="button"
          variant={shotPreviewOn ? "default" : "outline"}
          size="sm"
          className="col-span-2 h-9"
          disabled={!viewer}
          aria-pressed={shotPreviewOn}
          title="在右下角实时预览摄像机画面，并叠加三分构图线"
          onClick={() => setShotPreviewOn((value) => !value)}
        >
          <Video className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {shotPreviewOn ? "隐藏镜头取景" : "镜头取景"}
        </Button>
      </div>
      <InspectorPropertyList
        className="text-[11px] text-muted-foreground"
        items={[
          { label: "视野角", value: `${cameraState.fovDeg.toFixed(0)}°` },
          {
            label: "景深",
            value: cameraState.depthOfFieldEnabled ? "开启" : "关闭",
          },
          { label: "焦点距离", value: cameraState.focusDistance.toFixed(2) },
          { label: "清晰范围", value: cameraState.focusRange.toFixed(2) },
          { label: "模糊半径", value: cameraState.blurRadius.toFixed(2) },
        ]}
      />
    </div>
  );

  return (
    <>
      {autoCompositionNavPortal}
      <Drama3DEditorShell
        header={
          <div
            data-editor-header="primary"
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="返回分镜"
              title="返回分镜"
              disabled={saving || autoPlanning}
              onClick={() => void goBack()}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <h1 className="min-w-0 truncate text-sm font-semibold">
              {shotOrder ? `第 ${shotOrder} 镜 3D 草图` : "3D 草图"}
            </h1>
            {isMobileViewport ? (
              <div
                data-ai-composition-action="true"
                className="ml-auto flex shrink-0 items-center"
              >
                {renderAutoCompositionButton()}
              </div>
            ) : null}
          </div>
        }
        viewport={
          <Card className="h-full min-h-0 w-full overflow-hidden">
            <CardContent className="relative h-full min-h-0 w-full p-0">
              <canvas
                ref={canvasRef}
                aria-label="3D 草图视口"
                aria-busy={saving || autoPlanning}
                className="block h-full w-full touch-none bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {!viewer && !viewerError ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  初始化 3D 草图
                </div>
              ) : null}
              {viewerError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center">
                  <p className="text-sm text-destructive">{viewerError}</p>
                  <p className="text-xs text-muted-foreground">
                    请确认浏览器支持 WebGL，并重新打开 3D 草图。
                  </p>
                  <Button variant="outline" onClick={() => void goBack()}>
                    返回分镜
                  </Button>
                </div>
              ) : null}
              {(shotPreviewOn || cameraSelected) && viewer && !viewerError ? (
                <div className="pointer-events-none absolute bottom-[calc(3%+1.6rem)] right-[2.5%] rounded border border-primary/70 bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                  镜头取景（导出草图不包含此预览）
                </div>
              ) : null}
              <TransformToolToolbar
                tool={transformTool}
                disabled={!viewer || saving || autoPlanning}
                onToolChange={setTransformTool}
              />
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
                <Move3D
                  className="mr-1 inline h-3.5 w-3.5"
                  aria-hidden="true"
                />
                拖动手柄移动角色或摄像机 · 右键旋转 · 滚轮缩放视角 · 中键平移
              </div>
              <div className="pointer-events-none absolute right-3 top-3">
                <Badge variant="secondary" className="shadow-sm">
                  镜头预览
                </Badge>
              </div>
            </CardContent>
          </Card>
        }
        objects={<Drama3DObjectPanel items={objectItems} />}
        actions={
          <Card className="flex h-full min-h-0 flex-col overflow-hidden">
            <CardContent className="h-full min-h-0 flex-1 space-y-4 overflow-y-auto pt-4">
              {selectedObjectId === SCENE_OBJECT_ID ? (
                <>
                  <InspectorGameObjectCard
                    icon={<Layers3 className="h-4 w-4" aria-hidden="true" />}
                    name={`第 ${context.shot.order} 镜`}
                  />
                  <div className="text-xs font-medium">镜头设计</div>
                  <InspectorPropertyList
                    className="text-xs"
                    items={[
                      {
                        label: "景别",
                        value: context.shot.shotSize || "未设置",
                      },
                    ]}
                  />
                  <div className="space-y-1.5 border-t border-border/60 pt-4 text-xs">
                    <div className="text-muted-foreground">动作</div>
                    <p className="whitespace-pre-wrap leading-5">
                      {context.shot.action || "未设置"}
                    </p>
                    {context.shot.dialogue ? (
                      <>
                        <div className="pt-1 text-muted-foreground">对白</div>
                        <p className="whitespace-pre-wrap leading-5">
                          {context.shot.dialogue}
                        </p>
                      </>
                    ) : null}
                  </div>
                  <div className="space-y-2 border-t border-border/60 pt-4 text-xs">
                    <div className="text-muted-foreground">AI 构图说明</div>
                    <p className="whitespace-pre-wrap leading-5 text-foreground">
                      {compositionNote || "尚未生成构图说明。"}
                    </p>
                  </div>
                  {cameraActions}
                </>
              ) : cameraSelected ? (
                <>
                  <InspectorGameObjectCard
                    icon={<Video className="h-4 w-4" aria-hidden="true" />}
                    name="摄像机"
                  />
                  <InspectorComponentSection title="Transform">
                    <div className="space-y-2">
                      <InspectorVector3Field
                        label="位置"
                        value={shotCameraPose.position}
                        disabled={saving || autoPlanning}
                        onCommit={(next) =>
                          applyViewerAction((nextViewer) => {
                            nextViewer.setShotCameraPose({ position: next });
                            return true;
                          })
                        }
                      />
                      <div className="flex items-center gap-2">
                        <span className="w-10 shrink-0 text-xs text-muted-foreground">
                          旋转 Y
                        </span>
                        <InspectorNumberField
                          label="Y"
                          value={shotCameraPose.yawDeg}
                          suffix="°"
                          disabled={saving || autoPlanning}
                          onCommit={(value) =>
                            applyViewerAction((nextViewer) => {
                              nextViewer.setShotCameraPose({ yawDeg: value });
                              return true;
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-10 shrink-0 text-xs text-muted-foreground">
                          俯仰角
                        </span>
                        <InspectorNumberField
                          label="X"
                          value={shotCameraPose.pitchDeg}
                          suffix="°"
                          disabled={saving || autoPlanning}
                          onCommit={(value) =>
                            applyViewerAction((nextViewer) => {
                              nextViewer.setShotCameraPose({ pitchDeg: value });
                              return true;
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-10 shrink-0 text-xs text-muted-foreground">
                          视野角
                        </span>
                        <InspectorNumberField
                          label="FOV"
                          value={cameraState.fovDeg}
                          suffix="°"
                          disabled={saving || autoPlanning}
                          onCommit={(value) =>
                            applyViewerAction((nextViewer) => {
                              nextViewer.setCameraState({
                                ...nextViewer.getCameraState(),
                                fovDeg: Math.max(10, Math.min(120, value)),
                              });
                              return true;
                            })
                          }
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      拖动机身或用移动/旋转手柄调整机位；选中摄像机时右下角实时预览镜头画面。
                    </p>
                  </InspectorComponentSection>
                  <div className="space-y-2 border-t border-border/60 pt-4">
                    <div className="text-xs font-medium">镜头朝向</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-full"
                        aria-label="镜头向左旋转"
                        title="向左旋转"
                        disabled={saving || autoPlanning}
                        onClick={() =>
                          applyViewerAction((nextViewer) =>
                            nextViewer.rotateSelected(-15),
                          )
                        }
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-full"
                        aria-label="镜头向右旋转"
                        title="向右旋转"
                        disabled={saving || autoPlanning}
                        onClick={() =>
                          applyViewerAction((nextViewer) =>
                            nextViewer.rotateSelected(15),
                          )
                        }
                      >
                        <RotateCw className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  {cameraActions}
                </>
              ) : selectedMarker ? (
                <>
                  <InspectorGameObjectCard
                    icon={<MapPin className="h-4 w-4" aria-hidden="true" />}
                    name={selectedMarker.label}
                  />
                  <InspectorTransformSection
                    value={{
                      position: selectedMarker.position,
                      yawDeg: selectedMarker.yawDeg,
                      scale: 1,
                    }}
                    hint={
                      <p className="text-[11px] text-muted-foreground">
                        标记摆放跟随场景设定，请在场景 3D 编辑器中调整。
                      </p>
                    }
                  />
                  <InspectorComponentSection
                    title="标记信息"
                    defaultOpen={false}
                  >
                    <InspectorPropertyList
                      className="text-xs"
                      items={[
                        {
                          label: "置信度",
                          value: `${Math.round(selectedMarker.confidence * 100)}%`,
                        },
                      ]}
                    />
                  </InspectorComponentSection>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={!viewer || saving || autoPlanning}
                    onClick={() => focusMarker(selectedMarker.id)}
                  >
                    <Move3D className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    聚焦空间标记
                  </Button>
                  {cameraActions}
                </>
              ) : selectedActorContext ? (
                <>
                  <InspectorGameObjectCard
                    icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
                    name={selectedActorContext.characterName}
                  />
                  <InspectorTransformSection
                    value={{
                      position: selectedTransform?.position ?? [0, 0, 0],
                      yawDeg: selectedTransform?.yawDeg ?? 0,
                      scale: selectedTransform?.scale?.[0] ?? 1,
                    }}
                    disabled={saving || autoPlanning || !selectedName}
                    onCommit={(patch) =>
                      applyViewerAction((nextViewer) =>
                        nextViewer.setSelectedTransform({
                          ...(patch.position
                            ? { position: patch.position }
                            : {}),
                          ...(patch.yawDeg != null
                            ? { yawDeg: patch.yawDeg }
                            : {}),
                          ...(patch.scale != null
                            ? { scale: [patch.scale, patch.scale, patch.scale] }
                            : {}),
                        }),
                      )
                    }
                    footer={
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={saving || autoPlanning || !selectedName}
                        onClick={() =>
                          applyViewerAction((nextViewer) =>
                            nextViewer.groundSelected(),
                          )
                        }
                      >
                        落地
                      </Button>
                    }
                  />
                  <InspectorComponentSection title="基础属性">
                    <InspectorPropertyList
                      className="text-xs"
                      items={[
                        {
                          label: "身高",
                          value: formatHeight(
                            selectedActorContext.heightMeters,
                          ),
                        },
                      ]}
                    />
                  </InspectorComponentSection>
                  <InspectorComponentSection title="静态姿势">
                    <label className="block space-y-1.5 text-xs text-muted-foreground">
                      <span>姿势</span>
                      <SelectControl
                        aria-label="角色姿势"
                        value={selectedPose ?? ""}
                        disabled={saving || autoPlanning || !selectedName}
                        onChange={(event) =>
                          applyViewerAction((nextViewer) =>
                            nextViewer.setSelectedPose(
                              event.target.value as DramaShotBlockingSketchPose,
                            ),
                          )
                        }
                        className="h-9 w-full"
                      >
                        <option value="" disabled>
                          选择姿势
                        </option>
                        {availablePoses.map((pose) => (
                          <option key={pose} value={pose}>
                            {BLOCKING_3D_POSE_LABELS[pose]}
                          </option>
                        ))}
                      </SelectControl>
                    </label>
                  </InspectorComponentSection>
                  <InspectorComponentSection title="模型外观">
                    <label className="block space-y-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center justify-between gap-2">
                        <span>模型颜色</span>
                        <span className="font-mono text-[11px] uppercase">
                          {selectedColor ? rgbToHex(selectedColor) : "—"}
                        </span>
                      </span>
                      <Input
                        type="color"
                        aria-label="模型颜色"
                        value={rgbToHex(selectedColor)}
                        disabled={saving || autoPlanning || !selectedName}
                        onChange={(event) => {
                          const color = hexToRgb(event.target.value);
                          if (color)
                            applyViewerAction((nextViewer) =>
                              nextViewer.setSelectedColor(color),
                            );
                        }}
                        className="h-10 cursor-pointer p-1"
                      />
                    </label>
                  </InspectorComponentSection>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {STORY_SCENE_3D_MARKERS_ENABLED
                    ? "从上方对象列表选择世界、摄像机、角色或空间标记。"
                    : "从上方对象列表选择世界、摄像机或角色。"}
                </p>
              )}
            </CardContent>
          </Card>
        }
      />
    </>
  );
}
