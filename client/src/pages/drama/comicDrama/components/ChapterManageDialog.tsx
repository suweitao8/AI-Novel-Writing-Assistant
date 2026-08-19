import type { Chapter } from "@ai-novel/shared/types/novel";
import ChapterManagePanel from "@/pages/drama/comicDrama/components/ChapterManagePanel";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";

interface ChapterManageDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapters: Chapter[];
  currentChapterId: string | null;
  directorTaskActive: boolean;
  onSelectChapter: (chapter: Chapter) => void;
}

// 「章节管理」弹窗：点卡片把该章切为当前章（「初稿 / 正文」等子页签随之更新），
// 支持搜索与手动新建；关闭走右上角 × 或点击弹窗外区域。
export default function ChapterManageDialog(props: ChapterManageDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent title="章节管理">
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
