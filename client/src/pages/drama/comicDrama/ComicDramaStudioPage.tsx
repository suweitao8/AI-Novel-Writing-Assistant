import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenText,
  Boxes,
  Clapperboard,
  Film,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { ComicDramaLinkStats } from "@ai-novel/shared/types/comicDrama";
import { getComicDramaStudioOverview } from "@/api/media/comicDrama";
import {
  assembleDramaSourceBundle,
  createDramaProject,
  getDramaVisualStyles,
  setDramaVisualStyle,
  type DramaVisualStyle,
} from "@/api/media/drama";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import StorySettingsTabs from "@/pages/novels/components/storySettings/StorySettingsTabs";
import VoiceStagePanel from "@/pages/drama/comicDrama/VoiceStagePanel";
import ChapterManageDialog from "@/pages/drama/comicDrama/components/ChapterManageDialog";
import NovelChapterOutlineTab from "@/pages/drama/comicDrama/components/NovelChapterOutlineTab";
import NovelOutlineTab from "@/pages/drama/comicDrama/components/NovelOutlineTab";
import { useNovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";

// 顶层页签是项目级的：当前（章节工作台）/资产（角色场景道具世界观）/设定（项目配置）。
type StudioStage = "current" | "assets" | "settings";
// 「当前」的子页签全部作用于当前章：初稿→正文→分镜→配音→视频。
type CurrentTab = "draft" | "text" | "storyboard" | "voice" | "video";

const STAGE_LABELS: Record<StudioStage, string> = {
  current: "当前",
  assets: "资产",
  settings: "设定",
};

const CURRENT_TAB_LABELS: Record<CurrentTab, string> = {
  draft: "初稿",
  text: "正文",
  storyboard: "分镜",
  voice: "配音",
  video: "视频",
};

// 漫剧工作室：顶栏为返回按钮 + 项目名、居中的项目级页签（当前/资产/设定）。
// 「当前」按章推进：顶栏章节管理显示当前章并负责切换，子页签（初稿/正文/分镜/配音/视频）
// 全部随当前章更新；「解析」按本章初稿生成本章节拍。
export default function ComicDramaStudioPage() {
  const { novelId = "" } = useParams();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<StudioStage>("current");
  const [currentTab, setCurrentTab] = useState<CurrentTab>("draft");
  const [chapterManageOpen, setChapterManageOpen] = useState(false);

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
  const chapterWorkspace = useNovelChapterWorkspace(novelId);
  const storyboard = useStoryboardStage({
    novelId,
    novelTitle: overview?.novel.title ?? "",
    drama: overview?.drama ?? null,
    chapterCount: overview?.novel.chapterCount ?? 0,
  });

  const directorTask = overview?.novel.directorTask ?? null;
  const directorActive = directorTask?.status === "running" || directorTask?.status === "queued";

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

  const parseChapterOutline = () => {
    chapterWorkspace.previewMutation.mutate(undefined, {
      onSuccess: () => setCurrentTab("text"),
    });
  };

  const parseDisabledReason = !chapterWorkspace.currentChapter
    ? "还没有章节，先打开「章节管理」新建第一章。"
    : !chapterWorkspace.expectationText.trim()
      ? "先在「初稿」页签写下本章的故事，AI 才能解析。"
      : null;

  let headerActions: ReactNode = null;
  if (stage === "current") {
    const chapter = chapterWorkspace.currentChapter;
    headerActions = (
      <>
        {directorActive && directorTask ? (
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            AI 写作中<span className="font-semibold tabular-nums text-foreground">{directorTask.progress}%</span>
          </span>
        ) : null}
        {currentTab === "storyboard" && overview.drama ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => storyboard.syncMutation.mutate()}
              disabled={storyboard.syncMutation.isPending}
            >
              {storyboard.syncMutation.isPending
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                : <RefreshCw className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              同步最新章节
            </Button>
            <Button size="sm" asChild>
              <Link to={`/drama/projects/${overview.drama.projectId}`}>
                <Clapperboard className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" />打开分镜工作台
              </Link>
            </Button>
          </>
        ) : null}
        {currentTab === "storyboard" && !overview.drama ? (
          <Button
            size="sm"
            onClick={() => storyboard.createMutation.mutate()}
            disabled={storyboard.createMutation.isPending || overview.novel.chapterCount < 1}
            title={overview.novel.chapterCount < 1 ? "先让 AI 写出至少一章成稿，再生成分镜。" : undefined}
          >
            {storyboard.createMutation.isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Wand2 className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            从成稿生成分镜
          </Button>
        ) : null}
        {currentTab === "video" && overview.drama ? (
          <Button size="sm" asChild>
            <Link to={`/drama/projects/${overview.drama.projectId}`}>
              <Film className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" />打开视频工作台
            </Link>
          </Button>
        ) : null}
        <Button variant="outline" size="sm" className="max-w-[240px]" onClick={() => setChapterManageOpen(true)}>
          <BookOpenText className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{chapter ? `${chapter.order} · ${chapter.title}` : "章节管理"}</span>
        </Button>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={stage} onValueChange={(value) => setStage(value as StudioStage)}>
        <header className="overflow-hidden rounded-3xl border border-border bg-background shadow-sm">
          <div className="flex flex-col gap-2.5 px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="-ml-2 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                title="返回漫剧列表"
              >
                <Link to="/drama" aria-label="返回漫剧列表">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">{overview.novel.title}</h1>
            </div>
            <TabsList className="sm:justify-self-center">
              <TabsTrigger value="current"><BookOpenText className="mr-1.5 h-4 w-4" aria-hidden="true" />{STAGE_LABELS.current}</TabsTrigger>
              <TabsTrigger value="assets"><Boxes className="mr-1.5 h-4 w-4" aria-hidden="true" />{STAGE_LABELS.assets}</TabsTrigger>
              <TabsTrigger value="settings"><Settings className="mr-1.5 h-4 w-4" aria-hidden="true" />{STAGE_LABELS.settings}</TabsTrigger>
            </TabsList>
            <div className="flex flex-wrap items-center justify-end gap-2">{headerActions}</div>
          </div>
          {stage === "current" ? (
            <div className="flex flex-col items-center gap-2 border-t border-border bg-muted/[0.28] px-4 py-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span className="hidden sm:block" aria-hidden="true" />
              <Tabs
                value={currentTab}
                onValueChange={(value) => setCurrentTab(value as CurrentTab)}
                className="sm:justify-self-center"
              >
                <TabsList>
                  <TabsTrigger value="draft">{CURRENT_TAB_LABELS.draft}</TabsTrigger>
                  <TabsTrigger value="text">{CURRENT_TAB_LABELS.text}</TabsTrigger>
                  <TabsTrigger value="storyboard">{CURRENT_TAB_LABELS.storyboard}</TabsTrigger>
                  <TabsTrigger value="voice">{CURRENT_TAB_LABELS.voice}</TabsTrigger>
                  <TabsTrigger value="video">{CURRENT_TAB_LABELS.video}</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-self-end">
                {chapterWorkspace.savePending ? (
                  <span className="text-xs text-muted-foreground">自动保存中…</span>
                ) : null}
                <Button
                  size="sm"
                  onClick={parseChapterOutline}
                  disabled={chapterWorkspace.previewMutation.isPending || parseDisabledReason !== null}
                  title={parseDisabledReason ?? "按本章初稿生成本章节拍"}
                >
                  {chapterWorkspace.previewMutation.isPending
                    ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                    : <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                  解析
                </Button>
              </div>
            </div>
          ) : null}
        </header>

        <TabsContent value="current" className="space-y-4">
          {currentTab === "draft" ? (
            <NovelOutlineTab
              novelId={novelId}
              workspace={chapterWorkspace}
              onOpenChapterManage={() => setChapterManageOpen(true)}
            />
          ) : currentTab === "text" ? (
            <NovelChapterOutlineTab workspace={chapterWorkspace} onGoOutline={() => setCurrentTab("draft")} />
          ) : currentTab === "storyboard" ? (
            <StoryboardSection drama={overview.drama} chapterCount={overview.novel.chapterCount} />
          ) : currentTab === "voice" ? (
            <VoiceSection novelId={novelId} drama={overview.drama} />
          ) : (
            <VideoSection drama={overview.drama} videoProviders={overview.videoProviders} />
          )}
        </TabsContent>

        <TabsContent value="assets" className="space-y-4">
          <section className="overflow-hidden rounded-3xl border border-border bg-background p-4 shadow-sm sm:p-6">
            <StorySettingsTabs novelId={novelId} />
          </section>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <ProjectSettingsSection drama={overview.drama} storyboard={storyboard} />
        </TabsContent>
      </Tabs>

      <ChapterManageDialog
        novelId={novelId}
        open={chapterManageOpen}
        onOpenChange={setChapterManageOpen}
        chapters={chapterWorkspace.chapters}
        currentChapterId={chapterWorkspace.currentChapter?.id ?? null}
        directorTaskActive={directorActive}
        onSelectChapter={(chapter) => {
          chapterWorkspace.switchChapter(chapter);
          setChapterManageOpen(false);
        }}
      />
    </div>
  );
}

// 分镜管线共享状态：画面风格选择（「设定」页签用）、创建分镜项目、同步最新章节。
// 顶栏按钮与内容区共用同一份 mutation，避免两处状态漂移。
function useStoryboardStage(input: {
  novelId: string;
  novelTitle: string;
  drama: ComicDramaLinkStats | null;
  chapterCount: number;
}) {
  const queryClient = useQueryClient();
  const [selectedStyle, setSelectedStyle] = useState<string>("");
  const stylesQuery = useQuery({
    queryKey: ["drama", "visual-styles"],
    queryFn: () => getDramaVisualStyles(),
  });
  const styleOptions = stylesQuery.data?.data ?? [];
  const effectiveStyleId = selectedStyle || input.drama?.visualStyle || "post_apocalyptic";
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.overview(input.novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.links([input.novelId]) });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (input.chapterCount < 1) {
        throw new Error("小说还没有成稿章节。先让 AI 写出至少一章，再生成分镜。");
      }
      return createDramaProject({
        title: input.novelTitle,
        source: "novel_import",
        sourceRef: input.novelId,
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
    mutationFn: (styleId: string) => {
      if (!input.drama) {
        throw new Error("还没有分镜项目。");
      }
      return setDramaVisualStyle(input.drama.projectId, styleId);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("画面风格已更新，之后生成的首帧图与角色图会使用新风格。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新风格失败，请重试。"),
  });

  const syncMutation = useMutation({
    mutationFn: () => {
      if (!input.drama) {
        throw new Error("还没有分镜项目。");
      }
      return assembleDramaSourceBundle(input.drama.projectId);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("已从小说最新成稿同步来源内容。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "同步失败，请重试。"),
  });

  return { styleOptions, effectiveStyleId, selectedStyle, setSelectedStyle, styleMutation, createMutation, syncMutation };
}

type StoryboardStage = ReturnType<typeof useStoryboardStage>;

// 「设定」页签：项目级配置。画面风格影响首帧图与角色形象的整体渲染，
// 在创建分镜项目前选择会被记住并在创建时生效。
function ProjectSettingsSection(props: {
  drama: ComicDramaLinkStats | null;
  storyboard: StoryboardStage;
}) {
  const { storyboard, drama } = props;
  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-4 p-6">
        <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">画面风格</span>
            <span className="text-xs text-muted-foreground">影响首帧图与角色形象的整体渲染风格，随时可切换。</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {storyboard.styleOptions.map((style: DramaVisualStyle) => (
              <Button
                key={style.id}
                type="button"
                size="sm"
                variant={storyboard.effectiveStyleId === style.id ? "default" : "outline"}
                disabled={storyboard.styleMutation.isPending}
                onClick={() => {
                  storyboard.setSelectedStyle(style.id);
                  if (drama) {
                    storyboard.styleMutation.mutate(style.id);
                  }
                }}
              >
                {style.label}
              </Button>
            ))}
          </div>
          {!drama ? (
            <p className="text-xs leading-5 text-muted-foreground">还没有分镜项目；这里选的风格会在生成分镜时使用。</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>分镜项目状态</span>
          {drama ? (
            <Badge variant="outline">{drama.status}</Badge>
          ) : (
            <span>还没有分镜项目，先在「当前 · 分镜」从成稿生成。</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StoryboardSection(props: {
  drama: ComicDramaLinkStats | null;
  chapterCount: number;
}) {
  const { drama } = props;
  if (!drama) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6 text-sm leading-6 text-muted-foreground">
          还没有分镜项目。当前小说已有 {props.chapterCount} 章成稿——满足一集以上的量就可以开始，之后随时同步新章节。
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-4 p-6">
        <div className="grid gap-2 sm:grid-cols-4">
          <StageMetric label="分集" value={`${drama.episodeCount} 集`} hint={`已写台本 ${drama.scriptedEpisodeCount} 集`} />
          <StageMetric label="分镜" value={`${drama.storyboardCount} 组`} hint={`共 ${drama.shotCount} 镜`} />
          <StageMetric label="首帧图" value={`${drama.keyframeReadyCount} / ${drama.shotCount}`} hint="镜头画面已生成" />
          <StageMetric label="项目状态" value={drama.status} hint="分镜管线状态" />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          小说每写完新的章节，点「同步最新章节」，分镜就能覆盖到最新剧情。
        </p>
      </CardContent>
    </Card>
  );
}

function VoiceSection(props: {
  novelId: string;
  drama: { projectId: string; shotCount: number; audioReadyCount: number } | null;
}) {
  if (!props.drama) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6 text-sm leading-6 text-muted-foreground">
          先创建分镜项目，配音会在这里就绪。
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="rounded-3xl">
      <CardContent className="p-4 sm:p-6">
        <VoiceStagePanel novelId={props.novelId} projectId={props.drama.projectId} />
      </CardContent>
    </Card>
  );
}

function VideoSection(props: {
  drama: { projectId: string; videoPromptCount: number; videoReadyCount: number } | null;
  videoProviders: Array<{ id: string; label: string; kind: string }>;
}) {
  const hasRealProvider = props.videoProviders.some((provider) => provider.id !== "mock");
  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-4 p-6">
        {props.drama ? (
          <>
            <StageMetric
              label="已生成视频"
              value={`${props.drama.videoReadyCount} / ${Math.max(props.drama.videoPromptCount, props.drama.videoReadyCount)}`}
              hint="视频任务已出片"
            />
            {!hasRealProvider ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm leading-6 text-amber-700 dark:text-amber-400">
                当前只有占位视频通道，不会生成真实视频。可以先完成首帧图与配音并导出素材；接入外部视频服务地址后即可一键出片。
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">先创建分镜项目，视频能力会在这里就绪。</p>
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
