import { createContext, useContext, useEffect } from "react";

/**
 * 页面与顶部导航栏之间的上收通道：
 * - 页签：页面挂载时通过 useRegisterPageTabs 声明自己的二级/三级页签，
 *   TopNav 在一级导航下方统一渲染，同一行按注册顺序排列，组间用分隔线区分层级。
 * - 操作区：TopNav 挂出一个 DOM 槽位（「AI 实况」左侧），页面把工具按钮
 *   用 createPortal 渲染进去；按钮仍在页面组件树内更新，状态天然同步。
 */
export interface PageTabItem {
  key: string;
  label: string;
  /** 在该页签右侧画竖线分隔，用于同一胶囊内的语义分组边界。 */
  dividerAfter?: boolean;
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
  navActionsSlot: HTMLDivElement | null;
  setNavActionsSlot: (slot: HTMLDivElement | null) => void;
}

const PageTabsContext = createContext<PageTabsContextValue>({
  rows: [],
  setPageTabRows: () => {},
  navActionsSlot: null,
  setNavActionsSlot: () => {},
});

export const PageTabsProvider = PageTabsContext.Provider;

export function usePageTabRows(): PageTabRow[] {
  return useContext(PageTabsContext).rows;
}

export function usePageNavActionsSlot(): HTMLDivElement | null {
  return useContext(PageTabsContext).navActionsSlot;
}

export function useSetPageNavActionsSlot(): (slot: HTMLDivElement | null) => void {
  return useContext(PageTabsContext).setNavActionsSlot;
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
