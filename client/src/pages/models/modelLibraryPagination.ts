export const MODEL_LIBRARY_PAGE_SIZE = 24;
export const MODEL_LIBRARY_MAX_PAGE_ROWS = 8;

export interface ModelLibraryPageSizeMetrics {
  columns: number;
  availableHeight: number;
  cardHeight: number;
  rowGap: number;
}

/**
 * 用当前可视网格能容纳的完整行数决定页大小，避免宽屏下固定 24 条只形成两三行。
 * 页大小始终是列数的整数倍，且限制最大行数，避免超高窗口一次挂载过多卡片。
 */
export function getModelLibraryPageSize(metrics: ModelLibraryPageSizeMetrics): number {
  const columns = Number.isFinite(metrics.columns) && metrics.columns > 0
    ? Math.floor(metrics.columns)
    : 0;
  const availableHeight = Number.isFinite(metrics.availableHeight) && metrics.availableHeight > 0
    ? metrics.availableHeight
    : 0;
  const cardHeight = Number.isFinite(metrics.cardHeight) && metrics.cardHeight > 0
    ? metrics.cardHeight
    : 0;
  const rowGap = Number.isFinite(metrics.rowGap) && metrics.rowGap >= 0 ? metrics.rowGap : 0;
  if (columns === 0 || availableHeight === 0 || cardHeight === 0) return MODEL_LIBRARY_PAGE_SIZE;

  const rows = Math.max(
    1,
    Math.min(
      MODEL_LIBRARY_MAX_PAGE_ROWS,
      Math.floor((availableHeight + rowGap) / (cardHeight + rowGap)),
    ),
  );
  return columns * rows;
}

export interface ModelLibraryPage<T> {
  page: number;
  totalPages: number;
  entries: T[];
}

export function getModelLibraryPage<T>(
  entries: readonly T[],
  requestedPage: number,
  pageSize = MODEL_LIBRARY_PAGE_SIZE,
): ModelLibraryPage<T> {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0
    ? Math.floor(pageSize)
    : MODEL_LIBRARY_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(entries.length / safePageSize));
  const safePage = Number.isFinite(requestedPage)
    ? Math.min(totalPages, Math.max(1, Math.floor(requestedPage)))
    : 1;
  const start = (safePage - 1) * safePageSize;
  return {
    page: safePage,
    totalPages,
    entries: entries.slice(start, start + safePageSize),
  };
}
