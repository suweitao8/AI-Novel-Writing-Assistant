import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Image as ImageIcon, PenLine } from "lucide-react";
import { getModelCategories } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ModelCategoryCard from "./ModelCategoryCard";

export default function ModelCategorySettings() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({
    queryKey: queryKeys.settings.modelCategories,
    queryFn: getModelCategories,
  });
  const categories = categoriesQuery.data?.data;

  const invalidateAfterSave = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelCategories }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys }),
      queryClient.invalidateQueries({ queryKey: queryKeys.llm.providers }),
    ]);
  };

  return (
    <div className="space-y-4">
      <ModelCategoryCard
        icon={<PenLine className="h-4 w-4" />}
        title="文本模型"
        description="用于大纲、正文、审校、修复等全部文字任务；配置一次，所有创作环节都会使用这里的模型。"
        status={categories?.text}
        onSaved={invalidateAfterSave}
      />
      <ModelCategoryCard
        icon={<ImageIcon className="h-4 w-4" />}
        title="图片模型"
        description="用于小说封面、角色立绘和场景插图生成。"
        status={categories?.image}
        isImageCategory
        onSaved={invalidateAfterSave}
      />
      <Card className="min-w-0 opacity-80">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <AudioLines className="h-4 w-4" />
            音频模型
            <Badge variant="outline">准备中</Badge>
          </CardTitle>
          <CardDescription>用于角色配音与有声朗读，功能开放后会在这里配置。</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
