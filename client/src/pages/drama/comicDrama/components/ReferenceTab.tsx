import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { previewChapterReferenceDraft } from "@/api/novel/chapters";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import LineNumberedTextarea from "@/pages/drama/comicDrama/components/LineNumberedTextarea";
import type { NovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";

interface ReferenceTabProps {
  novelId: string;
  workspace: NovelChapterWorkspace;
  value: string;
  onChange: (value: string) => void;
  onApplied: () => void;
}

// 漫剧工作室「当前 · 参考」页签：粘贴参考小说原文（50 行编辑器），
// 「解析」把原文压缩成逐行标注旁白/角色的初稿（约 20 行）写入本章初稿。
// 初稿已有内容时先弹确认，替换即写入并跳到「初稿」页签。
export default function ReferenceTab(props: ReferenceTabProps) {
  const { workspace } = props;
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  const chapter = workspace.currentChapter;
  const referenceText = props.value.trim();

  const applyDraft = (draftText: string, lineCount: number) => {
    workspace.applyExpectationText(draftText);
    toast.success(`已写入初稿，共 ${lineCount} 行。`);
    props.onApplied();
  };

  const parseMutation = useMutation({
    mutationFn: async () => {
      if (!chapter) {
        throw new Error("还没有章节。");
      }
      return previewChapterReferenceDraft(props.novelId, chapter.id, referenceText);
    },
    onSuccess: (response) => {
      const draftText = response.data?.draftText ?? "";
      const lineCount = response.data?.segments.length ?? draftText.split("\n").length;
      if (!draftText.trim()) {
        toast.error("AI 没有生成初稿，请重试。");
        return;
      }
      if (workspace.expectationText.trim()) {
        setPendingDraft(draftText);
        return;
      }
      applyDraft(draftText, lineCount);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "解析失败，请重试。"),
  });

  const parseDisabledReason = !chapter
    ? "还没有章节。"
    : !referenceText
      ? "还没有粘贴参考内容。"
      : null;

  return (
    <div className="space-y-3">
      <Card className="rounded-3xl">
        <CardContent className="space-y-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">参考文本</span>
            <AiButton
              variant="outline"
              size="sm"
              onClick={() => parseMutation.mutate()}
              disabled={parseMutation.isPending || parseDisabledReason !== null}
              title={parseDisabledReason ?? "按参考文本生成本章初稿"}
            >
              {parseMutation.isPending
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                : <Sparkles className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              解析
            </AiButton>
          </div>
          <LineNumberedTextarea
            id="drama-reference-textarea"
            ariaLabel="参考小说文本"
            value={props.value}
            minRows={50}
            maxLength={20000}
            placeholder="粘贴参考小说文本"
            onChange={props.onChange}
          />
        </CardContent>
      </Card>

      <Dialog open={pendingDraft !== null} onOpenChange={(open) => { if (!open) setPendingDraft(null); }}>
        <AppDialogContent
          title="替换本章初稿"
          description="本章初稿已有内容。"
          footer={
            <>
              <Button variant="outline" onClick={() => setPendingDraft(null)}>取消</Button>
              <Button
                onClick={() => {
                  if (pendingDraft !== null) {
                    applyDraft(pendingDraft, pendingDraft.split("\n").length);
                    setPendingDraft(null);
                  }
                }}
              >
                替换
              </Button>
            </>
          }
        >
          <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border/70 bg-muted/10 px-4 py-3 text-sm leading-7 text-foreground">
            {pendingDraft}
          </div>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
