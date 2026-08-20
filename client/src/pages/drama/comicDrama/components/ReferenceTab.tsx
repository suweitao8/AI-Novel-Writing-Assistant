import { BookOpenText, ClipboardPaste, FilePlus2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import LineNumberedTextarea from "@/pages/drama/comicDrama/components/LineNumberedTextarea";

interface ReferenceTabProps {
  /** null = 本章没有参考文本且未进入编辑态：只读展示整本参考小说 */
  editorValue: string | null;
  onChange: (value: string) => void;
  docTitle: string;
  docCharCount: number;
  /** 整本参考小说预览文本（截取前 2 万字） */
  previewText: string;
  docLoading: boolean;
  onCopyDocToChapter: () => void;
  onBeginEdit: () => void;
}

// 漫剧工作室「当前 · 参考」页签：本章参考文本编辑器（自动保存）。
// 本章没有参考文本时只读展示整本参考小说——「解析」「提取」直接可用整本；
// 想单独编辑时一键复制整本为本章参考，或从空白粘贴，避免在整本小说上
// 直接粘贴造成同一内容叠出多份。
export default function ReferenceTab(props: ReferenceTabProps) {
  if (props.editorValue === null) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpenText className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">整本参考小说</span>
                {props.docCharCount > 0 ? (
                  <Badge variant="secondary">{props.docCharCount.toLocaleString()} 字</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                本章还没有单独的参考文本。「解析」与「提取」会直接使用下面这本《{props.docTitle}》；
                也可以把它一键复制为本章参考，或粘贴别的文本单独编辑。
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                onClick={props.onCopyDocToChapter}
                disabled={props.docLoading || !props.previewText.trim()}
              >
                复制为本章参考
              </Button>
              <Button size="sm" variant="outline" onClick={props.onBeginEdit}>
                <ClipboardPaste className="mr-1.5 h-4 w-4" aria-hidden="true" />
                粘贴新文本
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
            {props.docLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                正在读取整本参考小说…
              </p>
            ) : props.previewText.trim() ? (
              <>
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                  {props.previewText}
                </pre>
                {props.docCharCount > 20000 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    整本约 {props.docCharCount.toLocaleString()} 字，这里展示前 2 万字；复制为本章参考时同样取前 2 万字。
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                这本书还没有上传参考小说。可以在「设定 → 通用 → 参考小说」上传，或直接点「粘贴新文本」贴入本章参考。
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <FilePlus2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">本章参考文本</span>
          <Badge variant="secondary">{props.editorValue.trim().length.toLocaleString()} 字</Badge>
          <span className="text-xs text-muted-foreground">自动保存；「解析」与「提取」使用这份文本</span>
        </div>
        <LineNumberedTextarea
          id="drama-reference-textarea"
          ariaLabel="参考小说文本"
          value={props.editorValue}
          minRows={50}
          maxLength={20000}
          onChange={props.onChange}
        />
      </CardContent>
    </Card>
  );
}
