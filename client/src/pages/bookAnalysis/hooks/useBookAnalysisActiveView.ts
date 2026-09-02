import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { isRememberedTabValue } from "@/lib/rememberedTabs";
import { useRememberedTab } from "@/hooks/useRememberedTab";

export type BookAnalysisActiveView = "sections" | "characters";

const VIEW_VALUES = ["sections", "characters"] as const satisfies readonly BookAnalysisActiveView[];
const DEFAULT_VIEW: BookAnalysisActiveView = "sections";

export function useBookAnalysisActiveView(): {
  activeView: BookAnalysisActiveView;
  setActiveView: (view: BookAnalysisActiveView) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const analysisId = searchParams.get("analysisId")?.trim() || "none";
  const [rememberedView, setRememberedView] = useRememberedTab({
    scope: `book-analysis:${analysisId}:main-view`,
    defaultValue: DEFAULT_VIEW,
    values: VIEW_VALUES,
  });
  const rawView = searchParams.get("view");
  const hasViewParam = searchParams.has("view");
  const explicitView = isRememberedTabValue(rawView, VIEW_VALUES) ? rawView : null;
  const activeView = useMemo(
    () => explicitView ?? (hasViewParam ? DEFAULT_VIEW : rememberedView),
    [explicitView, hasViewParam, rememberedView],
  );

  useEffect(() => {
    if (explicitView !== null) {
      setRememberedView(explicitView);
      return;
    }
    if (hasViewParam) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("view");
        return next;
      }, { replace: true });
    }
  }, [explicitView, hasViewParam, setRememberedView, setSearchParams]);

  const setActiveView = useCallback((view: BookAnalysisActiveView) => {
    setRememberedView(view);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (view === DEFAULT_VIEW) {
          next.delete("view");
        } else {
          next.set("view", view);
        }
        return next;
      },
      { replace: true },
    );
  }, [setRememberedView, setSearchParams]);

  return { activeView, setActiveView };
}
