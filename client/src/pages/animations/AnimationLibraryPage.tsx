import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Play, Search } from "lucide-react";

import {
  ANIMATION_LIBRARY,
  ANIMATION_LIBRARY_CLASSIFICATIONS,
  ANIMATION_LIBRARY_GROUPS,
  filterAnimationLibraryEntries,
  type AnimationLibraryClassificationId,
  type AnimationLibraryEntry,
  type AnimationLibraryGroupId,
} from "@/config/animationLibrary";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ensureAnimationThumbnail,
  getAnimationThumbnail,
  subscribeAnimationThumbnails,
} from "./animationThumbnailStudio";
import { getAnimationKeyframe, subscribeAnimationKeyframes } from "./animationPreviewStorage";

export const PAGE_SIZE = 24;

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
          {entry.packLabel} · {entry.classificationLabel} · {entry.postureLabel}
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
  const [groupId, setGroupId] = useState<AnimationLibraryGroupId | "all">("all");
  const [classificationId, setClassificationId] = useState<
    AnimationLibraryClassificationId | "all"
  >("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const groupCounts = useMemo(() => countBy(ANIMATION_LIBRARY, (entry) => entry.groupId), []);
  const classificationScopedEntries = useMemo(
    () => filterAnimationLibraryEntries(ANIMATION_LIBRARY, { groupId, query: search }),
    [groupId, search],
  );
  const classificationCounts = useMemo(
    () => countBy(classificationScopedEntries, (entry) => entry.classificationId),
    [classificationScopedEntries],
  );
  const entries = useMemo(
    () =>
      filterAnimationLibraryEntries(ANIMATION_LIBRARY, {
        groupId,
        classificationId,
        query: search,
      }),
    [classificationId, groupId, search],
  );

  useEffect(() => {
    setPage(1);
  }, [classificationId, groupId, searchInput]);

  useEffect(() => {
    if (classificationId !== "all" && !classificationCounts.has(classificationId)) {
      setClassificationId("all");
    }
  }, [classificationCounts, classificationId]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(pageStart, pageStart + PAGE_SIZE);
  const hasActiveFilters =
    groupId !== "all" || classificationId !== "all" || searchInput.trim().length > 0;

  const resetFilters = () => {
    setGroupId("all");
    setClassificationId("all");
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  return (
    <div className="space-y-3" data-animation-page>
      <section
        className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
        aria-label="动画搜索"
        data-animation-search
      >
        <label htmlFor="animation-library-search" className="relative min-w-[220px] flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="animation-library-search"
            aria-label="搜索动画"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="搜索动画名称、片段名、套装或分类"
            className="h-10 pl-9"
          />
        </label>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {entries.length} / {ANIMATION_LIBRARY.length}
        </span>
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
      </section>

      <section
        aria-label="动画来源与细分类"
        className="space-y-1 rounded-xl border border-border bg-card p-1"
        data-animation-category-table
        data-animation-group-filter
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="w-8 shrink-0 px-1 text-[11px] font-medium text-muted-foreground">来源</span>
          <Tabs
            value={groupId}
            onValueChange={(value) => {
              setGroupId(value as AnimationLibraryGroupId | "all");
              setClassificationId("all");
            }}
            className="min-w-0 flex-1"
          >
            <TabsList className="h-8 w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-transparent p-0 whitespace-nowrap">
              <TabsTrigger
                value="all"
                className="h-7 shrink-0 rounded-lg px-2 text-[12px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                data-animation-group="all"
              >
                全部 <span className="text-[10px] opacity-75">{ANIMATION_LIBRARY.length}</span>
              </TabsTrigger>
              {ANIMATION_LIBRARY_GROUPS.map((group) => (
                <TabsTrigger
                  key={group.id}
                  value={group.id}
                  className="h-7 shrink-0 rounded-lg px-2 text-[12px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  data-animation-group={group.id}
                >
                  {group.label} <span className="text-[10px] opacity-75">{groupCounts.get(group.id) ?? 0}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div
          className="flex min-w-0 items-center gap-2 border-t border-border/60 pt-1"
          role="group"
          aria-label="动画细分类筛选"
          data-animation-classification-filter
        >
          <span className="w-8 shrink-0 px-1 text-[11px] font-medium text-muted-foreground">分类</span>
          <div className="flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto whitespace-nowrap">
            <button
              type="button"
              aria-pressed={classificationId === "all"}
              onClick={() => setClassificationId("all")}
              className={cn(
                "shrink-0 rounded-lg border px-2 py-1 text-[11px] transition-colors",
                classificationId === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              data-animation-classification="all"
            >
              全部
            </button>
            {ANIMATION_LIBRARY_CLASSIFICATIONS.filter(({ id }) => classificationCounts.has(id)).map(
              (classification) => (
                <button
                  key={classification.id}
                  type="button"
                  aria-pressed={classificationId === classification.id}
                  onClick={() => setClassificationId(classification.id)}
                  className={cn(
                    "shrink-0 rounded-lg border px-2 py-1 text-[11px] transition-colors",
                    classificationId === classification.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  data-animation-classification={classification.id}
                >
                  {classification.label} <span className="text-[10px] opacity-75">{classificationCounts.get(classification.id)}</span>
                </button>
              ),
            )}
          </div>
        </div>

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
          没有符合当前搜索或筛选的动画
        </section>
      )}
    </div>
  );
}
