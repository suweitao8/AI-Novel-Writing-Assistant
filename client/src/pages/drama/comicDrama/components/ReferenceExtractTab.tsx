import { Check, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReferenceExtractItem } from "@ai-novel/shared/types/novelReferenceExtraction";
import type { ReferenceExtractStage } from "@/pages/drama/comicDrama/hooks/useReferenceExtractStage";

interface ReferenceExtractTabProps {
  stage: ReferenceExtractStage;
}

// 漫剧工作室「当前 · 提取」页签：展示从参考小说提取的角色 / 场景 / 世界观建议，
// 勾选后创建进设定中心。「提取」按钮在子页签行右侧（useReferenceExtractStage）。
export default function ReferenceExtractTab(props: ReferenceExtractTabProps) {
  const { stage } = props;
  const { extraction, selected } = stage;
  const selectedCount = selected.size;

  if (stage.totalItems === 0) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6 text-sm leading-6 text-muted-foreground">
          还没有提取结果。
        </CardContent>
      </Card>
    );
  }

  const renderGroup = (title: string, group: "characters" | "scenes" | "worldview") => {
    const items = extraction[group];
    if (items.length === 0) {
      return null;
    }
    const allSelected = items.every((_item, index) => selected.has(stage.itemKey(group, index)));
    return (
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <Badge variant="secondary">{items.length}</Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => stage.selectGroup(group, !allSelected)}
          >
            {allSelected ? "取消全选" : "全选"}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => {
            const key = stage.itemKey(group, index);
            const isSelected = selected.has(key);
            const character = item as ReferenceExtractItem & { role?: string };
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isSelected}
                onClick={() => stage.toggleSelected(key)}
                className={cn(
                  "relative min-w-0 rounded-xl border p-3.5 text-left transition-colors",
                  isSelected
                    ? "border-primary/60 bg-primary/5"
                    : "border-border/70 bg-background hover:border-primary/30",
                )}
              >
                <span
                  className={cn(
                    "absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full border",
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                  )}
                  aria-hidden="true"
                >
                  {isSelected ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-1.5 pr-6">
                  <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
                  {group === "characters" && character.role ? (
                    <Badge variant="outline" className="shrink-0">{character.role}</Badge>
                  ) : null}
                </span>
                <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{item.description}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-5 p-4 sm:p-6">
        {renderGroup("角色", "characters")}
        {renderGroup("场景", "scenes")}
        {renderGroup("世界观", "worldview")}
        <div className="flex items-center justify-end gap-2 border-t border-border/70 pt-4">
          <Button
            size="sm"
            onClick={() => stage.createSelectedMutation.mutate()}
            disabled={selectedCount === 0 || stage.createSelectedMutation.isPending}
          >
            {stage.createSelectedMutation.isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            创建所选（{selectedCount}）
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
