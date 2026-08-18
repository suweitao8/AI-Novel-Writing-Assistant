import { useRef } from "react";
import { Check, FileText, Loader2, Upload } from "lucide-react";
import {
  BOOK_ANALYSIS_PRESETS,
  BOOK_ANALYSIS_SECTIONS,
  type BookAnalysisPreset,
} from "@ai-novel/shared/types/bookAnalysis";
import type { DocumentChapter, KnowledgeDocumentDetail, KnowledgeDocumentSummary } from "@ai-novel/shared/types/knowledge";
import BookAnalysisSourceRangePicker from "./BookAnalysisSourceRangePicker";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { BookAnalysisMode, BookAnalysisSourceRangeDraft, NovelOption } from "../hooks/bookAnalysisWorkspace.types";
import SelectControl from "@/components/common/SelectControl";

interface BookAnalysisCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysisMode: BookAnalysisMode;
  selectedDocumentId: string;
  selectedVersionId: string;
  selectedDiagnosisNovelId: string;
  userFocusInstruction: string;
  selectedSourceRange: BookAnalysisSourceRangeDraft;
  analysisPreset: BookAnalysisPreset;
  documentOptions: KnowledgeDocumentSummary[];
  versionOptions: KnowledgeDocumentDetail["versions"];
  sourceDocument?: KnowledgeDocumentDetail;
  sourceChapters: DocumentChapter[];
  sourceChaptersRequested: boolean;
  sourceChaptersLoading: boolean;
  sourceChaptersError: string;
  novelOptions: NovelOption[];
  importDocumentStatus: "idle" | "pending" | "success" | "error";
  importDocumentFile: File | null;
  createPending: boolean;
  createDiagnosisPending: boolean;
  onModeChange: (mode: BookAnalysisMode) => void;
  onSelectDocument: (documentId: string) => void;
  onSelectVersion: (versionId: string) => void;
  onSelectDiagnosisNovel: (novelId: string) => void;
  onUserFocusInstructionChange: (instruction: string) => void;
  onSourceRangeChange: (range: BookAnalysisSourceRangeDraft) => void;
  onImportDocument: (file: File) => void;
  onRequestSourceChapters: () => void;
  onAnalysisPresetChange: (preset: BookAnalysisPreset) => void;
  onCreate: () => void;
  onCreateDiagnosis: () => void;
}

const ESTIMATED_SEGMENT_CHARS = 10_000;
const MAX_ESTIMATED_SEGMENTS = 12;

function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function getBookAnalysisScaleLabel(charCount: number): { label: string; tone: string } {
  if (charCount >= 300_000) {
    return { label: "大型书籍", tone: "建议使用成本更可控的模型，或先拆分文档范围。" };
  }
  if (charCount >= 100_000) {
    return { label: "中等体量", tone: "适合标准拆书，生成时间和 token 用量会随章节规模增加。" };
  }
  return { label: "轻量体量", tone: "适合快速检查结构、人物和写法特征。" };
}

function getPresetSectionTitles(sectionKeys: readonly string[]): string {
  return sectionKeys
    .map((key) => BOOK_ANALYSIS_SECTIONS.find((section) => section.key === key)?.title)
    .filter((title): title is string => Boolean(title))
    .join("、");
}

export default function BookAnalysisCreateDialog(props: BookAnalysisCreateDialogProps) {
  const {
    open,
    onOpenChange,
    analysisMode,
    selectedDocumentId,
    selectedVersionId,
    selectedDiagnosisNovelId,
    userFocusInstruction,
    selectedSourceRange,
    analysisPreset,
    documentOptions,
    versionOptions,
    sourceDocument,
    sourceChapters,
    sourceChaptersRequested,
    sourceChaptersLoading,
    sourceChaptersError,
    novelOptions,
    importDocumentStatus,
    importDocumentFile,
    createPending,
    createDiagnosisPending,
    onModeChange,
    onSelectDocument,
    onSelectVersion,
    onSelectDiagnosisNovel,
    onUserFocusInstructionChange,
    onSourceRangeChange,
    onImportDocument,
    onRequestSourceChapters,
    onAnalysisPresetChange,
    onCreate,
    onCreateDiagnosis,
  } = props;
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const isDiagnosisMode = analysisMode === "diagnosis";
  const selectedSourceVersion = sourceDocument?.versions.find((version) => version.id === selectedVersionId)
    ?? sourceDocument?.versions.find((version) => version.isActive)
    ?? sourceDocument?.versions[0];
  const sourceCharCount = selectedSourceVersion?.charCount ?? selectedSourceVersion?.content.length ?? 0;
  const sortedSourceChapters = [...sourceChapters].sort((a, b) => a.chapterIndex - b.chapterIndex);
  const rangeStartChapter = selectedSourceRange
    ? sortedSourceChapters.find((chapter) => chapter.chapterIndex === selectedSourceRange.startChapterIndex)
    : null;
  const rangeEndChapter = selectedSourceRange
    ? sortedSourceChapters.find((chapter) => chapter.chapterIndex === selectedSourceRange.endChapterIndex)
    : null;
  const selectedRangeCharCount = rangeStartChapter && rangeEndChapter
    ? Math.max(0, rangeEndChapter.endOffset - rangeStartChapter.startOffset)
    : sourceCharCount;
  const effectiveSourceCharCount = selectedSourceRange ? selectedRangeCharCount : sourceCharCount;
  const sourceRangeValid = !selectedSourceRange || Boolean(rangeStartChapter && rangeEndChapter && selectedRangeCharCount > 0);
  const estimatedSegmentCount = effectiveSourceCharCount > 0
    ? Math.min(MAX_ESTIMATED_SEGMENTS, Math.max(1, Math.ceil(effectiveSourceCharCount / ESTIMATED_SEGMENT_CHARS)))
    : 0;
  const selectedPreset = BOOK_ANALYSIS_PRESETS.find((preset) => preset.key === analysisPreset) ?? BOOK_ANALYSIS_PRESETS[1];
  const estimatedSectionCount = selectedPreset.sectionKeys.length;
  const estimatedLlmCalls = estimatedSegmentCount > 0 ? estimatedSegmentCount + estimatedSectionCount : 0;
  const scale = getBookAnalysisScaleLabel(effectiveSourceCharCount);

  const canSubmit = isDiagnosisMode
    ? Boolean(selectedDiagnosisNovelId) && !createDiagnosisPending
    : Boolean(selectedDocumentId) && sourceRangeValid && !createPending;
  const submitting = isDiagnosisMode ? createDiagnosisPending : createPending;
  const submitLabel = isDiagnosisMode
    ? (createDiagnosisPending ? "正在创建诊断..." : "创建诊断拆书")
    : (createPending ? "正在创建..." : "创建拆书");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title="新建拆书分析"
        description="选择文档与拆书范围，提交后会在右侧分析列表中出现新任务。"
        className="max-w-4xl"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!canSubmit}
              onClick={isDiagnosisMode ? onCreateDiagnosis : onCreate}
            >
              {submitLabel}
            </Button>
          </div>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 p-1">
              <Button
                type="button"
                size="sm"
                variant={analysisMode === "reference" ? "default" : "ghost"}
                onClick={() => onModeChange("reference")}
              >
                参考作品
              </Button>
              <Button
                type="button"
                size="sm"
                variant={isDiagnosisMode ? "default" : "ghost"}
                onClick={() => onModeChange("diagnosis")}
              >
                诊断稿子
              </Button>
            </div>

            {isDiagnosisMode ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">要诊断的小说</div>
                <SelectControl
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedDiagnosisNovelId}
                  onChange={(event) => onSelectDiagnosisNovel(event.target.value)}
                >
                  <option value="">选择小说</option>
                  {novelOptions.map((novel) => (
                    <option key={novel.id} value={novel.id}>
                      {novel.title}
                    </option>
                  ))}
                </SelectControl>
                <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                  系统会导出这本小说的当前章节正文，作为新的知识文档创建诊断拆书。
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">知识文档</div>
                  <SelectControl
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedDocumentId}
                    onChange={(event) => onSelectDocument(event.target.value)}
                  >
                    <option value="">{documentOptions.length > 0 ? "选择文档" : "还没有文档，先在下方导入"}</option>
                    {documentOptions.map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.title}
                      </option>
                    ))}
                  </SelectControl>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">文档版本</div>
                  <SelectControl
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedVersionId}
                    onChange={(event) => onSelectVersion(event.target.value)}
                    disabled={!selectedDocumentId}
                  >
                    <option value="">使用当前激活版本</option>
                    {versionOptions.map((version) => (
                      <option key={version.id} value={version.id}>
                        v{version.versionNumber} {version.isActive ? "（当前）" : ""}
                      </option>
                    ))}
                  </SelectControl>
                </div>
              </div>
                <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">导入外部小说</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        选择一个 txt 文本文件，导入后会自动出现在上方文档列表并选中，即可开始拆解。
                      </div>
                    </div>
                    <input
                      ref={importFileInputRef}
                      type="file"
                      accept=".txt,text/plain"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          onImportDocument(file);
                        }
                        event.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={importDocumentStatus === "pending"}
                      onClick={() => importFileInputRef.current?.click()}
                    >
                      {importDocumentStatus === "pending" ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      )}
                      {importDocumentStatus === "pending" ? "正在导入..." : "选择文件"}
                    </Button>
                  </div>
                  {importDocumentFile ? (
                    <div
                      className={cn(
                        "mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                        importDocumentStatus === "pending" && "border-primary/30 bg-primary/5 text-foreground",
                        importDocumentStatus === "success" && "border-primary/30 bg-primary/5 text-foreground",
                        importDocumentStatus === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
                      )}
                    >
                      {importDocumentStatus === "pending" ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                      ) : importDocumentStatus === "success" ? (
                        <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                      <span className="min-w-0 truncate font-medium">{importDocumentFile.name}</span>
                      <span className="shrink-0 opacity-70">{(importDocumentFile.size / 1024).toFixed(1)} KB</span>
                      <span className="ml-auto shrink-0">
                        {importDocumentStatus === "pending"
                          ? "正在导入，请稍候..."
                          : importDocumentStatus === "success"
                            ? "已导入，可在上方文档列表中确认"
                            : "导入失败，请重新选择文件"}
                      </span>
                    </div>
                  ) : null}
                </div>
                <BookAnalysisSourceRangePicker
                  selectedRange={selectedSourceRange}
                  sourceChapters={sourceChapters}
                  sourceCharCount={sourceCharCount}
                  sourceSelected={Boolean(selectedDocumentId)}
                  chaptersRequested={sourceChaptersRequested}
                  chaptersLoading={sourceChaptersLoading}
                  chaptersError={sourceChaptersError}
                  onRangeChange={onSourceRangeChange}
                  onRequestChapters={onRequestSourceChapters}
                />
              </>
            )}

            <div className="space-y-2">
              <div className="text-sm font-medium">分析维度</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {BOOK_ANALYSIS_PRESETS.map((preset) => {
                  const selected = preset.key === analysisPreset;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={`rounded-md border p-3 text-left transition-colors ${
                        selected ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                      }`}
                      onClick={() => onAnalysisPresetChange(preset.key)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{preset.title}</div>
                        <div className="text-xs text-muted-foreground">{preset.sectionKeys.length} 项</div>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{preset.summary}</div>
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">
                        包含：{getPresetSectionTitles(preset.sectionKeys)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">本次拆书重点</div>
              <textarea
                className="min-h-[92px] w-full rounded-md border bg-background p-3 text-sm"
                value={userFocusInstruction}
                onChange={(event) => onUserFocusInstructionChange(event.target.value)}
                placeholder={isDiagnosisMode
                  ? "例如：重点检查前三章留存、主角动机清晰度或伏笔回收风险。"
                  : "例如：重点观察群像戏轮转、主角语言风格或付费爽点设计。"}
              />
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-foreground">
              {isDiagnosisMode
                ? "诊断会根据小说正文长度消耗模型 token。章节越多，分析时间和 token 用量通常越高；建议先选择适合本次检查的拆书范围。"
                : "拆书会根据书籍内容长度消耗模型 token。书籍越长，分析时间和 token 用量通常越高；建议先确认文档范围，再开始分析。"}
            </div>

            <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
              分析使用系统设置中的默认文本模型。用量达到安全上限时任务会自动暂停，已完成的章节会保留，可随时继续。
            </div>

            {!isDiagnosisMode && selectedSourceVersion ? (
              <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                <div className="font-medium text-foreground">本次拆书体量：{scale.label}</div>
                <div className="mt-1">
                  约 {formatCount(effectiveSourceCharCount)} 字，预计拆成 {estimatedSegmentCount} 个原文片段，
                  约 {estimatedLlmCalls} 次模型调用。
                </div>
                <div className="mt-1">{scale.tone}</div>
              </div>
            ) : null}

            {!isDiagnosisMode && sourceDocument ? (
              <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                版本数：{sourceDocument.versions.length} | 已有拆书：{sourceDocument.bookAnalysisCount}
              </div>
            ) : null}
          </aside>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
