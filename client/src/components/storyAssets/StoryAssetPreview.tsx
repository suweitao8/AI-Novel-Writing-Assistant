import { useEffect, useState } from "react";
import { ImageOff, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoryAssetImageStatus, StoryAssetPreviewSource } from "./storyAssetPresentation";

// 1536x864 角色四视图板：取最左 1/4（384px）内居中的 y=240..624，输出 384x384 方形头像。
const CHARACTER_PREVIEW_CROP_TOP = "-62.5%";

export interface StoryAssetPreviewProps {
  preview: StoryAssetPreviewSource | null;
  status?: StoryAssetImageStatus | null;
  className?: string;
}

function PreviewFallback({
  label,
  status,
  className,
}: {
  label: string;
  status?: StoryAssetImageStatus | null;
  className?: string;
}) {
  const isGenerating = status === "generating";
  const isError = status === "error";
  return (
    <div
      role="img"
      aria-label={label}
      aria-live={isGenerating ? "polite" : undefined}
      className={cn(
        "relative flex aspect-square min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-border/70 bg-muted/25 px-2",
        isGenerating && "border-primary/60 bg-primary/10 ring-2 ring-primary/20",
        isError && "border-destructive/50 bg-destructive/10",
        className,
      )}
    >
      {isGenerating ? (
        <LoaderCircle aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin text-primary" />
      ) : (
        <ImageOff aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
      )}
      <span className={cn("text-xs", isGenerating ? "font-medium text-primary" : isError ? "text-destructive" : "text-muted-foreground")}>
        {isGenerating ? "生成中" : isError ? "生成失败" : "暂无预览图"}
      </span>
    </div>
  );
}

export function StoryAssetPreview({ preview, status = null, className }: StoryAssetPreviewProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [preview?.url]);

  if (!preview?.url || hasError) {
    return <PreviewFallback label={preview?.alt ?? "暂无预览图"} status={status} className={className} />;
  }

  if (preview.mode === "character-left-square") {
    return <PreviewFrame preview={preview} status={status} className={className} character onError={() => setHasError(true)} />;
  }

  return <PreviewFrame preview={preview} status={status} className={className} onError={() => setHasError(true)} />;
}

function PreviewFrame({
  preview,
  status,
  className,
  character = false,
  onError,
}: {
  preview: StoryAssetPreviewSource;
  status?: StoryAssetImageStatus | null;
  className?: string;
  character?: boolean;
  onError: () => void;
}) {
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted/25", className)}>
      <img
        src={preview.url}
        alt={preview.alt}
        loading="lazy"
        decoding="async"
        className={character ? "absolute left-0 h-auto w-[400%] max-w-none" : "absolute inset-0 h-full w-full object-cover object-center"}
        style={character ? { top: CHARACTER_PREVIEW_CROP_TOP } : undefined}
        onError={onError}
      />
      {status === "generating" ? (
        <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/65 text-sm font-medium text-primary" aria-live="polite">
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
          生成中
        </div>
      ) : null}
    </div>
  );
}
