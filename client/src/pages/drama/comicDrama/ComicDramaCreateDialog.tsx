import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, FilePlus2, Loader2 } from "lucide-react";
import { createNovel } from "@/api/novel/core";
import { queryKeys } from "@/api/queryKeys";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface ComicDramaCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 创建漫剧：只需要一个书名。漫剧从写小说开始——先建设定、写大纲，
// AI 写完小说后接着做分镜、配音，最终合成动态漫视频。
export default function ComicDramaCreateDialog(props: ComicDramaCreateDialogProps) {
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
        productionKind: "comic_drama",
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
          <div className="flex items-start gap-2.5 rounded-xl bg-muted/40 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
            <Clapperboard className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>接下来的流程：写小说 → 生成分镜 → 合成配音 → 制作动态漫视频。每一步都可以先做一部分，边写边做。</span>
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
