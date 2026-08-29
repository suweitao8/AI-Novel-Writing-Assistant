import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { ANIMATION_LIBRARY, ANIMATION_LIBRARY_CATEGORIES, type AnimationLibraryEntry } from "@/config/animationLibrary";
import { MODEL_LIBRARY, MODEL_LIBRARY_CATEGORIES, type ModelLibraryEntry } from "@/config/modelLibrary";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import {
  openAnimationPreview,
  type AnimationPreview,
} from "./modelLibrary3d/animationPreviewApp";
import { ensureThumbnail, getThumbnail, subscribeThumbnails } from "./modelLibrary3d/thumbnailStudio";

function ModelCard({ entry }: { entry: ModelLibraryEntry }) {
  const [thumbnail, setThumbnail] = useState<string | null>(() => getThumbnail(entry.id));
  useEffect(() => {
    if (ensureThumbnail(entry)) return;
    return subscribeThumbnails(() => {
      const next = getThumbnail(entry.id);
      if (next) setThumbnail(next);
    });
  }, [entry]);

  return (
    <Link
      to={`/models/${entry.id}`}
      className="group block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/60"
      data-model-card={entry.id}
      title={`打开 ${entry.name} 的 3D 编辑`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={`${entry.name} 预览`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="truncate px-1.5 py-1.5 text-[11px] text-foreground">{entry.name}</div>
    </Link>
  );
}

function AnimationPreviewDialog({ entry, onClose }: { entry: AnimationLibraryEntry | null; onClose: () => void }) {
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const previewRef = useRef<AnimationPreview | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!entry || !canvasEl || previewRef.current) return undefined;
    let disposed = false;
    setStatus("正在加载动作");
    const handle = openAnimationPreview({
      canvas: canvasEl,
      glbUrl: entry.fileUrl,
      clipName: entry.clipName,
      onStatus: setStatus,
      onError: (message) => toast.error("动作预览失败", { description: message }),
    });
    handle.ready
      .then((preview) => {
        if (disposed) {
          preview.destroy();
          return;
        }
        previewRef.current = preview;
        setStatus("");
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setStatus("");
        toast.error("动作预览初始化失败", {
          description: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      disposed = true;
      handle.cancel();
      previewRef.current = null;
    };
  }, [entry, canvasEl]);

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AppDialogContent
        title={entry ? `${entry.name} 预览` : "动画预览"}
        footer={
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        }
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
          <canvas
            key={entry?.id ?? "empty"}
            ref={setCanvasEl}
            className="block h-full w-full"
            data-animation-preview-canvas
          />
          {status ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {status}
            </div>
          ) : null}
        </div>
      </AppDialogContent>
    </Dialog>
  );
}

function AnimationTable({ onPreview }: { onPreview: (entry: AnimationLibraryEntry) => void }) {
  const [category, setCategory] = useState<string>("全部");
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of ANIMATION_LIBRARY) {
      map.set(entry.category, (map.get(entry.category) ?? 0) + 1);
    }
    return map;
  }, []);
  const entries = useMemo(
    () =>
      category === "全部"
        ? ANIMATION_LIBRARY
        : ANIMATION_LIBRARY.filter((entry) => entry.category === category),
    [category],
  );

  return (
    <section className="space-y-3" data-animation-table>
      <section
        role="tablist"
        aria-label="动画分类"
        className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1"
        data-animation-category-table
      >
        {["全部", ...ANIMATION_LIBRARY_CATEGORIES].map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={category === item}
            onClick={() => setCategory(item)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors",
              category === item
                ? "bg-primary font-medium text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {item}
            <span
              className={cn(
                "text-[10px] leading-none",
                category === item ? "text-primary-foreground/80" : "text-muted-foreground/70",
              )}
            >
              {item === "全部" ? ANIMATION_LIBRARY.length : counts.get(item) ?? 0}
            </span>
          </button>
        ))}
      </section>

      <div className="overflow-hidden rounded-xl border border-border bg-card" data-animation-row-table>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-1.5 font-normal">名称</th>
              <th scope="col" className="px-3 py-1.5 font-normal">时长</th>
              <th scope="col" className="px-3 py-1.5 text-right font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-b-0" data-animation-row={entry.id}>
                <td className="px-3 py-2 text-foreground">{entry.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{entry.durationSeconds.toFixed(1)} 秒</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => onPreview(entry)}>
                    预览
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ModelLibraryPage() {
  const [category, setCategory] = useState<string>("全部");
  const [previewEntry, setPreviewEntry] = useState<AnimationLibraryEntry | null>(null);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of MODEL_LIBRARY) {
      map.set(entry.category, (map.get(entry.category) ?? 0) + 1);
    }
    return map;
  }, []);
  const entries = useMemo(
    () => (category === "全部" ? MODEL_LIBRARY : MODEL_LIBRARY.filter((entry) => entry.category === category)),
    [category],
  );

  return (
    <div className="space-y-3" data-model-library-page>
      <section
        role="tablist"
        aria-label="模型分类"
        className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1"
        data-model-category-table
      >
        {["全部", ...MODEL_LIBRARY_CATEGORIES].map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={category === item}
            onClick={() => setCategory(item)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors",
              category === item
                ? "bg-primary font-medium text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {item}
            <span
              className={cn(
                "text-[10px] leading-none",
                category === item ? "text-primary-foreground/80" : "text-muted-foreground/70",
              )}
            >
              {item === "全部" ? MODEL_LIBRARY.length : counts.get(item) ?? 0}
            </span>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10" data-model-grid>
        {entries.map((entry) => (
          <ModelCard key={entry.id} entry={entry} />
        ))}
      </section>

      <AnimationTable onPreview={setPreviewEntry} />

      <AnimationPreviewDialog entry={previewEntry} onClose={() => setPreviewEntry(null)} />
    </div>
  );
}
