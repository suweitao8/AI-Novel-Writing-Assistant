import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { getStorySettingsWorld, updateStorySettingsWorld } from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

// 漫剧「设定 · 世界观」：只显示章节解析累积的关键设定条目。
// 条目来源是「当前」页签解析后的提取应用（useReferenceExtractStage 写入 keySettings）；
// 这里不做 AI 生成与基础设定编辑，误提取的条目可删除。

interface WorldSettingsPanelProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

export default function WorldSettingsPanel({ novelId, onChanged }: WorldSettingsPanelProps) {
  const queryClient = useQueryClient();
  const worldQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsWorld(novelId),
    queryFn: () => getStorySettingsWorld(novelId),
  });
  const keySettings = worldQuery.data?.data?.keySettings ?? [];

  const removeMutation = useMutation({
    mutationFn: (index: number) => updateStorySettingsWorld(novelId, {
      keySettings: keySettings.filter((_, i) => i !== index),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsWorld(novelId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) });
      await onChanged?.();
    },
    onError: (error: Error) => {
      toast.error("删除条目失败。", { description: error.message });
    },
  });

  if (worldQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">正在加载世界观...</p>;
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">关键设定</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {keySettings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有世界观条目。解析章节后到「提取」里应用世界观建议，条目会出现在这里。
          </p>
        ) : (
          keySettings.map((setting, index) => (
            <div key={`${setting.title}-${index}`} className="space-y-1 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium">{setting.title}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  aria-label="删除条目"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(index)}
                >
                  {removeMutation.isPending && removeMutation.variables === index
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{setting.content}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
