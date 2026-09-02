import { useEffect, useRef, useState } from "react";

import {
  getModelLibraryPageSize,
  MODEL_LIBRARY_PAGE_SIZE,
} from "../modelLibraryPagination";

const FALLBACK_GRID_COLUMNS = 1;

function parsePixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getGridColumnCount(grid: HTMLElement): number {
  const columns = getComputedStyle(grid).gridTemplateColumns
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
  return columns || FALLBACK_GRID_COLUMNS;
}

/**
 * 读取模型页当前的可用网格空间，使页大小跟随窗口、侧栏和响应式列数变化。
 * 只观察布局，不把缩略图加载状态作为分页尺寸依据。
 */
export function useModelLibraryPageSize(enabled: boolean) {
  const pageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLElement>(null);
  const [pageSize, setPageSize] = useState(MODEL_LIBRARY_PAGE_SIZE);

  useEffect(() => {
    if (!enabled) return;

    const page = pageRef.current;
    const grid = gridRef.current;
    if (!page || !grid) return;

    const scrollContainer = page.closest<HTMLElement>("main");
    const measure = () => {
      const firstCard = grid.querySelector<HTMLElement>("[data-model-card]");
      if (!firstCard) return;

      const gridStyle = getComputedStyle(grid);
      const gridRect = grid.getBoundingClientRect();
      const firstCardRect = firstCard.getBoundingClientRect();
      const pagination = page.querySelector<HTMLElement>("[data-model-pagination]");
      const paginationStyle = pagination ? getComputedStyle(pagination) : null;
      const scrollStyle = scrollContainer ? getComputedStyle(scrollContainer) : null;
      const contentBottom = scrollContainer
        ? scrollContainer.getBoundingClientRect().bottom - parsePixels(scrollStyle?.paddingBottom ?? "0")
        : window.innerHeight;
      const paginationHeight = pagination?.getBoundingClientRect().height ?? 0;
      const paginationSpacing = parsePixels(paginationStyle?.marginTop ?? "0");
      const availableHeight = contentBottom
        - gridRect.top
        - paginationHeight
        - paginationSpacing;
      const nextPageSize = getModelLibraryPageSize({
        columns: getGridColumnCount(grid),
        availableHeight,
        cardHeight: firstCardRect.height,
        rowGap: parsePixels(gridStyle.rowGap),
      });

      setPageSize((current) => current === nextPageSize ? current : nextPageSize);
    };

    measure();
    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(measure)
      : null;
    resizeObserver?.observe(page);
    resizeObserver?.observe(grid);
    if (scrollContainer) resizeObserver?.observe(scrollContainer);
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled]);

  return { pageRef, gridRef, pageSize };
}
