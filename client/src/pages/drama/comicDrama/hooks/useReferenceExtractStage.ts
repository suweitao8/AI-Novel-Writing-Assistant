import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createStorySettingsCharacter,
  createStorySettingsProp,
  createStorySettingsScene,
  getStorySettingsCharacters,
  getStorySettingsProps,
  getStorySettingsScenes,
  getStorySettingsWorld,
  updateStorySettingsWorld,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import type {
  ReferenceExtractionPayload,
  ReferenceExtractCharacter,
  ReferenceExtractItem,
  StoryAssetState,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import type { NovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";
import type {
  CharacterAssetFormState,
  SceneAssetFormState,
  PropAssetFormState,
} from "@/pages/novels/components/storySettings/assetForms";
import { newStateId } from "@/pages/novels/components/storySettings/assetForms";

// 「提取」页签：展示「解析」产出并随章节持久化的设定建议（Chapter.referenceExtractionJson）。
// 每条建议点开弹窗核对、可修改（与资产页签共用 assetForms 表单），点「应用」单个创建——
// 不做批量勾选，用户要逐条看过、改好才应用。同名资产不重复创建（已存在时应用按钮拦截）；
// 外观状态不在这里生成（用户手动管理），只在首次创建时把画面/音色提示词记为初始状态。

const EMPTY_EXTRACTION: ReferenceExtractionPayload = { characters: [], scenes: [], props: [], worldview: [] };

const GROUP_LABELS: Record<string, string> = {
  characters: "角色",
  scenes: "场景",
  props: "道具",
  worldview: "世界观",
};

export function parseReferenceExtraction(raw: string | null | undefined): ReferenceExtractionPayload {
  if (!raw?.trim()) {
    return EMPTY_EXTRACTION;
  }
  try {
    return normalizeExtraction(JSON.parse(raw) as unknown);
  } catch {
    return EMPTY_EXTRACTION;
  }
}

export function normalizeExtraction(raw: unknown): ReferenceExtractionPayload {
  const source = (raw ?? {}) as Partial<ReferenceExtractionPayload>;
  const items = (list: unknown): ReferenceExtractItem[] =>
    Array.isArray(list)
      ? list.filter((item): item is ReferenceExtractItem => {
        const candidate = item as ReferenceExtractItem;
        return typeof candidate?.name === "string" && candidate.name.trim().length > 0
          && typeof candidate?.description === "string";
      })
      : [];
  // 角色没有 description 字段（v3 起用 appearance/personality），过滤条件只看 name。
  const characters = (Array.isArray(source.characters) ? source.characters : [])
    .filter((item): item is ReferenceExtractCharacter =>
      typeof (item as ReferenceExtractCharacter)?.name === "string" && item.name.trim().length > 0)
    .map((character) => ({
      ...character,
      role: String(character.role || "配角"),
      appearance: typeof character.appearance === "string" ? character.appearance : "",
      personality: typeof character.personality === "string" ? character.personality : "",
      imagePrompt: typeof character.imagePrompt === "string" ? character.imagePrompt : "",
      voicePrompt: typeof character.voicePrompt === "string" ? character.voicePrompt : "",
    }));
  return {
    characters,
    scenes: items(source.scenes),
    props: items(source.props),
    worldview: items(source.worldview).map((item) => ({ name: item.name, description: item.description })),
  };
}

export type ApplyOneInput = {
  group: "characters" | "scenes" | "props" | "worldview";
  index: number;
  form:
    | (CharacterAssetFormState & { __kind: "character" })
    | (SceneAssetFormState & { __kind: "scene" })
    | (PropAssetFormState & { __kind: "prop" })
    | { __kind: "worldview"; name: string; description: string };
};

export function useReferenceExtractStage(input: {
  novelId: string;
  workspace: NovelChapterWorkspace;
}) {
  const queryClient = useQueryClient();
  const { workspace } = input;
  const chapter = workspace.currentChapter;
  const extraction = useMemo(
    () => parseReferenceExtraction(workspace.referenceExtractionJson),
    [workspace.referenceExtractionJson],
  );

  // 已有资产名单（与资产页签共享缓存）：卡片标「已存在」、应用前兜底查重。
  const charactersQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsCharacters(input.novelId),
    queryFn: () => getStorySettingsCharacters(input.novelId),
  });
  const scenesQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsScenes(input.novelId),
    queryFn: () => getStorySettingsScenes(input.novelId),
  });
  const propsQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsProps(input.novelId),
    queryFn: () => getStorySettingsProps(input.novelId),
  });
  const characters = charactersQuery.data?.data ?? [];
  const scenes = scenesQuery.data?.data ?? [];
  const props = propsQuery.data?.data ?? [];
  const existingNames = useMemo(() => ({
    characters: new Set(characters.map((item) => item.name.trim())),
    scenes: new Set(scenes.map((item) => item.name.trim())),
    props: new Set(props.map((item) => item.name.trim())),
  }), [characters, scenes, props]);

  const chapterOrder = chapter?.order;

  // 从持久化建议里移除一条（应用成功后调用；全部用完则清空字段）。
  const removeAppliedItem = (group: ApplyOneInput["group"], index: number) => {
    const next: ReferenceExtractionPayload = {
      characters: [...extraction.characters],
      scenes: [...extraction.scenes],
      props: [...extraction.props],
      worldview: [...extraction.worldview],
    };
    next[group].splice(index, 1);
    const remaining = next.characters.length + next.scenes.length + next.props.length + next.worldview.length;
    workspace.applyReferenceExtraction(remaining > 0 ? JSON.stringify(next) : null);
  };

  const applyOneMutation = useMutation({
    mutationFn: async (payload: ApplyOneInput): Promise<{ group: string }> => {
      const { group, index, form } = payload;
      const chapterTag = chapterOrder ? { chapterOrder } : {};

      if (form.__kind === "character") {
        if (existingNames.characters.has(form.name.trim())) {
          throw new Error("已有同名角色，不能重复创建。");
        }
        const imagePrompt = form.facePrompt.trim();
        const voicePrompt = form.voiceTexture.trim();
        const states: StoryAssetState[] = imagePrompt
          ? [{
            id: newStateId(),
            label: "初始",
            description: form.appearance.trim() || imagePrompt,
            imagePrompt,
            ...(voicePrompt ? { voicePrompt } : {}),
            ...chapterTag,
          }]
          : [];
        await createStorySettingsCharacter(input.novelId, {
          name: form.name.trim(),
          gender: form.gender || undefined,
          ageGroup: form.ageGroup || undefined,
          appearance: form.appearance.trim() || undefined,
          facePrompt: imagePrompt || undefined,
          voiceTexture: voicePrompt || undefined,
          states,
        });
      } else if (form.__kind === "scene") {
        if (existingNames.scenes.has(form.name.trim())) {
          throw new Error("已有同名场景，不能重复创建。");
        }
        const imagePrompt = form.environmentPrompt.trim();
        await createStorySettingsScene(input.novelId, {
          name: form.name.trim(),
          sceneType: (form.sceneType || undefined) as "interior" | "exterior" | "nature" | undefined,
          summary: form.summary.trim() || undefined,
          environmentPrompt: imagePrompt || undefined,
          significance: form.significance.trim() || undefined,
          states: imagePrompt
            ? [{ id: newStateId(), label: "初始", description: form.summary.trim() || imagePrompt, imagePrompt, ...chapterTag }]
            : [],
        });
      } else if (form.__kind === "prop") {
        if (existingNames.props.has(form.name.trim())) {
          throw new Error("已有同名道具，不能重复创建。");
        }
        const imagePrompt = form.visualPrompt.trim();
        await createStorySettingsProp(input.novelId, {
          name: form.name.trim(),
          visualPrompt: imagePrompt || undefined,
          states: imagePrompt
            ? [{ id: newStateId(), label: "初始", description: imagePrompt, imagePrompt, ...chapterTag }]
            : [],
        });
      } else {
        const worldResponse = await getStorySettingsWorld(input.novelId);
        const existingSettings = worldResponse.data?.keySettings ?? [];
        if (existingSettings.some((entry) => entry.title.trim() === form.name.trim())) {
          throw new Error("已有同名世界观条目，不能重复创建。");
        }
        await updateStorySettingsWorld(input.novelId, {
          keySettings: [...existingSettings, { title: form.name.trim(), content: form.description.trim() }],
        });
      }

      removeAppliedItem(group, index);
      return { group };
    },
    onSuccess: async ({ group }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(input.novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsCharacters(input.novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScenes(input.novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsProps(input.novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsWorld(input.novelId) }),
      ]);
      toast.success(`${GROUP_LABELS[group] ?? "资产"}已应用。`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "应用失败，请重试。"),
  });

  const totalItems = extraction.characters.length + extraction.scenes.length + extraction.props.length + extraction.worldview.length;

  return {
    extraction,
    existingNames,
    applyOneMutation,
    totalItems,
  };
}

export type ReferenceExtractStage = ReturnType<typeof useReferenceExtractStage>;
