import { Card, CardContent } from "@/components/ui/card";
import LineNumberedTextarea from "@/pages/drama/comicDrama/components/LineNumberedTextarea";

interface ReferenceTabProps {
  value: string;
  onChange: (value: string) => void;
}

// 漫剧工作室「当前 · 参考」页签：粘贴参考小说原文的 50 行编辑器。
// 「解析」按钮在子页签行右侧（useReferenceDraftStage），与各子页签自己的工具同位。
export default function ReferenceTab(props: ReferenceTabProps) {
  return (
    <Card className="rounded-3xl">
      <CardContent className="p-4 sm:p-6">
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
  );
}
