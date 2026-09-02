import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenText,
  Boxes,
  Loader2,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import type { ComicDramaLinkStats } from "@ai-novel/shared/types/comicDrama";
import { getComicDramaStudioOverview, updateDramaPreviewScene } from "@/api/media/comicDrama";
import {
  assembleDramaSourceBundle,
  generateComicDramaStoryboard,
  getDramaVisualStyles,
} from "@/api/media/drama";
import { getStorySettingsOverview, getStorySettingsScenes, getStorySettingsWorld } from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import SelectControl from "@/components/common/SelectControl";
import AiButton from "@/components/common/AiButton";
import SettingsCharactersTab from "@/pages/novels/components/storySettings/SettingsCharactersTab";
import SettingsPropsTab from "@/pages/novels/components/storySettings/SettingsPropsTab";
import SettingsScenesTab from "@/pages/novels/components/storySettings/SettingsScenesTab";
import AutoStoryAssetImageGeneration from "@/pages/novels/components/storySettings/AutoStoryAssetImageGeneration";
import { usePageNavActionsSlot, useRegisterPageTabs } from "@/components/layout/PageTabsContext";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { isRememberedTabValue } from "@/lib/rememberedTabs";
import { useRememberedTab } from "@/hooks/useRememberedTab";
import WorldSettingsPanel from "@/pages/drama/comicDrama/components/WorldSettingsPanel";
import ReferenceNovelCard from "@/pages/drama/comicDrama/components/ReferenceNovelCard";
import WorldMapPanel from "@/pages/drama/comicDrama/components/WorldMapPanel";
import ChapterManageDialog from "@/pages/drama/comicDrama/components/ChapterManageDialog";
import CreateChapterDialog from "@/pages/drama/comicDrama/components/CreateChapterDialog";
import ScriptTab from "@/pages/drama/comicDrama/components/ScriptTab";
import ReferenceExtractTab from "@/pages/drama/comicDrama/components/ReferenceExtractTab";
import ReferenceTab from "@/pages/drama/comicDrama/components/ReferenceTab";
import ShotVoiceListPanel from "@/pages/drama/comicDrama/ShotVoiceListPanel";
import { DramaEpisodeAssemblyPanel } from "@/pages/drama/components/DramaEpisodeAssemblyPanel";
import { DRAMA_CHAPTERS_QUERY_KEY, useNovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";
import { useReferenceDraftStage } from "@/pages/drama/comicDrama/hooks/useReferenceDraftStage";
import { useReferenceExtractStage } from "@/pages/drama/comicDrama/hooks/useReferenceExtractStage";
import { invalidateStorySettingsCaches } from "@/pages/drama/comicDrama/storySettingsSync";
import {
  CHAPTER_WORKBENCH_STAGES,
  readStudioNavigation,
  SETTINGS_TAB_LABELS,
  STUDIO_STAGE_DIVIDERS,
  STUDIO_STAGE_LABELS,
  STUDIO_STAGE_ORDER,
  type SettingsTab,
  type StudioStage,
} from "./navigation/studioNavigation";

// 章节工作台的子页签也已拍平：参考/提取/脚本/分镜/视频与角色、场景、道具、设定
// 平级（2026-08-27 用户决定），「章节」「资产」两个中间层都不复存在。
// 这些页签始终作用于「当前选中章节」：参考→提取→脚本→分镜→成片（脚本是本章的线性
// 分镜脚本，2026-08-20 用户决定初稿+正文合并为一：解析产出的初稿质量已可当正文，
// 编辑改成列表而非自由文本）；章节切换由导航栏操作区的章节按钮承担。
// 「设定」的子页签：世界观（章节解析累积的关键设定条目，只读+可删）/ 地图（国家→城市→地点三层）/ 通用（参考小说与项目配置）。

const DEFAULT_DRAMA_VISUAL_STYLE_ID = "realistic";
const SETTINGS_TAB_VALUES = ["world", "map", "general"] as const;

// 漫剧工作室：全部项目级页签统一放在顶部导航栏，章节工作台页签的工具按钮
// （章节/引用/解析/生成/分镜工具）也上收到导航栏「AI 实况」左侧；
// 移动端没有顶部导航栏，页签、子页签条和工具按钮都保留在页头内。
export default function ComicDramaStudioPage() {
  const { novelId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const isMobileViewport = useIsMobileViewport();
  const rawStage = searchParams.get("stage");
  const legacyStage = readStudioNavigation(searchParams.toString()).stage;
  const explicitStage = isRememberedTabValue(rawStage, STUDIO_STAGE_ORDER)
    ? rawStage
    : rawStage === "assets" || rawStage === "current" || searchParams.has("tab")
      ? legacyStage
      : null;
  const hasInvalidStageParam = rawStage !== null && explicitStage === null;
  const [rememberedStage, setRememberedStage] = useRememberedTab<StudioStage>({
    scope: `drama-project:${novelId || "none"}:studio-stage`,
    defaultValue: "script",
    values: STUDIO_STAGE_ORDER,
  });
  const [settingsTab, setSettingsTab] = useRememberedTab<SettingsTab>({
    scope: `drama-project:${novelId || "none"}:studio-settings`,
    defaultValue: "world",
    values: SETTINGS_TAB_VALUES,
  });
  const stage = explicitStage ?? (hasInvalidStageParam ? "script" : rememberedStage);
  const [storyboardToolbarTarget, setStoryboardToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [chapterManageOpen, setChapterManageOpen] = useState(false);
  const [createChapterOpen, setCreateChapterOpen] = useState(false);

  useEffect(() => {
    if (explicitStage !== null) {
      setRememberedStage(explicitStage);
      return;
    }
    if (hasInvalidStageParam) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("stage");
        return next;
      }, { replace: true });
    }
  }, [explicitStage, hasInvalidStageParam, setRememberedStage, setSearchParams]);

  const handleStageChange = (nextStage: StudioStage) => {
    setRememberedStage(nextStage);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("stage", nextStage);
      return next;
    }, { replace: true });
  };


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
    onApplied: () => handleStageChange("script"),
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
    onGenerated: () => handleStageChange("storyboard"),
  });

  const directorTask = overview?.novel.directorTask ?? null;
  const directorActive = directorTask?.status === "running" || directorTask?.status === "queued";
  // 桌面端项目级页签与子页签统一上收到顶部导航栏；移动端保留页头内页签。
  const stageTabRow = {
    id: "studio-stage",
    tabs: STUDIO_STAGE_ORDER.map((key) => ({
      key,
      label: STUDIO_STAGE_LABELS[key],
      dividerAfter: STUDIO_STAGE_DIVIDERS.has(key),
    })),
    active: stage,
    rememberedKey: `drama-project:${novelId || "none"}:studio-stage`,
    onSelect: (key: string) => handleStageChange(key as StudioStage),
  };
  const subTabRow = stage === "settings"
    ? {
      id: "studio-sub",
      tabs: (Object.keys(SETTINGS_TAB_LABELS) as SettingsTab[]).map((key) => ({ key, label: SETTINGS_TAB_LABELS[key] })),
      active: settingsTab,
      rememberedKey: `drama-project:${novelId || "none"}:studio-settings`,
      onSelect: (key: string) => setSettingsTab(key as SettingsTab),
      }
    : null;
  // 角色 / 场景 / 道具页签没有子页签，三级胶囊只在章节、设定语境下出现。
  const pageTabRows = subTabRow ? [stageTabRow, subTabRow] : [stageTabRow];
  useRegisterPageTabs(!isMobileViewport, pageTabRows);
  // 顶部导航栏「AI 实况」左侧的操作区槽位：桌面端把当前页签的工具按钮 portal 进去。
  const navActionsSlot = usePageNavActionsSlot();

  // 分镜自动同步：切换章节或进入「分镜」页签时，静默把小说最新内容打包进分镜项目
  // （幂等：upsert 内容包、重建角色与初始事实），不再依赖手动「同步最新章节」按钮。
  const dramaProjectId = overview?.drama?.projectId ?? null;
  const currentChapterId = chapterWorkspace.currentChapter?.id ?? null;
  const lastSyncKeyRef = useRef("");
  useEffect(() => {
    const syncKey = `${dramaProjectId ?? ""}|${currentChapterId ?? ""}|${stage === "storyboard" ? "sb" : "-"}`;
    if (!dramaProjectId || syncKey === lastSyncKeyRef.current || storyboard.syncMutation.isPending) {
      return;
    }
    lastSyncKeyRef.current = syncKey;
    storyboard.syncMutation.mutate();
  }, [dramaProjectId, currentChapterId, stage, storyboard.syncMutation]);

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

  // 章节工作台五页签（参考/提取/脚本/分镜/视频）共享章节上下文的操作按钮。
  const isChapterWorkbench = (CHAPTER_WORKBENCH_STAGES as readonly string[]).includes(stage);
  let headerActions: ReactNode = null;
  if (isChapterWorkbench) {
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

  // 章节工作台页签的工具按钮（按页签变化）：桌面端渲染进顶部导航栏操作区，
  // 移动端渲染在页头子页签条右列。分镜页签时容器同时充当分镜工具的传送目标。
  const currentToolbarContent = isChapterWorkbench ? (
    <>
      {stage === "reference" ? (
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
      ) : stage === "script" ? (
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
      ) : null}
    </>
  ) : null;

  const mobileToolbar = isMobileViewport && isChapterWorkbench ? (
    <div
      ref={stage === "storyboard" ? setStoryboardToolbarTarget : undefined}
      className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto"
    >
      {currentToolbarContent}
    </div>
  ) : null;

  // 桌面端操作区：整组按钮（页签工具 + 章节管理）portal 进顶部导航栏，
  // 位于「AI 实况」左侧；portal 内容仍在本组件树内，按钮状态与页面实时同步。
  const navActionsPortal = !isMobileViewport && isChapterWorkbench && navActionsSlot
    ? createPortal(
        <div className="flex min-w-0 items-center justify-end gap-2">
          <div
            ref={stage === "storyboard" ? setStoryboardToolbarTarget : undefined}
            className="flex items-center gap-1.5"
          >
            {currentToolbarContent}
          </div>
          {headerActions}
        </div>,
        navActionsSlot,
      )
    : null;

  return (
    <div className="space-y-4">
      <AutoStoryAssetImageGeneration novelId={novelId} />
      {navActionsPortal}
      <Tabs value={stage} onValueChange={(value) => handleStageChange(value as StudioStage)}>
        {isMobileViewport ? (
        <header className="overflow-hidden rounded-3xl border border-border bg-background shadow-sm">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-5">
            <TabsList>
              {STUDIO_STAGE_ORDER.map((key) => (
                <TabsTrigger key={key} value={key}>{STUDIO_STAGE_LABELS[key]}</TabsTrigger>
              ))}
            </TabsList>
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              {headerActions}
            </div>
          </div>
          {stage === "settings" ? (
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
          ) : (
            <SubTabRow>
              <span className="hidden sm:block" aria-hidden="true" />
              {mobileToolbar}
              <span className="hidden sm:block" aria-hidden="true" />
            </SubTabRow>
          )}
        </header>
        ) : null}

        <TabsContent value="reference" className="space-y-4">
          <ReferenceTab
            value={referenceStage.referenceText}
            onChange={referenceStage.setReferenceText}
            placeholder={referenceStage.hasReferenceDoc ? "点「引用」带入参考小说对应章节，或直接粘贴参考文本" : "粘贴参考文本"}
          />
        </TabsContent>

        <TabsContent value="extract" className="space-y-4">
          <ReferenceExtractTab stage={extractStage} />
        </TabsContent>

        <TabsContent value="script" className="space-y-4">
          <ScriptTab
            novelId={novelId}
            workspace={chapterWorkspace}
            onOpenChapterManage={() => setChapterManageOpen(true)}
          />
        </TabsContent>

        <TabsContent value="storyboard" className="space-y-4">
          {overview.drama ? (
            <ShotVoiceListPanel
              novelId={novelId}
              projectId={overview.drama.projectId}
              chapterOrder={chapterWorkspace.currentChapter?.order ?? null}
              toolbarTarget={storyboardToolbarTarget}
            />
          ) : (
            <StoryboardBootstrapCard
              canGenerate={storyboard.scriptReady}
              generatePending={storyboard.generateMutation.isPending}
              onGenerate={() => storyboard.generateMutation.mutate()}
            />
          )}
        </TabsContent>

        <TabsContent value="video" className="space-y-4">
          <VideoSection drama={overview.drama} order={chapterWorkspace.currentChapter?.order ?? 1} />
        </TabsContent>

        <TabsContent value="characters" className="space-y-4">
          <section className="overflow-hidden rounded-3xl border border-border bg-background p-4 shadow-sm sm:p-6">
            <SettingsCharactersTab novelId={novelId} onChanged={invalidateStorySettings} />
          </section>
        </TabsContent>

        <TabsContent value="scenes" className="space-y-4">
          <section className="overflow-hidden rounded-3xl border border-border bg-background p-4 shadow-sm sm:p-6">
            <SettingsScenesTab novelId={novelId} onChanged={invalidateStorySettings} />
          </section>
        </TabsContent>

        <TabsContent value="props" className="space-y-4">
          <section className="overflow-hidden rounded-3xl border border-border bg-background p-4 shadow-sm sm:p-6">
            <SettingsPropsTab novelId={novelId} onChanged={invalidateStorySettings} />
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
              <ProjectSettingsSection novelId={novelId} drama={overview.drama} />
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
    || DEFAULT_DRAMA_VISUAL_STYLE_ID;
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

// 「设定 · 通用」页签：项目级配置（分镜项目状态 + 漫剧卡片预览图）。
function ProjectSettingsSection(props: {
  novelId: string;
  drama: ComicDramaLinkStats | null;
}) {
  const { novelId, drama } = props;
  const queryClient = useQueryClient();
  const scenesQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsScenes(novelId),
    queryFn: () => getStorySettingsScenes(novelId),
    enabled: Boolean(novelId) && Boolean(drama),
  });
  const scenes = scenesQuery.data?.data ?? [];
  const savePreviewSceneMutation = useMutation({
    mutationFn: (sceneId: string | null) => updateDramaPreviewScene(drama!.projectId, sceneId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.comicDrama.overview(novelId) });
      toast.success("预览图已更新。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "预览图保存失败，请稍后重试。"),
  });

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
        {drama ? (
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1">
              <span className="text-xs font-medium text-foreground">卡片预览图</span>
              <SelectControl
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={drama.previewSceneId ?? ""}
                disabled={savePreviewSceneMutation.isPending}
                onChange={(event) => savePreviewSceneMutation.mutate(event.target.value || null)}
              >
                <option value="">默认（第一个有图的场景）</option>
                {scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>{scene.name}</option>
                ))}
              </SelectControl>
            </label>
            {drama.previewImageUrl ? (
              <img
                src={drama.previewImageUrl}
                alt="当前漫剧卡片预览图"
                className="h-14 w-24 rounded-md border border-border object-cover"
              />
            ) : null}
          </div>
        ) : null}
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
  drama: { projectId: string; shotCount: number } | null;
  order: number;
}) {
  if (!props.drama) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6">
          <p className="text-sm leading-6 text-muted-foreground">还没有分镜项目。</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <DramaEpisodeAssemblyPanel
      projectId={props.drama.projectId}
      order={props.order}
      hasShots={props.drama.shotCount > 0}
      busy={false}
      buttonLabel="合成视频"
      doneButtonLabel="重新合成视频"
    />
  );
}
