import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Loader2 } from "lucide-react";
import { createNovel } from "@/api/novel/core";
import { queryKeys } from "@/api/queryKeys";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface BlankNovelCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 空白小说创建：只起书名（想法可选），创建一本简易模式的空书，
// 落到书架的「从零开始」工作台——先建设定、写大纲，再让 AI 推理细纲开写。
export default function BlankNovelCreateDialog(props: BlankNovelCreateDialogProps) {
  const { open, onOpenChange } = props;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await createNovel({
        title: title.trim(),
        description: description.trim() || undefined,
        creationExperience: "simple",
        writingMode: "original",
      });
      const novelId = response.data?.id;
      if (!novelId) {
        throw new Error("创建成功但没有返回作品信息，请回到小说列表查找。");
      }
      return novelId;
    },
    onSuccess: async (novelId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
      onOpenChange(false);
      setTitle("");
      setDescription("");
      toast.success("空白小说已创建，先写大纲或建设定，随时可以让 AI 开始。");
      navigate(`/novels/${novelId}/simple`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建失败，请稍后重试。"),
  });

  const canSubmit = title.trim().length > 0 && !createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title="创建空白小说"
        description="只需要一个书名就能开始。创建后可以先添加角色、场景、道具，写一个简略大纲，再让 AI 推理成分章细纲开写。"
        className="max-w-xl"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
              取消
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true"  /> : <FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true"  />}
              创建并进入
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="blank-novel-title" className="text-sm font-medium text-foreground">书名</label>
            <Input
              id="blank-novel-title"
              value={title}
              maxLength={60}
              placeholder="例如：深海修理铺"
              onChange={(event) => setTitle(event.target.value)}
             />
            <p className="text-xs text-muted-foreground">之后随时可以改名，先用一个喜欢的名字开始就好。</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="blank-novel-idea" className="text-sm font-medium text-foreground">故事想法（可选）</label>
            <textarea className="min-h-[72px] w-full rounded-md border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              id="blank-novel-idea"
              value={description}
              maxLength={2000}
              rows={4}
              placeholder="一句话或一段话都行，例如：一个退休的深海修理师在海底捡到一艘会说话的旧潜艇。"
              onChange={(event) => setDescription(event.target.value)}
             />
            <p className="text-xs text-muted-foreground">它会作为 AI 理解这本书的起点；也可以留空，进去之后再慢慢补充。</p>
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
