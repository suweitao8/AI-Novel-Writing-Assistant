import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, Clapperboard, FilePlus2, FileText, Loader2, X } from "lucide-react";
import { createKnowledgeDocument } from "@/api/knowledge";
import { createNovel } from "@/api/novel/core";
import { queryKeys } from "@/api/queryKeys";
import { isTxtFile, readTextFile } from "@/lib/textFile";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface ComicDramaCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 创建漫剧：一个书名（可选一句想法与一本参考小说）。漫剧从写小说开始——
// 先建设定、写大纲，AI 写完小说后接着做分镜、配音，最终合成动态漫视频。
// 参考小说在提交时才上传入知识库（取消创建不会留下孤儿文档），只存储备用不进入写作。
export default function ComicDramaCreateDialog(props: ComicDramaCreateDialogProps) {
  const { open, onOpenChange } = props;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      let referenceKnowledgeDocumentId: string | undefined;
      if (referenceFile) {
        if (!isTxtFile(referenceFile)) {
          throw new Error("参考小说目前支持 txt 文本文件。");
        }
        const content = await readTextFile(referenceFile);
        if (!content.trim()) {
          throw new Error("参考小说文件是空的，换一个试试。");
        }
        const document = await createKnowledgeDocument({
          title: referenceFile.name.replace(/\.txt$/i, "").slice(0, 80) || referenceFile.name,
          fileName: referenceFile.name,
          content,
        });
        referenceKnowledgeDocumentId = document.data?.id;
        if (!referenceKnowledgeDocumentId) {
          throw new Error("参考小说保存失败，请重试。");
        }
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
      return novelId;
    },
    onSuccess: async (novelId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setReferenceFile(null);
      toast.success("漫剧项目已创建。先写小说，AI 写完可以接着做分镜、配音和视频。");
      navigate(`/drama/studio/${novelId}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建失败，请稍后重试。"),
  });

  const canSubmit = title.trim().length > 0 && !createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title="创建漫剧"
        description="从一本小说开始，最终做成一部动态漫视频：先让 AI 帮你把小说写出来，再自动衔接分镜、配音和视频合成。"
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
              placeholder="例如：深海修理铺"
              onChange={(event) => setTitle(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">之后随时可以改名，先用一个喜欢的名字开始就好。</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="comic-drama-idea" className="text-sm font-medium text-foreground">故事想法（可选）</label>
            <textarea
              className="min-h-[96px] w-full rounded-md border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              id="comic-drama-idea"
              value={description}
              maxLength={2000}
              rows={4}
              placeholder="一句话或一段话都行，例如：一个退休的深海修理师在海底捡到一艘会说话的旧潜艇。"
              onChange={(event) => setDescription(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">它会作为 AI 理解这个故事的起点；也可以留空，进去之后再慢慢补充。</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">参考小说（可选）</label>
            {referenceFile ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{referenceFile.name}</p>
                  <p className="text-xs text-muted-foreground">创建时会存入项目设定，之后可以在设定里替换或移除。</p>
                </div>
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
                className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border bg-background/60 px-3.5 py-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/20 disabled:opacity-50"
              >
                <BookOpenText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">上传一本现成小说（txt）</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    作为参考资料存进项目设定，写作时不会被当成正文；需要的时候去设定里查看。
                  </span>
                </span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && !isTxtFile(file)) {
                  toast.error("参考小说目前支持 txt 文本文件。");
                } else {
                  setReferenceFile(file);
                }
                event.target.value = "";
              }}
            />
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-muted/40 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
            <Clapperboard className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>接下来的流程：写小说 → 生成分镜 → 合成配音 → 制作动态漫视频。每一步都可以先做一部分，边写边做。</span>
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
