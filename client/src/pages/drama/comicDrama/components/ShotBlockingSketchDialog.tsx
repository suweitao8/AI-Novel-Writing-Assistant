import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  FlipHorizontal2,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  confirmDramaShotBlockingSketch,
  getDramaShotBlockingSketch,
  saveDramaShotBlockingSketch,
  uploadDramaShotBlockingSketchPng,
  type DramaShot,
  type DramaShotBlockingSketchActor,
  type DramaShotBlockingSketchData,
  type DramaShotBlockingSketchEditorContext,
} from "@/api/media/drama";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  BLOCKING_SKETCH_CANVAS,
  clampBlockingSketchFov,
  clampBlockingSketchPitch,
  moveBlockingSketchActor,
  nextBlockingSketchZIndex,
  scaleBlockingSketchActor,
  updateBlockingSketchYaw,
} from "./shotBlockingSketchMath";

type ActorSource = DramaShotBlockingSketchEditorContext["actors"][number];
type CanvasImageMap = Record<string, HTMLImageElement>;

function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败。"));
    image.src = src;
  });
}

function createInitialSketch(context: DramaShotBlockingSketchEditorContext): DramaShotBlockingSketchData | null {
  if (context.sketch) {
    return context.sketch;
  }
  if (!context.scene) {
    return null;
  }
  const count = context.actors.length;
  return {
    status: "draft",
    version: 1,
    scene: {
      assetId: context.scene.assetId,
      stateId: context.scene.stateId,
      imageUrl: context.scene.imageUrl,
      yawDeg: 0,
      pitchDeg: 0,
      fovDeg: 78,
    },
    actors: context.actors.map((actor, index) => ({
      characterName: actor.characterName,
      ...(actor.assetId ? { assetId: actor.assetId } : {}),
      ...(actor.stateId ? { stateId: actor.stateId } : {}),
      ...(actor.imageUrl ? { imageUrl: actor.imageUrl } : {}),
      x: count <= 1 ? 0.5 : 0.26 + (index / Math.max(1, count - 1)) * 0.48,
      y: 0.82,
      scale: 0.52,
      flipX: false,
      zIndex: index,
    })),
  };
}

function actorImageKey(actor: DramaShotBlockingSketchActor): string | null {
  return actor.imageUrl?.trim() || null;
}

function drawWrappedPanorama(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  sketch: DramaShotBlockingSketchData,
) {
  const { width, height } = BLOCKING_SKETCH_CANVAS;
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, width, height);
  if (!image) {
    ctx.fillStyle = "#475569";
    ctx.fillRect(0, 0, width, height);
    return;
  }
  const imageWidth = image.naturalWidth || 1;
  const imageHeight = image.naturalHeight || 1;
  const sourceWidth = Math.max(1, Math.min(imageWidth, imageWidth * (sketch.scene.fovDeg / 360)));
  const sourceHeight = Math.max(1, Math.min(imageHeight, sourceWidth * (height / width)));
  const centerX = ((sketch.scene.yawDeg / 360 + 0.5) % 1 + 1) % 1 * imageWidth;
  const maxOffsetY = Math.max(0, (imageHeight - sourceHeight) / 2);
  const centerY = imageHeight / 2 + (sketch.scene.pitchDeg / 60) * maxOffsetY;
  const sourceY = Math.max(0, Math.min(imageHeight - sourceHeight, centerY - sourceHeight / 2));
  const sourceX = ((centerX - sourceWidth / 2) % imageWidth + imageWidth) % imageWidth;
  const firstWidth = Math.min(sourceWidth, imageWidth - sourceX);
  ctx.drawImage(image, sourceX, sourceY, firstWidth, sourceHeight, 0, 0, (firstWidth / sourceWidth) * width, height);
  if (firstWidth < sourceWidth) {
    const remaining = sourceWidth - firstWidth;
    ctx.drawImage(image, 0, sourceY, remaining, sourceHeight, (firstWidth / sourceWidth) * width, 0, (remaining / sourceWidth) * width, height);
  }
}

function actorAspect(actor: DramaShotBlockingSketchActor, source: ActorSource | undefined, images: CanvasImageMap): number {
  if (source?.sourceImageKind === "state_sheet") {
    return 4 / 9;
  }
  const image = actorImageKey(actor) ? images[actorImageKey(actor)!] : undefined;
  return image ? Math.max(0.2, Math.min(1.6, image.naturalWidth / Math.max(1, image.naturalHeight))) : 4 / 9;
}

function actorRect(actor: DramaShotBlockingSketchActor, source: ActorSource | undefined, images: CanvasImageMap) {
  const height = Math.max(44, actor.scale * BLOCKING_SKETCH_CANVAS.height);
  const width = height * actorAspect(actor, source, images);
  return {
    x: actor.x * BLOCKING_SKETCH_CANVAS.width - width / 2,
    y: actor.y * BLOCKING_SKETCH_CANVAS.height - height,
    width,
    height,
  };
}

function drawPlaceholderActor(ctx: CanvasRenderingContext2D, rect: ReturnType<typeof actorRect>) {
  const centerX = rect.x + rect.width / 2;
  const head = Math.min(rect.width * 0.42, rect.height * 0.18);
  ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
  ctx.beginPath();
  ctx.arc(centerX, rect.y + head, head, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(rect.x + rect.width * 0.17, rect.y + head * 2.05, rect.width * 0.66, rect.height - head * 2.05, rect.width * 0.14);
  ctx.fill();
}

function drawSketchCanvas(
  canvas: HTMLCanvasElement,
  sketch: DramaShotBlockingSketchData,
  sourcesByName: Map<string, ActorSource>,
  images: CanvasImageMap,
  selectedName: string | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = BLOCKING_SKETCH_CANVAS.width;
  canvas.height = BLOCKING_SKETCH_CANVAS.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawWrappedPanorama(ctx, images[sketch.scene.imageUrl], sketch);
  for (const actor of [...sketch.actors].sort((left, right) => left.zIndex - right.zIndex)) {
    const source = sourcesByName.get(actor.characterName);
    const rect = actorRect(actor, source, images);
    const image = actorImageKey(actor) ? images[actorImageKey(actor)!] : undefined;
    if (image) {
      ctx.save();
      if (actor.flipX) {
        ctx.translate(rect.x + rect.width / 2, 0);
        ctx.scale(-1, 1);
        ctx.translate(-(rect.x + rect.width / 2), 0);
      }
      if (source?.sourceImageKind === "state_sheet") {
        const cellWidth = image.naturalWidth / 4;
        ctx.drawImage(image, cellWidth * 2, 0, cellWidth, image.naturalHeight, rect.x, rect.y, rect.width, rect.height);
      } else {
        ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      }
      ctx.restore();
    } else {
      drawPlaceholderActor(ctx, rect);
    }
    if (selectedName === actor.characterName) {
      ctx.save();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 6]);
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
      ctx.fillRect(rect.x, Math.max(0, rect.y - 32), Math.min(220, Math.max(96, rect.width)), 28);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "500 16px system-ui";
      ctx.fillText(actor.characterName, rect.x + 8, Math.max(19, rect.y - 12));
      ctx.restore();
    }
  }
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("草图导出失败。"));
    }, "image/png");
  });
}

export default function ShotBlockingSketchDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  shot: Pick<DramaShot, "id" | "order">;
  onSaved?: () => void;
}) {
  const { open, onOpenChange, projectId, shot } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<{ mode: "scene" | "actor"; actorName?: string; x: number; y: number } | null>(null);
  const [sketch, setSketch] = useState<DramaShotBlockingSketchData | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const contextQuery = useQuery({
    queryKey: ["drama-shot-blocking-sketch", projectId, shot.id],
    queryFn: () => getDramaShotBlockingSketch(projectId, shot.id),
    enabled: open,
    staleTime: 0,
  });
  const context = contextQuery.data?.data;
  const sourcesByName = useMemo(() => new Map(context?.actors.map((actor) => [actor.characterName, actor]) ?? []), [context?.actors]);
  const imageUrls = useMemo(() => {
    const urls = new Set<string>();
    if (sketch?.scene.imageUrl) urls.add(sketch.scene.imageUrl);
    for (const actor of sketch?.actors ?? []) {
      if (actor.imageUrl) urls.add(actor.imageUrl);
    }
    return [...urls];
  }, [sketch]);
  const [images, setImages] = useState<CanvasImageMap>({});

  useEffect(() => {
    if (!context) return;
    const next = createInitialSketch(context);
    setSketch(next);
    setSelectedName(next?.actors[0]?.characterName ?? null);
  }, [context]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(imageUrls.map(async (url) => {
      try {
        const image = await loadCanvasImage(url);
        return [url, image] as const;
      } catch {
        return null;
      }
    })).then((loaded) => {
      if (cancelled) return;
      setImages((current) => ({
        ...current,
        ...Object.fromEntries(loaded.filter((item): item is readonly [string, HTMLImageElement] => Boolean(item))),
      }));
    });
    return () => { cancelled = true; };
  }, [imageUrls]);

  useEffect(() => {
    if (!canvasRef.current || !sketch) return;
    drawSketchCanvas(canvasRef.current, sketch, sourcesByName, images, selectedName);
  }, [images, selectedName, sketch, sourcesByName]);

  const selectedActor = sketch?.actors.find((actor) => actor.characterName === selectedName) ?? null;
  const readyToSave = Boolean(sketch && context?.scene);

  const updateSelectedActor = (update: (actor: DramaShotBlockingSketchActor) => DramaShotBlockingSketchActor) => {
    if (!selectedName) return;
    setSketch((current) => current ? {
      ...current,
      actors: current.actors.map((actor) => actor.characterName === selectedName ? update(actor) : actor),
    } : current);
  };

  const addActor = (source: ActorSource) => {
    setSelectedName(source.characterName);
    setSketch((current) => {
      if (!current || current.actors.some((actor) => actor.characterName === source.characterName)) return current;
      const actor: DramaShotBlockingSketchActor = {
        characterName: source.characterName,
        ...(source.assetId ? { assetId: source.assetId } : {}),
        ...(source.stateId ? { stateId: source.stateId } : {}),
        ...(source.imageUrl ? { imageUrl: source.imageUrl } : {}),
        x: 0.5,
        y: 0.82,
        scale: 0.52,
        flipX: false,
        zIndex: nextBlockingSketchZIndex(current.actors),
      };
      return { ...current, actors: [...current.actors, actor] };
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!sketch || saving) return;
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * BLOCKING_SKETCH_CANVAS.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * BLOCKING_SKETCH_CANVAS.height;
    const hit = [...sketch.actors]
      .sort((left, right) => right.zIndex - left.zIndex)
      .find((actor) => {
        const rect = actorRect(actor, sourcesByName.get(actor.characterName), images);
        return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
      });
    pointerRef.current = hit
      ? { mode: "actor", actorName: hit.characterName, x: event.clientX, y: event.clientY }
      : { mode: "scene", x: event.clientX, y: event.clientY };
    if (hit) setSelectedName(hit.characterName);
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || !sketch) return;
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (pointer.mode === "actor" && pointer.actorName) {
      setSketch((current) => current ? {
        ...current,
        actors: current.actors.map((actor) => actor.characterName === pointer.actorName
          ? moveBlockingSketchActor(actor, deltaX / bounds.width, deltaY / bounds.height)
          : actor),
      } : current);
      return;
    }
    setSketch((current) => current ? {
      ...current,
      scene: {
        ...current.scene,
        yawDeg: updateBlockingSketchYaw(current.scene.yawDeg, deltaX, current.scene.fovDeg / Math.max(1, bounds.width)),
        pitchDeg: clampBlockingSketchPitch(current.scene.pitchDeg + (deltaY / Math.max(1, bounds.height)) * 120),
      },
    } : current);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    setSketch((current) => current ? {
      ...current,
      scene: { ...current.scene, fovDeg: clampBlockingSketchFov(current.scene.fovDeg + event.deltaY * 0.04) },
    } : current);
  };

  const save = async (confirmAfterSave: boolean) => {
    const canvas = canvasRef.current;
    if (!sketch || !canvas || !readyToSave) return;
    setSaving(true);
    try {
      const saved = await saveDramaShotBlockingSketch(projectId, shot.id, sketch);
      if (!saved.data) throw new Error("保存草图后没有返回构图数据。");
      drawSketchCanvas(canvas, saved.data, sourcesByName, images, null);
      const png = await canvasToPng(canvas);
      const uploaded = await uploadDramaShotBlockingSketchPng(projectId, shot.id, png);
      const result = confirmAfterSave
        ? await confirmDramaShotBlockingSketch(projectId, shot.id)
        : uploaded;
      if (!result.data) throw new Error("草图保存后没有返回结果。");
      setSketch(result.data);
      props.onSaved?.();
      toast.success(confirmAfterSave ? "摆位草图已确认。" : "摆位草图已保存。");
    } catch (error) {
      toast.error(confirmAfterSave ? "确认草图失败" : "保存草图失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      if (canvas && sketch) drawSketchCanvas(canvas, sketch, sourcesByName, images, selectedName);
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title={`第 ${shot.order} 镜摆位草图`}
        className="max-w-6xl"
        footer={(
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="button" variant="outline" disabled={!readyToSave || saving} onClick={() => void save(false)}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              保存草图
            </Button>
            <Button type="button" disabled={!readyToSave || saving} onClick={() => void save(true)}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              确认草图
            </Button>
          </div>
        )}
      >
        {contextQuery.isLoading ? (
          <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />载入摆位草图
          </div>
        ) : contextQuery.isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">载入摆位草图失败。</div>
        ) : !context?.scene || !sketch ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">当前镜头没有可用的场景全景图。</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_13rem]">
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-border bg-muted/20 shadow-inner">
                <canvas
                  ref={canvasRef}
                  width={BLOCKING_SKETCH_CANVAS.width}
                  height={BLOCKING_SKETCH_CANVAS.height}
                  className="aspect-video w-full touch-none cursor-grab bg-muted active:cursor-grabbing"
                  aria-label="摆位草图画布"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onWheel={onWheel}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>视角 {Math.round(sketch.scene.yawDeg)}°</span>
                <span>俯仰 {Math.round(sketch.scene.pitchDeg)}°</span>
                <span>视野 {Math.round(sketch.scene.fovDeg)}°</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSketch((current) => current ? {
                    ...current,
                    scene: { ...current.scene, yawDeg: 0, pitchDeg: 0, fovDeg: 78 },
                  } : current)}
                >
                  <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />复位视角
                </Button>
              </div>
            </div>

            <aside className="space-y-3 rounded-xl border border-border bg-muted/10 p-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">角色列表</h3>
                <div className="mt-2 space-y-1">
                  {(context.actors ?? []).map((actor) => {
                    const placed = sketch.actors.some((item) => item.characterName === actor.characterName);
                    return (
                      <Button
                        key={actor.characterName}
                        type="button"
                        size="sm"
                        variant={selectedName === actor.characterName ? "secondary" : "ghost"}
                        className={cn("h-8 w-full justify-start text-xs", placed && "text-foreground")}
                        onClick={() => placed ? setSelectedName(actor.characterName) : addActor(actor)}
                      >
                        {placed ? actor.characterName : `加入 ${actor.characterName}`}
                      </Button>
                    );
                  })}
                  {context.actors.length === 0 ? <p className="text-xs text-muted-foreground">本镜没有角色。</p> : null}
                </div>
              </div>

              {selectedActor ? (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-medium text-foreground">{selectedActor.characterName}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <Button type="button" size="icon" variant="outline" className="h-8 w-full" title="缩小" aria-label="缩小角色" onClick={() => updateSelectedActor((actor) => scaleBlockingSketchActor(actor, 0.88))}>
                      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon" variant="outline" className="h-8 w-full" title="放大" aria-label="放大角色" onClick={() => updateSelectedActor((actor) => scaleBlockingSketchActor(actor, 1.14))}>
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon" variant="outline" className="h-8 w-full" title="左右翻转" aria-label="左右翻转角色" onClick={() => updateSelectedActor((actor) => ({ ...actor, flipX: !actor.flipX }))}>
                      <FlipHorizontal2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon" variant="outline" className="h-8 w-full" title="前移" aria-label="角色前移" onClick={() => updateSelectedActor((actor) => ({ ...actor, zIndex: nextBlockingSketchZIndex(sketch.actors) }))}>
                      <ArrowUpToLine className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon" variant="outline" className="h-8 w-full" title="后移" aria-label="角色后移" onClick={() => updateSelectedActor((actor) => ({ ...actor, zIndex: Math.max(0, actor.zIndex - 1) }))}>
                      <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon" variant="outline" className="h-8 w-full text-destructive hover:text-destructive" title="移除" aria-label="移除角色" onClick={() => {
                      setSketch((current) => current ? { ...current, actors: current.actors.filter((actor) => actor.characterName !== selectedName) } : current);
                      setSelectedName(null);
                    }}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </AppDialogContent>
    </Dialog>
  );
}
