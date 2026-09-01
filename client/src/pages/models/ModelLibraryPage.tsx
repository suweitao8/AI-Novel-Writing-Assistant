import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search } from "lucide-react";

import { MODEL_LIBRARY, MODEL_LIBRARY_CATEGORIES, type ModelLibraryEntry } from "@/config/modelLibrary";
import { filterModelLibraryEntries } from "@/config/modelLibraryFilters";
import { getModelLibraryVisibility } from "@/api/modelLibrary";
import {
  getModelUsagePlacementLabel,
  getModelUsageSurfaceLabel,
} from "@/config/modelLibraryUsage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ModelLibraryPagination } from "./components/ModelLibraryPagination";
import { prefetchModelAsset } from "./modelLibrary3d/modelViewerApp";
import {
  cancelThumbnail,
  disposeThumbnailStudio,
  ensureThumbnail,
  getThumbnail,
  subscribeThumbnails,
} from "./modelLibrary3d/thumbnailStudio";
import {
  getModelLibraryPage,
  MODEL_LIBRARY_PAGE_SIZE,
} from "./modelLibraryPagination";

const MODEL_THUMBNAIL_ROOT_MARGIN = "320px 0px";
const MODEL_LIBRARY_FIRST_ROW_CATEGORY_COUNT = 6;

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
        cancelThumbnail(entry.id);
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
      cancelThumbnail(entry.id);
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
  const [page, setPage] = useState(1);
  const [hiddenModelIds, setHiddenModelIds] = useState<ReadonlySet<string> | null>(null);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const visibilityRequestIdRef = useRef(0);

  const loadVisibility = useCallback(async () => {
    const requestId = visibilityRequestIdRef.current + 1;
    visibilityRequestIdRef.current = requestId;
    setHiddenModelIds(null);
    setVisibilityError(null);
    try {
      const response = await getModelLibraryVisibility();
      if (requestId !== visibilityRequestIdRef.current) return;
      if (!response.success || !response.data) {
        throw new Error(response.error ?? response.message ?? "模型库可见性加载失败。");
      }
      setHiddenModelIds(new Set(response.data.hiddenModelIds));
    } catch (error: unknown) {
      if (requestId !== visibilityRequestIdRef.current) return;
      setHiddenModelIds(null);
      setVisibilityError(error instanceof Error ? error.message : "模型库可见性加载失败。");
    }
  }, []);

  useEffect(() => {
    void loadVisibility();
  }, [loadVisibility]);

  const applySearch = (value: string) => {
    setSearch(value.trim());
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applySearch(searchInput);
  };

  useEffect(() => {
    return () => {
      void disposeThumbnailStudio();
    };
  }, []);

  const visibleEntries = useMemo(
    () => hiddenModelIds ? filterModelLibraryEntries(MODEL_LIBRARY, "", hiddenModelIds) : [],
    [hiddenModelIds],
  );
  const visibleCategories = useMemo(
    () => MODEL_LIBRARY_CATEGORIES.filter((item) => visibleEntries.some((entry) => entry.category === item)),
    [visibleEntries],
  );
  const categoryItems = ["全部", ...visibleCategories];
  const firstRowCategoryItems = categoryItems.slice(0, MODEL_LIBRARY_FIRST_ROW_CATEGORY_COUNT);
  const secondaryCategoryItems = categoryItems.slice(MODEL_LIBRARY_FIRST_ROW_CATEGORY_COUNT);
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
        ? visibleEntries
        : visibleEntries.filter((entry) => entry.category === category);
      return filterModelLibraryEntries(categoryEntries, search, hiddenModelIds ?? undefined);
    },
    [category, hiddenModelIds, search, visibleEntries],
  );
  const currentPage = getModelLibraryPage(entries, page, MODEL_LIBRARY_PAGE_SIZE);
  const pageEntries = currentPage.entries;

  useEffect(() => {
    setPage(1);
  }, [category, hiddenModelIds, search]);

  useEffect(() => {
    if (page !== currentPage.page) setPage(currentPage.page);
  }, [currentPage.page, page]);

  const hasActiveFilters = category !== "全部" || searchInput.trim().length > 0;
  const clearFilters = () => {
    setCategory("全部");
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  if (!hiddenModelIds) {
    return (
      <section
        className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-12 text-center"
        data-model-library-visibility-state={visibilityError ? "error" : "loading"}
      >
        {visibilityError ? (
          <>
            <p className="text-sm text-destructive">{visibilityError}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadVisibility()}>
              重试
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">正在加载模型库</p>
          </>
        )}
      </section>
    );
  }

  const renderCategoryButton = (item: string) => (
    <button
      key={item}
      type="button"
      role="tab"
      aria-selected={category === item}
      onClick={() => {
        setCategory(item);
        setPage(1);
      }}
      className={cn(
        "flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] transition-colors",
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
  );

  return (
    <div className="space-y-3" data-model-library-page>
      <section
        className="relative min-w-0 rounded-xl border border-border bg-card p-2"
        aria-label="模型筛选"
        data-model-filter-controls
      >
        <div className="min-w-0" data-model-category-filter>
          <div
            role="tablist"
            aria-label="模型分类"
            className="min-w-0 space-y-1"
            data-model-category-table
          >
            <div
              data-model-category-first-row
              className="flex min-w-0 flex-wrap items-center gap-1 sm:pr-84"
            >
              {firstRowCategoryItems.map(renderCategoryButton)}
            </div>
            {secondaryCategoryItems.length > 0 ? (
              <div
                data-model-category-secondary-row
                className="flex min-w-0 flex-wrap items-center gap-1"
              >
                {secondaryCategoryItems.map(renderCategoryButton)}
              </div>
            ) : null}
          </div>
        </div>
        <form
          className="mt-2 flex w-full items-center gap-1.5 sm:absolute sm:right-2 sm:top-2 sm:mt-0 sm:w-80"
          aria-label="搜索模型"
          data-model-search
          onSubmit={submitSearch}
        >
          <label htmlFor="model-library-search" className="relative min-w-0 flex-1 sm:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="model-library-search"
              aria-label="搜索模型"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applySearch(event.currentTarget.value);
                }
              }}
              placeholder="搜索模型名称、文件名或分类"
              className="h-8 pl-8 text-xs"
            />
          </label>
          <Button type="submit" size="sm" className="h-8 shrink-0 gap-1 px-2.5 text-xs">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            搜索
          </Button>
        </form>
      </section>

      {entries.length > 0 ? (
        <>
          <section className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10" data-model-grid>
            {pageEntries.map((entry) => (
              <ModelCard key={entry.id} entry={entry} />
            ))}
          </section>
          <ModelLibraryPagination
            page={currentPage.page}
            totalPages={currentPage.totalPages}
            onPageChange={setPage}
          />
        </>
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
