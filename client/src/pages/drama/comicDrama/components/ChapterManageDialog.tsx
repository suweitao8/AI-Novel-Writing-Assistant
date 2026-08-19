import ChapterManagePanel from "@/pages/drama/comicDrama/components/ChapterManagePanel";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";

interface ChapterManageDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directorTaskActive: boolean;
}

// 漫剧工作室「章节管理」弹窗：承载手动建章、本章大纲与 AI 细纲节拍，
// 让小说阶段的子页签保持「大纲 / 细纲 / 设定」三个入口，章节操作从顶栏进入。
export default function ChapterManageDialog(props: ChapterManageDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent
        title="章节管理"
        description="新建章节、写本章大纲，并让 AI 展开细纲节拍；正文在阅读台里查看。"
        footer={
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>关闭</Button>
        }
      >
        <ChapterManagePanel novelId={props.novelId} directorTaskActive={props.directorTaskActive} />
      </AppDialogContent>
    </Dialog>
  );
}
