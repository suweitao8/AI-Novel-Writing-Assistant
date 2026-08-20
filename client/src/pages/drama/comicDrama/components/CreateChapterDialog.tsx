import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { createNovelChapter } from "@/api/novel/chapters";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { findReferenceChapterTitle } from "@/pages/drama/comicDrama/hooks/useReferenceDraftStage";

interface CreateChapterDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextOrder: number;
  onCreated: () => Promise<void>;
}

// 新建章节弹窗：只有一个标题输入。每次打开按新建序号自动取参考小说对应章节的
// 标题预填（「第N章 标题」行，可改）；没有参考源或没匹配到则为空，由用户填写。
export default function CreateChapterDialog(props: CreateChapterDialogProps) {
  const { novelId, open, onOpenChange, nextOrder, onCreated } = props;
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(findReferenceChapterTitle(novelId, nextOrder));
    }
  }, [open, novelId, nextOrder]);

  const createMutation = useMutation({
    mutationFn: () =>
      createNovelChapter(novelId, {
        title: title.trim(),
        order: nextOrder,
      }),
    onSuccess: async () => {
      await onCreated();
      toast.success(`第 ${nextOrder} 章已创建。`);
      setTitle("");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建章节失败，请重试。"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title={`新建第 ${nextOrder} 章`}
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
        <div className="space-y-1">
          <label className="text-sm font-medium">章节标题</label>
          <Input
            value={title}
            maxLength={60}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
