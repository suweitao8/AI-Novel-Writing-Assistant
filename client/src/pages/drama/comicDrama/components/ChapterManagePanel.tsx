import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, Loader2, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import type { Chapter } from "@ai-novel/shared/types/novel";
import type {
  ChapterDetailOutlineBeat,
  ChapterDetailOutlineDocument,
} from "@ai-novel/shared/types/novelChapterDetailOutline";
import {
  createNovelChapter,
  getNovelChapters,
  previewChapterDetailOutline,
  saveChapterDetailOutline,
  updateNovelChapter,
} from "@/api/novel/chapters";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const CHAPTERS_QUERY_KEY = "drama-studio-chapters";

function chapterWordCount(content?: string | null): number {
  return (content ?? "").replace(/\s+/g, "").length;
}

function chapterStatusMeta(chapter: Chapter): { label: string; tone: string } {
  if (chapterWordCount(chapter.content) > 0) return { label: "有正文", tone: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" };
  if ((chapter.expectation ?? "").trim()) return { label: "有大纲", tone: "border-primary/40 bg-primary/10 text-primary" };
  return { label: "空白章", tone: "text-muted-foreground" };
}

function parseDetailOutline(chapter: Chapter): { beats: ChapterDetailOutlineBeat[]; notes: string | null } | null {
  const raw = chapter.detailOutlineJson?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ChapterDetailOutlineDocument;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.beats)) return null;
    return { beats: parsed.beats, notes: parsed.notes ?? null };
  } catch {
    return null;
  }
}

export default function ChapterManagePanel(props: { novelId: string; directorTaskActive: boolean }) {
  const { novelId, directorTaskActive } = props;
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);

  const chaptersQuery = useQuery({
    queryKey: [CHAPTERS_QUERY_KEY, novelId],
    queryFn: () => getNovelChapters(novelId),
  });
  const chapters = useMemo(
    () => [...(chaptersQuery.data?.data ?? [])].sort((left, right) => left.order - right.order),
    [chaptersQuery.data],
  );
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredChapters = normalizedKeyword
    ? chapters.filter(
      (chapter) =>
        chapter.title.toLowerCase().includes(normalizedKeyword)
          || String(chapter.order).includes(normalizedKeyword),
    )
    : chapters;
  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId) ?? null;

  const invalidateChapters = async () => {
    await queryClient.invalidateQueries({ queryKey: [CHAPTERS_QUERY_KEY, novelId] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="按章节序号或标题搜索"
            className="pl-9"
          />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {normalizedKeyword ? `${filteredChapters.length}/${chapters.length} 章` : `${chapters.length} 章`}
        </span>
        <Button
          className="ml-auto"
          size="sm"
          onClick={() => setCreateOpen(true)}
          disabled={directorTaskActive}
          title={directorTaskActive ? "AI 正在写作，暂停后再手动添加章节。" : undefined}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />新建章节
        </Button>
      </div>

      {chaptersQuery.isPending ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />正在加载章节
        </div>
      ) : chapters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">还没有章节。可以先写本章大纲并让 AI 展开细纲，也可以去「创作」页签写全书大纲交给 AI。</p>
          <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)} disabled={directorTaskActive}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />新建第一章
          </Button>
        </div>
      ) : filteredChapters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-12 text-center text-sm text-muted-foreground">
          没有匹配「{keyword.trim()}」的章节。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredChapters.map((chapter) => {
            const status = chapterStatusMeta(chapter);
            const summary = (chapter.expectation ?? "").trim() || (chapter.content ?? "").replace(/\s+/g, " ").trim();
            return (
              <button
                key={chapter.id}
                type="button"
                onClick={() => setSelectedChapterId(chapter.id)}
                className="group text-left"
              >
                <Card className="h-full rounded-lg border-border/70 bg-background transition group-hover:border-primary/35 group-hover:shadow-sm">
                  <CardContent className="flex h-full min-h-[132px] flex-col gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0 tabular-nums">第 {chapter.order} 章</Badge>
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground group-hover:text-primary">{chapter.title}</span>
                    </div>
                    <Badge variant="outline" className={cn("w-fit", status.tone)}>{status.label}</Badge>
                    <span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {summary ? summary.slice(0, 120) : "还没有大纲，点开写下这一章要发生什么。"}
                    </span>
                    <span className="mt-auto pt-1 text-xs tabular-nums text-muted-foreground">
                      {chapterWordCount(chapter.content).toLocaleString()} 字
                      {parseDetailOutline(chapter) ? " · 已有细纲" : ""}
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

      {selectedChapter ? (
        <ChapterDetailDialog
          novelId={novelId}
          chapter={selectedChapter}
          onClose={() => setSelectedChapterId(null)}
          onChanged={invalidateChapters}
        />
      ) : null}
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
      toast.success(`第 ${nextOrder} 章已创建，可以继续写本章大纲。`);
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
        description="写下这一章的标题和大纲：大纲会被 AI 展开成细纲节拍，也是写作时的依据。"
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

function ChapterDetailDialog(props: {
  novelId: string;
  chapter: Chapter;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { novelId, chapter, onClose, onChanged } = props;
  const [synopsis, setSynopsis] = useState(() => (chapter.expectation ?? "").trim());
  const [beats, setBeats] = useState<ChapterDetailOutlineBeat[] | null>(() => parseDetailOutline(chapter)?.beats ?? null);
  const [notes, setNotes] = useState<string>(() => parseDetailOutline(chapter)?.notes ?? "");

  const saveSynopsisMutation = useMutation({
    mutationFn: () => updateNovelChapter(novelId, chapter.id, { expectation: synopsis.trim() || "" }),
    onSuccess: async () => {
      await onChanged();
      toast.success("本章大纲已保存。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存大纲失败，请重试。"),
  });

  const previewMutation = useMutation({
    mutationFn: () => previewChapterDetailOutline(novelId, chapter.id),
    onSuccess: (response) => {
      setBeats(response.data?.beats ?? []);
      setNotes(response.data?.notes ?? "");
      toast.success("细纲草稿已生成，确认或修改后保存。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "细纲推理失败，请稍后重试。"),
  });

  const saveOutlineMutation = useMutation({
    mutationFn: () => saveChapterDetailOutline(novelId, chapter.id, { beats: beats ?? [], notes: notes.trim() || null }),
    onSuccess: async () => {
      await onChanged();
      toast.success("本章细纲已保存。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存细纲失败，请重试。"),
  });

  const synopsisEmpty = !synopsis.trim();
  const beatCount = beats?.length ?? 0;

  const updateBeat = (index: number, patch: Partial<ChapterDetailOutlineBeat>) => {
    setBeats((current) => current?.map((beat, i) => (i === index ? { ...beat, ...patch } : beat)) ?? null);
  };
  const removeBeat = (index: number) => {
    setBeats((current) => current?.filter((_, i) => i !== index) ?? null);
  };
  const addBeat = () => {
    setBeats((current) => [...(current ?? []), { summary: "", keyEvent: null }]);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AppDialogContent
        title={`第 ${chapter.order} 章 · ${chapter.title}`}
        description="写本章大纲，让 AI 展开成细纲节拍，跟着节拍写正文或交给 AI 写。"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>关闭</Button>
          </>
        }
      >
        <div className="space-y-6">
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">本章大纲</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveSynopsisMutation.mutate()}
                disabled={saveSynopsisMutation.isPending || synopsis.trim() === (chapter.expectation ?? "").trim()}
              >
                {saveSynopsisMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                保存大纲
              </Button>
            </div>
            <textarea
              value={synopsis}
              onChange={(event) => setSynopsis(event.target.value)}
              placeholder="这一章要发生什么、推进什么、结尾留什么钩子。"
              className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3.5 py-3 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">AI 细纲节拍</h3>
              <AiButton
                size="sm"
                variant="outline"
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending || synopsisEmpty}
                title={synopsisEmpty ? "先写本章大纲，AI 才能推理细纲。" : undefined}
              >
                {previewMutation.isPending
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                {beatCount > 0 ? "重新推理细纲" : "AI 推理细纲"}
              </AiButton>
            </div>

            {beatCount === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                {synopsisEmpty
                  ? "先在上方写本章大纲，再让 AI 展开成 3～10 个情节节拍。"
                  : "还没有细纲。点「AI 推理细纲」把大纲展开成情节节拍，也可以手动添加。"}
              </div>
            ) : (
              <div className="space-y-2">
                {beats?.map((beat, index) => (
                  <div key={index} className="flex items-start gap-2 rounded-xl border border-border/70 bg-background p-2.5">
                    <span className="mt-1.5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Input
                        value={beat.summary}
                        onChange={(event) => updateBeat(index, { summary: event.target.value })}
                        placeholder="这一拍发生了什么"
                        className="h-8 text-sm"
                      />
                      <Input
                        value={beat.keyEvent ?? ""}
                        onChange={(event) => updateBeat(index, { keyEvent: event.target.value })}
                        placeholder="关键事件（选填）"
                        className="h-8 text-xs text-muted-foreground"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`删除第 ${index + 1} 拍`}
                      onClick={() => removeBeat(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button type="button" variant="ghost" size="sm" onClick={addBeat}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />添加一拍
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveOutlineMutation.mutate()}
                    disabled={saveOutlineMutation.isPending || beatCount < 3 || beatCount > 10}
                    title={beatCount < 3 ? "细纲至少 3 拍。" : beatCount > 10 ? "细纲最多 10 拍。" : undefined}
                  >
                    {saveOutlineMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    保存细纲
                  </Button>
                </div>
                {notes.trim() ? (
                  <p className="rounded-lg bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">AI 补充说明：{notes}</p>
                ) : null}
              </div>
            )}
          </section>

          <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/20 px-3 py-2.5">
            <span className="text-xs tabular-nums text-muted-foreground">
              正文 {chapterWordCount(chapter.content).toLocaleString()} 字
            </span>
            <Button asChild size="sm" variant="ghost">
              <Link to={`/novels/${novelId}/simple`}>
                <BookOpenText className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />去阅读台写正文
              </Link>
            </Button>
          </section>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
