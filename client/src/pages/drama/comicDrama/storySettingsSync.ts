import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";

// 设定中心缓存的整体失效：资产页签、设定页签与提取应用共用同一套 key，
// 任何一处改动后统一走这里，避免各处手写失效列表漂移漏项。
export async function invalidateStorySettingsCaches(queryClient: QueryClient, novelId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsCharacters(novelId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScenes(novelId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsProps(novelId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsWorld(novelId) }),
  ]);
}
