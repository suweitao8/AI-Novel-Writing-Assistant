import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Play, Search } from "lucide-react";

import {
  ANIMATION_LIBRARY,
  ANIMATION_LIBRARY_ACTION_TYPES,
  ANIMATION_LIBRARY_GROUPS,
  ANIMATION_LIBRARY_PACKS,
  filterAnimationLibraryEntries,
  type AnimationLibraryActionTypeId,
  type AnimationLibraryEntry,
  type AnimationLibraryGroupId,
} from "@/config/animationLibrary";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
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
          {entry.packLabel} · {entry.actionTypeLabel} · {entry.durationSeconds.toFixed(1)} 秒
        </div>
      </div>
    </Link>
  );
}

function countBy<T extends string>(entries: readonly AnimationLibraryEntry[], read: (entry: AnimationLibraryEntry) => T) {
  const counts = new Map<T, number>();
  for (const entry of entries) counts.set(read(entry), (counts.get(read(entry)) ?? 0) + 1);
  return counts;
}

export default function AnimationLibraryPage() {
  const [groupId, setGroupId] = useState<AnimationLibraryGroupId | "all">("all");
  const [packId, setPackId] = useState<string>("all");
  const [actionType, setActionType] = useState<AnimationLibraryActionTypeId | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const groupCounts = useMemo(() => countBy(ANIMATION_LIBRARY, (entry) => entry.groupId), []);
  const availablePacks = useMemo(
    () =>
      ANIMATION_LIBRARY_PACKS.filter(
        (pack) => groupId === "all" || pack.groupId === groupId,
      ),
    [groupId],
  );
  const packScopedEntries = useMemo(
    () => filterAnimationLibraryEntries(ANIMATION_LIBRARY, { groupId, packId }),
    [groupId, packId],
  );
  const actionCounts = useMemo(
    () => countBy(packScopedEntries, (entry) => entry.actionType),
    [packScopedEntries],
  );
  const entries = useMemo(
    () => filterAnimationLibraryEntries(ANIMATION_LIBRARY, { groupId, packId, actionType, query: search }),
    [actionType, groupId, packId, search],
  );

  useEffect(() => {
    if (packId !== "all" && !availablePacks.some((pack) => pack.id === packId)) {
      setPackId("all");
    }
  }, [availablePacks, packId]);

  useEffect(() => {
    if (actionType !== "all" && !actionCounts.has(actionType)) {
      setActionType("all");
    }
  }, [actionCounts, actionType]);

  const selectedPack = packId === "all" ? null : availablePacks.find((pack) => pack.id === packId);
  const selectedGroup = groupId === "all" ? null : ANIMATION_LIBRARY_GROUPS.find((group) => group.id === groupId);

  const resetFilters = () => {
    setGroupId("all");
    setPackId("all");
    setActionType("all");
    setSearchInput("");
    setSearch("");
  };
  const hasActiveFilters = groupId !== "all" || packId !== "all" || actionType !== "all" || searchInput.trim().length > 0;

  return (
    <div className="space-y-3" data-animation-page>
      <section
        className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
        aria-label="动画搜索"
        data-animation-search
      >
        <label htmlFor="animation-library-search" className="relative min-w-[220px] flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="animation-library-search"
            aria-label="搜索动画"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="搜索动画名称、片段名、套装或动作类型"
            className="h-10 pl-9"
          />
        </label>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {entries.length} / {ANIMATION_LIBRARY.length}
        </span>
      </section>

      <section
        aria-label="动画来源与大类"
        className="rounded-xl border border-border bg-card p-1"
        data-animation-category-table
        data-animation-group-filter
      >
        <Tabs
          value={groupId}
          onValueChange={(value) => setGroupId(value as AnimationLibraryGroupId | "all")}
        >
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger
              value="all"
              className="h-8 rounded-lg px-2.5 text-[13px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-animation-group="all"
            >
              全部
              <span className="ml-1 text-[10px] opacity-75">{ANIMATION_LIBRARY.length}</span>
            </TabsTrigger>
            {ANIMATION_LIBRARY_GROUPS.map((group) => (
              <TabsTrigger
                key={group.id}
                value={group.id}
                className="h-8 rounded-lg px-2.5 text-[13px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                data-animation-group={group.id}
              >
                {group.label}
                <span className="ml-1 text-[10px] opacity-75">{groupCounts.get(group.id) ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </section>

      <section className="grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-label="动画套装与动作筛选">
        <div className="space-y-1.5">
          <label htmlFor="animation-pack-filter" className="text-xs font-medium text-foreground">动画套装</label>
          <Select value={packId} onValueChange={setPackId}>
            <SelectTrigger id="animation-pack-filter" data-animation-pack-filter>
              <SelectValue placeholder="选择动画套装" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部套装 · {selectedGroup?.label ?? "所有来源"}</SelectItem>
              {availablePacks.map((pack) => (
                <SelectItem key={pack.id} value={pack.id}>
                  {groupId === "all"
                    ? `${ANIMATION_LIBRARY_GROUPS.find((group) => group.id === pack.groupId)?.label ?? ""} · ${pack.label}`
                    : pack.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">动作类型</span>
            <span className="text-[11px] text-muted-foreground">{entries.length} / {ANIMATION_LIBRARY.length}</span>
          </div>
          <div className="flex min-h-11 flex-wrap content-center gap-1" role="group" aria-label="动作类型筛选" data-animation-action-filter>
            <button
              type="button"
              aria-pressed={actionType === "all"}
              onClick={() => setActionType("all")}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                actionType === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              data-animation-action="all"
            >
              全部
            </button>
            {ANIMATION_LIBRARY_ACTION_TYPES.filter(({ id }) => actionCounts.has(id)).map((action) => (
              <button
                key={action.id}
                type="button"
                aria-pressed={actionType === action.id}
                onClick={() => setActionType(action.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                  actionType === action.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                data-animation-action={action.id}
              >
                {action.label}
                <span className="ml-1 text-[10px] opacity-75">{actionCounts.get(action.id)}</span>
              </button>
            ))}
          </div>
        </div>

        {hasActiveFilters ? (
          <div className="flex items-center gap-2 md:col-span-2">
            <span className="truncate text-[11px] text-muted-foreground">
              {[searchInput.trim() ? `搜索：${searchInput.trim()}` : null, selectedGroup?.label, selectedPack?.label, actionType === "all" ? null : ANIMATION_LIBRARY_ACTION_TYPES.find((action) => action.id === actionType)?.label]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="shrink-0 rounded-md px-2 py-1 text-[11px] text-primary hover:bg-accent"
              data-animation-reset-filters
            >
              清除筛选
            </button>
          </div>
        ) : null}
      </section>

      {entries.length > 0 ? (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" data-animation-grid>
          {entries.map((entry) => (
            <AnimationCard key={entry.id} entry={entry} />
          ))}
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground" data-animation-empty>
          没有符合当前搜索或筛选的动画
        </section>
      )}
    </div>
  );
}
