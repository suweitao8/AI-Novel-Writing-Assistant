import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search } from "lucide-react";

import { MODEL_LIBRARY, MODEL_LIBRARY_CATEGORIES, type ModelLibraryEntry } from "@/config/modelLibrary";
import { filterModelLibraryEntries } from "@/config/modelLibraryFilters";
import {
  getModelUsagePlacementLabel,
  getModelUsageSurfaceLabel,
} from "@/config/modelLibraryUsage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { prefetchModelAsset } from "./modelLibrary3d/modelViewerApp";
import {
  disposeThumbnailStudio,
  ensureThumbnail,
  getThumbnail,
  subscribeThumbnails,
} from "./modelLibrary3d/thumbnailStudio";

const MODEL_THUMBNAIL_ROOT_MARGIN = "320px 0px";

function ModelCard({ entry }: { entry: ModelLibraryEntry }) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(() => getThumbnail(entry.id));

  useEffect(() => {
    if (getThumbnail(entry.id)) return;

    let active = true;
    let unsubscribe: (() => void) | null = null;
    const requestThumbnail = () => {
      if (!active) return;
      unsubscribe = subscribeThumbnails(() => {
        const next = getThumbnail(entry.id);
        if (next) setThumbnail(next);
      });
      if (ensureThumbnail(entry)) {
        unsubscribe();
        unsubscribe = null;
        const next = getThumbnail(entry.id);
        if (next) setThumbnail(next);
      }
    };

    const card = cardRef.current;
    if (!card || typeof IntersectionObserver === "undefined") {
      requestThumbnail();
      return () => {
        active = false;
        unsubscribe?.();
      };
    }

    const observer = new IntersectionObserver(
      (observedEntries) => {
        if (!observedEntries.some((observedEntry) => observedEntry.isIntersecting)) return;
        observer.disconnect();
        requestThumbnail();
      },
      { rootMargin: MODEL_THUMBNAIL_ROOT_MARGIN, threshold: 0 },
    );
    observer.observe(card);

    return () => {
      active = false;
      observer.disconnect();
      unsubscribe?.();
    };
  }, [entry]);

  return (
    <Link
      ref={cardRef}
      to={`/models/${entry.id}`}
      className="group block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/60"
      data-model-card={entry.id}
      title={`打开 ${entry.name} 的 3D 编辑`}
      onPointerEnter={() => prefetchModelAsset(entry.fileUrl)}
      onFocus={() => prefetchModelAsset(entry.fileUrl)}
      onClick={(event) => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          // 在路由切换前抢占缩略图后台工作，避免点击后仍由离屏渲染占用主线程。
          disposeThumbnailStudio();
        }
      }}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={`${entry.name} 预览`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="truncate px-1.5 pt-1.5 text-[11px] text-foreground">{entry.name}</div>
      <div className="flex min-w-0 items-center gap-1.5 px-1.5 pb-1.5" data-model-usage-summary>
        <Badge
          variant="outline"
          className="min-w-0 max-w-full truncate px-1.5 py-0 text-[9px] font-medium"
          data-model-usage-support-surface={entry.usage.supportSurface}
          data-model-usage-placement-mode={entry.usage.placementMode}
        >
          {getModelUsageSurfaceLabel(entry.usage.supportSurface)} · {getModelUsagePlacementLabel(entry.usage.placementMode)}
        </Badge>
      </div>
    </Link>
  );
}

export default function ModelLibraryPage() {
  const [category, setCategory] = useState<string>("全部");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    return () => {
      void disposeThumbnailStudio();
    };
  }, []);

  const visibleEntries = useMemo(() => filterModelLibraryEntries(MODEL_LIBRARY), []);
  const visibleCategories = useMemo(
    () => MODEL_LIBRARY_CATEGORIES.filter((item) => visibleEntries.some((entry) => entry.category === item)),
    [visibleEntries],
  );
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of visibleEntries) {
      map.set(entry.category, (map.get(entry.category) ?? 0) + 1);
    }
    return map;
  }, [visibleEntries]);
  const entries = useMemo(
    () => {
      const categoryEntries = category === "全部"
        ? MODEL_LIBRARY
        : MODEL_LIBRARY.filter((entry) => entry.category === category);
      return filterModelLibraryEntries(categoryEntries, search);
    },
    [category, search],
  );
  const hasActiveFilters = category !== "全部" || searchInput.trim().length > 0;
  const clearFilters = () => {
    setCategory("全部");
    setSearchInput("");
    setSearch("");
  };

  return (
    <div className="space-y-3" data-model-library-page>
      <section
        className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
        aria-label="模型搜索"
        data-model-search
      >
        <label htmlFor="model-library-search" className="relative min-w-[220px] flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="model-library-search"
            aria-label="搜索模型"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="搜索模型名称、文件名或分类"
            className="h-10 pl-9"
          />
        </label>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {entries.length} / {visibleEntries.length}
        </span>
      </section>

      <section
        role="tablist"
        aria-label="模型分类"
        className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1"
        data-model-category-table
      >
        {["全部", ...visibleCategories].map((item) => (
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
              {item === "全部" ? visibleEntries.length : counts.get(item) ?? 0}
            </span>
          </button>
        ))}
      </section>

      {entries.length > 0 ? (
        <section className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10" data-model-grid>
          {entries.map((entry) => (
            <ModelCard key={entry.id} entry={entry} />
          ))}
        </section>
      ) : (
        <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground" data-model-empty>
          <p>没有符合当前搜索或分类的模型</p>
          {hasActiveFilters ? (
            <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
              清除筛选
            </Button>
          ) : null}
        </section>
      )}
    </div>
  );
}
