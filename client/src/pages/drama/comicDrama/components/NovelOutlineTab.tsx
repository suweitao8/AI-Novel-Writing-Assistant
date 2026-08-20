import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, Loader2 } from "lucide-react";
import {
  getStorySettingsCharacters,
  getStorySettingsProps,
  getStorySettingsScenes,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import LineNumberedTextarea, { type OutlineEntityHighlight } from "@/pages/drama/comicDrama/components/LineNumberedTextarea";
import OutlineSettingsAside from "@/pages/drama/comicDrama/components/OutlineSettingsAside";
import type { NovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";
import { Button } from "@/components/ui/button";

const AUTOSAVE_DELAY_MS = 1200;

interface NovelOutlineTabProps {
  novelId: string;
  workspace: NovelChapterWorkspace;
  onOpenChapterManage: () => void;
}

// 漫剧工作室「当前 · 初稿」页签：当前章的分镜式初稿（每单元「分镜：画面」+「旁白/角色（神态）：内容」
// 两行一组、组间空行，对话组整组铺淡蓝底、场景切换行（【场景：…】）淡绿底、角色状态切换行淡黄底加粗；
// 修改后自动静默保存），右侧是设定资产面板（快速查找与创建，名字在本章初稿里高亮）。
// 「解析」按钮在上方子页签行右侧，按本章初稿生成本章节拍。
export default function NovelOutlineTab(props: NovelOutlineTabProps) {
  const { novelId, workspace } = props;
  const savePending = workspace.savePending;
  const dirty = workspace.expectationDirty;

  const autosaveRef = useRef({ dirty, pending: savePending, flush: workspace.flushExpectationSave });
  autosaveRef.current = { dirty, pending: savePending, flush: workspace.flushExpectationSave };

  useEffect(() => {
    if (!dirty || savePending) {
      return;
    }
    const timer = setTimeout(() => autosaveRef.current.flush(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [workspace.expectationText, dirty, savePending]);

  // 切走页签时把还没到自动保存间隔的修改立即落库，避免丢稿。
  useEffect(() => () => {
    const { dirty: wasDirty, pending, flush } = autosaveRef.current;
    if (wasDirty && !pending) {
      flush();
    }
  }, []);

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

  if (workspace.chaptersQuery.isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> 正在加载章节
      </div>
    );
  }

  if (!workspace.currentChapter) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-background/60 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">还没有章节。</p>
        <Button className="mt-4" size="sm" onClick={props.onOpenChapterManage}>
          <BookOpenText className="mr-1.5 h-4 w-4" aria-hidden="true" />打开章节管理新建第一章
        </Button>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <LineNumberedTextarea
        id="drama-outline-textarea"
        ariaLabel="本章初稿"
        value={workspace.expectationText}
        minRows={24}
        maxLength={20000}
        placeholder="写下这一章的故事走向"
        storyboardMode
        highlight={highlight}
        onChange={workspace.setExpectationText}
        onBlur={workspace.flushExpectationSave}
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
