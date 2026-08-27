// 漫剧开发期临时配置：导航只保留漫剧主链路入口，其余入口暂时隐藏。
// 恢复全部入口时，将 DRAMA_FOCUS_MODE 改回 false 即可，无需删除各处过滤调用。
export const DRAMA_FOCUS_MODE = true;

const DRAMA_FOCUS_HIDDEN_NAV_ROUTES = new Set<string>([
  "/",
  "/novels",
  "/comic",
  "/creative-hub",
  "/book-analysis",
  "/titles",
  "/knowledge",
  "/worlds",
  "/style-engine",
  "/anti-ai-rules",
  "/base-characters",
  "/auto-director/follow-ups",
  "/prompt-workbench",
  "/genres",
  "/story-modes",
  "/chat-legacy",
  // 系统设置的二级页签：小说链路配置与外观，漫剧开发期暂时收起。
  "/settings/director",
  "/settings/knowledge",
  "/settings/appearance",
]);

export function isNavRouteVisible(to: string): boolean {
  if (!to) {
    return true;
  }
  if (!DRAMA_FOCUS_MODE) {
    return true;
  }
  return !DRAMA_FOCUS_HIDDEN_NAV_ROUTES.has(to);
}

export interface DramaFocusNavItem {
  to: string;
  label: string;
}

const DRAMA_FOCUS_NAV_ITEMS: DramaFocusNavItem[] = [
  { to: "/drama", label: "漫剧" },
  // 记录与画风收进系统：系统设置总览提供入口卡片，顶部导航只保留主链路。
  { to: "/settings", label: "系统" },
];

export function getDramaFocusNavItems(): DramaFocusNavItem[] {
  return DRAMA_FOCUS_NAV_ITEMS;
}
