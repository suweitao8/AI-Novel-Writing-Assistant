import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createStorySettingsCharacter,
  createStorySettingsScene,
  getStorySettingsWorld,
  updateStorySettingsWorld,
} from "@/api/story/storySettings";
import { previewChapterReferenceExtract } from "@/api/novel/chapters";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import type {
  ReferenceExtractionPayload,
  ReferenceExtractItem,
} from "@ai-novel/shared/types/novelReferenceExtraction";

// 「提取」页签的管线：从当前参考文本 AI 提取角色/场景/世界观建议，
// 用户勾选确认后创建进设定中心（建议而已，不自动写入）。提取结果按小说存
// 浏览器本地（与参考文本同策略）；创建成功或已存在同名条目后从建议列表移除，
// 失败的保留在列表里供重试。
function extractionStorageKey(novelId: string): string {
  return `drama-studio-extract:${novelId}`;
}

const EMPTY_EXTRACTION: ReferenceExtractionPayload = { characters: [], scenes: [], worldview: [] };

function normalizeExtraction(raw: unknown): ReferenceExtractionPayload {
  const source = (raw ?? {}) as Partial<ReferenceExtractionPayload>;
  const items = (list: unknown): ReferenceExtractItem[] =>
    Array.isArray(list)
      ? list.filter((item): item is ReferenceExtractItem => {
          const candidate = item as ReferenceExtractItem;
          return typeof candidate?.name === "string" && candidate.name.trim().length > 0
            && typeof candidate?.description === "string";
        })
      : [];
  return {
    characters: items(source.characters).map((item) => ({
      ...item,
      role: String((item as unknown as { role?: string }).role || "配角"),
    })),
    scenes: items(source.scenes),
    worldview: items(source.worldview),
  };
}

export function useReferenceExtractStage(input: {
  novelId: string;
  chapterId: string | null;
  referenceText: string;
}) {
  const queryClient = useQueryClient();
  const [extraction, setExtraction] = useState<ReferenceExtractionPayload>(EMPTY_EXTRACTION);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(extractionStorageKey(input.novelId));
      setExtraction(raw ? normalizeExtraction(JSON.parse(raw)) : EMPTY_EXTRACTION);
    } catch {
      setExtraction(EMPTY_EXTRACTION);
    }
    setSelected(new Set());
  }, [input.novelId]);

  const persist = (next: ReferenceExtractionPayload) => {
    setExtraction(next);
    try {
      window.localStorage.setItem(extractionStorageKey(input.novelId), JSON.stringify(next));
    } catch {
      // 本地存储不可用时仅保留内存态
    }
  };

  const extractMutation = useMutation({
    mutationFn: async () => {
      if (!input.chapterId) {
        throw new Error("还没有章节。");
      }
      return previewChapterReferenceExtract(input.novelId, input.chapterId, input.referenceText.trim());
    },
    onSuccess: (response) => {
      const next = normalizeExtraction(response.data ?? EMPTY_EXTRACTION);
      persist(next);
      const count = next.characters.length + next.scenes.length + next.worldview.length;
      if (count === 0) {
        toast.error("没有提取到内容。");
        return;
      }
      toast.success(`已提取 ${count} 条：角色 ${next.characters.length}、场景 ${next.scenes.length}、世界观 ${next.worldview.length}。`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "提取失败，请重试。"),
  });

  const itemKey = (group: "characters" | "scenes" | "worldview", index: number) => `${group}:${index}`;
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
  const selectGroup = (group: "characters" | "scenes" | "worldview", checked: boolean) => {
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

  const createSelectedMutation = useMutation({
    mutationFn: async () => {
      const pickedCharacters = extraction.characters.filter((_item, index) => selected.has(itemKey("characters", index)));
      const pickedScenes = extraction.scenes.filter((_item, index) => selected.has(itemKey("scenes", index)));
      const pickedWorldview = extraction.worldview.filter((_item, index) => selected.has(itemKey("worldview", index)));

      // failedKey 记录创建失败的条目，留在建议列表里供重试；创建成功/已存在同名的移除。
      const failedKeys = new Set<string>();
      let created = 0;
      let failed = 0;

      for (const character of pickedCharacters) {
        try {
          await createStorySettingsCharacter(input.novelId, {
            name: character.name,
            role: character.role,
            personality: character.description,
          });
          created += 1;
        } catch {
          failed += 1;
          failedKeys.add(`characters:${character.name}`);
        }
      }
      for (const scene of pickedScenes) {
        try {
          await createStorySettingsScene(input.novelId, {
            name: scene.name,
            summary: scene.description,
          });
          created += 1;
        } catch {
          failed += 1;
          failedKeys.add(`scenes:${scene.name}`);
        }
      }
      if (pickedWorldview.length > 0) {
        try {
          const worldResponse = await getStorySettingsWorld(input.novelId);
          const existing = worldResponse.data?.keySettings ?? [];
          const existingTitles = new Set(existing.map((item) => item.title.trim()));
          const additions = pickedWorldview
            .filter((item) => !existingTitles.has(item.name.trim()))
            .map((item) => ({ title: item.name, content: item.description }));
          await updateStorySettingsWorld(input.novelId, {
            keySettings: [...existing, ...additions],
          });
          created += additions.length;
        } catch {
          failed += pickedWorldview.length;
          pickedWorldview.forEach((item) => failedKeys.add(`worldview:${item.name}`));
        }
      }

      const remaining: ReferenceExtractionPayload = {
        characters: extraction.characters.filter((item, index) =>
          !selected.has(itemKey("characters", index)) || failedKeys.has(`characters:${item.name}`)),
        scenes: extraction.scenes.filter((item, index) =>
          !selected.has(itemKey("scenes", index)) || failedKeys.has(`scenes:${item.name}`)),
        worldview: extraction.worldview.filter((item, index) =>
          !selected.has(itemKey("worldview", index)) || failedKeys.has(`worldview:${item.name}`)),
      };
      persist(remaining);
      setSelected(new Set());

      if (created > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(input.novelId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsCharacters(input.novelId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScenes(input.novelId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsWorld(input.novelId) }),
        ]);
      }
      return { created, failed };
    },
    onSuccess: ({ created, failed }) => {
      if (failed > 0) {
        toast.error(`已创建 ${created} 项，${failed} 项失败，已保留在列表中可重试。`);
      } else {
        toast.success(`已创建 ${created} 项设定。`);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建设定失败，请重试。"),
  });

  const totalItems = extraction.characters.length + extraction.scenes.length + extraction.worldview.length;
  const extractDisabledReason = !input.chapterId
    ? "还没有章节。"
    : !input.referenceText.trim()
      ? "还没有参考内容。"
      : null;

  return {
    extraction,
    selected,
    itemKey,
    toggleSelected,
    selectGroup,
    extractMutation,
    extractDisabledReason,
    createSelectedMutation,
    totalItems,
  };
}

export type ReferenceExtractStage = ReturnType<typeof useReferenceExtractStage>;
