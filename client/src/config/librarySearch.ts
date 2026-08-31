export function normalizeLibrarySearchQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function matchesLibrarySearchQuery(
  query: string,
  values: readonly (string | undefined)[],
): boolean {
  const normalizedQuery = normalizeLibrarySearchQuery(query);
  if (!normalizedQuery) return true;

  return values.some((value) => {
    if (!value) return false;
    return normalizeLibrarySearchQuery(value).includes(normalizedQuery);
  });
}
