import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReferenceExtractCharacter } from "@ai-novel/shared/types/novelReferenceExtraction";
import type { ApplyOneInput, ReferenceExtractStage } from "@/pages/drama/comicDrama/hooks/useReferenceExtractStage";
import ExtractApplyDialog, { type ExtractGroup } from "@/pages/drama/comicDrama/components/ExtractApplyDialog";

interface ReferenceExtractTabProps {
  stage: ReferenceExtractStage;
}

interface OpenTarget {
  group: ExtractGroup;
  index: number;
}

const GROUP_ICONS: Record<ExtractGroup, string> = {
  characters: "👤",
  scenes: "📍",
  props: "📦",
  worldview: "🌍",
};

// 漫剧工作室「当前 · 提取」页签：「解析」产出并随章节保存的设定建议。
// 点卡片打开应用弹窗——先核对、可修改（与资产页签同一套表单），点「应用」单个创建；
// 同名资产标「已存在」拦截重复创建。
export default function ReferenceExtractTab(props: ReferenceExtractTabProps) {
  const { stage } = props;
  const { extraction } = stage;
  const [target, setTarget] = useState<OpenTarget | null>(null);

  if (stage.totalItems === 0) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6 text-sm leading-6 text-muted-foreground">
          还没有提取结果。
        </CardContent>
      </Card>
    );
  }

  const targetItem = target ? extraction[target.group][target.index] ?? null : null;

  const existingFor = (group: ExtractGroup, name: string) => {
    if (group === "worldview") {
      return false;
    }
    return stage.existingNames[group].has(name.trim());
  };

  const renderGroup = (title: string, group: ExtractGroup) => {
    const items = extraction[group];
    if (items.length === 0) {
      return null;
    }
    return (
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => {
            const character = group === "characters" ? item as ReferenceExtractCharacter : null;
            const body = character
              ? [character.appearance, character.personality].filter(Boolean).join("；") || item.description
              : item.description;
            const existing = existingFor(group, item.name);
            return (
              <button
                key={`${group}:${index}`}
                type="button"
                onClick={() => setTarget({ group, index })}
                className={cn(
                  "min-w-0 rounded-xl border p-3.5 text-left transition-colors",
                  existing
                    ? "border-border/70 bg-muted/30"
                    : "border-border/70 bg-background hover:border-primary/40",
                )}
              >
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span aria-hidden="true">{GROUP_ICONS[group]}</span>
                  <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
                  {group === "characters" && character?.role ? (
                    <Badge variant="outline" className="shrink-0">{character.role}</Badge>
                  ) : null}
                  {existing ? (
                    <Badge className="shrink-0 bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-400">
                      已存在
                    </Badge>
                  ) : null}
                </span>
                <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{body}</span>
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
        {renderGroup("道具", "props")}
        {renderGroup("世界观", "worldview")}
        <ExtractApplyDialog
          open={target !== null}
          group={target?.group ?? "characters"}
          item={targetItem}
          existing={targetItem && target ? existingFor(target.group, targetItem.name) : false}
          pending={stage.applyOneMutation.isPending}
          onOpenChange={(open) => { if (!open) setTarget(null); }}
          onApply={(form) => {
            const current = target;
            if (!current) {
              return;
            }
            const kind = current.group === "characters" ? "character"
              : current.group === "scenes" ? "scene"
                : current.group === "props" ? "prop" : "worldview";
            stage.applyOneMutation.mutate({
              group: current.group,
              index: current.index,
              form: { ...(form as Record<string, unknown>), __kind: kind } as ApplyOneInput["form"],
            });
            setTarget(null);
          }}
        />
      </CardContent>
    </Card>
  );
}
