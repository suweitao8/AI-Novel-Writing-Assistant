import { useEffect, useRef } from "react";
import LineNumberedTextarea from "@/pages/drama/comicDrama/components/LineNumberedTextarea";
import type { NovelOutlineWorkspace } from "@/hooks/useNovelOutlineWorkspace";

const AUTOSAVE_DELAY_MS = 1200;

// 漫剧工作室「小说 · 大纲」页签：只有编辑区本身（默认 50 行起、回车加行、
// 修改后自动静默保存）；针对大纲的「解析」按钮在上方子页签行右侧，
// 逐章细化在顶栏「章节管理」里。
export default function NovelOutlineTab(props: { workspace: NovelOutlineWorkspace }) {
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
    <LineNumberedTextarea
      id="drama-outline-textarea"
      ariaLabel="大纲"
      value={workspace.outlineText}
      minRows={50}
      maxLength={20000}
      placeholder="写下这本书的走向"
      onChange={workspace.setOutlineText}
      onBlur={flushSave}
    />
  );
}
