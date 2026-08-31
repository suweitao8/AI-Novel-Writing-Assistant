import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Play, Search } from "lucide-react";

import {
  ANIMATION_LIBRARY,
  ANIMATION_LIBRARY_GROUPS,
  ANIMATION_LIBRARY_SCOPES,
  filterAnimationLibraryEntries,
  type AnimationLibraryEntry,
  type AnimationLibraryGroupId,
  type AnimationLibraryScopeId,
} from "@/config/animationLibrary";
import { getAnimationFrameCount } from "./animationFrame";
import SelectControl from "@/components/common/SelectControl";
import { Badge } from "@/components/ui/badge";
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
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1 truncate text-[11px] text-foreground">{entry.name}</div>
          <Badge variant={entry.rootMotion ? "default" : "outline"} className="shrink-0 px-1.5 py-0 text-[9px]">
            {entry.rootMotion ? "分镜可用" : "兼容动画"}
          </Badge>
        </div>
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
  const [scope, setScope] = useState<AnimationLibraryScopeId>("storyboard");
  const [groupId, setGroupId] = useState<AnimationLibraryGroupId | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
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
  const groupCounts = useMemo(() => countBy(scopedEntries, (entry) => entry.groupId), [scopedEntries]);
  const visibleGroups = useMemo(
    () => ANIMATION_LIBRARY_GROUPS.filter((group) => groupCounts.has(group.id)),
    [groupCounts],
  );
  const entries = useMemo(
    () =>
      filterAnimationLibraryEntries(ANIMATION_LIBRARY, {
        scope,
        groupId,
        query: search,
      }),
    [groupId, scope, search],
  );

  useEffect(() => {
    setPage(1);
  }, [groupId, scope, search]);

  useEffect(() => {
    if (groupId !== "all" && !groupCounts.has(groupId)) setGroupId("all");
  }, [groupCounts, groupId]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(pageStart, pageStart + PAGE_SIZE);
  const hasActiveFilters =
    scope !== "storyboard" ||
    groupId !== "all" ||
    searchInput.trim().length > 0;

  const resetFilters = () => {
    setScope("storyboard");
    setGroupId("all");
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
        <div className="flex min-w-0 flex-wrap items-center gap-2" data-animation-filter-controls>
          <div className="flex min-w-0 items-center gap-2" data-animation-scope-filter>
            <span className="w-8 shrink-0 px-1 text-[11px] font-medium text-muted-foreground">用途</span>
            <Tabs
              value={scope}
              onValueChange={(value) => {
                setScope(value as AnimationLibraryScopeId);
                setGroupId("all");
              }}
              className="min-w-0"
            >
              <TabsList className="h-8 flex-nowrap justify-start gap-1 overflow-x-auto bg-transparent p-0 whitespace-nowrap">
                {ANIMATION_LIBRARY_SCOPES.map((scopeOption) => (
                  <TabsTrigger
                    key={scopeOption.id}
                    value={scopeOption.id}
                    className="h-7 shrink-0 rounded-lg px-2 text-[12px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    data-animation-scope={scopeOption.id}
                  >
                    {scopeOption.label} <span className="text-[10px] opacity-75">
                      {scopeOption.id === "storyboard"
                        ? ANIMATION_LIBRARY.filter((entry) => entry.rootMotion).length
                        : scopeOption.id === "compatibility"
                          ? ANIMATION_LIBRARY.filter((entry) => !entry.rootMotion).length
                          : ANIMATION_LIBRARY.length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="flex min-w-0 items-center gap-2" data-animation-category-filter>
            <label
              htmlFor="animation-library-category"
              className="shrink-0 px-1 text-[11px] font-medium text-muted-foreground"
            >
              分类
            </label>
            <SelectControl
              id="animation-library-category"
              aria-label="按分类筛选"
              className="h-8 min-w-40 rounded-lg border-border/60 bg-background px-2 text-xs"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value as AnimationLibraryGroupId | "all")}
            >
              <option value="all">全部分类 ({scopedEntries.length})</option>
              {visibleGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label} ({groupCounts.get(group.id) ?? 0})
                </option>
              ))}
            </SelectControl>
          </div>
          <form
            className="flex min-w-0 flex-1 items-center gap-1.5 md:ml-auto md:max-w-md"
            aria-label="搜索动画"
            data-animation-search
            onSubmit={submitSearch}
          >
            <label htmlFor="animation-library-search" className="relative min-w-0 flex-1 md:w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="animation-library-search"
                aria-label="搜索动画"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
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
