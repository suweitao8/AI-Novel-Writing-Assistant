import { createContext, useContext, useEffect } from "react";

/**
 * 页面级页签上收到顶部导航栏的通道：页面挂载时通过 useRegisterPageTabs
 * 声明自己的二级/三级页签，TopNav 在一级导航下方统一渲染。
 * 同一行内按注册顺序排列，组间用分隔线区分层级。
 */
export interface PageTabItem {
  key: string;
  label: string;
}

export interface PageTabRow {
  id: string;
  tabs: PageTabItem[];
  active: string;
  onSelect: (key: string) => void;
}

interface PageTabsContextValue {
  rows: PageTabRow[];
  setPageTabRows: (rows: PageTabRow[]) => void;
}

const PageTabsContext = createContext<PageTabsContextValue>({
  rows: [],
  setPageTabRows: () => {},
});

export const PageTabsProvider = PageTabsContext.Provider;

export function usePageTabRows(): PageTabRow[] {
  return useContext(PageTabsContext).rows;
}

export function useRegisterPageTabs(enabled: boolean, rows: PageTabRow[]): void {
  const { setPageTabRows } = useContext(PageTabsContext);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    setPageTabRows(rows);
    return () => setPageTabRows([]);
    // rows 是每次渲染的新数组；这里依赖序列化结果，避免引用比较导致注册丢失。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, setPageTabRows, JSON.stringify(rows)]);
}
