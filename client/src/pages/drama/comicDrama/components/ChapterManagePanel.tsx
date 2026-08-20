import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import type { Chapter } from "@ai-novel/shared/types/novel";
import CreateChapterDialog from "@/pages/drama/comicDrama/components/CreateChapterDialog";
import { DRAMA_CHAPTERS_QUERY_KEY } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// 列表固定高度：空态与结果态一致，避免章节增删/搜索切换时弹窗高度跳动。
const LIST_HEIGHT_CLASS = "h-[56vh]";

interface ChapterManagePanelProps {
  novelId: string;
  chapters: Chapter[];
  currentChapterId: string | null;
  directorTaskActive: boolean;
  onSelectChapter: (chapter: Chapter) => void;
}

// 章节管理面板：工具栏（新建 / 搜索）+ 极简章节卡（第几章 + 标题，桌面一行 5 个）。
// 打开时自动滚到正在编辑的章节；点卡片把该章切为当前章。
export default function ChapterManagePanel(props: ChapterManagePanelProps) {
  const { novelId, directorTaskActive } = props;
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const currentCardRef = useRef<HTMLButtonElement | null>(null);

  const chapters = useMemo(
    () => [...props.chapters].sort((left, right) => left.order - right.order),
    [props.chapters],
  );
  const normalizedKeyword = appliedKeyword.trim().toLowerCase();
  const filteredChapters = normalizedKeyword
    ? chapters.filter(
        (chapter) =>
          chapter.title.toLowerCase().includes(normalizedKeyword)
          || String(chapter.order).includes(normalizedKeyword),
      )
    : chapters;

  // 面板随弹窗每次打开重新挂载：滚到正在编辑的章节那一行，很长的书不用手动翻。
  useEffect(() => {
    const node = currentCardRef.current;
    if (!node) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      node.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const invalidateChapters = async () => {
    await queryClient.invalidateQueries({ queryKey: [DRAMA_CHAPTERS_QUERY_KEY, novelId] });
  };

  const applySearch = () => {
    setAppliedKeyword(keyword);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="新建章节"
          title="新建章节"
          onClick={() => setCreateOpen(true)}
          disabled={directorTaskActive}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Input
          value={keyword}
          aria-label="搜索章节"
          placeholder="按章节序号或标题搜索"
          maxLength={40}
          className="h-8 min-w-0 flex-1"
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              applySearch();
              event.currentTarget.blur();
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-8 w-8 shrink-0"
          aria-label="搜索"
          onClick={applySearch}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {chapters.length === 0 ? (
        <div className={cn(LIST_HEIGHT_CLASS, "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/60 px-6 text-center")}>
          <p className="text-sm text-muted-foreground">还没有章节。</p>
          <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)} disabled={directorTaskActive}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />新建第一章
          </Button>
        </div>
      ) : (
        <div className={cn(LIST_HEIGHT_CLASS, "overflow-y-auto pr-1")}>
          {filteredChapters.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-background/60 px-6 text-center text-sm text-muted-foreground">
              没有「{appliedKeyword.trim()}」的章节。
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {filteredChapters.map((chapter) => {
                const isCurrent = chapter.id === props.currentChapterId;
                return (
                  <button
                    key={chapter.id}
                    type="button"
                    ref={isCurrent ? currentCardRef : undefined}
                    onClick={() => props.onSelectChapter(chapter)}
                    className="group text-left"
                  >
                    <Card className={cn(
                      "rounded-lg border-border/70 bg-background transition group-hover:border-primary/35 group-hover:shadow-sm",
                      isCurrent && "border-primary/50 ring-1 ring-primary/30",
                    )}>
                      <CardContent className="flex flex-col gap-0.5 p-2.5">
                        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                          第 {chapter.order} 章
                        </span>
                        <span className="w-full truncate text-sm font-semibold text-foreground group-hover:text-primary" title={chapter.title}>
                          {chapter.title}
                        </span>
                      </CardContent>
                    </Card>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <CreateChapterDialog
        novelId={novelId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        nextOrder={chapters.length > 0 ? Math.max(...chapters.map((chapter) => chapter.order)) + 1 : 1}
        onCreated={invalidateChapters}
      />
    </div>
  );
}
