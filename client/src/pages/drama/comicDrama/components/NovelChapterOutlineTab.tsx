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

function proseWordCount(content?: string | null): number {
  return (content ?? "").replace(/\s+/g, "").length;
}

// 漫剧工作室「当前 · 正文」页签：当前章的节拍（由「解析」按本章初稿生成，逐拍可改可增删，
// 3～10 拍确认保存后常驻本章）；AI 写出正文后，下方常驻展示本章已成稿的正文。
export default function NovelChapterOutlineTab(props: NovelChapterOutlineTabProps) {
  const { workspace } = props;
  const chapter = workspace.currentChapter;
  const beats = workspace.beats;
  const prose = (chapter?.content ?? "").trim();

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

  return (
    <div className="space-y-4">
      {!beats || beats.length === 0 ? (
        <Card className="rounded-3xl">
          <CardContent className="p-6">
            <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-10 text-center">
              <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                第 {chapter.order} 章还没有节拍。点上方「解析」按本章初稿生成；还没写初稿的，先去「初稿」页签写下这一章的故事。
              </p>
              <Button className="mt-4" size="sm" variant="outline" onClick={props.onGoOutline}>
                去写初稿
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-3xl">
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">第 {chapter.order} 章 · {chapter.title}</span>
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                {beats.length} 拍
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
                disabled={!(beats.length >= 3 && beats.length <= 10) || workspace.saveBeatsMutation.isPending}
                title={!(beats.length >= 3 && beats.length <= 10) ? "节拍需要 3～10 拍。" : undefined}
                onClick={() => workspace.saveBeatsMutation.mutate()}
              >
                {workspace.saveBeatsMutation.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  : <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />}
                保存节拍
              </Button>
            </div>

            {workspace.notes.trim() ? (
              <p className="rounded-lg bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">AI 补充说明：{workspace.notes}</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {prose ? (
        <Card className="rounded-3xl">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">本章正文</span>
              <span className="text-xs tabular-nums text-muted-foreground">{proseWordCount(prose).toLocaleString()} 字</span>
            </div>
            <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border/70 bg-muted/10 px-4 py-3 text-sm leading-7 text-foreground">
              {chapter.content}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
