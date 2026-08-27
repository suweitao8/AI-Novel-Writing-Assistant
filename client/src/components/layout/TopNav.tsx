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
import { usePageTabRows, useSetPageNavActionsSlot, type PageTabRow } from "./PageTabsContext";

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
  const setNavActionsSlot = useSetPageNavActionsSlot();
  const pageTabRows = usePageTabRows();
  return (
    <header className="flex h-14 min-w-0 shrink-0 items-center border-b bg-muted/20 pl-4 pr-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <DesktopBrandMark className="h-8 w-8 shrink-0 drop-shadow-none" />
        <span className="truncate text-sm font-semibold">AI 小说创作工作台</span>
        <AppVersionBadge />
      </div>

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

      {/* 页面页签：二级页签固定居中于中间预留区，三级页签固定在二级右侧；
          左侧放一份等宽的隐形三级副本作镜像占位，使 [镜像|二级|三级] 整体
          居中时二级恰好落在区域正中，且三级组不越过右侧操作区。
          全部走文档流（不做绝对定位）；超宽时 justify-center 会把左侧裁进
          滚动区，被裁的恰好是隐形镜像，三级组仍可横向滚动到达。 */}
      <nav
        aria-label="页面页签"
        className="flex min-w-0 flex-1 items-center justify-center overflow-x-auto px-2"
      >
        {pageTabRows.length > 0 ? (
          <div className="flex shrink-0 items-center">
            {pageTabRows.length > 1 ? (
              <span
                aria-hidden="true"
                className="invisible flex select-none items-center pr-2"
              >
                {pageTabRows.slice(1).map((row, index) => (
                  <PageTabGroup key={`mirror-${row.id}`} row={row} separated={index > 0} />
                ))}
              </span>
            ) : null}
            <PageTabGroup row={pageTabRows[0]} separated={false} />
            {pageTabRows.length > 1 ? (
              <span className="flex items-center pl-2">
                {pageTabRows.slice(1).map((row, index) => (
                  <PageTabGroup key={row.id} row={row} separated={index > 0} />
                ))}
              </span>
            ) : null}
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
            "flex h-9 items-center rounded-md px-2 text-[13px] transition-colors",
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
