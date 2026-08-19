import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import AiButton from "@/components/common/AiButton";
import { Card, CardContent } from "@/components/ui/card";
import LineNumberedTextarea from "@/pages/drama/comicDrama/components/LineNumberedTextarea";
import type { NovelOutlineWorkspace } from "@/hooks/useNovelOutlineWorkspace";

interface NovelOutlineTabProps {
  workspace: NovelOutlineWorkspace;
  onStart: () => void;
  directorActive: boolean;
  hasChapters: boolean;
}

const AUTOSAVE_DELAY_MS = 1200;

// 漫剧工作室「小说 · 大纲」页签：带行号的大纲编辑区（默认 50 行起、回车加行、
// 修改后自动静默保存），标题行右侧让 AI 接手逐章写作；逐章细化在顶栏「章节管理」里。
export default function NovelOutlineTab(props: NovelOutlineTabProps) {
  const { workspace } = props;
  const savePending = workspace.saveOutlineMutation.isPending;

  const mutateRef = useRef(workspace.saveOutlineMutation.mutate);
  mutateRef.current = workspace.saveOutlineMutation.mutate;
  const latestRef = useRef({ dirty: workspace.outlineDirty, pending: savePending });
  latestRef.current = { dirty: workspace.outlineDirty, pending: savePending };

  useEffect(() => {
    if (!workspace.outlineDirty || savePending) {
      return;
    }
    const timer = setTimeout(() => mutateRef.current({ silent: true }), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [workspace.outlineText, workspace.outlineDirty, savePending]);

  // 切走页签时把还没到自动保存间隔的修改立即落库，避免丢稿。
  useEffect(() => () => {
    const { dirty, pending } = latestRef.current;
    if (dirty && !pending) {
      mutateRef.current({ silent: true });
    }
  }, []);

  const flushSave = () => {
    if (workspace.outlineDirty && !savePending) {
      mutateRef.current({ silent: true });
    }
  };

  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="drama-outline-textarea" className="text-sm font-medium text-foreground">我的简略大纲</label>
          <div className="flex flex-wrap items-center gap-2.5">
            {savePending ? <span className="text-xs text-muted-foreground">自动保存中…</span> : null}
            <span className="hidden text-xs text-muted-foreground md:inline">
              {props.directorActive
                ? "AI 正在逐章写作，章节在顶栏「章节管理」里查看。"
                : props.hasChapters
                  ? "AI 会接着已有章节继续往下写。"
                  : "AI 会按这份大纲与「设定」逐章写作与审校。"}
            </span>
            <AiButton
              size="sm"
              onClick={props.onStart}
              disabled={props.directorActive || workspace.startMutation.isPending}
              title={props.directorActive ? "AI 正在写作中，等这一轮写完可以继续。" : undefined}
            >
              {workspace.startMutation.isPending
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                : null}
              {props.hasChapters ? "让 AI 继续创作" : "让 AI 开始创作"}
            </AiButton>
          </div>
        </div>
        <LineNumberedTextarea
          id="drama-outline-textarea"
          ariaLabel="我的简略大纲"
          value={workspace.outlineText}
          minRows={50}
          maxLength={20000}
          placeholder="写下这本书的走向"
          onChange={workspace.setOutlineText}
          onBlur={flushSave}
        />
      </CardContent>
    </Card>
  );
}
