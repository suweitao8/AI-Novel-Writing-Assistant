import { Move3D, RotateCw, Scale3d } from "lucide-react";

import { cn } from "@/lib/utils";

export type TransformToolbarTool = "translate" | "rotate" | "scale";

const TOOLS = [
  { value: "translate", label: "移动", icon: Move3D },
  { value: "rotate", label: "旋转", icon: RotateCw },
  { value: "scale", label: "缩放", icon: Scale3d },
] as const;

export interface TransformToolToolbarProps {
  tool: TransformToolbarTool | null;
  onToolChange: (tool: TransformToolbarTool | null) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Unity 场景视图左上角的工具条：移动 / 旋转 / 缩放手柄切换，
 * 再点一次当前工具可收起手柄（回到纯观察）。
 */
export function TransformToolToolbar({ tool, onToolChange, disabled = false, className }: TransformToolToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="变换工具"
      data-transform-tool={tool ?? "none"}
      className={cn(
        "pointer-events-auto absolute left-3 top-3 flex items-center gap-0.5 rounded-lg border border-border bg-background/90 p-1 shadow-sm backdrop-blur",
        className,
      )}
    >
      {TOOLS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={tool === value}
          disabled={disabled}
          onClick={() => onToolChange(tool === value ? null : value)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            tool === value && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
