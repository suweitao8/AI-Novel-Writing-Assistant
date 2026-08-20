import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenText,
  Boxes,
  Film,
  Loader2,
  Plus,
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
import { getStorySettingsOverview } from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import SettingsCharactersTab from "@/pages/novels/components/storySettings/SettingsCharactersTab";
import SettingsPropsTab from "@/pages/novels/components/storySettings/SettingsPropsTab";
import SettingsScenesTab from "@/pages/novels/components/storySettings/SettingsScenesTab";
import SettingsWorldTab from "@/pages/novels/components/storySettings/SettingsWorldTab";
import ReferenceNovelCard from "@/pages/drama/comicDrama/components/ReferenceNovelCard";
import ChapterManageDialog from "@/pages/drama/comicDrama/components/ChapterManageDialog";
import CreateChapterDialog from "@/pages/drama/comicDrama/components/CreateChapterDialog";
import NovelChapterOutlineTab from "@/pages/drama/comicDrama/components/NovelChapterOutlineTab";
import NovelOutlineTab from "@/pages/drama/comicDrama/components/NovelOutlineTab";
import ReferenceExtractTab from "@/pages/drama/comicDrama/components/ReferenceExtractTab";
import ReferenceTab from "@/pages/drama/comicDrama/components/ReferenceTab";
import ShotVoiceListPanel from "@/pages/drama/comicDrama/ShotVoiceListPanel";
import { DRAMA_CHAPTERS_QUERY_KEY, useNovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";
import { useReferenceDraftStage } from "@/pages/drama/comicDrama/hooks/useReferenceDraftStage";
import { useReferenceExtractStage } from "@/pages/drama/comicDrama/hooks/useReferenceExtractStage";

// 顶层页签是项目级的：当前（章节工作台）/资产（角色场景道具）/设定（世界观与项目配置）。
type StudioStage = "current" | "assets" | "settings";
// 「当前」的子页签全部作用于当前章：参考→初稿→正文→分镜→配音→视频。
type CurrentTab = "reference" | "extract" | "draft" | "text" | "storyboard" | "video";
// 「资产」的子页签：角色 / 场景 / 道具（世界观在「设定」页签）。
type AssetTab = "characters" | "scenes" | "props";
// 「设定」的子页签：世界观 / 项目（画面风格与分镜项目状态）。
type SettingsTab = "world" | "project";

const STAGE_LABELS: Record<StudioStage, string> = {
  current: "当前",
  assets: "资产",
  settings: "设定",
};

const CURRENT_TAB_LABELS: Record<CurrentTab, string> = {
  reference: "参考",
  extract: "提取",
  draft: "初稿",
  text: "正文",
  storyboard: "分镜配音",
  video: "视频",
};

const ASSET_TAB_LABELS: Record<AssetTab, string> = {
  characters: "角色",
  scenes: "场景",
  props: "道具",
};

const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  world: "世界观",
  project: "项目",
};

// 漫剧工作室：顶栏为返回（图标+项目名，弱化样式）+ 居中的项目级页签（当前/资产/设定），
// 每个页签下方都有自己的居中子页签条、操作按钮靠右。
// 「当前」按章推进：顶栏章节管理显示当前章并负责切换，子页签（初稿/正文/分镜/配音/视频）
// 全部随当前章更新；「解析」按本章初稿生成本章节拍。
export default function ComicDramaStudioPage() {
  const { novelId = "" } = useParams();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<StudioStage>("current");
  const [currentTab, setCurrentTab] = useState<CurrentTab>("draft");
  const [assetTab, setAssetTab] = useState<AssetTab>("characters");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("world");
  const [chapterManageOpen, setChapterManageOpen] = useState(false);
  const [createChapterOpen, setCreateChapterOpen] = useState(false);

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
  const settingsOverviewQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsOverview(novelId),
    queryFn: () => getStorySettingsOverview(novelId),
    enabled: Boolean(novelId),
  });
  const settingsOverview = settingsOverviewQuery.data?.data ?? null;
  const invalidateStorySettings = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsCharacters(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScenes(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsProps(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsWorld(novelId) }),
    ]);
  };
  const chapterWorkspace = useNovelChapterWorkspace(novelId);
  const referenceStage = useReferenceDraftStage({
    novelId,
    workspace: chapterWorkspace,
    onApplied: () => setCurrentTab("draft"),
  });
  const extractStage = useReferenceExtractStage({
    novelId,
    chapterId: chapterWorkspace.currentChapter?.id ?? null,
    referenceText: referenceStage.referenceText,
  });
  const storyboard = useStoryboardStage({
    novelId,
    novelTitle: overview?.novel.title ?? "",
    drama: overview?.drama ?? null,
    chapterCount: overview?.novel.chapterCount ?? 0,
  });

  const directorTask = overview?.novel.directorTask ?? null;
  const directorActive = directorTask?.status === "running" || directorTask?.status === "queued";

  // 分镜自动同步：切换章节或进入「分镜」页签时，静默把小说最新内容打包进分镜项目
  // （幂等：upsert 内容包、重建角色与初始事实），不再依赖手动「同步最新章节」按钮。
  const dramaProjectId = overview?.drama?.projectId ?? null;
  const currentChapterId = chapterWorkspace.currentChapter?.id ?? null;
  const lastSyncKeyRef = useRef("");
  useEffect(() => {
    const syncKey = `${dramaProjectId ?? ""}|${currentChapterId ?? ""}|${currentTab === "storyboard" ? "sb" : "-"}`;
    if (!dramaProjectId || syncKey === lastSyncKeyRef.current || storyboard.syncMutation.isPending) {
      return;
    }
    lastSyncKeyRef.current = syncKey;
    storyboard.syncMutation.mutate();
  }, [dramaProjectId, currentChapterId, currentTab, storyboard.syncMutation]);

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
    ? "还没有章节。"
    : !chapterWorkspace.expectationText.trim()
      ? "本章还没有初稿。"
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
        <Button variant="outline" size="sm" className="max-w-[240px]" onClick={() => setChapterManageOpen(true)}>
          <span className="truncate">{chapter ? `${chapter.order} · ${chapter.title}` : "章节管理"}</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="新增章节"
          title={directorActive ? "AI 正在写作，暂停后再手动添加章节。" : "新增下一章"}
          disabled={directorActive}
          onClick={() => setCreateChapterOpen(true)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={stage} onValueChange={(value) => setStage(value as StudioStage)}>
        <header className="overflow-hidden rounded-3xl border border-border bg-background shadow-sm">
          <div className="flex flex-col gap-2.5 px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-4 sm:px-5">
            <Link
              to="/drama"
              aria-label="返回漫剧列表"
              className="flex min-w-0 items-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">{overview.novel.title}</span>
            </Link>
            <TabsList className="sm:justify-self-center">
              <TabsTrigger value="current"><BookOpenText className="mr-1.5 h-4 w-4" aria-hidden="true" />{STAGE_LABELS.current}</TabsTrigger>
              <TabsTrigger value="assets"><Boxes className="mr-1.5 h-4 w-4" aria-hidden="true" />{STAGE_LABELS.assets}</TabsTrigger>
              <TabsTrigger value="settings"><Settings className="mr-1.5 h-4 w-4" aria-hidden="true" />{STAGE_LABELS.settings}</TabsTrigger>
            </TabsList>
            <div className="flex flex-wrap items-center justify-end gap-2">{headerActions}</div>
          </div>
          {stage === "current" ? (
            <SubTabRow>
              <span className="hidden sm:block" aria-hidden="true" />
              <Tabs
                value={currentTab}
                onValueChange={(value) => setCurrentTab(value as CurrentTab)}
                className="sm:justify-self-center"
              >
                <TabsList>
                  <TabsTrigger value="reference">{CURRENT_TAB_LABELS.reference}</TabsTrigger>
                  <TabsTrigger value="extract">{CURRENT_TAB_LABELS.extract}</TabsTrigger>
                  <TabsTrigger value="draft">{CURRENT_TAB_LABELS.draft}</TabsTrigger>
                  <TabsTrigger value="text">{CURRENT_TAB_LABELS.text}</TabsTrigger>
                  <TabsTrigger value="storyboard">{CURRENT_TAB_LABELS.storyboard}</TabsTrigger>
                  <TabsTrigger value="video">{CURRENT_TAB_LABELS.video}</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-self-end">
                {currentTab === "extract" ? (
                  <Button
                    size="sm"
                    onClick={() => extractStage.extractMutation.mutate()}
                    disabled={extractStage.extractMutation.isPending || extractStage.extractDisabledReason !== null}
                    title={extractStage.extractDisabledReason ?? "从参考文本提取角色、场景与世界观"}
                  >
                    {extractStage.extractMutation.isPending
                      ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                    提取
                  </Button>
                ) : currentTab === "reference" ? (
                  <Button
                    size="sm"
                    onClick={() => referenceStage.parseMutation.mutate()}
                    disabled={referenceStage.parseMutation.isPending || referenceStage.parseDisabledReason !== null}
                    title={referenceStage.parseDisabledReason ?? "按参考文本生成本章初稿"}
                  >
                    {referenceStage.parseMutation.isPending
                      ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                    解析
                  </Button>
                ) : currentTab === "draft" ? (
                  <>
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
                  </>
                ) : currentTab === "video" && overview.drama ? (
                  <Button size="sm" asChild>
                    <Link to={`/drama/projects/${overview.drama.projectId}`}>
                      <Film className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" />打开视频工作台
                    </Link>
                  </Button>
                ) : null}
              </div>
            </SubTabRow>
          ) : stage === "assets" ? (
            <SubTabRow>
              <span className="hidden sm:block" aria-hidden="true" />
              <Tabs
                value={assetTab}
                onValueChange={(value) => setAssetTab(value as AssetTab)}
                className="sm:justify-self-center"
              >
                <TabsList>
                  <TabsTrigger value="characters">
                    {ASSET_TAB_LABELS.characters}{settingsOverview ? ` ${settingsOverview.counts.characters}` : ""}
                  </TabsTrigger>
                  <TabsTrigger value="scenes">
                    {ASSET_TAB_LABELS.scenes}{settingsOverview ? ` ${settingsOverview.counts.scenes}` : ""}
                  </TabsTrigger>
                  <TabsTrigger value="props">
                    {ASSET_TAB_LABELS.props}{settingsOverview ? ` ${settingsOverview.counts.props}` : ""}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="hidden sm:block" aria-hidden="true" />
            </SubTabRow>
          ) : (
            <SubTabRow>
              <span className="hidden sm:block" aria-hidden="true" />
              <Tabs
                value={settingsTab}
                onValueChange={(value) => setSettingsTab(value as SettingsTab)}
                className="sm:justify-self-center"
              >
                <TabsList>
                  <TabsTrigger value="world">{SETTINGS_TAB_LABELS.world}</TabsTrigger>
                  <TabsTrigger value="project">{SETTINGS_TAB_LABELS.project}</TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="hidden sm:block" aria-hidden="true" />
            </SubTabRow>
          )}
        </header>

        <TabsContent value="current" className="space-y-4">
          {currentTab === "extract" ? (
            <ReferenceExtractTab stage={extractStage} />
          ) : currentTab === "reference" ? (
            <ReferenceTab
              value={referenceStage.referenceText}
              onChange={referenceStage.setReferenceText}
            />
          ) : currentTab === "draft" ? (
            <NovelOutlineTab
              novelId={novelId}
              workspace={chapterWorkspace}
              onOpenChapterManage={() => setChapterManageOpen(true)}
            />
          ) : currentTab === "text" ? (
            <NovelChapterOutlineTab workspace={chapterWorkspace} />
          ) : currentTab === "storyboard" ? (
            overview.drama ? (
              <ShotVoiceListPanel novelId={novelId} projectId={overview.drama.projectId} />
            ) : (
              <StoryboardBootstrapCard
                chapterCount={overview.novel.chapterCount}
                createPending={storyboard.createMutation.isPending}
                onCreate={() => storyboard.createMutation.mutate()}
              />
            )
          ) : (
            <VideoSection drama={overview.drama} videoProviders={overview.videoProviders} />
          )}
        </TabsContent>

        <TabsContent value="assets" className="space-y-4">
          <section className="overflow-hidden rounded-3xl border border-border bg-background p-4 shadow-sm sm:p-6">
            {assetTab === "characters" ? (
              <SettingsCharactersTab novelId={novelId} onChanged={invalidateStorySettings} />
            ) : assetTab === "scenes" ? (
              <SettingsScenesTab novelId={novelId} onChanged={invalidateStorySettings} />
            ) : (
              <SettingsPropsTab novelId={novelId} onChanged={invalidateStorySettings} />
            )}
          </section>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <ReferenceNovelCard novelId={novelId} referenceDocument={overview.novel.referenceDocument ?? null} />
          {settingsTab === "world" ? (
            <section className="overflow-hidden rounded-3xl border border-border bg-background p-4 shadow-sm sm:p-6">
              <SettingsWorldTab novelId={novelId} onChanged={invalidateStorySettings} />
            </section>
          ) : (
            <ProjectSettingsSection drama={overview.drama} storyboard={storyboard} />
          )}
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

      <CreateChapterDialog
        novelId={novelId}
        open={createChapterOpen}
        onOpenChange={setCreateChapterOpen}
        nextOrder={chapterWorkspace.chapters.length > 0
          ? Math.max(...chapterWorkspace.chapters.map((chapter) => chapter.order)) + 1
          : 1}
        onCreated={async () => {
          await queryClient.invalidateQueries({ queryKey: [DRAMA_CHAPTERS_QUERY_KEY, novelId] });
        }}
      />

      <Dialog
        open={referenceStage.pendingDraft !== null}
        onOpenChange={(open) => { if (!open) referenceStage.setPendingDraft(null); }}
      >
        <AppDialogContent
          title="替换本章初稿"
          description="本章初稿已有内容。"
          footer={
            <>
              <Button variant="outline" onClick={() => referenceStage.setPendingDraft(null)}>取消</Button>
              <Button
                onClick={() => {
                  const draft = referenceStage.pendingDraft;
                  if (draft !== null) {
                    referenceStage.applyDraft(draft, draft.split("\n").length);
                    referenceStage.setPendingDraft(null);
                  }
                }}
              >
                替换
              </Button>
            </>
          }
        >
          <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border/70 bg-muted/10 px-4 py-3 text-sm leading-7 text-foreground">
            {referenceStage.pendingDraft}
          </div>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}

// 三个项目级页签共用的子页签条：子页签居中，右侧放当前子页签自己的工具按钮。
function SubTabRow(props: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 border-t border-border bg-muted/[0.28] px-4 py-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-4">
      {props.children}
    </div>
  );
}

// 分镜管线共享状态：画面风格选择（「设定」页签用）、创建分镜项目、章节自动同步。
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
        throw new Error("小说还没有成稿章节。");
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
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "同步小说内容到分镜失败，请重试。"),
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
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>分镜项目状态</span>
          {drama ? (
            <Badge variant="outline">{drama.status}</Badge>
          ) : (
            <span>还没有分镜项目。</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// 「分镜」页签还没有分镜项目时的引导卡：从小说成稿一键创建分镜项目，
// 创建后分镜板直接在本页签内展示与操作。
function StoryboardBootstrapCard(props: {
  chapterCount: number;
  createPending: boolean;
  onCreate: () => void;
}) {
  return (
    <Card className="rounded-3xl">
      <CardContent className="p-6">
        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-10 text-center">
          <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
            还没有分镜项目。
          </p>
          <Button
            className="mt-4"
            size="sm"
            onClick={props.onCreate}
            disabled={props.createPending || props.chapterCount < 1}
            title={props.chapterCount < 1 ? "还没有成稿章节。" : undefined}
          >
            {props.createPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Wand2 className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            从成稿生成分镜
          </Button>
        </div>
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
                当前只有占位视频通道，不会生成真实视频。
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">还没有分镜项目。</p>
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
