import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { MODEL_LIBRARY, MODEL_LIBRARY_CATEGORIES, type ModelLibraryEntry } from "@/config/modelLibrary";
import { cn } from "@/lib/utils";
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

export default function ModelLibraryPage() {
  const [category, setCategory] = useState<string>("全部");
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
    </div>
  );
}
