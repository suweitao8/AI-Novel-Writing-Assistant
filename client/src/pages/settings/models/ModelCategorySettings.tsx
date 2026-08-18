import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Image as ImageIcon, PenLine } from "lucide-react";
import { getModelCategories } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
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
      <ModelCategoryCard
        icon={<AudioLines className="h-4 w-4" />}
        title="音频模型"
        description="用于角色配音与朗读；默认连接本机 VoxCPM2 语音服务，本地生成不消耗云端额度。"
        status={categories?.audio}
        isAudioCategory
        onSaved={invalidateAfterSave}
      />
    </div>
  );
}
