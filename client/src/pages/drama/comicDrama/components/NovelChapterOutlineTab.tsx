import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { NovelOutlineWorkspace } from "@/hooks/useNovelOutlineWorkspace";

interface NovelChapterOutlineTabProps {
  workspace: NovelOutlineWorkspace;
  onGoOutline: () => void;
}

// 漫剧工作室「小说 · 细纲」页签：手动整理分章剧情走向（可增删调序），
// 确认保存后成为 AI 写作遵循的剧情契约；写到某一章时，逐章的深化在顶栏「章节管理」里做。
export default function NovelChapterOutlineTab(props: NovelChapterOutlineTabProps) {
  const { workspace, onGoOutline } = props;
  const draftChapters = workspace.draftChapters;

  if (!draftChapters || draftChapters.length === 0) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6">
          <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-12 text-center">
            <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
              还没有分章细纲。想先规划全书的，可以在这里逐章写下剧情走向；
              想直接开写的，去顶栏「章节管理」写下当前章的大概故事，让 AI 展开成这一章的细纲。
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" variant="outline" onClick={onGoOutline}>
                去写大纲
              </Button>
              <Button size="sm" onClick={workspace.appendChapter}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />加一章
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">分章细纲</span>
          {workspace.confirmedChapterCount > 0 ? (
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              已确认 {workspace.confirmedChapterCount} 章
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">共 {draftChapters.length} 章，标题与梗概可以直接修改。</span>
        </div>

        <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
          <label htmlFor="drama-draft-premise" className="text-sm font-medium text-foreground">全书梗概</label>
          <textarea
            className="min-h-[72px] w-full rounded-md border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            id="drama-draft-premise"
            value={workspace.draftPremise}
            rows={2}
            maxLength={600}
            onChange={(event) => workspace.setDraftPremise(event.target.value)}
           />
        </div>

        <ol className="space-y-3">
          {draftChapters.map((chapter, index) => (
            <li key={`drama-draft-chapter-${index}`} className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-foreground">{index + 1}</span>
                <Input
                  value={chapter.title}
                  maxLength={60}
                  placeholder="本章标题"
                  className="h-9 flex-1"
                  onChange={(event) => workspace.updateChapter(index, { title: event.target.value })}
                 />
                <div className="flex items-center gap-1">
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="上移" aria-label="上移本章" disabled={index === 0} onClick={() => workspace.moveChapter(index, -1)}>
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="下移" aria-label="下移本章" disabled={index === draftChapters.length - 1} onClick={() => workspace.moveChapter(index, 1)}>
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="删除本章" aria-label="删除本章" onClick={() => workspace.removeChapter(index)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <textarea
                value={chapter.synopsis}
                rows={3}
                maxLength={600}
                placeholder="本章梗概：发生了什么、推进了什么、结尾钩子是什么"
                className="mt-2 w-full rounded-md border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onChange={(event) => workspace.updateChapter(index, { synopsis: event.target.value })}
               />
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={workspace.appendChapter}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />加一章
          </Button>
          <div className="flex-1" />
          <Button
            type="button"
            disabled={!workspace.canConfirmChapters || workspace.saveChaptersMutation.isPending}
            title={!workspace.canConfirmChapters ? "细纲至少 3 章，并且需要填写全书梗概。" : undefined}
            onClick={() => workspace.saveChaptersMutation.mutate()}
          >
            {workspace.saveChaptersMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />}
            确认并保存细纲
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
