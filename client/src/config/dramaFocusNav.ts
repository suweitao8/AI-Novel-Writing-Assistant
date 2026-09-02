// 漫剧是当前产品的唯一主创作入口；保留这个常量让壳层布局逻辑保持清晰。
export const DRAMA_FOCUS_MODE = true;

// 仅保留仍有产品价值的系统页签，旧小说链路的配置页通过路由兼容跳转处理。
const DRAMA_FOCUS_HIDDEN_NAV_ROUTES = new Set<string>([
  "/settings/director",
  "/settings/appearance",
]);

export type DramaFocusFeature = "novel-readiness";

const DRAMA_FOCUS_HIDDEN_FEATURES = new Set<DramaFocusFeature>([
  "novel-readiness",
]);

export function isDramaFocusFeatureVisible(
  feature: DramaFocusFeature,
  focusMode = DRAMA_FOCUS_MODE,
): boolean {
  return !focusMode || !DRAMA_FOCUS_HIDDEN_FEATURES.has(feature);
}

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
  { to: "/models", label: "模型" },
  { to: "/animations", label: "动画" },
  // 记录与画风收进系统：系统设置总览提供入口卡片，顶部导航只保留主链路。
  { to: "/settings", label: "系统" },
];

export function getDramaFocusNavItems(): DramaFocusNavItem[] {
  return DRAMA_FOCUS_NAV_ITEMS;
}
