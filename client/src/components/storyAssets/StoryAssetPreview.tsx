import { useEffect, useState } from "react";
import { ImageOff, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCharacterFaceWindow, type CharacterFaceWindow } from "./characterFaceWindow";
import type { StoryAssetImageStatus, StoryAssetPreviewSource } from "./storyAssetPresentation";

// 角色状态图按 1536x1024 双列四视图板生成，左上角是正面面部特写视图，但视图
// 边界和分隔线位置每次生成都会漂移。取景窗口由 characterFaceWindow 按图片内容
// 动态计算（避开侧面视图和分隔线）；分析完成前先按旧的固定比例展示，分析失败
// 也回退到该固定窗口。
const CHARACTER_SHEET_NATURAL_WIDTH = 1536;
const CHARACTER_AVATAR_FACE_WINDOW = {
  /** 方形窗口边长（源图像素）。 */
  size: 560,
  offsetX: 0,
  offsetY: 160,
};

const CHARACTER_AVATAR_WINDOW_STYLE = (() => {
  const { size, offsetX, offsetY } = CHARACTER_AVATAR_FACE_WINDOW;
  return {
    width: `${(CHARACTER_SHEET_NATURAL_WIDTH / size) * 100}%`,
    left: `${(-offsetX / size) * 100}%`,
    top: `${(-offsetY / size) * 100}%`,
  };
})();

function faceWindowStyle(win: CharacterFaceWindow) {
  return {
    width: `${(win.naturalWidth / win.size) * 100}%`,
    left: `${(-win.left / win.size) * 100}%`,
    top: `${(-win.top / win.size) * 100}%`,
  };
}

/** 角色预览 URL 对应的自适应取景窗口；null 表示尚未分析完成或不可分析。 */
function useCharacterFaceWindow(url: string | null): CharacterFaceWindow | null {
  const [win, setWin] = useState<CharacterFaceWindow | null>(null);
  useEffect(() => {
    if (!url) {
      setWin(null);
      return undefined;
    }
    let active = true;
    void getCharacterFaceWindow(url).then((result) => {
      if (active) setWin(result);
    });
    return () => {
      active = false;
    };
  }, [url]);
  return win;
}

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
  const isCharacter = preview?.mode === "character-left-square";
  const faceWindow = useCharacterFaceWindow(isCharacter && preview ? preview.url : null);

  useEffect(() => {
    setHasError(false);
  }, [preview?.url]);

  if (!preview?.url || hasError) {
    return <PreviewFallback label={preview?.alt ?? "暂无预览图"} status={status} className={className} />;
  }

  if (isCharacter) {
    return <PreviewFrame preview={preview} status={status} className={className} character faceWindow={faceWindow} onError={() => setHasError(true)} />;
  }

  return <PreviewFrame preview={preview} status={status} className={className} onError={() => setHasError(true)} />;
}

function PreviewFrame({
  preview,
  status,
  className,
  character = false,
  faceWindow = null,
  onError,
}: {
  preview: StoryAssetPreviewSource;
  status?: StoryAssetImageStatus | null;
  className?: string;
  character?: boolean;
  faceWindow?: CharacterFaceWindow | null;
  onError: () => void;
}) {
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted/25", className)}>
      <img
        src={preview.url}
        alt={preview.alt}
        loading="lazy"
        decoding="async"
        className={character ? "absolute h-auto max-w-none" : "absolute inset-0 h-full w-full object-cover object-center"}
        style={character ? (faceWindow ? faceWindowStyle(faceWindow) : CHARACTER_AVATAR_WINDOW_STYLE) : undefined}
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
