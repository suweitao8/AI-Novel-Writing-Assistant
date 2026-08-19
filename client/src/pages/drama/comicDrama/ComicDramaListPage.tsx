import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Clapperboard,
  Loader2,
  PlusCircle,
} from "lucide-react";
import { getComicDramaLinks } from "@/api/comicDrama";
import { getNovelList } from "@/api/novel/core";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ComicDramaCreateDialog from "./ComicDramaCreateDialog";

const COMIC_DRAMA_PAGE_SIZE = 24;

// 漫剧项目的四个阶段：小说是根，分镜/配音/视频依次推进。
type StageState = "pending" | "active" | "done";

function novelStageState(task: { status: string } | null | undefined): StageState {
  if (!task) return "pending";
  if (task.status === "queued" || task.status === "running" || task.status === "waiting_approval") return "active";
  return "done";
}

export default function ComicDramaListPage() {
  const [createOpen, setCreateOpen] = useState(false);
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

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-normal">漫剧列表</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            每个漫剧项目都是一条完整的工作流：先写小说，再生成分镜和配音，最后合成动态漫视频。
          </p>
        </div>
        <Button size="lg" onClick={() => setCreateOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />
          创建漫剧
        </Button>
      </section>

      {listQuery.isPending ? (
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          正在打开漫剧列表
        </div>
      ) : novels.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-border bg-background/60 px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Clapperboard className="h-7 w-7" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-foreground">从一个书名开始你的第一部漫剧</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            只需要起一个名字。AI 会帮你把小说写出来，之后自动衔接分镜、配音和视频合成。
          </p>
          <div className="mt-6">
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              创建漫剧
            </Button>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {novels.map((novel) => (
            <ComicDramaCard
              key={novel.id}
              novel={novel}
              link={links[novel.id] ?? null}
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

function ComicDramaCard(props: { novel: ComicDramaCardNovel; link: { status: string; shotCount: number; keyframeReadyCount: number; audioReadyCount: number; videoReadyCount: number } | null }) {
  const { novel, link } = props;
  const novelStage = novelStageState(novel.latestAutoDirectorTask);
  const storyboardStage: StageState = !link ? "pending" : link.shotCount > 0 ? "done" : "active";
  const voiceStage: StageState = !link ? "pending" : link.audioReadyCount > 0 ? "done" : link.shotCount > 0 ? "active" : "pending";
  const videoStage: StageState = !link ? "pending" : link.videoReadyCount > 0 ? "done" : link.audioReadyCount > 0 ? "active" : "pending";

  return (
    <Link
      to={`/drama/studio/${novel.id}`}
      aria-label={`打开《${novel.title}》漫剧工作室`}
      className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Card className="h-full overflow-hidden rounded-lg border-border/70 bg-background transition group-hover:border-primary/35 group-hover:shadow-sm">
        <CardContent className="flex h-full min-h-[104px] flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate font-semibold text-foreground group-hover:text-primary">{novel.title}</h3>
            <span className="shrink-0 text-xs text-muted-foreground">{novel._count?.chapters ?? 0} 章</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StageBadge label="小说" state={novelStage} />
            <StageBadge label="分镜" state={storyboardStage} />
            <StageBadge label="配音" state={voiceStage} />
            <StageBadge label="视频" state={videoStage} />
          </div>
          <span className="mt-auto truncate pt-1 text-xs text-muted-foreground">
            {link
              ? `分镜 ${link.shotCount} 镜 · 首帧 ${link.keyframeReadyCount} · 配音 ${link.audioReadyCount} · 视频 ${link.videoReadyCount}`
              : novelStage === "pending" ? "还没开始写小说" : "AI 正在写小说，写完可生成分镜"}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
