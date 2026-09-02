export const MODEL_LIBRARY_PAGE_SIZE = 50;

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
