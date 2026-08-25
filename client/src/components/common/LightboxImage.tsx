import { useEffect, useState, type ReactNode } from "react";
import { Download, X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 图片放大查看（搬自旧项目 mydrama 的 lightbox-image）。
 * - LightboxImage：缩略图位组件，点击打开大图；
 * - LightboxOverlay：受控大图层，包在已有图片的 onClick 上使用。
 */

function sanitizeDownloadName(alt: string): string {
  return `${alt || "image"}.jpg`.replace(/[\\/:*?"<>|]+/g, "-").trim() || "image.jpg";
}

export function LightboxOverlay(props: {
  open: boolean;
  src: string;
  alt: string;
  onClose: () => void;
  /** 大图下的说明文字（可选） */
  caption?: ReactNode;
}) {
  const { open, src, alt, onClose, caption } = props;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-6"
      role="dialog"
      aria-label={`查看大图：${alt}`}
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 flex gap-2">
        <a
          href={src}
          download={sanitizeDownloadName(alt)}
          aria-label="下载图片"
          className="rounded-full bg-background/80 p-2 text-foreground/80 transition hover:scale-105 hover:bg-background hover:text-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          <Download className="h-5 w-5" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭大图"
          className="rounded-full bg-background/80 p-2 text-foreground/80 transition hover:scale-105 hover:bg-background hover:text-foreground"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <img
        src={src}
        alt={alt}
        decoding="async"
        className="max-h-[78vh] max-w-full rounded-xl object-contain shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
      />
      {caption ? (
        <p className="max-w-[80vw] text-center text-xs leading-5 text-background/80" onClick={(event) => event.stopPropagation()}>
          {caption}
        </p>
      ) : null}
    </div>
  );
}

export function LightboxImage(props: {
  src: string;
  alt: string;
  className?: string;
  /** contain 模式下用模糊放大底图填充空隙 */
  blurBackdrop?: boolean;
  fit?: "cover" | "contain";
  onError?: () => void;
}) {
  const { src, alt, className, blurBackdrop = true, fit = "cover", onError } = props;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="点击查看大图"
        className={cn(
          "group/lb relative block cursor-zoom-in overflow-hidden rounded-lg border border-border bg-muted/40 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className ?? "h-36 w-full",
        )}
      >
        {fit === "contain" && blurBackdrop ? (
          <img
            src={src}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-md"
          />
        ) : null}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={onError}
          className={cn("relative z-10 h-full w-full", fit === "contain" ? "object-contain" : "object-cover")}
        />
        <span className="absolute bottom-1.5 right-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-background/75 text-foreground/70 opacity-0 transition-opacity group-hover/lb:opacity-100">
          <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>
      <LightboxOverlay open={open} src={src} alt={alt} onClose={() => setOpen(false)} />
    </>
  );
}
