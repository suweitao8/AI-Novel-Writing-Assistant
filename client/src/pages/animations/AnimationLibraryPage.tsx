import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

import {
  ANIMATION_LIBRARY,
  ANIMATION_LIBRARY_ACTION_TYPES,
  ANIMATION_LIBRARY_CATEGORY_FILTERS,
  filterAnimationLibraryEntries,
  type AnimationLibraryEntry,
  type AnimationLibraryCategoryFilterId,
} from "@/config/animationLibrary";
import { getAnimationFrameCount } from "./animationFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePageNavActionsSlot } from "@/components/layout/PageTabsContext";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { cn } from "@/lib/utils";
import {
  disposeAnimationThumbnailStudio,
  ensureAnimationThumbnail,
  getAnimationThumbnail,
  subscribeAnimationThumbnails,
} from "./animationThumbnailStudio";
import { getAnimationKeyframe, subscribeAnimationKeyframes } from "./animationPreviewStorage";

export const PAGE_SIZE = 24;

function AnimationCard({ entry }: { entry: AnimationLibraryEntry }) {
  const [thumbnail, setThumbnail] = useState<string | null>(() => {
    return getAnimationKeyframe(entry.id, entry.frameRate)?.dataUrl ?? getAnimationThumbnail(entry.id);
  });

  useEffect(() => {
    const syncThumbnail = () => {
      setThumbnail(
        getAnimationKeyframe(entry.id, entry.frameRate)?.dataUrl ?? getAnimationThumbnail(entry.id),
      );
    };
    syncThumbnail();
    const unsubscribeThumbnails = subscribeAnimationThumbnails(syncThumbnail);
    const unsubscribeKeyframes = subscribeAnimationKeyframes((changedId) => {
      if (changedId === entry.id) syncThumbnail();
    });
    if (!getAnimationKeyframe(entry.id, entry.frameRate)) ensureAnimationThumbnail(entry);
    return () => {
      unsubscribeThumbnails();
      unsubscribeKeyframes();
    };
  }, [entry]);

  return (
    <Link
      to={`/animations/${entry.id}`}
      className="group block overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
      </div>
      <div className="px-1.5 py-1.5">
        <div className="truncate text-[11px] text-foreground">{entry.name}</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {entry.packLabel} · {entry.classificationLabel} · {entry.postureLabel} · 共 {getAnimationFrameCount(entry.durationSeconds, entry.frameRate)} 帧
        </div>
      </div>
    </Link>
  );
}

function countBy<T extends string>(
  entries: readonly AnimationLibraryEntry[],
  read: (entry: AnimationLibraryEntry) => T,
) {
  const counts = new Map<T, number>();
  for (const entry of entries) counts.set(read(entry), (counts.get(read(entry)) ?? 0) + 1);
  return counts;
}

export default function AnimationLibraryPage() {
  const [category, setCategory] = useState<AnimationLibraryCategoryFilterId>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const navActionsSlot = usePageNavActionsSlot();
  const isMobileViewport = useIsMobileViewport();

  const applySearch = (value: string) => {
    setSearch(value.trim());
    setPage(1);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applySearch(searchInput);
  };

  useEffect(() => {
    return () => {
      void disposeAnimationThumbnailStudio();
    };
  }, []);

  const searchedEntries = useMemo(
    () => filterAnimationLibraryEntries(ANIMATION_LIBRARY, { query: search }),
    [search],
  );
  const categoryCounts = useMemo(
    () => countBy(searchedEntries, (entry) => entry.source === "legacy" ? "legacy" : entry.actionType),
    [searchedEntries],
  );
  const visibleActionTypes = useMemo(
    () => ANIMATION_LIBRARY_ACTION_TYPES.filter((option) => categoryCounts.has(option.id)),
    [categoryCounts],
  );
  const entries = useMemo(
    () => filterAnimationLibraryEntries(ANIMATION_LIBRARY, { category, query: search }),
    [category, search],
  );

  useEffect(() => {
    setPage(1);
  }, [category, search]);

  useEffect(() => {
    if (category !== "all" && category !== "legacy" && !visibleActionTypes.some(({ id }) => id === category)) {
      setCategory("all");
    }
  }, [category, visibleActionTypes]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(pageStart, pageStart + PAGE_SIZE);
  const hasActiveFilters =
    category !== "all" ||
    searchInput.trim().length > 0;

  const resetFilters = () => {
    setCategory("all");
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const renderCategoryButton = (id: AnimationLibraryCategoryFilterId, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={category === id}
      onClick={() => {
        setCategory(id);
        setPage(1);
      }}
      data-animation-category={id}
      className={cn(
        "flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] transition-colors",
        category === id
          ? "bg-primary font-medium text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "text-[10px] leading-none",
          category === id ? "text-primary-foreground/80" : "text-muted-foreground/70",
        )}
      >
        {id === "all" ? searchedEntries.length : categoryCounts.get(id) ?? 0}
      </span>
    </button>
  );

  const searchForm = (
    <form
      className="flex min-w-0 items-center gap-1.5"
      aria-label="搜索动画"
      data-animation-search
      onSubmit={submitSearch}
    >
      <label htmlFor="animation-library-search" className="relative min-w-0 flex-1 sm:w-64">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="animation-library-search"
          aria-label="搜索动画"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applySearch(event.currentTarget.value);
            }
          }}
          placeholder="搜索动画名称或片段名"
          className="h-8 pl-8 text-xs"
        />
      </label>
      <Button type="submit" size="sm" className="h-8 shrink-0 gap-1 px-2.5 text-xs">
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        搜索
      </Button>
      {hasActiveFilters ? (
        <button
          type="button"
          onClick={resetFilters}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] text-primary hover:bg-accent"
          data-animation-reset-filters
        >
          清除筛选
        </button>
      ) : null}
    </form>
  );

  // 桌面端把搜索框和搜索按钮 portal 进顶部导航栏，紧贴「AI 实况」左侧；
  // 移动端顶栏放不下，搜索保留在筛选卡内部。
  const searchPortal = !isMobileViewport && navActionsSlot
    ? createPortal(
        <div className="flex min-w-0 items-center justify-end gap-2">{searchForm}</div>,
        navActionsSlot,
      )
    : null;

  return (
    <div className="space-y-3" data-animation-page>
      {searchPortal}
      <section
        aria-label="动画筛选"
        className="rounded-xl border border-border bg-card p-2"
        data-animation-category-table
      >
        <div className="min-w-0" data-animation-category-filter>
          <div
            role="tablist"
            aria-label="动画分类"
            className="flex min-w-0 flex-wrap items-center gap-1"
            data-animation-category-row
          >
            {ANIMATION_LIBRARY_CATEGORY_FILTERS.map(({ id, label }) => {
              if (id === "all" || id === "legacy") return renderCategoryButton(id, label);
              // 当前搜索范围内没有内容的动作分类自动隐藏。
              return visibleActionTypes.some(({ id: actionId }) => actionId === id)
                ? renderCategoryButton(id, label)
                : null;
            })}
          </div>
        </div>
        {isMobileViewport ? (
          <div className="mt-2 flex min-w-0 items-center" data-animation-search-row>
            {searchForm}
          </div>
        ) : null}
      </section>

      {entries.length > 0 ? (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" data-animation-grid>
            {pageEntries.map((entry) => (
              <AnimationCard key={entry.id} entry={entry} />
            ))}
          </section>
          <nav
            className="flex items-center justify-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
            aria-label="动画分页"
            data-animation-pagination
          >
            <button
              type="button"
              aria-label="上一页"
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={page <= 1}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              上一页
            </button>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              第 {page} / {totalPages} 页 · 共 {entries.length} 条
            </span>
            <button
              type="button"
              aria-label="下一页"
              onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
              disabled={page >= totalPages}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              下一页
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </nav>
        </>
      ) : (
        <section
          className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground"
          data-animation-empty
        >
          没有符合当前搜索或分类的动画
        </section>
      )}
    </div>
  );
}
