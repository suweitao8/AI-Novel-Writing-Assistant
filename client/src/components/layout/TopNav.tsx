import { NavLink } from "react-router-dom";
import {
  Clapperboard,
  LayoutDashboard,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import DesktopBrandMark from "./DesktopBrandMark";
import LiveExecutionDialog from "@/components/liveExecution/LiveExecutionDialog";
import { Button } from "@/components/ui/button";
import { getDramaFocusNavItems } from "@/config/dramaFocusNav";
import { cn } from "@/lib/utils";
import { usePageTabRows, useSetPageNavActionsSlot, type PageTabRow } from "./PageTabsContext";

const iconByRoute = new Map<string, LucideIcon>([
  ["/drama", Clapperboard],
  ["/settings", Settings2],
]);

interface TopNavProps {
  onSwitchToWorkspaceNav?: () => void;
}

export default function TopNav({ onSwitchToWorkspaceNav }: TopNavProps) {
  const setNavActionsSlot = useSetPageNavActionsSlot();
  const pageTabRows = usePageTabRows();
  return (
    <header className="flex h-14 min-w-0 shrink-0 items-center border-b bg-muted/20 pl-4 pr-3">
      {/* 品牌「工作台」：点击回到漫剧主链路首页。 */}
      <NavLink
        to="/drama"
        aria-label="工作台，进入漫剧"
        title="工作台"
        className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-muted/60"
      >
        <DesktopBrandMark className="h-8 w-8 shrink-0 drop-shadow-none" />
        <span className="truncate text-sm font-semibold">工作台</span>
      </NavLink>

      <nav className="ml-6 flex h-full min-w-0 items-center self-stretch">
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
                  {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                  {item.label}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* 页面页签：二级、三级各自包在独立胶囊体里，中间留固定间距；
          二级组固定居中于中间预留区（镜像占位法），三级组固定在二级右侧。
          超宽时 justify-center 把左侧裁进滚动区，被裁的恰好是隐形镜像。 */}
      <nav
        aria-label="页面页签"
        className="flex min-w-0 flex-1 items-center justify-center overflow-x-auto px-2"
      >
        {pageTabRows.length > 0 ? (
          <div className="flex shrink-0 items-center gap-3">
            {pageTabRows.length > 1 ? (
              <span
                aria-hidden="true"
                className="invisible flex select-none items-center"
              >
                {pageTabRows.slice(1).map((row) => (
                  <PageTabGroup key={`mirror-${row.id}`} row={row} />
                ))}
              </span>
            ) : null}
            <PageTabGroup row={pageTabRows[0]} />
            {pageTabRows.slice(1).map((row) => (
              <PageTabGroup key={row.id} row={row} />
            ))}
          </div>
        ) : null}
      </nav>

      {/* 页面操作区槽位：页面把当前页的工具按钮 portal 进来，紧贴「AI 实况」左侧 */}
      <div className="flex shrink-0 items-center gap-2">
        <div
          ref={setNavActionsSlot}
          className="flex min-w-0 items-center gap-1.5 empty:hidden"
        />
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

// 一级行内的分段胶囊：整组包在一个圆角胶囊容器里，选中项用浮起底色区分。
function PageTabGroup({ row }: { row: PageTabRow }) {
  return (
    <div
      role="group"
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-muted/40 p-1"
    >
      {row.tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => row.onSelect(tab.key)}
          aria-pressed={row.active === tab.key}
          className={cn(
            "flex h-7 items-center whitespace-nowrap rounded-full px-2 text-[13px] transition-colors",
            row.active === tab.key
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
