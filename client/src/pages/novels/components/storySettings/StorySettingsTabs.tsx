import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, MapPin, Package, Globe2 } from "lucide-react";
import { queryKeys } from "@/api/queryKeys";
import { getStorySettingsOverview } from "@/api/story/storySettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SettingsCharactersTab from "./SettingsCharactersTab";
import SettingsScenesTab from "./SettingsScenesTab";
import SettingsPropsTab from "./SettingsPropsTab";
import SettingsWorldTab from "./SettingsWorldTab";
import AutoStoryAssetImageGeneration from "./AutoStoryAssetImageGeneration";

interface StorySettingsTabsProps {
  novelId: string;
  initialTab?: string;
}

const STORY_SETTINGS_TABS = ["characters", "scenes", "props", "world"] as const;

// 设定中心：角色 / 场景 / 道具 / 世界观 四个页签，短篇工作室与简易书架页共用。
export default function StorySettingsTabs({ novelId, initialTab = "characters" }: StorySettingsTabsProps) {
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsOverview(novelId),
    queryFn: () => getStorySettingsOverview(novelId),
  });
  const overview = overviewQuery.data?.data;

  const invalidateSettings = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsCharacters(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScenes(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsProps(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsWorld(novelId) }),
    ]);
  };

  return (
    <>
      <AutoStoryAssetImageGeneration novelId={novelId} />
      <Tabs
        defaultValue={initialTab}
        rememberedKey={`novel:${novelId}:story-settings`}
        rememberedValues={STORY_SETTINGS_TABS}
        className="space-y-4"
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="characters" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            角色{overview ? ` ${overview.counts.characters}` : ""}
          </TabsTrigger>
          <TabsTrigger value="scenes" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            场景{overview ? ` ${overview.counts.scenes}` : ""}
          </TabsTrigger>
          <TabsTrigger value="props" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            道具{overview ? ` ${overview.counts.props}` : ""}
          </TabsTrigger>
          <TabsTrigger value="world" className="gap-1.5">
            <Globe2 className="h-3.5 w-3.5" />
            世界观
          </TabsTrigger>
        </TabsList>
        <TabsContent value="characters">
          <SettingsCharactersTab novelId={novelId} onChanged={invalidateSettings} />
        </TabsContent>
        <TabsContent value="scenes">
          <SettingsScenesTab novelId={novelId} onChanged={invalidateSettings} />
        </TabsContent>
        <TabsContent value="props">
          <SettingsPropsTab novelId={novelId} onChanged={invalidateSettings} />
        </TabsContent>
        <TabsContent value="world">
          <SettingsWorldTab novelId={novelId} onChanged={invalidateSettings} />
        </TabsContent>
      </Tabs>
    </>
  );
}
