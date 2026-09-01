import type { ModelLibraryEntry } from "./modelLibrary.ts";
import { matchesLibrarySearchQuery } from "./librarySearch.ts";

export function isModelLibraryEntryVisible(entry: Pick<ModelLibraryEntry, "category">): boolean {
  return entry.category !== "角色";
}

export function filterModelLibraryEntries(
  entries: readonly ModelLibraryEntry[],
  query = "",
  hiddenModelIds?: ReadonlySet<string>,
): ModelLibraryEntry[] {
  return entries.filter(
    (entry) =>
      isModelLibraryEntryVisible(entry) &&
      !hiddenModelIds?.has(entry.id) &&
      matchesLibrarySearchQuery(query, [entry.name, entry.fileName, entry.category]),
  );
}
