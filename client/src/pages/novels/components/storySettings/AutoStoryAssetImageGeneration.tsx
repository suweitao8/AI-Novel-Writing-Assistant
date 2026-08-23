import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { StoryAssetStateImage } from "@ai-novel/shared/types/novelReferenceExtraction";
import {
  getStorySettingsCharacters,
  getStorySettingsProps,
  getStorySettingsScenes,
  type StorySettingsCharacter,
  type StorySettingsProp,
  type StorySettingsScene,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import {
  AUTO_STORY_ASSET_IMAGE_CONCURRENCY,
  getMissingStoryAssetImageTasks,
  runWithConcurrency,
  type AutoStoryAssetKind,
  type AutoStoryAsset,
  type StoryAssetImageTask,
} from "./autoStoryAssetImages";
import {
  reserveStoryAssetImageRequest,
  startStoryAssetImageRequest,
} from "./storyAssetImageRequestCoordinator";

type StoryAssetRecord = (StorySettingsCharacter | StorySettingsScene | StorySettingsProp) & AutoStoryAsset;

type AssetListResponse = ApiResponse<StoryAssetRecord[]>;

interface AssetGroup {
  kind: AutoStoryAssetKind;
  assets: StoryAssetRecord[];
  queryKey: QueryKey;
}

interface AutoStoryAssetImageGenerationProps {
  novelId: string;
}

function getAssetGroup(
  novelId: string,
  kind: AutoStoryAssetKind,
  assets: StoryAssetRecord[],
): AssetGroup {
  const queryKey = kind === "character"
    ? queryKeys.novels.storySettingsCharacters(novelId)
    : kind === "scene"
      ? queryKeys.novels.storySettingsScenes(novelId)
      : queryKeys.novels.storySettingsProps(novelId);
  return { kind, assets, queryKey };
}

function updateAssetInCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  assetId: string,
  update: (asset: StoryAssetRecord) => StoryAssetRecord,
): void {
  queryClient.setQueryData<AssetListResponse>(queryKey, (current) => {
    if (!current?.data) return current;
    return {
      ...current,
      data: current.data.map((asset) => asset.id === assetId ? update(asset) : asset),
    };
  });
}

function setStateImageStatus(
  queryClient: QueryClient,
  group: AssetGroup,
  task: StoryAssetImageTask,
  status: StoryAssetStateImage["status"],
  error?: string,
): void {
  updateAssetInCache(queryClient, group.queryKey, task.assetId, (asset) => ({
    ...asset,
    states: asset.states.map((state) => {
      if (state.id !== task.stateId) return state;
      const image: StoryAssetStateImage = {
        ...(state.image ?? { status: "idle" }),
        status,
      };
      if (error) image.error = error;
      else delete image.error;
      return { ...state, image };
    }),
  }));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "图片生成失败，请打开资产详情重试。";
}

/**
 * 无界面自动补图协调器：列表刷新后补齐三类资产的默认状态图。
 * 生图请求沿用详情弹窗的同一接口，避免创建入口各自维护一套副作用。
 */
export default function AutoStoryAssetImageGeneration({ novelId }: AutoStoryAssetImageGenerationProps) {
  const queryClient = useQueryClient();
  const charactersQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsCharacters(novelId),
    queryFn: () => getStorySettingsCharacters(novelId),
    enabled: Boolean(novelId),
  });
  const scenesQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsScenes(novelId),
    queryFn: () => getStorySettingsScenes(novelId),
    enabled: Boolean(novelId),
  });
  const propsQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsProps(novelId),
    queryFn: () => getStorySettingsProps(novelId),
    enabled: Boolean(novelId),
  });
  const sessionRef = useRef<{ novelId: string; attemptedKeys: Set<string> } | null>(null);

  if (!sessionRef.current || sessionRef.current.novelId !== novelId) {
    sessionRef.current = { novelId, attemptedKeys: new Set() };
  }

  useEffect(() => {
    if (!novelId || charactersQuery.isFetching || scenesQuery.isFetching || propsQuery.isFetching) {
      return;
    }

    const groups = [
      getAssetGroup(novelId, "character", (charactersQuery.data?.data ?? []) as StoryAssetRecord[]),
      getAssetGroup(novelId, "scene", (scenesQuery.data?.data ?? []) as StoryAssetRecord[]),
      getAssetGroup(novelId, "prop", (propsQuery.data?.data ?? []) as StoryAssetRecord[]),
    ];
    const attemptedKeys = sessionRef.current?.attemptedKeys ?? new Set<string>();
    const tasks = groups.flatMap((group) =>
      getMissingStoryAssetImageTasks(group.kind, group.assets, attemptedKeys));
    if (tasks.length === 0) return;
    tasks.forEach((task) => {
      attemptedKeys.add(task.key);
      reserveStoryAssetImageRequest({
        novelId,
        kind: task.kind,
        assetId: task.assetId,
        stateId: task.stateId,
      });
      const group = groups.find((candidate) => candidate.kind === task.kind);
      if (group) {
        setStateImageStatus(queryClient, group, task, "generating");
      }
    });

    const groupsByKind = new Map(groups.map((group) => [group.kind, group]));
    let succeeded = 0;
    let failed = 0;
    void runWithConcurrency(tasks, AUTO_STORY_ASSET_IMAGE_CONCURRENCY, async (task) => {
      const group = groupsByKind.get(task.kind);
      if (!group) return;
      try {
        const response = await startStoryAssetImageRequest({
          novelId,
          kind: task.kind,
          assetId: task.assetId,
          stateId: task.stateId,
        });
        if (!response.data) {
          throw new Error("图片生成失败，请打开资产详情重试。");
        }
        updateAssetInCache(queryClient, group.queryKey, task.assetId, () => response.data as StoryAssetRecord);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        setStateImageStatus(queryClient, group, task, "error", getErrorMessage(error));
      }
    }).then(() => {
      if (succeeded > 0) {
        toast.success(`已自动生成 ${succeeded} 张资产图片。`);
      }
      if (failed > 0) {
        toast.error(`${failed} 张资产图片生成失败。`, { description: "打开资产详情可重新生成。" });
      }
    });
  }, [
    charactersQuery.data?.data,
    charactersQuery.isFetching,
    novelId,
    propsQuery.data?.data,
    propsQuery.isFetching,
    queryClient,
    scenesQuery.data?.data,
    scenesQuery.isFetching,
  ]);

  return null;
}
