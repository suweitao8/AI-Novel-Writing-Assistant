import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

import {
  ANIMATION_LIBRARY,
  ANIMATION_LIBRARY_ACTION_TYPES,
  ANIMATION_LIBRARY_SOURCES,
  ANIMATION_LIBRARY_SCOPES,
  filterAnimationLibraryEntries,
  type AnimationLibraryEntry,
  type AnimationLibraryActionTypeId,
  type AnimationLibrarySourceFilterId,
  type AnimationLibraryScopeId,
} from "@/config/animationLibrary";
import { getAnimationFrameCount } from "./animationFrame";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
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
  const [source, setSource] = useState<AnimationLibrarySourceFilterId>("all");
  const [scope, setScope] = useState<AnimationLibraryScopeId>("all");
  const [actionType, setActionType] = useState<AnimationLibraryActionTypeId | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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

  const scopedEntries = useMemo(
    () => filterAnimationLibraryEntries(ANIMATION_LIBRARY, { scope, query: search }),
    [scope, search],
  );
  const sourceCounts = useMemo(
    () => countBy(scopedEntries, (entry) => entry.source),
    [scopedEntries],
  );
  const sourceEntries = useMemo(
    () => filterAnimationLibraryEntries(ANIMATION_LIBRARY, { scope, source, query: search }),
    [scope, search, source],
  );
  const actionTypeCounts = useMemo(
    () => countBy(sourceEntries, (entry) => entry.actionType),
    [sourceEntries],
  );
  const visibleActionTypes = useMemo(
    () => ANIMATION_LIBRARY_ACTION_TYPES.filter((option) => actionTypeCounts.has(option.id)),
    [actionTypeCounts],
  );
  const entries = useMemo(
    () =>
      filterAnimationLibraryEntries(ANIMATION_LIBRARY, {
        source,
        scope,
        actionType,
        query: search,
      }),
    [actionType, scope, search, source],
  );

  useEffect(() => {
    setPage(1);
  }, [actionType, scope, search, source]);

  useEffect(() => {
    if (actionType !== "all" && !actionTypeCounts.has(actionType)) setActionType("all");
  }, [actionType, actionTypeCounts]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(pageStart, pageStart + PAGE_SIZE);
  const hasActiveFilters =
    source !== "all" ||
    scope !== "all" ||
    actionType !== "all" ||
    searchInput.trim().length > 0;

  const resetFilters = () => {
    setSource("all");
    setScope("all");
    setActionType("all");
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  return (
    <div className="space-y-3" data-animation-page>
      <section
        aria-label="动画筛选"
        className="space-y-2 rounded-xl border border-border bg-card p-2"
        data-animation-category-table
      >
        <div className="flex min-w-0 flex-wrap items-start gap-2" data-animation-filter-controls>
          <div className="flex min-w-0 flex-1 items-center gap-2" data-animation-source-filter>
            <span className="shrink-0 px-1 text-[11px] font-medium text-muted-foreground">来源</span>
            <Tabs
              value={source}
              onValueChange={(value) => {
                setSource(value as AnimationLibrarySourceFilterId);
                setActionType("all");
                setPage(1);
              }}
              className="min-w-0 flex-1"
            >
              <TabsList className="flex h-8 min-w-0 w-full max-w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                {ANIMATION_LIBRARY_SOURCES.map((sourceOption) => (
                  <TabsTrigger
                    key={sourceOption.id}
                    value={sourceOption.id}
                    className="h-7 shrink-0 rounded-lg px-2 text-[12px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    data-animation-source={sourceOption.id}
                  >
                    {sourceOption.label} <span className="text-[10px] opacity-75">
                      {sourceOption.id === "all"
                        ? scopedEntries.length
                        : sourceCounts.get(sourceOption.id) ?? 0}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <form
            className="flex w-full shrink-0 items-center gap-1.5 sm:ml-auto sm:w-auto sm:max-w-md"
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
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2" data-animation-detail-filters>
          <div className="flex min-w-0 items-center gap-2" data-animation-scope-filter>
            <span className="shrink-0 px-1 text-[11px] font-medium text-muted-foreground">用途</span>
            <Tabs
              value={scope}
              onValueChange={(value) => {
                setScope(value as AnimationLibraryScopeId);
                setActionType("all");
                setPage(1);
              }}
              className="min-w-0"
            >
              <TabsList className="flex h-8 min-w-0 max-w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                {ANIMATION_LIBRARY_SCOPES.map((scopeOption) => (
                  <TabsTrigger
                    key={scopeOption.id}
                    value={scopeOption.id}
                    className="h-7 shrink-0 rounded-lg px-2 text-[12px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    data-animation-scope={scopeOption.id}
                  >
                    {scopeOption.label} <span className="text-[10px] opacity-75">
                      {scopeOption.id === "storyboard"
                        ? ANIMATION_LIBRARY.filter((entry) => entry.inPlace).length
                        : scopeOption.id === "compatibility"
                          ? ANIMATION_LIBRARY.filter((entry) => !entry.inPlace).length
                          : ANIMATION_LIBRARY.length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="flex min-w-0 items-center gap-2" data-animation-action-filter>
            <label
              htmlFor="animation-library-category"
              className="shrink-0 px-1 text-[11px] font-medium text-muted-foreground"
            >
              动作分类
            </label>
            <SelectControl
              id="animation-library-category"
              aria-label="按动作分类筛选"
              className="h-8 min-w-40 rounded-lg border-border/60 bg-background px-2 text-xs"
              value={actionType}
              onChange={(event) => {
                setActionType(event.target.value as AnimationLibraryActionTypeId | "all");
                setPage(1);
              }}
            >
              <option value="all">全部动作 ({sourceEntries.length})</option>
              {visibleActionTypes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({actionTypeCounts.get(option.id) ?? 0})
                </option>
              ))}
            </SelectControl>
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
