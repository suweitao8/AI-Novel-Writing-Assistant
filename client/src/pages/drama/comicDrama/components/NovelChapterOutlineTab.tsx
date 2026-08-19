import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { NovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";

interface NovelChapterOutlineTabProps {
  workspace: NovelChapterWorkspace;
  onGoOutline: () => void;
}

// 漫剧工作室「小说 · 细纲」页签：当前章的 AI 细纲节拍（由「解析」按本章大纲生成），
// 逐拍可改可增删，3～10 拍确认保存后常驻本章；没有节拍时引导去写大纲或点「解析」。
export default function NovelChapterOutlineTab(props: NovelChapterOutlineTabProps) {
  const { workspace } = props;
  const chapter = workspace.currentChapter;
  const beats = workspace.beats;

  if (workspace.chaptersQuery.isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> 正在加载章节
      </div>
    );
  }

  if (!chapter) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6 text-sm leading-6 text-muted-foreground">
          还没有章节，先去顶栏「章节管理」新建第一章。
        </CardContent>
      </Card>
    );
  }

  if (!beats || beats.length === 0) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6">
          <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-12 text-center">
            <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
              第 {chapter.order} 章还没有细纲。点上方「解析」按本章大纲生成节拍；还没写大纲的，先去「大纲」页签写下这一章的故事。
            </p>
            <Button className="mt-4" size="sm" variant="outline" onClick={props.onGoOutline}>
              去写大纲
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const beatCount = beats.length;
  const canSave = beatCount >= 3 && beatCount <= 10;

  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">第 {chapter.order} 章 · {chapter.title}</span>
          <Badge variant="outline" className="gap-1">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {beatCount} 拍
          </Badge>
          <span className="text-xs text-muted-foreground">逐拍可改可增删，3～10 拍可保存。</span>
        </div>

        <ol className="space-y-2">
          {beats.map((beat, index) => (
            <li key={`beat-${index}`} className="flex items-start gap-2 rounded-xl border border-border/70 bg-background p-2.5">
              <span className="mt-1.5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Input
                  value={beat.summary}
                  maxLength={120}
                  placeholder="这一拍发生了什么"
                  className="h-8 text-sm"
                  onChange={(event) => workspace.updateBeat(index, { summary: event.target.value })}
                />
                <Input
                  value={beat.keyEvent ?? ""}
                  maxLength={60}
                  placeholder="关键事件（可选）"
                  className="h-8 text-xs text-muted-foreground"
                  onChange={(event) => workspace.updateBeat(index, { keyEvent: event.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`删除第 ${index + 1} 拍`}
                onClick={() => workspace.removeBeat(index)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={workspace.addBeat}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />添加一拍
          </Button>
          <Button
            type="button"
            disabled={!canSave || workspace.saveBeatsMutation.isPending}
            title={!canSave ? "细纲需要 3～10 拍。" : undefined}
            onClick={() => workspace.saveBeatsMutation.mutate()}
          >
            {workspace.saveBeatsMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />}
            保存细纲
          </Button>
        </div>

        {workspace.notes.trim() ? (
          <p className="rounded-lg bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">AI 补充说明：{workspace.notes}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
