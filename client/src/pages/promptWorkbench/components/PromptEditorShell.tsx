import type { ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { LockKeyhole, Maximize2, Minimize2, ShieldCheck } from "lucide-react";
import type { PromptCatalogItem, PromptSlotOverrideScope } from "@/api/promptWorkbench";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import SelectControl from "@/components/common/SelectControl";
import {
  ENTRYPOINT_OPTIONS,
  LOCKED_FIELD_LABELS,
  MANAGEMENT_STATUS_LABELS,
  OUTPUT_TYPE_LABELS,
  SLOT_KIND_LABELS,
  TASK_TYPE_LABELS,
  capabilityLabels,
} from "../promptWorkbenchLabels";

interface PromptEditorShellProps {
  prompt: PromptCatalogItem;
  immersive?: boolean;
  onImmersiveChange?: (next: boolean) => void;
  entrypoint: string;
  onEntrypointChange: (entrypoint: string) => void;
  scope: PromptSlotOverrideScope;
  onScopeChange: (scope: PromptSlotOverrideScope) => void;
  selectedNovelId: string;
  onNovelChange: (novelId: string) => void;
  novels: Array<{ id: string; title?: string | null }>;
  selectedChapterId: string;
  onChapterChange: (chapterId: string) => void;
  chapters: Array<{ id: string; title?: string | null; order?: number | null; hasContent?: boolean }>;
  bodyPanel: ReactNode;
  contextPanel: ReactNode;
  runBar: ReactNode;
}

export function PromptEditorShell(props: PromptEditorShellProps) {
  const {
    bodyPanel,
    contextPanel,
    entrypoint,
    immersive = false,
    novels,
    chapters,
    onEntrypointChange,
    onChapterChange,
    onImmersiveChange,
    onNovelChange,
    onScopeChange,
    prompt,
    runBar,
    scope,
    selectedChapterId,
    selectedNovelId,
  } = props;
  const capabilities = capabilityLabels(prompt);

  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        immersive && "bg-background",
      )}
    >
      <header
        className={cn(
          "shrink-0 border-b border-border bg-card px-5 py-4",
          immersive && "bg-card px-6 py-3",
        )}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="min-w-0 truncate text-xl font-semibold tracking-normal text-foreground">
                {prompt.description || prompt.id}
              </h2>
              <span className="rounded-md bg-foreground px-2 py-0.5 text-xs font-semibold text-background">
                {prompt.version}
              </span>
              {immersive ? (
                <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  沉浸编辑
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{prompt.key}</span>
              <span>·</span>
              <span>{TASK_TYPE_LABELS[prompt.taskType] ?? prompt.taskType}</span>
              <span>·</span>
              <span>{OUTPUT_TYPE_LABELS[prompt.outputType] ?? prompt.outputType}</span>
              <span>·</span>
              <span>{MANAGEMENT_STATUS_LABELS[prompt.managementStatus]}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-primary/10 px-2 py-1 text-primary">
                {prompt.language === "zh" ? "中文" : prompt.language}
              </span>
              <span className="rounded-md bg-info/10 px-2 py-1 text-info">{prompt.family}</span>
              <span className="rounded-md bg-warning/10 px-2 py-1 text-warning">
                {prompt.contextPolicy.maxTokensBudget} tokens
              </span>
              <span className={cn(
                "rounded-md px-2 py-1",
                prompt.slotSupported ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}>
                {prompt.slotSupported ? `${prompt.slots.length} 个槽位` : "只读提示词"}
              </span>
              {capabilities.map((label) => (
                <span key={label} className="rounded-md bg-card/80 px-2 py-1 text-muted-foreground ring-1 ring-border">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center xl:justify-end">
            <SelectControl
              value={entrypoint}
              onChange={(event) => onEntrypointChange(event.target.value)}
              className="h-10 min-w-40 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              {ENTRYPOINT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectControl>

            <Tabs
              value={scope}
              onValueChange={(value) => onScopeChange(value as PromptSlotOverrideScope)}
            >
              <TabsList className="h-10">
                <TabsTrigger value="global" className="px-4">全局</TabsTrigger>
                <TabsTrigger value="novel" className="px-4">本书</TabsTrigger>
              </TabsList>
            </Tabs>

            {scope === "novel" ? (
              <SelectControl
                value={selectedNovelId}
                onChange={(event) => onNovelChange(event.target.value)}
                className="h-10 min-w-52 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="">选择小说</option>
                {novels.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title || novel.id}
                  </option>
                ))}
              </SelectControl>
            ) : null}

            {scope === "novel" && selectedNovelId ? (
              <SelectControl
                value={selectedChapterId}
                onChange={(event) => onChapterChange(event.target.value)}
                className="h-10 min-w-52 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="">选择预览章节</option>
                {chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    第 {chapter.order ?? "?"} 章 {chapter.title || "未命名章节"}{chapter.hasContent ? "" : "（无正文）"}
                  </option>
                ))}
              </SelectControl>
            ) : null}

            {onImmersiveChange ? (
              <Button
                type="button"
                variant={immersive ? "outline" : "secondary"}
                onClick={() => onImmersiveChange(!immersive)}
                className={cn(
                  "h-10 gap-2 border-primary/30",
                  immersive
                    ? "bg-card text-primary hover:bg-primary/10"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
                title={immersive ? "退出沉浸编辑" : "进入沉浸编辑"}
              >
                {immersive ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                {immersive ? "退出沉浸" : "沉浸编辑"}
              </Button>
            ) : null}
          </div>
        </div>

        <div className={cn(
          "mt-4 grid gap-4 border-t border-border pt-3 lg:grid-cols-2",
          immersive && "mt-3",
        )}>
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              可编辑槽位
            </div>
            <div className="flex flex-wrap gap-1.5">
              {prompt.slots.length > 0 ? prompt.slots.map((slot) => (
                <span
                  key={slot.key}
                  title={slot.key}
                  className="inline-flex max-w-full items-center rounded-md bg-primary/10 px-2 py-1 text-xs text-foreground"
                >
                  {slot.label}
                  <span className="ml-1 opacity-60">·{SLOT_KIND_LABELS[slot.kind] ?? slot.kind}</span>
                </span>
              )) : (
                <span className="text-xs text-muted-foreground">该提示词未开放表达槽位。</span>
              )}
            </div>
          </div>
          <div className="min-w-0 lg:border-l lg:border-border lg:pl-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
              <LockKeyhole className="h-4 w-4 text-muted-foreground" />
              锁定边界
            </div>
            <div className="flex flex-wrap gap-1.5">
              {prompt.lockedFields.map((field) => (
                <span
                  key={field}
                  title={field}
                  className="inline-flex rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
                >
                  {LOCKED_FIELD_LABELS[field] ?? field}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className={cn("min-h-0 flex-1", immersive && "px-4 py-4")}>
        <Group
          orientation="horizontal"
          className={cn(
            "h-full min-h-0",
            immersive && "overflow-hidden rounded-lg border border-border bg-card shadow-lg",
          )}
        >
          <Panel defaultSize={immersive ? 74 : 66} minSize={immersive ? 58 : 48}>
            <div
              className={cn(
                "h-full min-h-0 overflow-y-auto px-5 py-5 pb-28",
                immersive && "bg-card px-8 py-7 pb-32",
              )}
            >
              {bodyPanel}
            </div>
          </Panel>
          <Separator className={cn("w-1 bg-border transition-colors hover:bg-primary/50")} />
          <Panel defaultSize={immersive ? 26 : 34} minSize={immersive ? 20 : 24}>
            <div className="h-full min-h-0 border-l border-border bg-muted/30">
              {contextPanel}
            </div>
          </Panel>
        </Group>
      </div>

      {runBar}
    </section>
  );
}
