import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, FileText, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import type { ComicDramaNovelSummary } from "@ai-novel/shared/types/comicDrama";
import { createKnowledgeDocument } from "@/api/knowledge";
import { updateNovel } from "@/api/novel/core";
import { queryKeys } from "@/api/queryKeys";
import { isTxtFile, readTextFile } from "@/lib/textFile";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

type ReferenceDocument = NonNullable<ComicDramaNovelSummary["referenceDocument"]>;

// 漫剧设定·参考小说：上传一本现成小说作为参考资料存进项目（知识库文档），
// 不进入写作上下文；后续做剧情参考、风格分析时从这里取。
export default function ReferenceNovelCard(props: {
  novelId: string;
  referenceDocument: ReferenceDocument | null;
}) {
  const { novelId, referenceDocument } = props;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!isTxtFile(file)) {
        throw new Error("参考小说目前支持 txt 文本文件。");
      }
      const content = await readTextFile(file);
      if (!content.trim()) {
        throw new Error("这个文件是空的，换一个试试。");
      }
      const document = await createKnowledgeDocument({
        title: file.name.replace(/\.txt$/i, "").slice(0, 80) || file.name,
        fileName: file.name,
        content,
      });
      const documentId = document.data?.id;
      if (!documentId) {
        throw new Error("文件已读取，但保存参考小说失败，请重试。");
      }
      return updateNovel(novelId, { referenceKnowledgeDocumentId: documentId });
    },
    onSuccess: async () => {
      setPendingFile(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.overview(novelId) });
      toast.success(referenceDocument ? "参考小说已替换。" : "参考小说已存入项目设定。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "上传参考小说失败，请重试。"),
  });

  const removeMutation = useMutation({
    mutationFn: () => updateNovel(novelId, { referenceKnowledgeDocumentId: null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.overview(novelId) });
      toast.success("已移除参考小说。原文件仍保留在知识库里。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "移除失败，请重试。"),
  });

  const handlePickFile = (file: File | null) => {
    if (!file) {
      return;
    }
    setPendingFile(file);
    uploadMutation.mutate(file);
  };

  const busy = uploadMutation.isPending || removeMutation.isPending;

  return (
    <section className="rounded-xl border border-border/70 bg-background p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpenText className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">参考小说</h3>
            {referenceDocument ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {(referenceDocument.charCount ?? 0).toLocaleString()} 字
              </span>
            ) : null}
          </div>
          {referenceDocument ? (
            <>
              <p className="mt-1 truncate text-sm text-foreground">{referenceDocument.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {referenceDocument.fileName || "文本文档"}
                {" · "}存在项目设定里，后续做剧情与风格参考时使用
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              上传一本现成小说（txt）作为参考资料。它不会被当成正文，写作与分镜不会直接引用；需要参考时在这里管理。
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={referenceDocument ? "outline" : "default"}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {busy && uploadMutation.isPending
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              : referenceDocument
                ? <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                : <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
            {referenceDocument ? "替换" : "上传参考小说"}
          </Button>
          {referenceDocument ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              title="移除参考小说"
              aria-label="移除参考小说"
              disabled={busy}
              onClick={() => {
                if (window.confirm("移除参考小说？小说正文与设定不受影响，原文件仍保留在知识库。")) {
                  removeMutation.mutate();
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
      {pendingFile && uploadMutation.isPending ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          正在读取并保存「{pendingFile.name}」…
        </p>
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        className="hidden"
        onChange={(event) => {
          handlePickFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
    </section>
  );
}
