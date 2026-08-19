import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  AudioLines,
  BookOpenText,
  Clapperboard,
  ExternalLink,
  Film,
  Images,
  Loader2,
  RefreshCw,
  Wand2,
} from "lucide-react";
import { getComicDramaStudioOverview } from "@/api/comicDrama";
import {
  assembleDramaSourceBundle,
  createDramaProject,
  getDramaVisualStyles,
  setDramaVisualStyle,
  type DramaVisualStyle,
} from "@/api/drama";
import { queryKeys } from "@/api/queryKeys";
import StorySettingsTabs from "@/pages/novels/components/storySettings/StorySettingsTabs";
import BlankStartPanel from "@/pages/novels/simpleCreation/BlankStartPanel";
import VoiceStagePanel from "@/pages/drama/comicDrama/VoiceStagePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";

type StudioStage = "novel" | "storyboard" | "voice" | "video";

const STAGE_LABELS: Record<StudioStage, string> = {
  novel: "小说",
  storyboard: "分镜",
  voice: "配音",
  video: "视频",
};

// 漫剧工作室：一个项目、四个阶段——写小说 → 生成分镜 → 合成配音 → 制作动态漫视频。
// 小说阶段复用空白小说工作台（设定/大纲/细纲/自动导演），分镜之后衔接 drama 管线。
export default function ComicDramaStudioPage() {
  const { novelId = "" } = useParams();
  const [stage, setStage] = useState<StudioStage>("novel");
  const [novelSubView, setNovelSubView] = useState<"creation" | "settings">("creation");
  const overviewQuery = useQuery({
    queryKey: queryKeys.comicDrama.overview(novelId),
    queryFn: () => getComicDramaStudioOverview(novelId),
    enabled: Boolean(novelId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.novel.directorTask?.status;
      return status === "running" || status === "queued" ? 10000 : false;
    },
  });
  const overview = overviewQuery.data?.data ?? null;

  if (overviewQuery.isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> 正在打开漫剧工作室
      </div>
    );
  }
  if (!overview) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <span className="text-sm text-muted-foreground">没有找到这个漫剧项目。</span>
        <Button variant="outline" asChild>
          <Link to="/drama"><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />返回漫剧列表</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="overflow-hidden rounded-3xl border border-border bg-background shadow-sm">
        <div className="bg-muted/[0.28] px-5 py-5 sm:px-7">
          <Button variant="ghost" size="sm" asChild className="-ml-2 px-2 text-muted-foreground hover:bg-background hover:text-foreground">
            <Link to="/drama"><ArrowLeft className="h-4 w-4" />返回漫剧列表</Link>
          </Button>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{overview.novel.title}</h1>
                <Badge variant="outline">漫剧项目</Badge>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {overview.novel.description?.trim() || "从写小说到动态漫视频的完整工作流，按下面的阶段一步步推进。"}
              </p>
            </div>
            {overview.novel.directorTask ? (
              <div className="w-full rounded-2xl border border-border/80 bg-background/80 p-4 shadow-sm sm:max-w-xs">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">小说进度</span>
                  <span className="font-semibold text-foreground">{overview.novel.directorTask.progress}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${overview.novel.directorTask.progress}%` }} />
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {overview.novel.directorTask.currentItemLabel || overview.novel.directorTask.checkpointSummary || "AI 正在推进小说创作。"}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <Tabs value={stage} onValueChange={(value) => setStage(value as StudioStage)}>
        <TabsList>
          <TabsTrigger value="novel"><BookOpenText className="mr-1.5 h-4 w-4" aria-hidden="true" />{STAGE_LABELS.novel}</TabsTrigger>
          <TabsTrigger value="storyboard"><Images className="mr-1.5 h-4 w-4" aria-hidden="true" />{STAGE_LABELS.storyboard}</TabsTrigger>
          <TabsTrigger value="voice"><AudioLines className="mr-1.5 h-4 w-4" aria-hidden="true" />{STAGE_LABELS.voice}</TabsTrigger>
          <TabsTrigger value="video"><Film className="mr-1.5 h-4 w-4" aria-hidden="true" />{STAGE_LABELS.video}</TabsTrigger>
        </TabsList>
      </Tabs>

      {stage === "novel" ? (
        overview.novel.directorTask ? (
          <NovelRunningSection novelId={novelId} chapterCount={overview.novel.chapterCount} />
        ) : (
          <>
            <Tabs value={novelSubView} onValueChange={(value) => setNovelSubView(value as "creation" | "settings")}>
              <TabsList>
                <TabsTrigger value="creation">创作</TabsTrigger>
                <TabsTrigger value="settings">设定</TabsTrigger>
              </TabsList>
            </Tabs>
            {novelSubView === "settings" ? (
              <section className="overflow-hidden rounded-3xl border border-border bg-background p-4 shadow-sm sm:p-6">
                <StorySettingsTabs novelId={novelId} />
              </section>
            ) : (
              <BlankStartPanel novelId={novelId} novelTitle={overview.novel.title} onGoToSettings={() => setNovelSubView("settings")} />
            )}
          </>
        )
      ) : null}

      {stage === "storyboard" ? (
        <StoryboardSection novelId={novelId} novelTitle={overview.novel.title} drama={overview.drama} chapterCount={overview.novel.chapterCount} />
      ) : null}
      {stage === "voice" ? <VoiceSection novelId={novelId} drama={overview.drama} /> : null}
      {stage === "video" ? <VideoSection drama={overview.drama} videoProviders={overview.videoProviders} /> : null}
    </div>
  );
}

function NovelRunningSection(props: { novelId: string; chapterCount: number }) {
  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><BookOpenText className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 className="font-semibold text-foreground">AI 正在写作小说</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              已有 {props.chapterCount} 章成稿。可以先阅读已有正文，也可以先去做后面的分镜阶段。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={`/novels/${props.novelId}/simple`}><ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />打开阅读台</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StoryboardSection(props: {
  novelId: string;
  novelTitle: string;
  drama: {
    projectId: string;
    status: string;
    episodeCount: number;
    scriptedEpisodeCount: number;
    storyboardCount: number;
    shotCount: number;
    keyframeReadyCount: number;
    visualStyle?: string | null;
  } | null;
  chapterCount: number;
}) {
  const queryClient = useQueryClient();
  const [selectedStyle, setSelectedStyle] = useState<string>("");
  const stylesQuery = useQuery({
    queryKey: ["drama", "visual-styles"],
    queryFn: () => getDramaVisualStyles(),
  });
  const styleOptions = stylesQuery.data?.data ?? [];
  const effectiveStyleId = selectedStyle || props.drama?.visualStyle || "post_apocalyptic";
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.overview(props.novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.links([props.novelId]) });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (props.chapterCount < 1) {
        throw new Error("小说还没有成稿章节。先回到小说阶段让 AI 写出至少一章，再生成分镜。");
      }
      return createDramaProject({
        title: props.novelTitle,
        source: "novel_import",
        sourceRef: props.novelId,
        visualStyle: effectiveStyleId,
      });
    },
    onSuccess: async (response) => {
      await invalidate();
      const projectId = response.data?.id;
      toast.success(projectId
        ? "分镜项目已创建，正在从小说成稿导入内容。"
        : "分镜项目已创建。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建分镜项目失败，请重试。"),
  });

  const styleMutation = useMutation({
    mutationFn: async (styleId: string) => {
      if (!props.drama) {
        throw new Error("还没有分镜项目。");
      }
      return setDramaVisualStyle(props.drama.projectId, styleId);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("画面风格已更新，之后生成的首帧图与角色图会使用新风格。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新风格失败，请重试。"),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!props.drama) {
        throw new Error("还没有分镜项目。");
      }
      return assembleDramaSourceBundle(props.drama.projectId);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("已从小说最新成稿同步来源内容。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "同步失败，请重试。"),
  });

  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Images className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 className="font-semibold text-foreground">第二阶段 · 生成分镜</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              AI 会把小说成稿拆成分集台本和影视分镜：每个镜头有画面描述、台词、时长和运镜，并生成首帧图。
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">画面风格</span>
            <span className="text-xs text-muted-foreground">影响首帧图与角色形象的整体渲染风格，随时可切换。</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {styleOptions.map((style: DramaVisualStyle) => (
              <Button
                key={style.id}
                type="button"
                size="sm"
                variant={effectiveStyleId === style.id ? "default" : "outline"}
                disabled={styleMutation.isPending}
                onClick={() => {
                  setSelectedStyle(style.id);
                  if (props.drama) {
                    styleMutation.mutate(style.id);
                  }
                }}
              >
                {style.label}
              </Button>
            ))}
          </div>
        </div>

        {props.drama ? (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              <StageMetric label="分集" value={`${props.drama.episodeCount} 集`} hint={`已写台本 ${props.drama.scriptedEpisodeCount} 集`} />
              <StageMetric label="分镜" value={`${props.drama.storyboardCount} 组`} hint={`共 ${props.drama.shotCount} 镜`} />
              <StageMetric label="首帧图" value={`${props.drama.keyframeReadyCount} / ${props.drama.shotCount}`} hint="镜头画面已生成" />
              <StageMetric label="项目状态" value={props.drama.status} hint="分镜管线状态" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to={`/drama/projects/${props.drama.projectId}`}>
                  <Clapperboard className="mr-2 h-4 w-4" aria-hidden="true" />打开分镜工作台
                </Link>
              </Button>
              <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                {syncMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />}
                同步最新章节
              </Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              小说每写完新的章节，回到这里点「同步最新章节」，分镜就能覆盖到最新剧情。
            </p>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
              还没有分镜项目。当前小说已有 {props.chapterCount} 章成稿——满足一集以上的量就可以开始，之后随时同步新章节。
            </div>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />}
              从成稿章节生成分镜
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function VoiceSection(props: {
  novelId: string;
  drama: { projectId: string; shotCount: number; audioReadyCount: number } | null;
}) {
  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><AudioLines className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 className="font-semibold text-foreground">第三阶段 · 合成配音</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              按分镜台词逐行配音：先给角色和旁白定音色，再一键合成；改了台词或音色的行会标成「已过期」，补配即可。
            </p>
          </div>
        </div>
        {props.drama ? (
          <VoiceStagePanel novelId={props.novelId} projectId={props.drama.projectId} />
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">先在「分镜」阶段创建分镜项目，配音会在这里就绪。</p>
        )}
      </CardContent>
    </Card>
  );
}

function VideoSection(props: {
  drama: { projectId: string; videoPromptCount: number; videoReadyCount: number } | null;
  videoProviders: Array<{ id: string; label: string }>;
}) {
  const hasRealProvider = props.videoProviders.some((provider) => provider.id !== "mock");
  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Film className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 className="font-semibold text-foreground">第四阶段 · 制作动态漫视频</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              把首帧图、运镜提示词和配音交给视频通道，逐镜生成动态画面，最终得到动态漫视频。
            </p>
          </div>
        </div>
        {props.drama ? (
          <>
            <StageMetric label="已生成视频" value={`${props.drama.videoReadyCount} / ${Math.max(props.drama.videoPromptCount, props.drama.videoReadyCount)}`} hint="视频任务已出片" />
            {!hasRealProvider ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm leading-6 text-amber-700 dark:text-amber-400">
                当前只有占位视频通道，不会生成真实视频。可以先完成首帧图与配音并导出素材；接入外部视频服务地址后即可一键出片。
              </div>
            ) : null}
            <Button asChild>
              <Link to={`/drama/projects/${props.drama.projectId}`}>
                <Film className="mr-2 h-4 w-4" aria-hidden="true" />打开视频工作台
              </Link>
            </Button>
          </>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">先完成「分镜」阶段，视频能力会在这里就绪。</p>
        )}
      </CardContent>
    </Card>
  );
}

function StageMetric(props: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{props.value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{props.hint}</div>
    </div>
  );
}
