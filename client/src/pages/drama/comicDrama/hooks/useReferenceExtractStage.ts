import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  type StorySettingsCharacter,
  type StorySettingsProp,
  type StorySettingsScene,
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

// 「提取」页签：展示「解析」产出并随章节持久化的设定建议（Chapter.referenceExtractionJson），
// 用户勾选确认后创建进设定中心。建议不用也一直保存着，直到被创建或清空。
// 创建规则：新资产带初始外观状态（含画面/音色提示词）；同名资产带 stateLabel 时
// 追加为新外观状态（并把基础外貌字段同步成最新状态，让生图/配音链路直接吃到），
// 同名且无状态变化的视为已存在，从建议列表移除。

const EMPTY_EXTRACTION: ReferenceExtractionPayload = { characters: [], scenes: [], props: [], worldview: [] };

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
  // 角色没有 description 字段（v3 起用 appearance/personality），过滤条件只看 name；
  // 场景/道具/世界观仍要求 name+description。
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
      stateLabel: typeof character.stateLabel === "string" ? character.stateLabel : "",
      stateNote: typeof character.stateNote === "string" ? character.stateNote : "",
      description: typeof character.description === "string" ? character.description : "",
    }));
  return {
    characters,
    scenes: items(source.scenes),
    props: items(source.props),
    worldview: items(source.worldview).map((item) => ({ name: item.name, description: item.description })),
  };
}

function newStateId(): string {
  return `state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildInitialStates(item: ReferenceExtractCharacter | ReferenceExtractItem, chapterOrder?: number): StoryAssetState[] {
  const imagePrompt = item.imagePrompt?.trim();
  if (!imagePrompt) {
    return [];
  }
  const voicePrompt = (item as ReferenceExtractCharacter).voicePrompt?.trim();
  const description = (item as ReferenceExtractCharacter).appearance?.trim() || item.description?.trim() || imagePrompt;
  return [{
    id: newStateId(),
    label: "初始",
    description,
    imagePrompt,
    ...(voicePrompt ? { voicePrompt } : {}),
    ...(chapterOrder ? { chapterOrder } : {}),
  }];
}

// 追加外观状态：states 数组末尾追加，并把基础画面/音色字段同步为最新状态——
// 生图/配音链路读的是基础字段（facePrompt/appearance/voiceTexture…），换装、受伤等
// 新状态会直接反映到后续的角色设计图与配音里；states 数组保留完整变化史。
async function appendCharacterState(
  novelId: string,
  current: StorySettingsCharacter,
  item: ReferenceExtractCharacter,
  chapterOrder?: number,
): Promise<void> {
  const nextState: StoryAssetState = {
    id: newStateId(),
    label: item.stateLabel?.trim() || "新状态",
    description: item.stateNote?.trim() || item.description || "",
    imagePrompt: item.imagePrompt?.trim() || current.facePrompt || "",
    ...(item.voicePrompt?.trim() ? { voicePrompt: item.voicePrompt.trim() } : {}),
    ...(chapterOrder ? { chapterOrder } : {}),
  };
  await updateStorySettingsCharacter(novelId, current.id, {
    states: [...current.states, nextState],
    facePrompt: nextState.imagePrompt,
    voiceTexture: item.voicePrompt?.trim() || current.voiceTexture,
  });
}

async function appendSceneState(
  novelId: string,
  current: StorySettingsScene,
  item: ReferenceExtractItem,
  chapterOrder?: number,
): Promise<void> {
  const nextState: StoryAssetState = {
    id: newStateId(),
    label: item.stateLabel?.trim() || "新状态",
    description: item.stateNote?.trim() || item.description,
    imagePrompt: item.imagePrompt?.trim() || current.environmentPrompt || "",
    ...(chapterOrder ? { chapterOrder } : {}),
  };
  await updateStorySettingsScene(novelId, current.id, {
    states: [...current.states, nextState],
    environmentPrompt: nextState.imagePrompt,
  });
}

async function appendPropState(
  novelId: string,
  current: StorySettingsProp,
  item: ReferenceExtractItem,
  chapterOrder?: number,
): Promise<void> {
  const nextState: StoryAssetState = {
    id: newStateId(),
    label: item.stateLabel?.trim() || "新状态",
    description: item.stateNote?.trim() || item.description,
    imagePrompt: item.imagePrompt?.trim() || current.visualPrompt || "",
    ...(chapterOrder ? { chapterOrder } : {}),
  };
  await updateStorySettingsProp(novelId, current.id, {
    states: [...current.states, nextState],
    visualPrompt: nextState.imagePrompt,
  });
}

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
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const itemKey = (group: "characters" | "scenes" | "props" | "worldview", index: number) => `${group}:${index}`;
  const toggleSelected = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  const selectGroup = (group: "characters" | "scenes" | "props" | "worldview", checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      extraction[group].forEach((_item, index) => {
        const key = itemKey(group, index);
        if (checked) {
          next.add(key);
        } else {
          next.delete(key);
        }
      });
      return next;
    });
  };

  const chapterOrder = chapter?.order;

  const createSelectedMutation = useMutation({
    mutationFn: async () => {
      const pickedCharacters = extraction.characters.filter((_item, index) => selected.has(itemKey("characters", index)));
      const pickedScenes = extraction.scenes.filter((_item, index) => selected.has(itemKey("scenes", index)));
      const pickedProps = extraction.props.filter((_item, index) => selected.has(itemKey("props", index)));

      const failedKeys = new Set<string>();
      let created = 0;
      let statesAdded = 0;

      if (pickedCharacters.length > 0) {
        const existing = await getStorySettingsCharacters(input.novelId);
        const byName = new Map((existing.data ?? []).map((item) => [item.name.trim(), item]));
        for (const item of pickedCharacters) {
          try {
            const current = byName.get(item.name.trim());
            if (current) {
              if (item.stateLabel?.trim()) {
                await appendCharacterState(input.novelId, current, item, chapterOrder);
                statesAdded += 1;
              }
              // 无状态变化的同名角色视为已存在，直接从建议里移除。
            } else {
              await createStorySettingsCharacter(input.novelId, {
                name: item.name,
                role: item.role,
                appearance: item.appearance || item.description,
                personality: item.personality,
                facePrompt: item.imagePrompt,
                voiceTexture: item.voicePrompt,
                states: buildInitialStates(item, chapterOrder),
              });
              created += 1;
            }
          } catch {
            failedKeys.add(`characters:${item.name}`);
          }
        }
      }

      if (pickedScenes.length > 0) {
        const existing = await getStorySettingsScenes(input.novelId);
        const byName = new Map((existing.data ?? []).map((item) => [item.name.trim(), item]));
        for (const item of pickedScenes) {
          try {
            const current = byName.get(item.name.trim());
            if (current) {
              if (item.stateLabel?.trim()) {
                await appendSceneState(input.novelId, current, item, chapterOrder);
                statesAdded += 1;
              }
            } else {
              await createStorySettingsScene(input.novelId, {
                name: item.name,
                summary: item.description,
                environmentPrompt: item.imagePrompt,
                states: buildInitialStates(item, chapterOrder),
              });
              created += 1;
            }
          } catch {
            failedKeys.add(`scenes:${item.name}`);
          }
        }
      }

      if (pickedProps.length > 0) {
        const existing = await getStorySettingsProps(input.novelId);
        const byName = new Map((existing.data ?? []).map((item) => [item.name.trim(), item]));
        for (const item of pickedProps) {
          try {
            const current = byName.get(item.name.trim());
            if (current) {
              if (item.stateLabel?.trim()) {
                await appendPropState(input.novelId, current, item, chapterOrder);
                statesAdded += 1;
              }
            } else {
              await createStorySettingsProp(input.novelId, {
                name: item.name,
                description: item.description,
                visualPrompt: item.imagePrompt,
                states: buildInitialStates(item, chapterOrder),
              });
              created += 1;
            }
          } catch {
            failedKeys.add(`props:${item.name}`);
          }
        }
      }

      const pickedWorldview = extraction.worldview.filter((_item, index) => selected.has(itemKey("worldview", index)));
      if (pickedWorldview.length > 0) {
        try {
          const worldResponse = await getStorySettingsWorld(input.novelId);
          const existing = worldResponse.data?.keySettings ?? [];
          const existingTitles = new Set(existing.map((item) => item.title.trim()));
          const additions = pickedWorldview
            .filter((item) => !existingTitles.has(item.name.trim()))
            .map((item) => ({ title: item.name, content: item.description }));
          await updateStorySettingsWorld(input.novelId, { keySettings: [...existing, ...additions] });
          created += additions.length;
        } catch {
          pickedWorldview.forEach((item) => failedKeys.add(`worldview:${item.name}`));
        }
      }

      const remaining: ReferenceExtractionPayload = {
        characters: extraction.characters.filter((item, index) =>
          !selected.has(itemKey("characters", index)) || failedKeys.has(`characters:${item.name}`)),
        scenes: extraction.scenes.filter((item, index) =>
          !selected.has(itemKey("scenes", index)) || failedKeys.has(`scenes:${item.name}`)),
        props: extraction.props.filter((item, index) =>
          !selected.has(itemKey("props", index)) || failedKeys.has(`props:${item.name}`)),
        worldview: extraction.worldview.filter((item, index) =>
          !selected.has(itemKey("worldview", index)) || failedKeys.has(`worldview:${item.name}`)),
      };
      const remainingCount = remaining.characters.length + remaining.scenes.length + remaining.props.length + remaining.worldview.length;
      workspace.applyReferenceExtraction(remainingCount > 0 ? JSON.stringify(remaining) : null);
      setSelected(new Set());

      if (created > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(input.novelId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsCharacters(input.novelId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScenes(input.novelId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsProps(input.novelId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsWorld(input.novelId) }),
        ]);
      }
      return { created, statesAdded, failed: failedKeys.size };
    },
    onSuccess: ({ created, statesAdded, failed }) => {
      if (failed > 0) {
        toast.error(`已创建 ${created} 项、新增 ${statesAdded} 个状态，${failed} 项失败（保留在列表可重试）。`);
      } else if (statesAdded > 0) {
        toast.success(`已创建 ${created} 项设定，新增 ${statesAdded} 个外观状态。`);
      } else {
        toast.success(`已创建 ${created} 项设定。`);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建设定失败，请重试。"),
  });

  const totalItems = extraction.characters.length + extraction.scenes.length + extraction.props.length + extraction.worldview.length;

  return {
    extraction,
    selected,
    itemKey,
    toggleSelected,
    selectGroup,
    createSelectedMutation,
    totalItems,
  };
}

export type ReferenceExtractStage = ReturnType<typeof useReferenceExtractStage>;
