import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getStorySettingsCharacters,
  getStorySettingsProps,
  getStorySettingsScenes,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import LineNumberedTextarea, { type OutlineEntityHighlight } from "@/pages/drama/comicDrama/components/LineNumberedTextarea";
import OutlineSettingsAside from "@/pages/drama/comicDrama/components/OutlineSettingsAside";
import type { NovelOutlineWorkspace } from "@/hooks/useNovelOutlineWorkspace";

const AUTOSAVE_DELAY_MS = 1200;
const DEFAULT_LINE_COUNT = 50;

interface NovelOutlineTabProps {
  novelId: string;
  workspace: NovelOutlineWorkspace;
}

// 漫剧工作室「小说 · 大纲」页签：左边是代码编辑器式的大纲编辑区（默认铺满 50 行
// 编号空行、回车加行、修改后自动静默保存），右边是设定速建面板——创建的角色/
// 场景/道具名会实时高亮在大纲正文里。「解析」按钮在上方子页签行右侧，
// 逐章细化在顶栏「章节管理」里。
export default function NovelOutlineTab(props: NovelOutlineTabProps) {
  const { novelId, workspace } = props;
  const savePending = workspace.saveOutlineMutation.isPending;

  const mutateRef = useRef(workspace.saveOutlineMutation.mutate);
  mutateRef.current = workspace.saveOutlineMutation.mutate;
  const latestRef = useRef({ dirty: workspace.outlineDirty, pending: savePending });
  latestRef.current = { dirty: workspace.outlineDirty, pending: savePending };

  useEffect(() => {
    if (!workspace.outlineDirty || savePending) {
      return;
    }
    const timer = setTimeout(() => mutateRef.current({ silent: true }), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [workspace.outlineText, workspace.outlineDirty, savePending]);

  // 切走页签时把还没到自动保存间隔的修改立即落库，避免丢稿。
  useEffect(() => () => {
    const { dirty, pending } = latestRef.current;
    if (dirty && !pending) {
      mutateRef.current({ silent: true });
    }
  }, []);

  // 大纲为空白时默认铺满 50 行编号空行（一次性；trim 后判空，纯换行不会触发自动保存）。
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || workspace.outlineQuery.isPending) {
      return;
    }
    seededRef.current = true;
    const hasOutline = Boolean((workspace.outlineState?.outline ?? "").trim()) || workspace.outlineText.trim().length > 0;
    if (!hasOutline) {
      workspace.setOutlineText("\n".repeat(DEFAULT_LINE_COUNT - 1));
    }
  }, [workspace.outlineQuery.isPending, workspace.outlineState, workspace.outlineText]);

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

  const highlight = useMemo<OutlineEntityHighlight>(
    () => ({
      characters: (charactersQuery.data?.data ?? []).map((character) => character.name),
      scenes: (scenesQuery.data?.data ?? []).map((scene) => scene.name),
      props: (propsQuery.data?.data ?? []).map((prop) => prop.name),
    }),
    [charactersQuery.data, scenesQuery.data, propsQuery.data],
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <LineNumberedTextarea
        id="drama-outline-textarea"
        ariaLabel="大纲"
        value={workspace.outlineText}
        minRows={DEFAULT_LINE_COUNT}
        maxLength={20000}
        placeholder="写下这本书的走向"
        highlight={highlight}
        onChange={workspace.setOutlineText}
        onBlur={() => {
          if (workspace.outlineDirty && !savePending) {
            mutateRef.current({ silent: true });
          }
        }}
      />
      <OutlineSettingsAside
        novelId={novelId}
        characters={charactersQuery.data?.data ?? []}
        scenes={scenesQuery.data?.data ?? []}
        props={propsQuery.data?.data ?? []}
      />
    </div>
  );
}
