import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import {
  clearErrorLog,
  ERROR_LOG_UPDATED_EVENT,
  readErrorLog,
  type ErrorLogEntry,
} from "@/lib/errorLog";

type ErrorLogFilter = "all" | "toast" | "uncaught";

const FILTER_LABELS: Record<ErrorLogFilter, string> = {
  all: "全部",
  toast: "弹窗报错",
  uncaught: "未捕获异常",
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function RecentErrorsCard() {
  const [entries, setEntries] = useState<ErrorLogEntry[]>([]);
  const [filter, setFilter] = useState<ErrorLogFilter>("all");

  const refresh = useCallback(() => {
    setEntries(readErrorLog());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(ERROR_LOG_UPDATED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(ERROR_LOG_UPDATED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const counts = useMemo(() => ({
    all: entries.length,
    toast: entries.filter((entry) => entry.source === "toast").length,
    uncaught: entries.filter((entry) => entry.source === "uncaught").length,
  }), [entries]);

  const visibleEntries = useMemo(() => (
    filter === "all" ? entries : entries.filter((entry) => entry.source === filter)
  ), [entries, filter]);

  const handleClear = () => {
    clearErrorLog();
    toast.success("已清空报错记录");
  };

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleAlert className="h-4 w-4" />
          最近报错日志
        </CardTitle>
        <CardDescription>
          本机记录的报错提示与未捕获异常，最多保留 100 条；重新加载或换浏览器不会跨设备同步。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as ErrorLogFilter)}>
          <TabsList>
            {(Object.keys(FILTER_LABELS) as ErrorLogFilter[]).map((key) => (
              <TabsTrigger key={key} value={key}>
                {FILTER_LABELS[key]}
                {counts[key] > 0 ? <span className="ml-1 text-xs text-muted-foreground">{counts[key]}</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {visibleEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无报错记录。</p>
        ) : (
          <>
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {visibleEntries.map((entry) => (
                <li key={entry.id} className="rounded-md border bg-background/60 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{entry.message}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatTime(entry.time)}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                    来源：{FILTER_LABELS[entry.source] ?? "弹窗报错"}
                  </div>
                  {entry.description ? (
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-all text-xs text-muted-foreground">
                      {entry.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Trash2 className="h-4 w-4" />
              清空记录
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
