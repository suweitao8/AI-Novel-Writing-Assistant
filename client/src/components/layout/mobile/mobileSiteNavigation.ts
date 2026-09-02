export type MobilePrimaryNavKey = "drama" | "models" | "animations" | "tasks" | "more";

export interface MobileNavItem {
  key: string;
  label: string;
  to: string;
  group: MobilePrimaryNavKey;
}

export interface MobileNavGroup {
  title: string;
  items: MobileNavItem[];
}

export interface MobileRoutePattern {
  key: string;
  pattern: RegExp;
  title: string;
  group: MobilePrimaryNavKey;
}

export const MOBILE_ROUTE_PATTERNS: MobileRoutePattern[] = [
  { key: "drama", pattern: /^\/drama(\/|$)/, title: "漫剧", group: "drama" },
  { key: "models", pattern: /^\/models(\/|$)/, title: "模型库", group: "models" },
  { key: "animations", pattern: /^\/animations(\/|$)/, title: "动画库", group: "animations" },
  { key: "tasks", pattern: /^\/tasks\/?$/, title: "任务", group: "tasks" },
  { key: "knowledge", pattern: /^\/knowledge\/?$/, title: "知识库", group: "more" },
  { key: "art-style", pattern: /^\/art-style\/?$/, title: "画风", group: "more" },
  { key: "settings-models", pattern: /^\/settings\/models\/?$/, title: "模型设置", group: "more" },
  { key: "settings-knowledge", pattern: /^\/settings\/knowledge\/?$/, title: "知识库与写法", group: "more" },
  { key: "settings-narrator-voice", pattern: /^\/settings\/narrator-voice(\/|$)/, title: "通用资产", group: "more" },
  { key: "settings-records", pattern: /^\/settings\/records\/?$/, title: "记录", group: "more" },
  { key: "settings-art-style", pattern: /^\/settings\/art-style\/?$/, title: "画风", group: "more" },
  { key: "settings", pattern: /^\/settings\/?$/, title: "系统设置", group: "more" },
];

const primaryNavItems: MobileNavItem[] = [
  { key: "drama", label: "漫剧", to: "/drama", group: "drama" },
  { key: "models", label: "模型", to: "/models", group: "models" },
  { key: "animations", label: "动画", to: "/animations", group: "animations" },
  { key: "tasks", label: "任务", to: "/tasks", group: "tasks" },
  { key: "more", label: "更多", to: "", group: "more" },
];

const moreNavGroups: MobileNavGroup[] = [
  {
    title: "资料",
    items: [
      { key: "knowledge", label: "知识库", to: "/knowledge", group: "more" },
    ],
  },
  {
    title: "系统",
    items: [
      { key: "settings-models", label: "模型设置", to: "/settings/models", group: "more" },
      { key: "settings-knowledge", label: "知识库与写法", to: "/settings/knowledge", group: "more" },
      { key: "settings-narrator-voice", label: "通用资产", to: "/settings/narrator-voice", group: "more" },
      { key: "settings-art-style", label: "画风", to: "/settings/art-style", group: "more" },
      { key: "settings-records", label: "记录", to: "/settings/records", group: "more" },
      { key: "settings", label: "系统", to: "/settings", group: "more" },
    ],
  },
];

export function getMobilePrimaryNavItems(): MobileNavItem[] {
  return primaryNavItems;
}

export function getMobileMoreNavGroups(): MobileNavGroup[] {
  return moreNavGroups;
}

export function getMobileRoutePattern(pathname: string): MobileRoutePattern | undefined {
  return MOBILE_ROUTE_PATTERNS.find((route) => route.pattern.test(pathname));
}

export function getMobilePageTitle(pathname: string): string {
  return getMobileRoutePattern(pathname)?.title ?? "更多功能";
}

export function getMobileNavGroupForPath(pathname: string): MobilePrimaryNavKey {
  return getMobileRoutePattern(pathname)?.group ?? "more";
}

export function getMobileRouteClassName(pathname: string): string {
  return `mobile-route-${getMobileRoutePattern(pathname)?.key ?? "more"}`;
}
