import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, BookOpenCheck, Loader2 } from "lucide-react";
import { confirmStorySettings } from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

interface StorySettingsConfirmCardProps {
  novelId: string;
  onConfirmed?: () => void | Promise<void>;
  onViewSettings?: () => void;
}

// 短篇动笔前的设定确认卡：默认一键采纳并开始写作，也可以先去设定页签调整。
export default function StorySettingsConfirmCard({ novelId, onConfirmed, onViewSettings }: StorySettingsConfirmCardProps) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  const confirmMutation = useMutation({
    mutationFn: () => confirmStorySettings(novelId),
    onSuccess: async () => {
      toast.success("设定已确认，开始写作。");
      setDismissed(true);
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) });
      await onConfirmed?.();
    },
    onError: (error) => {
      toast.error("确认失败，请重试。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  if (dismissed) {
    return null;
  }

  return (
    <Card className="min-w-0 border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2 text-sm leading-6">
          <BadgeCheck className="mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="text-emerald-800 dark:text-emerald-300">
            角色、场景、道具与世界观已生成。可以先在设定页签里查看和调整，也可以直接采纳开始写作；
            正文会遵守这些设定。
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onViewSettings ? (
            <Button variant="outline" size="sm" onClick={onViewSettings}>
              查看设定
            </Button>
          ) : null}
          <Button size="sm" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
            {confirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
            {confirmMutation.isPending ? "正在开始..." : "采纳并开始写作"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
