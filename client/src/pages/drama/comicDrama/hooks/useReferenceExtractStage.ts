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
  updateStorySettingsCharacter,
  updateStorySettingsProp,
  updateStorySettingsScene,
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
import { invalidateStorySettingsCaches } from "@/pages/drama/comicDrama/storySettingsSync";
import {
  type CharacterAssetFormState,
  normalizeStatesForSave,
  type SceneAssetFormState,
  type PropAssetFormState,
} from "@/pages/novels/components/storySettings/assetForms";

// 「提取」页签：展示「解析」产出并随章节持久化的设定建议（Chapter.referenceExtractionJson）。
// 每条建议点开弹窗核对、可修改（与资产页签共用 assetForms 表单）：新建议点「应用」单个创建；
// 同名已存在的建议直接载入已有资产编辑（状态列表可见已生成的图/音色），点「保存」更新该资产。
// 应用成功的建议保留在列表并亮「已存在」徽标（2026-08-23 用户要求：应用后仍要能看到、
// 知道哪些已经建过；重新「解析」会整份重写建议）。不做批量勾选。

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
  // parseDurationMs 是随提取结果持久化的解析耗时元数据（非 AI 产出），读取时原样保留。
  const parseDurationMs = typeof source.parseDurationMs === "number"
    && Number.isFinite(source.parseDurationMs)
    && source.parseDurationMs > 0
    ? Math.round(source.parseDurationMs)
    : undefined;
  return {
    characters,
    scenes: items(source.scenes),
    props: items(source.props),
    worldview: items(source.worldview).map((item) => ({ name: item.name, description: item.description })),
    ...(parseDurationMs ? { parseDurationMs } : {}),
  };
}

export type ApplyOneInput = {
  group: "characters" | "scenes" | "props" | "worldview";
  index: number;
  /** 已存在同名资产时传其 id：保存改为更新该资产（含已有状态与图/音色），否则创建新资产 */
  existingId?: string;
  form:
    | (CharacterAssetFormState & { __kind: "character"; states: StoryAssetState[] })
    | (SceneAssetFormState & { __kind: "scene"; states: StoryAssetState[] })
    | (PropAssetFormState & { __kind: "prop"; states: StoryAssetState[] })
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

  const applyOneMutation = useMutation({
    mutationFn: async (payload: ApplyOneInput): Promise<{ group: string; updated: boolean }> => {
      const { group, existingId, form } = payload;
      const chapterTag = chapterOrder ? { chapterOrder } : {};

      if (form.__kind === "character") {
        if (existingId) {
          // 已存在：更新已有资产本身；状态原样带回（保住已生成的图/音色），不改章节标记。
          await updateStorySettingsCharacter(input.novelId, existingId, {
            name: form.name.trim(),
            gender: form.gender || undefined,
            states: normalizeStatesForSave(form.states),
          });
        } else {
          if (existingNames.characters.has(form.name.trim())) {
            throw new Error("已有同名角色，不能重复创建。");
          }
          const states = normalizeStatesForSave(form.states.map((state, index) => ({
            ...state,
            ...(index === 0 ? { id: "initial", label: "初始状态" } : {}),
            ...chapterTag,
          })));
          await createStorySettingsCharacter(input.novelId, {
            name: form.name.trim(),
            gender: form.gender || undefined,
            states,
          });
        }
      } else if (form.__kind === "scene") {
        if (existingId) {
          await updateStorySettingsScene(input.novelId, existingId, {
            name: form.name.trim(),
            states: normalizeStatesForSave(form.states),
          });
        } else {
          if (existingNames.scenes.has(form.name.trim())) {
            throw new Error("已有同名场景，不能重复创建。");
          }
          const initial = form.states[0];
          const imagePrompt = initial?.imagePrompt?.trim() || `${form.name.trim()}初始状态`;
          const initialDescription = initial?.description?.trim() || imagePrompt;
          await createStorySettingsScene(input.novelId, {
            name: form.name.trim(),
            sceneType: initial?.sceneType ?? undefined,
            summary: initialDescription,
            environmentPrompt: imagePrompt || undefined,
            timeOfDay: initial?.timeOfDay ?? undefined,
            weather: initial?.weather ?? undefined,
            states: normalizeStatesForSave(form.states.map((state, stateIndex) => ({
              ...state,
              ...(stateIndex === 0 ? { id: "initial", label: "初始状态" } : {}),
              ...chapterTag,
            }))),
          });
        }
      } else if (form.__kind === "prop") {
        if (existingId) {
          await updateStorySettingsProp(input.novelId, existingId, {
            name: form.name.trim(),
            states: normalizeStatesForSave(form.states),
          });
        } else {
          if (existingNames.props.has(form.name.trim())) {
            throw new Error("已有同名道具，不能重复创建。");
          }
          const initial = form.states[0];
          const imagePrompt = initial?.imagePrompt?.trim() || `${form.name.trim()}初始状态`;
          await createStorySettingsProp(input.novelId, {
            name: form.name.trim(),
            visualPrompt: imagePrompt || undefined,
            states: normalizeStatesForSave(form.states.map((state, stateIndex) => ({
              ...state,
              ...(stateIndex === 0 ? { id: "initial", label: "初始状态" } : {}),
              ...chapterTag,
            }))),
          });
        }
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

      // 应用成功后建议保留在列表：资产名单缓存刷新后卡片自动亮「已存在」徽标，
      // 再点开走更新路径（existingId），同名兜底也拦得住重复创建。
      return { group, updated: Boolean(existingId) };
    },
    onSuccess: async ({ group, updated }) => {
      await invalidateStorySettingsCaches(queryClient, input.novelId);
      toast.success(updated ? `${GROUP_LABELS[group] ?? "资产"}已保存更新。` : `${GROUP_LABELS[group] ?? "资产"}已应用。`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存失败，请重试。"),
  });

  const totalItems = extraction.characters.length + extraction.scenes.length + extraction.props.length + extraction.worldview.length;

  return {
    novelId: input.novelId,
    extraction,
    existingNames,
    existingAssets: { characters, scenes, props },
    applyOneMutation,
    totalItems,
  };
}

export type ReferenceExtractStage = ReturnType<typeof useReferenceExtractStage>;
