import { useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useRegisterPageTabs } from "@/components/layout/PageTabsContext";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { cn } from "@/lib/utils";

const items = [
  { to: "/settings", label: "设置总览", end: true },
  { to: "/settings/models", label: "模型设置" },
  { to: "/settings/director", label: "自动导演" },
  { to: "/settings/knowledge", label: "知识库与写法" },
  { to: "/settings/narrator-voice", label: "旁白音色" },
  { to: "/settings/appearance", label: "外观与主题" },
  // 记录与画风以页签形式并入系统（2026-08-27 用户要求）；旧地址保留重定向。
  { to: "/settings/records", label: "记录" },
  { to: "/settings/art-style", label: "画风" },
];

// 系统设置的二级页签即子路由：桌面端上收到顶部导航栏，移动端保留页内列表。
export function SettingsShell(props: { title: string; description: string; children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobileViewport = useIsMobileViewport();
  const activeItem = items.find((item) => (
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
  )) ?? items[0];
  useRegisterPageTabs(!isMobileViewport, [{
    id: "settings-sections",
    tabs: items.map((item) => ({ key: item.to, label: item.label })),
    active: activeItem.to,
    onSelect: (key) => navigate(key),
  }]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {isMobileViewport ? (
        <nav aria-label="系统设置" className="min-w-0 pb-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {items.map(({ to, label, end }) => (
              <button
                key={to}
                type="button"
                onClick={() => navigate(to)}
                className={cn(
                  "flex shrink-0 items-center rounded-md px-3 py-2 text-sm transition-colors",
                  (end ? location.pathname === to : location.pathname.startsWith(to))
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
      ) : null}
      <main className="min-w-0 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">{props.title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{props.description}</p>
        </header>
        {props.children}
      </main>
    </div>
  );
}
