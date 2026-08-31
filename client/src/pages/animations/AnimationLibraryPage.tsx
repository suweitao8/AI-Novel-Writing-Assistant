import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

import {
  ANIMATION_LIBRARY,
  ANIMATION_LIBRARY_ACTION_TYPES,
  ANIMATION_LIBRARY_CLASSIFICATIONS,
  ANIMATION_LIBRARY_GROUPS,
  ANIMATION_LIBRARY_POSTURES,
  ANIMATION_LIBRARY_SCOPES,
  ANIMATION_LIBRARY_WEAPONS,
  filterAnimationLibraryEntries,
  type AnimationLibraryActionTypeId,
  type AnimationLibraryClassificationId,
  type AnimationLibraryEntry,
  type AnimationLibraryGroupId,
  type AnimationLibraryPosture,
  type AnimationLibraryScopeId,
  type AnimationLibraryWeaponType,
} from "@/config/animationLibrary";
import { getAnimationFrameCount } from "./animationFrame";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
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
  const [scope, setScope] = useState<AnimationLibraryScopeId>("storyboard");
  const [groupId, setGroupId] = useState<AnimationLibraryGroupId | "all">("all");
  const [packId, setPackId] = useState<string>("all");
  const [actionType, setActionType] = useState<AnimationLibraryActionTypeId | "all">("all");
  const [classificationId, setClassificationId] = useState<
    AnimationLibraryClassificationId | "all"
  >("all");
  const [posture, setPosture] = useState<AnimationLibraryPosture | "all">("all");
  const [weaponType, setWeaponType] = useState<AnimationLibraryWeaponType | "all">("all");
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
  const availablePackEntries = useMemo(
    () =>
      filterAnimationLibraryEntries(ANIMATION_LIBRARY, {
        scope,
        groupId,
        actionType,
        classificationId,
        posture,
        weaponType,
        query: search,
      }),
    [actionType, classificationId, groupId, posture, scope, search, weaponType],
  );
  const availablePacks = useMemo(() => {
    const seen = new Set<string>();
    return availablePackEntries.filter((entry) => {
      if (seen.has(entry.packId)) return false;
      seen.add(entry.packId);
      return true;
    });
  }, [availablePackEntries]);
  const classificationScopedEntries = useMemo(
    () =>
      filterAnimationLibraryEntries(ANIMATION_LIBRARY, {
        scope,
        groupId,
        packId,
        actionType,
        posture,
        weaponType,
        query: search,
      }),
    [actionType, groupId, packId, posture, scope, search, weaponType],
  );
  const classificationCounts = useMemo(
    () => countBy(classificationScopedEntries, (entry) => entry.classificationId),
    [classificationScopedEntries],
  );
  const entries = useMemo(
    () =>
      filterAnimationLibraryEntries(ANIMATION_LIBRARY, {
        scope,
        groupId,
        packId,
        actionType,
        classificationId,
        posture,
        weaponType,
        query: search,
      }),
    [actionType, classificationId, groupId, packId, posture, scope, search, weaponType],
  );

  useEffect(() => {
    setPage(1);
  }, [actionType, classificationId, groupId, packId, posture, scope, search, weaponType]);

  useEffect(() => {
    if (groupId !== "all" && !groupCounts.has(groupId)) setGroupId("all");
  }, [groupCounts, groupId]);

  useEffect(() => {
    if (packId !== "all" && !availablePacks.some((entry) => entry.packId === packId)) {
      setPackId("all");
    }
  }, [availablePacks, packId]);

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
    scope !== "storyboard" ||
    groupId !== "all" ||
    packId !== "all" ||
    actionType !== "all" ||
    classificationId !== "all" ||
    posture !== "all" ||
    weaponType !== "all" ||
    searchInput.trim().length > 0;

  const resetFilters = () => {
    setScope("storyboard");
    setGroupId("all");
    setPackId("all");
    setActionType("all");
    setClassificationId("all");
    setPosture("all");
    setWeaponType("all");
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  return (
    <div className="space-y-3" data-animation-page>
      <section
        aria-label="动画来源与细分类"
        className="space-y-2 rounded-xl border border-border bg-card p-2"
        data-animation-category-table
        data-animation-group-filter
      >
        <div className="flex min-w-0 items-center gap-2" data-animation-scope-filter>
          <span className="w-8 shrink-0 px-1 text-[11px] font-medium text-muted-foreground">用途</span>
          <Tabs
            value={scope}
            onValueChange={(value) => {
              setScope(value as AnimationLibraryScopeId);
              setGroupId("all");
              setPackId("all");
              setActionType("all");
              setClassificationId("all");
              setPosture("all");
              setWeaponType("all");
            }}
            className="min-w-0 flex-1"
          >
            <TabsList className="h-8 w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-transparent p-0 whitespace-nowrap">
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

        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border/60 pt-1" data-animation-group-filter-row>
          <span className="w-8 shrink-0 px-1 text-[11px] font-medium text-muted-foreground">来源</span>
          <Tabs
            value={groupId}
            onValueChange={(value) => {
              setGroupId(value as AnimationLibraryGroupId | "all");
              setPackId("all");
              setActionType("all");
              setClassificationId("all");
              setPosture("all");
              setWeaponType("all");
            }}
            className="min-w-0 flex-1"
          >
            <TabsList className="h-8 w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-transparent p-0 whitespace-nowrap">
              <TabsTrigger
                value="all"
                className="h-7 shrink-0 rounded-lg px-2 text-[12px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                data-animation-group="all"
              >
                全部 <span className="text-[10px] opacity-75">{scopedEntries.length}</span>
              </TabsTrigger>
              {visibleGroups.map((group) => (
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
          <form
            className="flex w-full shrink-0 items-center gap-1.5 md:ml-auto md:w-auto"
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
                placeholder="搜索名称、片段名、套装或分类"
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

        <div
          className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2 md:grid-cols-4"
          aria-label="动画套装、动作、姿态与武器筛选"
          data-animation-detail-filters
        >
          <div className="min-w-0 space-y-1 text-[11px] text-muted-foreground" data-animation-pack-filter>
            <label htmlFor="animation-library-pack" className="block">套装</label>
            <SelectControl
              id="animation-library-pack"
              aria-label="按套装筛选"
              className="h-8 w-full rounded-lg border-border/60 bg-background px-2 text-xs"
              value={packId}
              onChange={(event) => setPackId(event.target.value || "all")}
            >
              <option value="all">全部套装</option>
              {availablePacks.map((entry) => (
                <option key={entry.packId} value={entry.packId}>
                  {entry.packLabel}
                </option>
              ))}
            </SelectControl>
          </div>
          <div className="min-w-0 space-y-1 text-[11px] text-muted-foreground" data-animation-action-filter>
            <label htmlFor="animation-library-action" className="block">动作</label>
            <SelectControl
              id="animation-library-action"
              aria-label="按动作类型筛选"
              className="h-8 w-full rounded-lg border-border/60 bg-background px-2 text-xs"
              value={actionType}
              onChange={(event) => setActionType(event.target.value as AnimationLibraryActionTypeId | "all")}
            >
              <option value="all">全部动作</option>
              {ANIMATION_LIBRARY_ACTION_TYPES.map((action) => (
                <option key={action.id} value={action.id}>
                  {action.label}
                </option>
              ))}
            </SelectControl>
          </div>
          <div className="min-w-0 space-y-1 text-[11px] text-muted-foreground" data-animation-posture-filter>
            <label htmlFor="animation-library-posture" className="block">姿态</label>
            <SelectControl
              id="animation-library-posture"
              aria-label="按姿态筛选"
              className="h-8 w-full rounded-lg border-border/60 bg-background px-2 text-xs"
              value={posture}
              onChange={(event) => setPosture(event.target.value as AnimationLibraryPosture | "all")}
            >
              <option value="all">全部姿态</option>
              {ANIMATION_LIBRARY_POSTURES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </SelectControl>
          </div>
          <div className="min-w-0 space-y-1 text-[11px] text-muted-foreground" data-animation-weapon-filter>
            <label htmlFor="animation-library-weapon" className="block">武器</label>
            <SelectControl
              id="animation-library-weapon"
              aria-label="按武器类型筛选"
              className="h-8 w-full rounded-lg border-border/60 bg-background px-2 text-xs"
              value={weaponType}
              onChange={(event) => setWeaponType(event.target.value as AnimationLibraryWeaponType | "all")}
            >
              <option value="all">全部武器</option>
              {ANIMATION_LIBRARY_WEAPONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
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
