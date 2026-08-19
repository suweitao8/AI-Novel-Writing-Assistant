import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
import type { Chapter } from "@ai-novel/shared/types/novel";
import { createNovelChapter } from "@/api/novel/chapters";
import { DRAMA_CHAPTERS_QUERY_KEY } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

function chapterWordCount(content?: string | null): number {
  return (content ?? "").replace(/\s+/g, "").length;
}

interface ChapterManagePanelProps {
  novelId: string;
  chapters: Chapter[];
  currentChapterId: string | null;
  directorTaskActive: boolean;
  onSelectChapter: (chapter: Chapter) => void;
}

// 章节管理面板：工具栏（新建 / 搜索框 / 搜索按钮）+ 简化卡片（第几章、章节名、字数）。
// 点卡片把该章切为当前章，「初稿 / 正文」等子页签随之更新。
export default function ChapterManagePanel(props: ChapterManagePanelProps) {
  const { novelId, directorTaskActive } = props;
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

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
        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">还没有章节。点「新建章节」写下第一章的标题和这一章要发生什么。</p>
          <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)} disabled={directorTaskActive}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />新建第一章
          </Button>
        </div>
      ) : filteredChapters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-10 text-center text-sm text-muted-foreground">
          没有「{appliedKeyword.trim()}」的章节。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filteredChapters.map((chapter) => {
            const isCurrent = chapter.id === props.currentChapterId;
            return (
              <button
                key={chapter.id}
                type="button"
                onClick={() => props.onSelectChapter(chapter)}
                className="group text-left"
              >
                <Card className={cn(
                  "rounded-lg border-border/70 bg-background transition group-hover:border-primary/35 group-hover:shadow-sm",
                  isCurrent && "border-primary/50 ring-1 ring-primary/30",
                )}>
                  <CardContent className="flex items-center justify-between gap-3 p-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                        第 {chapter.order} 章
                      </span>
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground group-hover:text-primary">
                        {chapter.title}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {chapterWordCount(chapter.content).toLocaleString()} 字
                    </span>
                  </CardContent>
                </Card>
              </button>
            );
          })}
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

function CreateChapterDialog(props: {
  novelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextOrder: number;
  onCreated: () => Promise<void>;
}) {
  const { novelId, open, onOpenChange, nextOrder, onCreated } = props;
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      createNovelChapter(novelId, {
        title: title.trim(),
        order: nextOrder,
        expectation: synopsis.trim() || undefined,
      }),
    onSuccess: async () => {
      await onCreated();
      toast.success(`第 ${nextOrder} 章已创建，可以继续写本章初稿。`);
      setTitle("");
      setSynopsis("");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建章节失败，请重试。"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title={`新建第 ${nextOrder} 章`}
        description="写下这一章的标题和大纲：大纲会被 AI 展开成节拍，也是写作时的依据。"
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!title.trim() || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              创建章节
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">章节标题</label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：雨夜的第一个委托"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">本章大纲（选填，可之后再补）</label>
            <textarea
              value={synopsis}
              onChange={(event) => setSynopsis(event.target.value)}
              placeholder="这一章要发生什么、推进什么、结尾留什么钩子。"
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3.5 py-3 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
