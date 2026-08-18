import { LockKeyhole } from "lucide-react";
import type { PromptPreviewResult, PromptTestRunResult } from "@/api/promptWorkbench";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MESSAGE_ROLE_LABELS } from "../promptWorkbenchLabels";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-52 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function PromptTestRunResultPanel(props: {
  result: PromptTestRunResult | null;
  isPending?: boolean;
  error?: string | null;
}) {
  const { error, isPending, result } = props;
  if (isPending) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
        正在使用当前草稿调用模型，完成后会显示测试产出。
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!result) {
    return null;
  }

  const usage = result.meta.tokenUsage;

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">模型测试产出</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {result.meta.provider ?? "提示词路由"} / {result.meta.model ?? "默认模型"} · {result.meta.latencyMs}ms
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{result.outputType === "structured" ? "结构化" : "文本"}</Badge>
          {usage ? (
            <Badge variant="outline">
              Token {usage.totalTokens ?? "--"}
              {usage.inputTokens != null || usage.outputTokens != null
                ? `（${usage.inputTokens ?? "--"} / ${usage.outputTokens ?? "--"}）`
                : ""}
            </Badge>
          ) : null}
          {result.meta.repairUsed ? (
            <Badge variant="outline">JSON 修复 {result.meta.repairAttempts ?? 0} 次</Badge>
          ) : null}
        </div>
      </div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
        {result.outputText}
      </pre>
      {result.diagnostics.notes.length > 0 ? (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {result.diagnostics.notes.join(" ")}
        </div>
      ) : null}
    </div>
  );
}

export function PromptPreviewPanel(props: {
  preview: PromptPreviewResult | null;
  testRun?: PromptTestRunResult | null;
  testRunPending?: boolean;
  testRunError?: string | null;
}) {
  const { preview, testRun = null, testRunError = null, testRunPending = false } = props;
  if (!preview) {
    return (
      <div className="space-y-3">
        <PromptTestRunResultPanel result={testRun} isPending={testRunPending} error={testRunError} />
        <div className="rounded-md border border-dashed border-border bg-card/70 p-5 text-sm text-muted-foreground">
          点击底部“生成预览”后，可查看最终 messages、上下文选择和诊断结果。
        </div>
      </div>
    );
  }

  const defaultTab = preview.messages[0]
    ? `${preview.messages[0].role}-0`
    : "diagnostics";

  return (
    <div className="space-y-4">
      <PromptTestRunResultPanel result={testRun} isPending={testRunPending} error={testRunError} />

      <div className="grid overflow-hidden rounded-md border border-border bg-card md:grid-cols-4 md:divide-x md:divide-border">
        <div className="bg-muted/40 p-3">
          <div className="text-xs text-muted-foreground">入口</div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">{preview.diagnostics.entrypoint}</div>
        </div>
        <div className="bg-primary/10 p-3">
          <div className="text-xs text-muted-foreground">估算 Token</div>
          <div className="mt-1 text-sm font-semibold text-primary">{preview.context.estimatedInputTokens}</div>
        </div>
        <div className="bg-info/10 p-3">
          <div className="text-xs text-muted-foreground">已注入</div>
          <div className="mt-1 text-sm font-semibold text-info">{preview.context.selectedBlockIds.length}</div>
        </div>
        <div className="bg-warning/10 p-3">
          <div className="text-xs text-muted-foreground">缺失项</div>
          <div className="mt-1 text-sm font-semibold text-warning">{preview.diagnostics.missingRequiredGroups.length}</div>
        </div>
      </div>

      {preview.diagnostics.notes.length > 0 ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {preview.diagnostics.notes.join(" ")}
        </div>
      ) : null}

      <Tabs key={`${preview.prompt.key}:${preview.context.estimatedInputTokens}`} defaultValue={defaultTab}>
        <TabsList className="max-w-full overflow-x-auto">
          {preview.messages.map((message, index) => (
            <TabsTrigger key={`${message.role}-${index}`} value={`${message.role}-${index}`}>
              {MESSAGE_ROLE_LABELS[message.role] ?? message.role}
            </TabsTrigger>
          ))}
          <TabsTrigger value="diagnostics">诊断</TabsTrigger>
        </TabsList>

        {preview.messages.map((message, index) => (
          <TabsContent key={`${message.role}-${index}`} value={`${message.role}-${index}`}>
            <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <LockKeyhole className="h-3.5 w-3.5" />
                  {MESSAGE_ROLE_LABELS[message.role] ?? message.role}
                </div>
                <Badge variant="outline" className="text-muted-foreground">只读</Badge>
              </div>
              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed text-foreground">
                {message.content}
              </pre>
            </div>
          </TabsContent>
        ))}

        <TabsContent value="diagnostics">
          <JsonBlock
            value={{
              selectedBlockIds: preview.context.selectedBlockIds,
              droppedBlockIds: preview.context.droppedBlockIds,
              summarizedBlockIds: preview.context.summarizedBlockIds,
              missingRequiredGroups: preview.diagnostics.missingRequiredGroups,
              resolverErrors: preview.diagnostics.resolverErrors,
              tracePreview: preview.diagnostics.tracePreview,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
