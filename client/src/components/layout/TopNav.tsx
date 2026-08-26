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
    <header className="flex h-14 shrink-0 items-center border-b bg-muted/20 pl-4 pr-3">
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
    </header>
  );
}
