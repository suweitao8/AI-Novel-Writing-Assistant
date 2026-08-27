import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Unity Inspector 的组件节：带标题的可折叠块（对应 Transform / MeshRenderer 那一层）。
 * 标题点击切换折叠；内容始终渲染条件挂载——折叠时不占用面板高度。
 */
export interface InspectorComponentSectionProps {
  title: string;
  /** 折叠条左侧的图标（组件图标位）。 */
  icon?: ReactNode;
  defaultOpen?: boolean;
  /** 受控开关；不传则内部自持。 */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

export function InspectorComponentSection({
  title,
  icon,
  defaultOpen = true,
  open,
  onToggle,
  children,
  className,
}: InspectorComponentSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const toggle = () => {
    const next = !isOpen;
    if (onToggle) {
      onToggle(next);
    } else {
      setInternalOpen(next);
    }
  };

  return (
    <section
      data-inspector="component"
      data-component-title={title}
      className={cn("rounded-lg border border-border bg-card", className)}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 rounded-t-lg border-b border-border/60 px-3 py-2 text-left"
      >
        {icon ? <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">{icon}</span> : null}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{title}</span>
        {isOpen
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </button>
      {isOpen ? (
        <div className="space-y-4 p-3" data-inspector="component-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}
