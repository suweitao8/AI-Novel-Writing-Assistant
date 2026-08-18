import { BookOpen, Clock3, Download, Gauge, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getNovelWorkspaceHref, type NovelListItem } from "./novelListViewModel";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近编辑";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

function getFormLabel(novel: NovelListItem): string {
  if (novel.narrativeForm === "short_story") return "短篇";
  return novel.writingMode === "continuation" ? "长篇续写" : "长篇原创";
}

function getProgress(novel: NovelListItem): number {
  const task = novel.narrativeForm === "short_story" ? novel.latestCreationStudioTask : novel.latestAutoDirectorTask;
  if (task) return Math.max(0, Math.min(100, Math.round(task.progress * 100)));
  if (novel.projectStatus === "completed" && novel.outlineStatus === "completed") return 100;
  return 0;
}

function getPrimaryAction(novel: NovelListItem): { label: string; href: string } {
  if (novel.narrativeForm === "short_story") {
    const task = novel.latestCreationStudioTask;
    return {
      label: task?.status === "succeeded" ? "阅读作品" : "继续创作",
      href: `/novels/${novel.id}/story`,
    };
  }
  const task = novel.latestAutoDirectorTask;
  const workspaceHref = getNovelWorkspaceHref(novel);
  if (task?.status === "failed" || task?.status === "cancelled") {
    return { label: "恢复创作", href: workspaceHref };
  }
  if (task?.status === "waiting_approval") {
    return { label: "继续处理", href: workspaceHref };
  }
  return { label: task ? "继续创作" : "编辑作品", href: workspaceHref };
}

export function NovelShelfCard(props: {
  novel: NovelListItem;
  onOpenCockpit: (novelId: string) => void;
  onDownload: (input: { novelId: string; novelTitle: string }) => void;
  onDelete: (novelId: string, title: string) => void;
}) {
  const { novel } = props;
  const action = getPrimaryAction(novel);
  const progress = getProgress(novel);

  return (
    <Card className="group overflow-hidden rounded-lg border-border/70 bg-background transition hover:border-primary/35 hover:shadow-sm">
      <CardContent className="flex h-full items-center gap-3 p-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={action.href} className="line-clamp-1 text-base font-semibold hover:text-primary">
                {novel.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{getFormLabel(novel)}</span>
                {novel.writingPlatform ? <span>{novel.writingPlatform}</span> : null}
                <span>{novel.status === "published" ? "已发布" : "草稿"}</span>
              </div>
            </div>
          </div>

          <div className="mt-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress > 0 ? `创作进度 ${progress}%` : "尚未开始正文"}</span>
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{formatDate(novel.updatedAt)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
            <Button asChild size="sm" className="flex-1">
              <Link to={action.href}><BookOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />{action.label}</Link>
            </Button>
            {novel.narrativeForm !== "short_story" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                title="打开 AI 驾驶舱"
                aria-label="打开 AI 驾驶舱"
                onClick={() => props.onOpenCockpit(novel.id)}
              >
                <Gauge className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              title="导出作品"
              aria-label="导出作品"
              onClick={() => props.onDownload({ novelId: novel.id, novelTitle: novel.title })}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              title="删除作品"
              aria-label="删除作品"
              onClick={() => props.onDelete(novel.id, novel.title)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function NovelContinueCard(props: {
  novel: NovelListItem;
}) {
  const { novel } = props;
  const action = getPrimaryAction(novel);
  const progress = getProgress(novel);

  return (
    <Card className="rounded-lg border-border/70 bg-background">
      <CardContent className="flex min-h-[110px] items-center p-3">
        <div className="min-w-0 flex-1">
          <Link to={action.href} className="line-clamp-1 text-sm font-semibold hover:text-primary">{novel.title}</Link>
          <div className="mt-1 text-xs text-muted-foreground">{getFormLabel(novel)} · {progress}%</div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button asChild size="sm" className="h-8 flex-1 px-2 text-xs">
              <Link to={action.href}>{action.label}</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
