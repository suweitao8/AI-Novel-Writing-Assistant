import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { createNovelChapter } from "@/api/novel/chapters";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface CreateChapterDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextOrder: number;
  onCreated: () => Promise<void>;
}

// 新建章节弹窗：顶栏「新增」与章节管理面板共用，标题必填、本章大纲选填。
export default function CreateChapterDialog(props: CreateChapterDialogProps) {
  const { novelId, open, onOpenChange, nextOrder, onCreated } = props;
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      createNovelChapter(novelId, {
        title: title.trim(),
        order: nextOrder,
        expectation: synopsis.trim() || undefined,
      }),
    onSuccess: async () => {
      await onCreated();
      toast.success(`第 ${nextOrder} 章已创建，可以继续写本章初稿。`);
      setTitle("");
      setSynopsis("");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建章节失败，请重试。"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title={`新建第 ${nextOrder} 章`}
        description="写下这一章的标题和大纲：大纲会被 AI 展开成节拍，也是写作时的依据。"
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!title.trim() || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              创建章节
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">章节标题</label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：雨夜的第一个委托"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">本章大纲（选填，可之后再补）</label>
            <textarea
              value={synopsis}
              onChange={(event) => setSynopsis(event.target.value)}
              placeholder="这一章要发生什么、推进什么、结尾留什么钩子。"
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3.5 py-3 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
