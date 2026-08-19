import { Loader2 } from "lucide-react";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { NovelOutlineWorkspace } from "@/hooks/useNovelOutlineWorkspace";

interface NovelOutlineTabProps {
  workspace: NovelOutlineWorkspace;
  onStart: () => void;
  directorActive: boolean;
  hasChapters: boolean;
}

// 漫剧工作室「小说 · 大纲」页签：写全书简略大纲并保存，需要时从这里让 AI 接手逐章写作。
// 逐章细化不在这里做：当前章写个大概故事、让 AI 展开细纲的流程在顶栏「章节管理」里。
export default function NovelOutlineTab(props: NovelOutlineTabProps) {
  const { workspace } = props;
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

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <AiButton
            onClick={props.onStart}
            disabled={props.directorActive || workspace.startMutation.isPending}
            title={props.directorActive ? "AI 正在写作中，等这一轮写完可以继续。" : undefined}
          >
            {workspace.startMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : null}
            {props.hasChapters ? "让 AI 继续创作" : "让 AI 开始创作"}
          </AiButton>
          <p className="text-xs leading-5 text-muted-foreground">
            {props.directorActive
              ? "AI 正在逐章写作，写好的章节在顶栏「章节管理」里查看。"
              : props.hasChapters
                ? "AI 会接着已有章节继续往下写。"
                : "AI 会按这份大纲与「设定」逐章写作与审校。"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
