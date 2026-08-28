import { useSearchParams } from "react-router-dom";
import { SettingsShell } from "../components/SettingsShell";
import RecentErrorsCard from "../components/RecentErrorsCard";
import TaskCenterPage from "@/pages/tasks/TaskCenterPage";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { cn } from "@/lib/utils";

// 记录页的三级页签：报错日志（本机页面报错）与任务日志（任务中心执行历史）。
const RECORD_TABS = [
  { key: "errors", label: "报错日志" },
  { key: "tasks", label: "任务日志" },
] as const;

type RecordTab = (typeof RECORD_TABS)[number]["key"];

function isRecordTab(value: string | null): value is RecordTab {
  return value === "errors" || value === "tasks";
}

/** 系统设置内的记录页签：直接展示报错日志与任务日志。 */
export default function RecordsSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobileViewport = useIsMobileViewport();
  const tabParam = searchParams.get("tab");
  const tab: RecordTab = isRecordTab(tabParam) ? tabParam : "errors";

  const selectTab = (key: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", key);
      return next;
    });
  };

  return (
    <SettingsShell
      subTabs={{
        id: "records-sections",
        tabs: RECORD_TABS.map((item) => ({ key: item.key, label: item.label })),
        active: tab,
        onSelect: selectTab,
      }}
    >
      <h1 className="sr-only">记录</h1>
      {isMobileViewport ? (
        <nav aria-label="记录页签" className="min-w-0 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {RECORD_TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => selectTab(item.key)}
                aria-pressed={tab === item.key}
                className={cn(
                  "flex shrink-0 items-center rounded-md px-3 py-2 text-sm transition-colors",
                  tab === item.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      ) : null}
      {tab === "errors" ? <RecentErrorsCard /> : <TaskCenterPage compact />}
    </SettingsShell>
  );
}
