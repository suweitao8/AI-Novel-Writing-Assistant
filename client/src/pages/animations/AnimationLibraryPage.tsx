import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Play } from "lucide-react";

import { ANIMATION_LIBRARY, ANIMATION_LIBRARY_CATEGORIES, type AnimationLibraryEntry } from "@/config/animationLibrary";
import { cn } from "@/lib/utils";
import {
  ensureAnimationThumbnail,
  getAnimationThumbnail,
  subscribeAnimationThumbnails,
} from "./animationThumbnailStudio";
import { getAnimationKeyframe, subscribeAnimationKeyframes } from "./animationPreviewStorage";

function AnimationCard({ entry }: { entry: AnimationLibraryEntry }) {
  const [thumbnail, setThumbnail] = useState<string | null>(() => {
    return getAnimationKeyframe(entry.id)?.dataUrl ?? getAnimationThumbnail(entry.id);
  });

  useEffect(() => {
    const syncThumbnail = () => {
      setThumbnail(getAnimationKeyframe(entry.id)?.dataUrl ?? getAnimationThumbnail(entry.id));
    };
    syncThumbnail();
    const unsubscribeThumbnails = subscribeAnimationThumbnails(syncThumbnail);
    const unsubscribeKeyframes = subscribeAnimationKeyframes((changedId) => {
      if (changedId === entry.id) syncThumbnail();
    });
    if (!getAnimationKeyframe(entry.id)) ensureAnimationThumbnail(entry);
    return () => {
      unsubscribeThumbnails();
      unsubscribeKeyframes();
    };
  }, [entry]);

  return (
    <Link
      to={`/animations/${entry.id}`}
      className="group block overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/60"
      data-animation-card={entry.id}
      title={`打开 ${entry.name} 的 3D 预览`}
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
        <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm">
          <Play className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
      </div>
      <div className="px-1.5 py-1.5">
        <div className="truncate text-[11px] text-foreground">{entry.name}</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {entry.category} · {entry.durationSeconds.toFixed(1)} 秒
        </div>
      </div>
    </Link>
  );
}

export default function AnimationLibraryPage() {
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
    <div className="space-y-3" data-animation-page>
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

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" data-animation-grid>
        {entries.map((entry) => (
          <AnimationCard key={entry.id} entry={entry} />
        ))}
      </section>
    </div>
  );
}
