import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StorySegmentField from "./StorySegmentField";
import {
  buildContinuousText,
  buildDisplayText,
  countTextMetrics,
  findTextMatches,
  getSegmentOffsets,
  offsetToLineCol,
  type TextMatch,
} from "./storyTextMetrics";

interface StoryBodyEditorProps {
  segments: Array<{ id: string; content: string }>;
  drafts: Record<string, string>;
  onDraftChange: (segmentId: string, next: string) => void;
}

export default function StoryBodyEditor(props: StoryBodyEditorProps) {
  const { segments, drafts, onDraftChange } = props;
  const [keyword, setKeyword] = useState("");
  const [activeSeq, setActiveSeq] = useState<number | null>(null);
  const [caret, setCaret] = useState<{ segmentIndex: number; offset: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const draftList = useMemo(
    () => segments.map((segment) => drafts[segment.id] ?? segment.content),
    [drafts, segments],
  );
  const segmentOffsets = useMemo(() => getSegmentOffsets(draftList), [draftList]);
  const displayText = useMemo(() => buildDisplayText(draftList), [draftList]);
  const metrics = useMemo(
    () => countTextMetrics(buildContinuousText(segments, drafts)),
    [drafts, segments],
  );

  const segmentMatches = useMemo(
    () => draftList.map((draft) => findTextMatches(draft, keyword)),
    [draftList, keyword],
  );
  const matchPrefixSums = useMemo(() => {
    let accumulated = 0;
    return segmentMatches.map((matches) => {
      const start = accumulated;
      accumulated += matches.length;
      return start;
    });
  }, [segmentMatches]);
  const totalMatches = useMemo(
    () => segmentMatches.reduce((total, matches) => total + matches.length, 0),
    [segmentMatches],
  );

  // 文本编辑后匹配数量可能变化，越界的激活序号回到首个匹配。
  useEffect(() => {
    if (activeSeq !== null && activeSeq >= totalMatches) {
      setActiveSeq(totalMatches > 0 ? 0 : null);
    }
  }, [activeSeq, totalMatches]);

  const activeSegmentIndex = useMemo(() => {
    if (activeSeq === null || totalMatches === 0) {
      return null;
    }
    const seq = activeSeq % totalMatches;
    for (let index = segmentMatches.length - 1; index >= 0; index -= 1) {
      if (seq >= matchPrefixSums[index]) {
        return index;
      }
    }
    return null;
  }, [activeSeq, matchPrefixSums, segmentMatches, totalMatches]);

  const activeLocalMatchIndex = useMemo(() => {
    if (activeSegmentIndex === null || activeSeq === null || totalMatches === 0) {
      return null;
    }
    return (activeSeq % totalMatches) - matchPrefixSums[activeSegmentIndex];
  }, [activeSeq, activeSegmentIndex, matchPrefixSums, totalMatches]);

  const jump = useCallback(
    (delta: 1 | -1) => {
      if (totalMatches === 0) {
        return;
      }
      setActiveSeq((current) => {
        if (current === null) {
          return 0;
        }
        return (current + delta + totalMatches) % totalMatches;
      });
    },
    [totalMatches],
  );

  const handleKeywordChange = (next: string) => {
    setKeyword(next);
    setActiveSeq(null);
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    root.addEventListener("keydown", onKeyDown, true);
    return () => root.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const currentLineCol = useMemo(() => {
    if (!caret) {
      return null;
    }
    const segmentOffset = segmentOffsets[caret.segmentIndex];
    const globalOffset = segmentOffset ? segmentOffset.startOffset + caret.offset : caret.offset;
    return offsetToLineCol(displayText, globalOffset);
  }, [caret, displayText, segmentOffsets]);

  const hasKeyword = keyword.trim().length > 0;

  return (
    <div
      ref={rootRef}
      className="overflow-hidden rounded-lg border border-input bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/30 px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          value={keyword}
          onChange={(event) => handleKeywordChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              jump(event.shiftKey ? -1 : 1);
            }
            if (event.key === "Escape") {
              handleKeywordChange("");
              event.currentTarget.blur();
            }
          }}
          placeholder="在正文中查找（Ctrl+F）"
          className="h-7 w-44 text-sm sm:w-56"
        />
        {hasKeyword ? (
          <span className="text-xs tabular-nums text-muted-foreground">{totalMatches} 处</span>
        ) : null}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="上一个匹配"
            disabled={totalMatches === 0}
            onClick={() => jump(-1)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="下一个匹配"
            disabled={totalMatches === 0}
            onClick={() => jump(1)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {hasKeyword ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="清除查找"
              onClick={() => handleKeywordChange("")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {segments.map((segment, index) => (
        <StorySegmentField
          key={segment.id}
          value={draftList[index] ?? ""}
          startLine={segmentOffsets[index]?.startLine ?? 1}
          matches={segmentMatches[index] ?? []}
          activeMatchIndex={activeSegmentIndex === index ? activeLocalMatchIndex : null}
          currentLine={currentLineCol?.line ?? null}
          onChange={(next) => onDraftChange(segment.id, next)}
          onCaretChange={(offset) => setCaret(offset === null ? null : { segmentIndex: index, offset })}
        />
      ))}

      <div className="border-t border-border/70 bg-muted/30 px-3 py-1.5 text-xs tabular-nums text-muted-foreground">
        字数 {metrics.chars.toLocaleString()} · 行 {metrics.lines} · 段落 {metrics.paragraphs}
        {currentLineCol ? ` · 第 ${currentLineCol.line} 行 第 ${currentLineCol.column} 列` : ""}
      </div>
    </div>
  );
}
