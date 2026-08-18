import { useQuery } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { getLlmUsageRecords, type LlmUsageRecordView } from "@/api/llmUsage";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatDuration(durationMs: number): string {
  if (durationMs >= 1000) {
    const seconds = durationMs / 1000;
    return seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒` : `${seconds.toFixed(1)} 秒`;
  }
  return `${durationMs} 毫秒`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatTokens(value: number): string {
  if (!value) {
    return "--";
  }
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

function resolveRecordPurpose(record: LlmUsageRecordView): string {
  const stageHint = record.itemKey || record.stage;
  return stageHint ? `${record.label}（${stageHint}）` : record.label;
}

export default function TaskLlmUsageSection(props: { taskId: string }) {
  const { taskId } = props;
  const usageQuery = useQuery({
    queryKey: queryKeys.llm.usageRecords(taskId),
    queryFn: () => getLlmUsageRecords({ taskId, limit: 30 }),
    enabled: Boolean(taskId),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const records = usageQuery.data?.data ?? [];
  const totalDurationMs = records.reduce((sum, record) => sum + record.durationMs, 0);

  return (
    <section className="space-y-3 rounded-2xl border border-border/70 bg-muted/15 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Timer className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-semibold text-foreground">模型调用耗时</div>
        {records.length > 0 ? (
          <>
            <Badge variant="outline">{records.length} 次调用</Badge>
            <Badge variant="secondary">合计 {formatDuration(totalDurationMs)}</Badge>
          </>
        ) : null}
      </div>
      {usageQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">正在读取模型调用记录...</div>
      ) : records.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          这个任务还没有留下模型调用记录。开始生成后，这里会逐步显示每一步用了哪个模型、花了多久。
        </div>
      ) : (
        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {records.map((record) => (
            <div
              key={record.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border bg-background/80 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-foreground" title={record.label}>
                  {resolveRecordPurpose(record)}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{formatTime(record.recordedAt)}</span>
                  <span>·</span>
                  <span className="truncate">{record.model}</span>
                  {record.totalTokens > 0 ? (
                    <>
                      <span>·</span>
                      <span>{formatTokens(record.totalTokens)} tokens</span>
                    </>
                  ) : null}
                  {record.repairAttempts > 0 ? (
                    <>
                      <span>·</span>
                      <span>修复 {record.repairAttempts} 次</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    "text-sm font-medium",
                    record.durationMs >= 120_000
                      ? "text-warning"
                      : record.durationMs >= 60_000
                        ? "text-primary"
                        : "text-foreground",
                  )}
                >
                  {formatDuration(record.durationMs)}
                </span>
                <Badge variant={record.status === "succeeded" ? "outline" : "destructive"}>
                  {record.status === "succeeded" ? "完成" : "失败"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
