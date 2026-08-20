import { Card, CardContent } from "@/components/ui/card";
import LineNumberedTextarea from "@/pages/drama/comicDrama/components/LineNumberedTextarea";

interface ReferenceTabProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// 漫剧工作室「当前 · 参考」页签：本章参考文本编辑器（自动保存）。
// 参考小说对应章节经子页签行右侧的「引用」按钮带入；编辑器里是什么，
// 「解析」「提取」就用什么。
export default function ReferenceTab(props: ReferenceTabProps) {
  return (
    <Card className="rounded-3xl">
      <CardContent className="p-4 sm:p-6">
        <LineNumberedTextarea
          id="drama-reference-textarea"
          ariaLabel="参考小说文本"
          value={props.value}
          placeholder={props.placeholder}
          minRows={50}
          maxLength={20000}
          onChange={props.onChange}
        />
      </CardContent>
    </Card>
  );
}
