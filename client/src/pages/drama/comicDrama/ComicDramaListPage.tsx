import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  PlusCircle,
  Trash2,
} from "lucide-react";
import { deleteComicDramaByNovel, getComicDramaLinks } from "@/api/media/comicDrama";
import { getNovelList } from "@/api/novel/core";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import ComicDramaCreateDialog from "./ComicDramaCreateDialog";

const COMIC_DRAMA_PAGE_SIZE = 24;

// 漫剧项目的四个阶段：小说是根，分镜画面/配音/成片依次推进。
type StageState = "pending" | "active" | "done";

function novelStageState(task: { status: string } | null | undefined): StageState {
  if (!task) return "pending";
  if (task.status === "queued" || task.status === "running" || task.status === "waiting_approval") return "active";
  return "done";
}

export default function ComicDramaListPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["comic-drama", "list", COMIC_DRAMA_PAGE_SIZE],
    queryFn: () => getNovelList({ page: 1, limit: COMIC_DRAMA_PAGE_SIZE, productionKind: "comic_drama" }),
  });
  const novels = useMemo(() => listQuery.data?.data?.items ?? [], [listQuery.data]);
  const novelIds = useMemo(() => novels.map((novel) => novel.id), [novels]);
  const linksQuery = useQuery({
    queryKey: queryKeys.comicDrama.links(novelIds),
    queryFn: () => getComicDramaLinks(novelIds),
    enabled: novelIds.length > 0,
  });
  const links = linksQuery.data?.data?.links ?? {};

  const deleteMutation = useMutation({
    mutationFn: (novelId: string) => deleteComicDramaByNovel(novelId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["comic-drama"] });
      toast.success("漫剧项目已删除。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "删除失败，请稍后重试。"),
  });

  const handleDelete = (novelId: string, title: string) => {
    if (window.confirm(`确认删除《${title}》吗？小说正文与已生成的分镜画面、配音、成片数据会一并删除。`)) {
      deleteMutation.mutate(novelId);
    }
  };

  return (
    <div className="studio-page space-y-6">
      {listQuery.isPending ? (
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          正在打开漫剧列表
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="创建漫剧"
            className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-panel)] border border-dashed border-border/80 bg-[var(--surface-subtle)] text-muted-foreground transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <PlusCircle className="h-6 w-6" aria-hidden="true" />
            <span className="text-sm font-medium">创建漫剧</span>
          </button>
          {novels.map((novel) => (
            <ComicDramaCard
              key={novel.id}
              novel={novel}
              link={links[novel.id] ?? null}
              onDelete={() => handleDelete(novel.id, novel.title)}
            />
          ))}
        </section>
      )}

      <ComicDramaCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

interface ComicDramaCardNovel {
  id: string;
  title: string;
  description?: string | null;
  updatedAt: string;
  totalWordCount?: number | null;
  latestAutoDirectorTask?: { status: string; progress?: number } | null;
  _count?: { chapters?: number };
}

function StageBadge(props: { label: string; state: StageState }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1",
        props.state === "done" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        props.state === "active" && "border-primary/40 bg-primary/10 text-primary",
      )}
    >
      {props.state === "done" ? "✓" : props.state === "active" ? "•" : "○"}
      {props.label}
    </Badge>
  );
}

function ComicDramaCard(props: {
  novel: ComicDramaCardNovel;
  link: { status: string; shotCount: number; keyframeReadyCount: number; audioReadyCount: number; videoReadyCount: number } | null;
  onDelete: () => void;
}) {
  const { novel, link, onDelete } = props;
  const novelStage = novelStageState(novel.latestAutoDirectorTask);
  const storyboardStage: StageState = !link ? "pending" : link.shotCount > 0 ? "done" : "active";
  const voiceStage: StageState = !link ? "pending" : link.audioReadyCount > 0 ? "done" : link.shotCount > 0 ? "active" : "pending";
  const assemblyStage: StageState = !link ? "pending" : link.videoReadyCount > 0 ? "done" : link.audioReadyCount > 0 ? "active" : "pending";
  const chapterCount = novel._count?.chapters ?? 0;
  const wordCount = novel.totalWordCount ?? 0;

  return (
    <div className="group relative aspect-square">
      <Link
        to={`/drama/studio/${novel.id}`}
        aria-label={`打开《${novel.title}》漫剧工作室`}
        className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Card className="h-full overflow-hidden rounded-[var(--radius-panel)] border-border/70 bg-[var(--surface-panel)] transition group-hover:border-primary/35 group-hover:shadow-sm">
          <CardContent className="flex h-full flex-col gap-2 p-3">
            <h3 className="truncate pr-7 font-semibold text-foreground group-hover:text-primary">{novel.title}</h3>
            <div className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
              <span>{chapterCount} 章</span>
              <span aria-hidden="true" className="text-border">·</span>
              <span>{wordCount.toLocaleString()} 字</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <StageBadge label="小说" state={novelStage} />
              <StageBadge label="分镜" state={storyboardStage} />
              <StageBadge label="配音" state={voiceStage} />
              <StageBadge label="成片" state={assemblyStage} />
            </div>
            <span className="mt-auto truncate pt-1 text-xs text-muted-foreground">
              {link
                 ? `分镜 ${link.shotCount} · 画面 ${link.keyframeReadyCount} · 配音 ${link.audioReadyCount} · 成片 ${link.videoReadyCount}`
                : novelStage === "pending" ? "还没开始写小说" : "AI 正在写小说，写完可生成分镜"}
            </span>
          </CardContent>
        </Card>
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-destructive"
        title="删除漫剧项目"
        aria-label={`删除《${novel.title}》漫剧项目`}
        onClick={(event) => {
          event.preventDefault();
          onDelete();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
