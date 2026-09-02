import { Fragment } from "react";
import { NavLink } from "react-router-dom";
import {
  Box,
  Clapperboard,
  Film,
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
  ["/models", Box],
  ["/animations", Film],
  ["/settings", Settings2],
]);

interface TopNavProps {
  onSwitchToWorkspaceNav?: () => void;
}

export default function TopNav({ onSwitchToWorkspaceNav }: TopNavProps) {
  const setNavActionsSlot = useSetPageNavActionsSlot();
  const pageTabRows = usePageTabRows();
  return (
    <header className="studio-top-nav relative flex h-14 min-w-0 shrink-0 items-center border-b bg-[var(--surface-nav)] pl-4 pr-3">
      {/* 品牌「工作台」：点击回到漫剧主链路首页。 */}
      <NavLink
        to="/drama"
        aria-label="漫剧工作台，进入漫剧"
        title="漫剧工作台"
        className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] px-1 py-1 transition-colors hover:bg-[var(--control-hover)]"
      >
        <DesktopBrandMark className="h-8 w-8 shrink-0 drop-shadow-none" />
        <span className="truncate text-sm font-semibold">漫剧工作台</span>
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
                      : "border-transparent text-muted-foreground hover:bg-[var(--control-hover)] hover:text-foreground",
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

      {/* 页面页签：参照旧项目（mydrama）的固定位置做法——二级胶囊绝对定位在
          整个 header 的水平中心，不参与 flex 流，右侧操作按钮组随页签增减时
          二级位置恒定不动；三级胶囊锚定在二级右缘固定间距。 */}
      {pageTabRows.length > 0 ? (
        <nav
          aria-label="页面页签"
          className="absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center"
        >
          <PageTabGroup row={pageTabRows[0]} />
          {pageTabRows.slice(1).map((row) => (
            <div
              key={row.id}
              className="absolute left-full top-1/2 ml-3 flex -translate-y-1/2 items-center"
            >
              <PageTabGroup row={row} />
            </div>
          ))}
        </nav>
      ) : null}

      {/* 页面操作区槽位：页面把当前页的工具按钮 portal 进来，紧贴「AI 实况」左侧 */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
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

// 一级行内的分段胶囊：整组包在一个圆角胶囊容器里，选中项用浮起底色区分；
// 语义分组边界（资产 | 章节工作台 | 设定）画竖线分隔。
function PageTabGroup({ row }: { row: PageTabRow }) {
  return (
    <div
      role="group"
      className="studio-pill flex shrink-0 items-center gap-0.5 border border-border/70 bg-[var(--surface-control)] p-1 shadow-sm"
    >
      {row.tabs.map((tab) => (
        <Fragment key={tab.key}>
          <button
            type="button"
            onClick={() => row.onSelect(tab.key)}
            aria-pressed={row.active === tab.key}
            className={cn(
              "studio-pill flex h-7 items-center whitespace-nowrap px-2 text-[13px] transition-colors",
              row.active === tab.key
                ? "bg-[var(--control-active)] font-medium text-primary shadow-sm"
                : "text-muted-foreground hover:bg-[var(--control-hover)] hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
          {tab.dividerAfter ? (
            <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
