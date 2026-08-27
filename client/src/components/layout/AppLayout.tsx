import { Suspense, useEffect, useMemo, useState } from "react";
import { matchPath, Outlet, useLocation } from "react-router-dom";
import AppRouteFallback from "./AppRouteFallback";
import LLMSelectionBootstrap from "./LLMSelectionBootstrap";
import NovelWorkspaceRail from "./NovelWorkspaceRail";
import Sidebar from "./Sidebar";
import TopNav from "./TopNav";
import LiveExecutionDialog from "@/components/liveExecution/LiveExecutionDialog";
import MobileSiteShell from "./mobile/MobileSiteShell";
import AutoDirectorPauseNotificationWatcher from "@/components/autoDirector/AutoDirectorPauseNotificationWatcher";
import { TaskRecoveryProvider } from "./TaskRecoveryContext";
import TaskRecoveryDialog from "./TaskRecoveryDialog";
import { useIsMobileViewport } from "./mobile/useIsMobileViewport";
import { DRAMA_FOCUS_MODE } from "@/config/dramaFocusNav";
import {
  AUTO_DIRECTOR_MOBILE_CLASSES,
  shouldUseAutoDirectorMobileFullWidthContent,
} from "@/mobile/autoDirector";
import { CreationSetupProvider } from "@/components/onboarding/CreationSetupContext";
import { PageTabsProvider, type PageTabRow } from "./PageTabsContext";

const WORKSPACE_RAIL_COLLAPSED_STORAGE_KEY = "ai-novel.workspace-rail.collapsed";
const DEFAULT_APP_MAIN_CLASS_NAME = "min-h-0 min-w-0 flex-1 overflow-y-auto p-6";

export default function AppLayout() {
  const location = useLocation();
  const [pageTabRows, setPageTabRows] = useState<PageTabRow[]>([]);
  const pageTabsContextValue = useMemo(() => ({ rows: pageTabRows, setPageTabRows }), [pageTabRows]);
  const [isWorkspaceRailCollapsed, setIsWorkspaceRailCollapsed] = useState(false);
  const [workspaceNavMode, setWorkspaceNavMode] = useState<"workspace" | "project">("project");
  const isMobileViewport = useIsMobileViewport();
  const isNovelPreview = Boolean(matchPath("/novels/:id/preview", location.pathname));

  const workspaceRoute = useMemo(() => {
    const editMatch = matchPath("/novels/:id/edit", location.pathname);
    if (editMatch?.params.id) {
      return {
        novelId: editMatch.params.id,
        chapterId: "",
      };
    }
    const chapterMatch = matchPath("/novels/:id/chapters/:chapterId", location.pathname);
    if (chapterMatch?.params.id) {
      return {
        novelId: chapterMatch.params.id,
        chapterId: chapterMatch.params.chapterId ?? "",
      };
    }
    return null;
  }, [location.pathname]);

  const isNovelWorkspace = Boolean(workspaceRoute?.novelId);
  const showWorkspaceRail = isNovelWorkspace && workspaceNavMode === "workspace" && Boolean(workspaceRoute);
  const useTopNavLayout = DRAMA_FOCUS_MODE && !showWorkspaceRail;
  const useMobileNovelWorkspaceLayout = isMobileViewport && isNovelWorkspace;
  const useMobileSiteLayout = isMobileViewport && !isNovelWorkspace;
  const useMobileFullWidthContent = useMemo(
    () => shouldUseAutoDirectorMobileFullWidthContent(location.pathname),
    [location.pathname],
  );

  useEffect(() => {
    const workspaceRailValue = window.localStorage.getItem(WORKSPACE_RAIL_COLLAPSED_STORAGE_KEY);
    setIsWorkspaceRailCollapsed(workspaceRailValue === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_RAIL_COLLAPSED_STORAGE_KEY, String(isWorkspaceRailCollapsed));
  }, [isWorkspaceRailCollapsed]);

  useEffect(() => {
    setWorkspaceNavMode(isNovelWorkspace ? "workspace" : "project");
  }, [isNovelWorkspace, location.pathname]);

  if (isNovelPreview) {
    return (
      <CreationSetupProvider>
        <TaskRecoveryProvider>
          <div className="h-[100dvh] overflow-hidden bg-background text-foreground">
            <AutoDirectorPauseNotificationWatcher />
            <LLMSelectionBootstrap />
            <Suspense fallback={<AppRouteFallback />}>
              <Outlet />
            </Suspense>
            <TaskRecoveryDialog />
          </div>
        </TaskRecoveryProvider>
      </CreationSetupProvider>
    );
  }

  if (useMobileNovelWorkspaceLayout) {
    return (
      <CreationSetupProvider>
      <TaskRecoveryProvider>
        <div className="min-h-screen bg-background">
          <AutoDirectorPauseNotificationWatcher />
          <LiveExecutionDialog compact className="fixed right-3 top-3 z-50 h-9 w-9 bg-background px-0 shadow-sm" />
          <LLMSelectionBootstrap />
          <Suspense fallback={<AppRouteFallback />}>
            <Outlet />
          </Suspense>
          <TaskRecoveryDialog />
        </div>
      </TaskRecoveryProvider>
      </CreationSetupProvider>
    );
  }

  if (useMobileSiteLayout) {
    return (
      <CreationSetupProvider>
      <TaskRecoveryProvider>
        <MobileSiteShell>
          <AutoDirectorPauseNotificationWatcher />
          <LLMSelectionBootstrap />
          <Suspense fallback={<AppRouteFallback />}>
            <Outlet />
          </Suspense>
          <TaskRecoveryDialog />
        </MobileSiteShell>
      </TaskRecoveryProvider>
      </CreationSetupProvider>
    );
  }

  return (
    <CreationSetupProvider>
    <TaskRecoveryProvider>
    <PageTabsProvider value={pageTabsContextValue}>
      <div className={useTopNavLayout
        ? "flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background"
        : "flex h-[100dvh] min-h-0 overflow-hidden bg-background"}
      >
        <AutoDirectorPauseNotificationWatcher />
        <LLMSelectionBootstrap />
        {useTopNavLayout ? (
          <TopNav
            onSwitchToWorkspaceNav={isNovelWorkspace ? () => setWorkspaceNavMode("workspace") : undefined}
          />
        ) : null}
        <div className="flex min-h-0 flex-1">
          {!useTopNavLayout ? (
            <div className={useMobileFullWidthContent ? "hidden md:block" : "shrink-0"}>
              {showWorkspaceRail && workspaceRoute ? (
                <NovelWorkspaceRail
                  novelId={workspaceRoute.novelId}
                  chapterId={workspaceRoute.chapterId}
                  collapsed={isWorkspaceRailCollapsed}
                  onToggle={() => setIsWorkspaceRailCollapsed((current) => !current)}
                  onSwitchToProjectNav={() => setWorkspaceNavMode("project")}
                />
              ) : (
                <Sidebar
                  onSwitchToWorkspaceNav={isNovelWorkspace ? () => setWorkspaceNavMode("workspace") : undefined}
                />
              )}
            </div>
          ) : null}
          <main className={useMobileFullWidthContent ? AUTO_DIRECTOR_MOBILE_CLASSES.appMain : DEFAULT_APP_MAIN_CLASS_NAME}>
            <Suspense fallback={<AppRouteFallback />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
        <TaskRecoveryDialog />
      </div>
    </PageTabsProvider>
    </TaskRecoveryProvider>
    </CreationSetupProvider>
  );
}
