import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Upload, X } from "lucide-react";
import type { IndexTTS25VoiceCatalog } from "@/api/audio";
import { saveIndexTTS25ReferenceAudio } from "@/api/audio";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const MAX_REFERENCE_AUDIO_BYTES = 10 * 1024 * 1024;

export interface IndexTTS25VoiceControlsProps {
  catalog?: IndexTTS25VoiceCatalog;
  catalogLoading?: boolean;
  catalogError?: Error | null;
  speaker: string;
  referenceAudio: string;
  sampleAudioUrl?: string;
  onSpeakerChange: (value: string) => void;
  onReferenceAudioChange: (value: string) => void;
  onRefresh?: () => void;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAudioFile(file: File): boolean {
  if (file.type.toLowerCase().startsWith("audio/")) return true;
  return /\.(wav|mp3|flac|m4a|ogg|webm)$/i.test(file.name);
}

export function IndexTTS25VoiceControls({
  catalog,
  catalogLoading = false,
  catalogError,
  speaker,
  referenceAudio,
  sampleAudioUrl,
  onSpeakerChange,
  onReferenceAudioChange,
  onRefresh,
  disabled = false,
}: IndexTTS25VoiceControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileLabel, setFileLabel] = useState(
    referenceAudio.startsWith("data:") ? "试听样本" : referenceAudio || "",
  );
  const [localPreview, setLocalPreview] = useState<{ referenceAudio: string; url: string } | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | undefined>(
    referenceAudio.startsWith("data:") ? referenceAudio : undefined,
  );

  useEffect(() => {
    setFileLabel(referenceAudio.startsWith("data:") ? "试听样本" : referenceAudio || "");
    if (referenceAudio.startsWith("data:")) {
      setReferencePreviewUrl(referenceAudio);
    } else if (localPreview?.referenceAudio === referenceAudio) {
      setReferencePreviewUrl(localPreview.url);
    } else {
      setReferencePreviewUrl(undefined);
    }
  }, [localPreview, referenceAudio]);

  const openFilePicker = () => {
    if (!disabled && !uploading) inputRef.current?.click();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || disabled || uploading) return;
    if (!isAudioFile(file)) {
      toast.error("参考音频格式不支持", { description: "请选择 WAV、MP3、FLAC、M4A 或 OGG 音频。" });
      return;
    }
    if (file.size > MAX_REFERENCE_AUDIO_BYTES) {
      toast.error("参考音频过大", { description: `单个文件不能超过 ${formatBytes(MAX_REFERENCE_AUDIO_BYTES)}。` });
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("无法读取音频文件。"));
        reader.onerror = () => reject(new Error("无法读取音频文件。"));
        reader.readAsDataURL(file);
      });
      const saved = await saveIndexTTS25ReferenceAudio(dataUrl);
      setLocalPreview({ referenceAudio: saved.fileName, url: dataUrl });
      setReferencePreviewUrl(dataUrl);
      setFileLabel(`${file.name}（${formatBytes(file.size)}）`);
      onReferenceAudioChange(saved.fileName);
      toast.success("参考音频已保存");
    } catch (error) {
      toast.error("保存参考音频失败", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setUploading(false);
    }
  };

  const referenceOptions = Array.from(new Set([
    ...((catalog?.referenceVoices ?? [])),
    ...(referenceAudio && !referenceAudio.startsWith("data:") ? [referenceAudio] : []),
  ]));
  const speakerOptions = Array.from(new Set([
    "default",
    ...((catalog?.speakers ?? [])),
    ...(speaker ? [speaker] : []),
  ]));
  const previewUrl = referencePreviewUrl ?? sampleAudioUrl;
  const previewKind = referencePreviewUrl ? "reference" : sampleAudioUrl ? "sample" : null;
  const clearReferenceAudio = () => {
    setLocalPreview(null);
    setReferencePreviewUrl(undefined);
    setFileLabel("");
    onReferenceAudioChange("");
  };

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">语音合成</p>
          <p className="text-xs text-muted-foreground">IndexTTS 2.5</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-[11px]",
            catalog?.available ? "text-success" : "text-muted-foreground",
          )}>
            {catalogLoading ? "读取中..." : catalog?.available ? "服务已连接" : "服务未连接"}
          </span>
          {onRefresh ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onRefresh}
              disabled={disabled || catalogLoading}
              aria-label="刷新 IndexTTS 音色目录"
              title="刷新 IndexTTS 音色目录"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", catalogLoading && "animate-spin")} aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>模型音色</span>
          <SelectControl
            value={speaker || "default"}
            onChange={(event) => onSpeakerChange(event.target.value || "default")}
            disabled={disabled || catalogLoading || speakerOptions.length === 0}
            aria-label="IndexTTS 2.5 模型音色"
            className="h-9 w-full bg-background text-sm"
          >
            {speakerOptions.map((option) => (
              <option key={option} value={option}>{option === "default" ? "default（基础音色）" : option}</option>
            ))}
          </SelectControl>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>参考音频</span>
          <SelectControl
            value={referenceAudio}
            onChange={(event) => {
              setLocalPreview(null);
              setFileLabel(event.target.value);
              onReferenceAudioChange(event.target.value);
            }}
            disabled={disabled || catalogLoading}
            aria-label="IndexTTS 2.5 参考音频"
            placeholder="默认参考音频"
            className="h-9 w-full bg-background text-sm"
          >
            <option value="">默认参考音频</option>
            {referenceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </SelectControl>
        </label>
      </div>

      <div className="space-y-2">
        <div
          role="button"
          tabIndex={disabled || uploading ? -1 : 0}
          aria-label="上传参考音频"
          aria-disabled={disabled || uploading}
          className={cn(
            "flex min-h-16 items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-xs transition",
            dragging ? "border-primary bg-accent" : "border-border hover:border-primary/60 hover:bg-accent/50",
            (disabled || uploading) && "cursor-not-allowed opacity-60",
            !disabled && !uploading && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onClick={openFilePicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openFilePicker();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled && !uploading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFile(event.dataTransfer.files[0]);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/wav,audio/mpeg,audio/flac,audio/mp4,audio/ogg,audio/webm"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <div className="flex min-w-0 items-center gap-2">
            {uploading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" /> : <Upload className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <span className="truncate text-muted-foreground">
              {uploading ? "正在保存参考音频..." : fileLabel ? `当前：${fileLabel}` : "点击、拖拽或按 Enter 上传参考音频"}
            </span>
          </div>
        </div>
        {previewUrl ? (
          <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/10 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">
                {previewKind === "reference" ? "参考音频试听" : "旁白试听样本"}
              </span>
              {referenceAudio ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={clearReferenceAudio}
                  disabled={disabled || uploading}
                >
                  <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />清除参考音频
                </Button>
              ) : null}
            </div>
            <audio
              controls
              preload="metadata"
              src={previewUrl}
              className="h-7 w-full"
              aria-label={previewKind === "reference" ? "参考音频试听" : "旁白试听样本"}
            />
          </div>
        ) : referenceAudio ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={clearReferenceAudio}
              disabled={disabled || uploading}
            >
              <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />清除参考音频
            </Button>
          </div>
        ) : null}
      </div>

      {catalogError || catalog?.error ? (
        <p className="text-xs text-destructive" role="alert">
          {catalogError?.message || catalog?.error}
        </p>
      ) : null}
      {!catalog?.available && catalog?.webUIUrl ? (
        <a
          href={catalog.webUIUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
        >
          打开 IndexTTS 音色训练工作台 <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}
