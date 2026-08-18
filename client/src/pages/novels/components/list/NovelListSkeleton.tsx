export function NovelListSkeleton() {
  return (
    <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={`loading-${index}`} className="flex items-center gap-3 rounded-xl border bg-background/90 p-3">
          <div className="min-w-0 flex-1 space-y-2.5 py-1">
            <div className="h-5 w-3/5 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
            <div className="h-1.5 animate-pulse rounded-full bg-muted" />
            <div className="h-8 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
