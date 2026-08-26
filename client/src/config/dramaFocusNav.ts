// 漫剧开发期临时配置：导航只保留漫剧主链路入口，其余入口暂时隐藏。
// 恢复全部入口时，将 DRAMA_FOCUS_MODE 改回 false 即可，无需删除各处过滤调用。
export const DRAMA_FOCUS_MODE = true;

const DRAMA_FOCUS_HIDDEN_NAV_ROUTES = new Set<string>([
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
