import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Box, Loader2, Move3D } from "lucide-react";

import { MODEL_LIBRARY, MODEL_LIBRARY_CATEGORIES, type ModelLibraryEntry } from "@/config/modelLibrary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ensureThumbnail, getThumbnail, subscribeThumbnails } from "./modelLibrary3d/thumbnailStudio";

function ModelCard({ entry }: { entry: ModelLibraryEntry }) {
  const [thumbnail, setThumbnail] = useState<string | null>(() => getThumbnail(entry.id));
  useEffect(() => {
    if (ensureThumbnail(entry)) return;
    return subscribeThumbnails(() => {
      const next = getThumbnail(entry.id);
      if (next) setThumbnail(next);
    });
  }, [entry]);

  return (
    <Card className="group gap-3 overflow-hidden py-0" data-model-card={entry.id}>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={`${entry.name} 预览`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="text-xs">正在生成预览</span>
          </div>
        )}
        <Badge variant="secondary" className="absolute left-2 top-2">
          {entry.category}
        </Badge>
      </div>
      <CardContent className="space-y-2.5 pb-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{entry.name}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {entry.source} · GLB · {entry.sizeKb} KB
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link to={`/models/${entry.id}`}>
            <Move3D className="mr-1.5 h-4 w-4" aria-hidden="true" />
            打开 3D 编辑
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ModelLibraryPage() {
  const [category, setCategory] = useState<string>("全部");
  const entries = useMemo(
    () => (category === "全部" ? MODEL_LIBRARY : MODEL_LIBRARY.filter((entry) => entry.category === category)),
    [category],
  );

  return (
    <div className="space-y-5" data-model-library-page>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-normal">模型库</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            挑选常用模型，打开 3D 场景查看细节并调整位置、旋转和缩放。
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
          <Box className="h-4 w-4" aria-hidden="true" />
          {MODEL_LIBRARY.length} 个模型
        </Badge>
      </section>

      <section className="flex flex-wrap items-center gap-2" aria-label="模型分类">
        {["全部", ...MODEL_LIBRARY_CATEGORIES].map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              category === item
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {item}
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {entries.map((entry) => (
          <ModelCard key={entry.id} entry={entry} />
        ))}
      </section>
    </div>
  );
}
