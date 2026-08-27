import { NavLink } from "react-router-dom";
import {
  Clapperboard,
  ImagePlus,
  LayoutDashboard,
  ListTodo,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import AppVersionBadge from "./AppVersionBadge";
import DesktopBrandMark from "./DesktopBrandMark";
import LiveExecutionDialog from "@/components/liveExecution/LiveExecutionDialog";
import { Button } from "@/components/ui/button";
import { getDramaFocusNavItems } from "@/config/dramaFocusNav";
import { cn } from "@/lib/utils";
import { usePageTabRows, type PageTabRow } from "./PageTabsContext";

const iconByRoute = new Map<string, LucideIcon>([
  ["/drama", Clapperboard],
  ["/tasks", ListTodo],
  ["/art-style", ImagePlus],
  ["/settings", Settings2],
]);

interface TopNavProps {
  onSwitchToWorkspaceNav?: () => void;
}

export default function TopNav({ onSwitchToWorkspaceNav }: TopNavProps) {
  return (
    <header className="flex shrink-0 flex-col border-b bg-muted/20">
      <div className="flex h-14 min-w-0 items-center pl-4 pr-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <DesktopBrandMark className="h-8 w-8 shrink-0 drop-shadow-none" />
          <span className="truncate text-sm font-semibold">AI 小说创作工作台</span>
          <AppVersionBadge />
        </div>

        <nav className="ml-8 flex h-full min-w-0 items-center self-stretch">
          {getDramaFocusNavItems().map((item) => {
            const Icon = iconByRoute.get(item.to);
            return (
              <NavLink key={item.to} to={item.to} className="flex h-full items-center">
                {({ isActive }) => (
                  <span
                    className={cn(
                      "flex h-full items-center gap-2 border-b-2 px-3 text-sm transition-colors",
                      isActive
                        ? "border-primary font-semibold text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                    {item.label}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {onSwitchToWorkspaceNav ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={onSwitchToWorkspaceNav}
              title="回到当前小说的创作导航"
            >
              <LayoutDashboard className="h-4 w-4" />
              创作导航
            </Button>
          ) : null}
          <LiveExecutionDialog className="justify-start" />
        </div>
      </div>
      <PageTabsBar />
    </header>
  );
}

function PageTabsBar() {
  const rows = usePageTabRows();
  if (rows.length === 0) {
    return null;
  }
  return (
    <nav
      aria-label="页面页签"
      className="flex h-10 min-w-0 shrink-0 items-center gap-1 overflow-x-auto border-t bg-background px-4"
    >
      {rows.map((row, index) => (
        <PageTabGroup key={row.id} row={row} separated={index > 0} />
      ))}
    </nav>
  );
}

function PageTabGroup({ row, separated }: { row: PageTabRow; separated: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {separated ? <span className="mx-2 h-4 w-px shrink-0 bg-border" aria-hidden="true" /> : null}
      {row.tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => row.onSelect(tab.key)}
          className={cn(
            "flex h-8 items-center rounded-md px-2.5 text-[13px] transition-colors",
            row.active === tab.key
              ? "bg-primary/10 font-medium text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <span className="whitespace-nowrap">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
