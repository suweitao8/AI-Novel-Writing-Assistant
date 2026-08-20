import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FileText, Loader2, Upload, X } from "lucide-react";
import { createKnowledgeDocument } from "@/api/knowledge";
import { createNovel } from "@/api/novel/core";
import { queryKeys } from "@/api/queryKeys";
import { isTxtFile, readTextFile } from "@/lib/textFile";
import { cn } from "@/lib/utils";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  NOVEL_REFERENCE_SOURCE_SLOT,
  referenceStorageKey,
} from "@/pages/drama/comicDrama/hooks/useReferenceDraftStage";

interface ComicDramaCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REFERENCE_CONTENT_LIMIT = 20000;

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.txt$/i, "").slice(0, 60);
}

// 创建漫剧：作品名（拖入现成小说时自动取文件名）+ 可选想法。
// 上传的参考小说在提交时存入知识库（取消创建不留孤儿文档），同时把正文（截断到
// 参考编辑器上限）写入项目级参考源 localStorage，工作室「参考」页签按章回落到它。
export default function ComicDramaCreateDialog(props: ComicDramaCreateDialogProps) {
  const { open, onOpenChange } = props;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const acceptFile = (file: File | null | undefined) => {
    if (!file) {
      return;
    }
    if (!isTxtFile(file)) {
      toast.error("参考小说目前支持 txt 文本文件。");
      return;
    }
    setReferenceFile(file);
    setTitle(titleFromFileName(file.name));
  };

  const createMutation = useMutation({
    mutationFn: async (): Promise<{ novelId: string; referenceContent: string | null }> => {
      let referenceKnowledgeDocumentId: string | undefined;
      let referenceContent: string | null = null;
      if (referenceFile) {
        const content = await readTextFile(referenceFile);
        if (!content.trim()) {
          throw new Error("参考小说文件是空的，换一个试试。");
        }
        const document = await createKnowledgeDocument({
          title: titleFromFileName(referenceFile.name) || referenceFile.name,
          fileName: referenceFile.name,
          content,
        });
        referenceKnowledgeDocumentId = document.data?.id;
        if (!referenceKnowledgeDocumentId) {
          throw new Error("参考小说保存失败，请重试。");
        }
        referenceContent = content.slice(0, REFERENCE_CONTENT_LIMIT);
      }
      const response = await createNovel({
        title: title.trim(),
        description: description.trim() || undefined,
        creationExperience: "simple",
        writingMode: "original",
        productionKind: "comic_drama",
        referenceKnowledgeDocumentId,
      });
      const novelId = response.data?.id;
      if (!novelId) {
        throw new Error("创建成功但没有返回作品信息，请回到漫剧列表查找。");
      }
      return { novelId, referenceContent };
    },
    onSuccess: async ({ novelId, referenceContent }) => {
      if (referenceContent) {
        try {
          window.localStorage.setItem(
            referenceStorageKey(novelId, NOVEL_REFERENCE_SOURCE_SLOT),
            referenceContent,
          );
        } catch {
          // 本地存储不可用时跳过，「参考」页签仍可手动粘贴
        }
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setReferenceFile(null);
      toast.success("漫剧项目已创建。");
      navigate(`/drama/studio/${novelId}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建失败，请稍后重试。"),
  });

  const canSubmit = title.trim().length > 0 && !createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title="创建漫剧"
        className="max-w-xl"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
              取消
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true" />}
              创建并开始
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="comic-drama-title" className="text-sm font-medium text-foreground">作品名</label>
            <Input
              id="comic-drama-title"
              value={title}
              maxLength={60}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="comic-drama-idea" className="text-sm font-medium text-foreground">故事想法（可选）</label>
            <textarea
              className="min-h-[96px] w-full rounded-md border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              id="comic-drama-idea"
              value={description}
              maxLength={2000}
              rows={4}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              acceptFile(event.dataTransfer.files?.[0]);
            }}
          >
            {referenceFile ? (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5",
                  dragActive ? "border-primary" : "border-border",
                )}
              >
                <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-sm text-foreground">{referenceFile.name}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="移除参考小说"
                  disabled={createMutation.isPending}
                  onClick={() => setReferenceFile(null)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={createMutation.isPending}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border border-dashed bg-background/60 px-3.5 py-3 text-left transition-colors disabled:opacity-50",
                  dragActive ? "border-primary bg-muted/20" : "border-border hover:border-primary/40 hover:bg-muted/20",
                )}
              >
                <Upload className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sm text-foreground">拖入或点击上传小说（txt）</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(event) => {
                acceptFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
