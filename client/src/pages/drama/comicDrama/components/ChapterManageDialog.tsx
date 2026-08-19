import { BookText, Loader2 } from "lucide-react";
import type { Chapter } from "@ai-novel/shared/types/novel";
import ChapterManagePanel from "@/pages/drama/comicDrama/components/ChapterManagePanel";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";

interface ChapterManageDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapters: Chapter[];
  currentChapterId: string | null;
  directorTaskActive: boolean;
  onSelectChapter: (chapter: Chapter) => void;
  onStartTakeover: () => void;
  takeoverPending: boolean;
  hasChapters: boolean;
}

// 「章节管理」弹窗：点卡片把该章切为当前章（「大纲 / 细纲」页签随之更新）；
// 让 AI 开始/继续创作（自动导演接管）的入口也在这里，按整本书推进写作。
export default function ChapterManageDialog(props: ChapterManageDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent
        title="章节管理"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button
              onClick={props.onStartTakeover}
              disabled={props.directorTaskActive || props.takeoverPending}
              title={props.directorTaskActive ? "AI 正在写作中，等这一轮写完可以继续。" : undefined}
            >
              {props.takeoverPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                : <BookText className="mr-2 h-4 w-4" aria-hidden="true" />}
              {props.hasChapters ? "让 AI 继续创作" : "让 AI 开始创作"}
            </Button>
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>关闭</Button>
          </div>
        }
      >
        <ChapterManagePanel
          novelId={props.novelId}
          chapters={props.chapters}
          currentChapterId={props.currentChapterId}
          directorTaskActive={props.directorTaskActive}
          onSelectChapter={props.onSelectChapter}
        />
      </AppDialogContent>
    </Dialog>
  );
}
