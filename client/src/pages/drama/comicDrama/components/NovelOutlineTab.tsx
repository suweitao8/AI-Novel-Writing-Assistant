import { Loader2 } from "lucide-react";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { NovelOutlineWorkspace } from "@/hooks/useNovelOutlineWorkspace";

interface NovelOutlineTabProps {
  workspace: NovelOutlineWorkspace;
  onExpanded: () => void;
}

// 漫剧工作室「小说 · 大纲」页签：写简略大纲并保存，让 AI 推理分章细纲后切到「细纲」页签确认。
export default function NovelOutlineTab(props: NovelOutlineTabProps) {
  const { workspace, onExpanded } = props;
  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-5 p-6">
        <div className="space-y-2">
          <label htmlFor="drama-outline-textarea" className="text-sm font-medium text-foreground">我的简略大纲</label>
          <textarea
            className="min-h-[72px] w-full rounded-md border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            id="drama-outline-textarea"
            value={workspace.outlineText}
            rows={9}
            maxLength={20000}
            placeholder={"像讲故事一样写下这本书的走向，不用分章。例如：\n林川是深海修理铺唯一的修理师。一天他捞起一艘会说话的旧潜艇，潜艇里藏着二十年前失踪科考队的记录……"}
            onChange={(event) => workspace.setOutlineText(event.target.value)}
           />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">写个大概就行；角色、场景、道具在「设定」页签里添加。</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!workspace.outlineDirty || workspace.saveOutlineMutation.isPending}
              onClick={() => workspace.saveOutlineMutation.mutate()}
            >
              {workspace.saveOutlineMutation.isPending
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                : null}
              保存大纲
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-5">
          <div className="space-y-1.5">
            <label htmlFor="drama-target-chapter-count" className="text-xs text-muted-foreground">期望章数（可选）</label>
            <Input
              id="drama-target-chapter-count"
              value={workspace.targetChapterCount}
              inputMode="numeric"
              className="w-28"
              placeholder="AI 决定"
              onChange={(event) => workspace.setTargetChapterCount(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
             />
          </div>
          <AiButton
            disabled={!workspace.canExpand || workspace.expandMutation.isPending}
            title={!workspace.canExpand ? "先写下几行故事走向，或让 AI 依据书名自由发挥。" : undefined}
            onClick={() => workspace.expandMutation.mutate(undefined, { onSuccess: onExpanded })}
          >
            {workspace.expandMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : null}
            {workspace.draftChapters ? "重新推理细纲" : "AI 推理细纲"}
          </AiButton>
          <p className="text-xs leading-5 text-muted-foreground">推理结果不落库，到「细纲」页签确认保存后才会成为剧情契约。</p>
        </div>
      </CardContent>
    </Card>
  );
}
