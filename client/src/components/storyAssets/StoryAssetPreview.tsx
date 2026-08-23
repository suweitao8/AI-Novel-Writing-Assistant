import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoryAssetPreviewSource } from "./storyAssetPresentation";

export interface StoryAssetPreviewProps {
  preview: StoryAssetPreviewSource | null;
  className?: string;
}

function PreviewFallback({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "relative flex aspect-square min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-border/70 bg-muted/25 px-2",
        className,
      )}
    >
      <ImageOff aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">暂无预览图</span>
    </div>
  );
}

export function StoryAssetPreview({ preview, className }: StoryAssetPreviewProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [preview?.url]);

  if (!preview?.url || hasError) {
    return <PreviewFallback label={preview?.alt ?? "暂无预览图"} className={className} />;
  }

  if (preview.mode === "character-top-left-grid") {
    return (
      <div className={cn("relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted/25", className)}>
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={preview.url}
            alt={preview.alt}
            loading="lazy"
            decoding="async"
            className="absolute left-0 top-0 h-[200%] w-[400%] max-w-none object-fill"
            onError={() => setHasError(true)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted/25", className)}>
      <img
        src={preview.url}
        alt={preview.alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center"
        onError={() => setHasError(true)}
      />
    </div>
  );
}
