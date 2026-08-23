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
} from "lucide-react";
import type { ComicDramaLinkStats } from "@ai-novel/shared/types/comicDrama";
import { getComicDramaStudioOverview } from "@/api/media/comicDrama";
import {
  assembleDramaSourceBundle,
  generateComicDramaStoryboard,
  getDramaVisualStyles,
} from "@/api/media/drama";
import { getStorySettingsOverview, getStorySettingsWorld } from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import AiButton from "@/components/common/AiButton";
import SettingsCharactersTab from "@/pages/novels/components/storySettings/SettingsCharactersTab";
import SettingsPropsTab from "@/pages/novels/components/storySettings/SettingsPropsTab";
import SettingsScenesTab from "@/pages/novels/components/storySettings/SettingsScenesTab";
import WorldSettingsPanel from "@/pages/drama/comicDrama/components/WorldSettingsPanel";
import ReferenceNovelCard from "@/pages/drama/comicDrama/components/ReferenceNovelCard";
import WorldMapPanel from "@/pages/drama/comicDrama/components/WorldMapPanel";
import ChapterManageDialog from "@/pages/drama/comicDrama/components/ChapterManageDialog";
import CreateChapterDialog from "@/pages/drama/comicDrama/components/CreateChapterDialog";
import ScriptTab from "@/pages/drama/comicDrama/components/ScriptTab";
import ReferenceExtractTab from "@/pages/drama/comicDrama/components/ReferenceExtractTab";
import ReferenceTab from "@/pages/drama/comicDrama/components/ReferenceTab";
import ShotVoiceListPanel from "@/pages/drama/comicDrama/ShotVoiceListPanel";
import { DRAMA_CHAPTERS_QUERY_KEY, useNovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";
import { useReferenceDraftStage } from "@/pages/drama/comicDrama/hooks/useReferenceDraftStage";
import { useReferenceExtractStage } from "@/pages/drama/comicDrama/hooks/useReferenceExtractStage";
import { invalidateStorySettingsCaches } from "@/pages/drama/comicDrama/storySettingsSync";

// 顶层页签是项目级的：当前（章节工作台）/资产（角色场景道具）/设定（世界观·地图·通用）。
type StudioStage = "current" | "assets" | "settings";
// 「当前」的子页签全部作用于当前章：参考→提取→脚本→分镜→视频（脚本是本章的线性分镜脚本，
// 2026-08-20 用户决定初稿+正文合并为一：解析产出的初稿质量已可当正文，编辑改成列表而非自由文本）。
type CurrentTab = "reference" | "extract" | "script" | "storyboard" | "video";
// 「资产」的子页签：角色 / 场景 / 道具（世界观在「设定」页签）。
type AssetTab = "characters" | "scenes" | "props";
// 「设定」的子页签：世界观（章节解析累积的关键设定条目，只读+可删）/ 地图（国家→城市→地点三层）/ 通用（参考小说与项目配置）。
// 画风不在本项目内维护：资产画风与时代画风库在独立的「画风管理」页（/art-style）；时代风格由各资产状态自带，脚本不再定义章节画风。
type SettingsTab = "world" | "map" | "general";

const STAGE_LABELS: Record<StudioStage, string> = {
  current: "当前",
  assets: "资产",
  settings: "设定",
};

const CURRENT_TAB_LABELS: Record<CurrentTab, string> = {
  reference: "参考",
  extract: "提取",
  script: "脚本",
  storyboard: "分镜",
  video: "视频",
};

const ASSET_TAB_LABELS: Record<AssetTab, string> = {
  characters: "角色",
  scenes: "场景",
  props: "道具",
};

const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  world: "世界观",
  map: "地图",
  general: "通用",
};

// 漫剧工作室：顶栏为返回（图标+项目名，弱化样式）+ 居中的项目级页签（当前/资产/设定），
// 每个页签下方都有自己的居中子页签条、操作按钮靠右。
// 「当前」按章推进：顶栏章节管理显示当前章并负责切换，子页签（脚本/分镜/视频）
// 全部随当前章更新；「解析」按参考文本生成本章脚本与设定提取。
export default function ComicDramaStudioPage() {
  const { novelId = "" } = useParams();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<StudioStage>("current");
  const [currentTab, setCurrentTab] = useState<CurrentTab>("script");
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
  // 小说级默认画风（NovelSettingsWorld.defaultArtStyle）：历史遗留数据，项目内已无编辑入口，
  // 仅作为创建分镜项目时 visualStyle 的兜底（解析链的兜底层之一）。
  const worldSettingsQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsWorld(novelId),
    queryFn: () => getStorySettingsWorld(novelId),
    enabled: Boolean(novelId),
  });
  const novelDefaultArtStyle = worldSettingsQuery.data?.data?.defaultArtStyle ?? null;
  const invalidateStorySettings = () => invalidateStorySettingsCaches(queryClient, novelId);
  const chapterWorkspace = useNovelChapterWorkspace(novelId);
  const referenceStage = useReferenceDraftStage({
    novelId,
    workspace: chapterWorkspace,
    referenceDocId: overview?.novel.referenceDocument?.id ?? null,
    onApplied: () => setCurrentTab("script"),
  });
  const extractStage = useReferenceExtractStage({
    novelId,
    workspace: chapterWorkspace,
  });
  const selectedScriptReady = Boolean(
    chapterWorkspace.currentChapter
      && chapterWorkspace.expectationText.trim()
      && !chapterWorkspace.expectationDirty
      && !chapterWorkspace.savePending
      && !chapterWorkspace.saveError,
  );
  const storyboard = useStoryboardStage({
    novelId,
    drama: overview?.drama ?? null,
    novelDefaultStyleId: novelDefaultArtStyle,
    chapterOrder: chapterWorkspace.currentChapter?.order ?? null,
    scriptReady: selectedScriptReady,
    onGenerated: () => setCurrentTab("storyboard"),
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
                  <TabsTrigger value="extract">
                    {CURRENT_TAB_LABELS.extract}{extractStage.totalItems > 0 ? ` ${extractStage.totalItems}` : ""}
                  </TabsTrigger>
                  <TabsTrigger value="script">{CURRENT_TAB_LABELS.script}</TabsTrigger>
                  <TabsTrigger value="storyboard">{CURRENT_TAB_LABELS.storyboard}</TabsTrigger>
                  <TabsTrigger value="video">{CURRENT_TAB_LABELS.video}</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:justify-self-end">
                {currentTab === "reference" ? (
                  <>
                    {chapterWorkspace.referenceSavePending ? (
                      <span className="text-xs text-muted-foreground">自动保存中…</span>
                    ) : chapterWorkspace.referenceDirty ? (
                      <span className="text-xs text-muted-foreground">还有未保存的修改…</span>
                    ) : null}
                    {referenceStage.hasReferenceDoc ? (
                      <Button
                        size="sm"
                        onClick={referenceStage.injectReferenceSource}
                        disabled={referenceStage.injectDisabled}
                        title={referenceStage.injectTitle}
                      >
                        引用
                      </Button>
                    ) : null}
                    {referenceStage.parseDisabledReason ? (
                      <span className="text-xs text-muted-foreground">{referenceStage.parseDisabledReason}</span>
                    ) : null}
                    <Button
                      size="sm"
                      onClick={() => referenceStage.parseMutation.mutate()}
                      disabled={referenceStage.parseMutation.isPending || referenceStage.parseDisabledReason !== null}
                      title={referenceStage.parseDisabledReason ?? "按参考文本生成本章脚本"}
                    >
                      {referenceStage.parseMutation.isPending
                        ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                        : <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                      解析
                    </Button>
                    {referenceStage.parseElapsedLabel ? (
                      <span className="text-xs text-muted-foreground">{referenceStage.parseElapsedLabel}</span>
                    ) : referenceStage.lastParseDurationLabel ? (
                      <span className="text-xs text-muted-foreground">上次解析 {referenceStage.lastParseDurationLabel}</span>
                    ) : null}
                  </>
                ) : currentTab === "script" ? (
                  <>
                    {chapterWorkspace.savePending ? (
                      <span className="text-xs text-muted-foreground">自动保存中…</span>
                    ) : chapterWorkspace.saveError ? (
                      <span className="inline-flex items-center gap-2 text-xs text-destructive">
                        保存失败
                        <button
                          type="button"
                          className="underline underline-offset-2"
                          onClick={chapterWorkspace.flushExpectationSave}
                        >
                          重试
                        </button>
                      </span>
                    ) : chapterWorkspace.expectationDirty ? (
                      <span className="text-xs text-muted-foreground">还有未保存的修改…</span>
                    ) : null}
                    <AiButton
                      size="sm"
                      disabled={!storyboard.scriptReady || storyboard.generateMutation.isPending}
                      onClick={() => storyboard.generateMutation.mutate()}
                    >
                      {storyboard.generateMutation.isPending ? "生成中…" : "生成"}
                    </AiButton>
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
                  <TabsTrigger value="map">{SETTINGS_TAB_LABELS.map}</TabsTrigger>
                  <TabsTrigger value="general">{SETTINGS_TAB_LABELS.general}</TabsTrigger>
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
              placeholder={referenceStage.hasReferenceDoc ? "点「引用」带入参考小说对应章节，或直接粘贴参考文本" : "粘贴参考文本"}
            />
          ) : currentTab === "script" ? (
            <ScriptTab
              novelId={novelId}
              workspace={chapterWorkspace}
              onOpenChapterManage={() => setChapterManageOpen(true)}
            />
          ) : currentTab === "storyboard" ? (
            overview.drama ? (
              <ShotVoiceListPanel novelId={novelId} projectId={overview.drama.projectId} />
            ) : (
              <StoryboardBootstrapCard
                canGenerate={storyboard.scriptReady}
                generatePending={storyboard.generateMutation.isPending}
                onGenerate={() => storyboard.generateMutation.mutate()}
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
          {settingsTab === "world" ? (
            <section className="overflow-hidden rounded-3xl border border-border bg-background p-4 shadow-sm sm:p-6">
              <WorldSettingsPanel novelId={novelId} onChanged={invalidateStorySettings} />
            </section>
          ) : settingsTab === "map" ? (
            <section className="overflow-hidden rounded-3xl border border-border bg-background p-4 shadow-sm sm:p-6">
              <WorldMapPanel novelId={novelId} onChanged={invalidateStorySettings} />
            </section>
          ) : (
            <>
              <ReferenceNovelCard novelId={novelId} referenceDocument={overview.novel.referenceDocument ?? null} />
              <ProjectSettingsSection drama={overview.drama} />
            </>
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
        referenceDocId={overview?.novel.referenceDocument?.id ?? null}
        onCreated={async () => {
          await queryClient.invalidateQueries({ queryKey: [DRAMA_CHAPTERS_QUERY_KEY, novelId] });
        }}
      />

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

// 分镜管线共享状态：画风选项、当前章节生成、章节自动同步。
// 顶栏按钮与内容区共用同一份 mutation，避免两处状态漂移。
function useStoryboardStage(input: {
  novelId: string;
  drama: ComicDramaLinkStats | null;
  novelDefaultStyleId: string | null;
  chapterOrder: number | null;
  scriptReady: boolean;
  onGenerated: () => void;
}) {
  const queryClient = useQueryClient();
  const stylesQuery = useQuery({
    queryKey: queryKeys.drama.visualStyles,
    queryFn: () => getDramaVisualStyles(),
  });
  const styleOptions = stylesQuery.data?.data ?? [];
  // 生效优先级：已有分镜项目的风格 > 小说默认风格 > 内置默认（预设列表第一项）。
  // 项目画风引用全局时代画风库：内置预设 id 或全局自定义风格名（2026-08-22 起都认）。
  const novelDefaultIsKnown = Boolean(input.novelDefaultStyleId)
    && styleOptions.some((style) => style.id === input.novelDefaultStyleId);
  const effectiveStyleId = input.drama?.visualStyle
    || (novelDefaultIsKnown ? input.novelDefaultStyleId : null)
    || styleOptions[0]?.id
    || "unreal_cinematic_3d";
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.overview(input.novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.links([input.novelId]) });
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (input.chapterOrder === null || !input.scriptReady) {
        throw new Error("请先保存当前章节脚本。");
      }
      return generateComicDramaStoryboard(input.novelId, input.chapterOrder, {
        visualStyle: effectiveStyleId,
      });
    },
    onSuccess: async (response) => {
      await invalidate();
      toast.success(`第 ${response.data?.episodeOrder ?? input.chapterOrder} 章分镜已生成。`);
      input.onGenerated();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "生成分镜失败，请重试。"),
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

  return { styleOptions, effectiveStyleId, scriptReady: input.scriptReady, generateMutation, syncMutation };
}

// 「设定 · 通用」页签：项目级配置，看分镜项目状态。
function ProjectSettingsSection(props: {
  drama: ComicDramaLinkStats | null;
}) {
  const { drama } = props;
  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-4 p-6">
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

// 「分镜」页签还没有分镜项目时的入口：生成当前选中章节的分镜。
function StoryboardBootstrapCard(props: {
  canGenerate: boolean;
  generatePending: boolean;
  onGenerate: () => void;
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
            onClick={props.onGenerate}
            disabled={props.generatePending || !props.canGenerate}
            title={!props.canGenerate ? "请先保存当前章节脚本。" : undefined}
          >
            {props.generatePending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            生成
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


function VideoSection(props: {
  drama: { projectId: string; videoPromptCount: number; videoReadyCount: number } | null;
  videoProviders: Array<{ id: string; label: string; kind: string; isDefault: boolean }>;
}) {
  const hasRealProvider = props.videoProviders.some((provider) => provider.id !== "mock");
  const defaultProvider = props.videoProviders.find((provider) => provider.isDefault)
    ?? props.videoProviders.find((provider) => provider.id === "local_ffmpeg")
    ?? props.videoProviders[0];
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
            {defaultProvider ? (
              <div className="text-sm text-muted-foreground">默认视频通道：{defaultProvider.label}</div>
            ) : null}
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
