import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Box,
  Clapperboard,
  Database,
  Film,
  ImagePlus,
  LayoutDashboard,
  ListTodo,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { listKnowledgeDocuments } from "@/api/knowledge";
import { queryKeys } from "@/api/queryKeys";
import { getTaskOverview } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LiveExecutionDialog from "@/components/liveExecution/LiveExecutionDialog";
import DesktopBrandMark from "@/components/layout/DesktopBrandMark";
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
      { to: "/drama", label: "漫剧", icon: Clapperboard },
      { to: "/models", label: "模型库", icon: Box },
      { to: "/animations", label: "动画库", icon: Film },
    ],
  },
  {
    title: "资料",
    items: [
      { to: "/knowledge", label: "知识库", icon: Database },
    ],
  },
  {
    title: "系统",
    items: [
      { to: "/tasks", label: "记录", icon: ListTodo },
      { to: "/settings/art-style", label: "画风", icon: ImagePlus },
      { to: "/settings", label: "系统", icon: Settings2 },
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

  const failedTaskCount = taskQuery.data?.data?.failedCount ?? 0;
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

    if (to === "/knowledge" && failedIndexCount > 0) {
      return <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-[10px]">{`F${failedIndexCount}`}</Badge>;
    }

    return null;
  };

  return (
    <aside className="studio-sidebar flex h-full min-h-0 w-64 flex-col border-r bg-[var(--surface-panel)] p-3">
      <div className="mb-4 flex items-center gap-2.5 px-1">
        <DesktopBrandMark className="h-8 w-8 shrink-0 drop-shadow-none" />
        <span className="truncate text-sm font-semibold">AI 漫剧工作台</span>
      </div>

      <nav aria-label="主导航" className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1.5">
            <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
              {group.title}
            </div>

            {group.items.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink key={item.to} to={item.to}>
                  {({ isActive }) => (
                    <div
                      className={cn(
                        "relative flex items-center rounded-[var(--radius-control)] py-2 pl-4 pr-2 text-sm transition-[background-color,color,box-shadow] duration-[var(--duration-fast)]",
                        isActive
                          ? "bg-[var(--control-active)] font-semibold text-accent-foreground shadow-sm"
                          : "text-foreground hover:bg-[var(--control-hover)] hover:text-accent-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-transparent",
                          isActive && "bg-primary",
                        )}
                      />

                      <Icon
                        className="mr-3 h-[18px] w-[18px] shrink-0"
                      />

                      <span className="truncate">{item.label}</span>

                      {renderBadge(item.to)}
                    </div>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-2 shrink-0 space-y-2 border-t border-border/70 pt-3">
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
