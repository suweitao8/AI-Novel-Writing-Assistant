import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BookOpenText,
  Braces,
  CircleHelp,
  Database,
  Globe2,
  House,
  LayoutDashboard,
  ListTodo,
  SquareStack,
  ScanSearch,
  Settings2,
  ShieldCheck,
  SquarePen,
  Tags,
  UsersRound,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { listKnowledgeDocuments } from "@/api/knowledge";
import { queryKeys } from "@/api/queryKeys";
import { getAutoDirectorFollowUpOverview } from "@/api/autoDirectorFollowUps";
import { getTaskOverview } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LiveExecutionDialog from "@/components/liveExecution/LiveExecutionDialog";
import AppVersionBadge from "@/components/layout/AppVersionBadge";
import DesktopBrandMark from "@/components/layout/DesktopBrandMark";
import DesktopReleaseNotesDialog from "@/components/layout/DesktopReleaseNotesDialog";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "创作",
    items: [
      { to: "/", label: "首页", icon: House },
      { to: "/help", label: "创作向导", icon: CircleHelp },
      { to: "/novels", label: "小说列表", icon: BookOpenText },
      { to: "/comic", label: "漫画工作台", icon: SquareStack },
      { to: "/creative-hub", label: "创作中枢", icon: LayoutDashboard },
      { to: "/book-analysis", label: "拆书", icon: ScanSearch },
    ],
  },
  {
    title: "资产",
    items: [
      { to: "/titles", label: "标题工坊", icon: SquarePen },
      { to: "/knowledge", label: "知识库", icon: Database },
      { to: "/worlds", label: "世界样本库", icon: Globe2 },
      { to: "/style-engine", label: "写法引擎", icon: WandSparkles },
      { to: "/anti-ai-rules", label: "反 AI 规则", icon: ShieldCheck },
      { to: "/base-characters", label: "基础角色库", icon: UsersRound },
    ],
  },
  {
    title: "系统",
    items: [
      { to: "/tasks", label: "运行记录", icon: ListTodo },
      { to: "/auto-director/follow-ups", label: "导演跟进", icon: Workflow },
      { to: "/prompt-workbench", label: "提示词管理", icon: Braces },
      { to: "/genres", label: "题材基底库", icon: Tags },
      { to: "/story-modes", label: "推进模式库", icon: Workflow },
      { to: "/settings", label: "系统设置", icon: Settings2 },
    ],
  },
];

interface SidebarProps {
  onSwitchToWorkspaceNav?: () => void;
}

export default function Sidebar({ onSwitchToWorkspaceNav }: SidebarProps) {
  const [badgeQueriesEnabled, setBadgeQueriesEnabled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setBadgeQueriesEnabled(true), 500);
    return () => window.clearTimeout(timer);
  }, []);

  const taskQuery = useQuery({
    queryKey: queryKeys.tasks.overview,
    queryFn: getTaskOverview,
    enabled: badgeQueriesEnabled,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const overview = query.state.data?.data;
      return (overview?.queuedCount ?? 0) > 0 || (overview?.runningCount ?? 0) > 0 ? 4000 : false;
    },
  });

  const knowledgeQuery = useQuery({
    queryKey: queryKeys.knowledge.documents("sidebar"),
    queryFn: () => listKnowledgeDocuments(),
    enabled: badgeQueriesEnabled,
    staleTime: 30_000,
  });

  const autoDirectorFollowUpQuery = useQuery({
    queryKey: queryKeys.autoDirectorFollowUps.overview,
    queryFn: getAutoDirectorFollowUpOverview,
    enabled: badgeQueriesEnabled,
    refetchInterval: (query) => {
      const totalCount = query.state.data?.data?.totalCount ?? 0;
      return totalCount > 0 ? 4000 : false;
    },
  });

  const failedTaskCount = taskQuery.data?.data?.failedCount ?? 0;
  const autoDirectorFollowUpCount = autoDirectorFollowUpQuery.data?.data?.totalCount ?? 0;
  const knowledgeDocuments = knowledgeQuery.data?.data ?? [];
  const failedIndexCount = knowledgeDocuments.filter((item) => item.latestIndexStatus === "failed").length;

  const renderBadge = (to: string) => {
    if (to === "/tasks") {
      if (failedTaskCount <= 0) {
        return null;
      }
      return (
        <div className="ml-auto flex items-center gap-1">
          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
            {`F${failedTaskCount}`}
          </Badge>
        </div>
      );
    }

    if (to === "/auto-director/follow-ups" && autoDirectorFollowUpCount > 0) {
      return <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-[10px]">{autoDirectorFollowUpCount}</Badge>;
    }

    if (to === "/knowledge" && failedIndexCount > 0) {
      return <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-[10px]">{`F${failedIndexCount}`}</Badge>;
    }

    return null;
  };

  return (
    <aside className="flex h-full min-h-0 w-64 flex-col border-r bg-muted/20 p-3">
      <div className="mb-4 flex items-center gap-2.5 px-1">
        <DesktopBrandMark className="h-8 w-8 shrink-0 drop-shadow-none" />
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold">AI 小说创作工作台</span>
          <AppVersionBadge />
        </div>
        <DesktopReleaseNotesDialog />
      </div>

      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
              {group.title}
            </div>

            {group.items.map((item) => {
              const Icon = item.icon;
              const isNovelEntry = item.to === "/novels";

              return (
                <NavLink key={item.to} to={item.to}>
                  {({ isActive }) => (
                    <div
                      className={cn(
                        "relative flex items-center rounded-md py-2 pl-4 pr-2 text-sm transition-colors",
                        isActive
                          ? "bg-accent/90 font-semibold text-accent-foreground"
                          : "text-foreground hover:bg-accent hover:text-accent-foreground",
                        isNovelEntry && (isActive ? "ring-1 ring-primary/20" : "bg-primary/5 hover:bg-primary/10"),
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-transparent",
                          isActive && "bg-primary",
                        )}
                      />

                      <Icon
                        className={cn("h-[18px] w-[18px] shrink-0 mr-3", isNovelEntry && "text-primary")}
                      />

                      <span className={cn("truncate", isNovelEntry && "font-semibold")}>{item.label}</span>

                      {renderBadge(item.to)}
                    </div>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-2 shrink-0 space-y-2 border-t pt-3">
        {onSwitchToWorkspaceNav ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={onSwitchToWorkspaceNav}
            title="回到当前小说的创作导航"
          >
            <LayoutDashboard className="h-4 w-4" />
            创作导航
          </Button>
        ) : null}
        <LiveExecutionDialog className="w-full justify-start" />
      </div>
    </aside>
  );
}
