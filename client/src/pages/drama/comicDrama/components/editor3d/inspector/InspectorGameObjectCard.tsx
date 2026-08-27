import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 属性编辑器顶部的对象名称行（2026-08-27 用户要求）：
 * 只显示图标 + 可编辑名称，不加卡片包裹，也不展示类型徽标或补充说明。
 * 提交逻辑由调用方决定；不传 onRename 时退化为只读展示。
 */
export interface InspectorGameObjectCardProps {
  icon?: ReactNode;
  /** 当前生效的名称。 */
  name: string;
  /** 名称是否可编辑（默认只读）。 */
  nameEditable?: boolean;
  /** 名称提交（失焦或回车，仅在值变化时触发）。 */
  onRename?: (name: string) => void;
  disabled?: boolean;
  className?: string;
}

export function InspectorGameObjectCard({
  icon,
  name,
  nameEditable = false,
  onRename,
  disabled = false,
  className,
}: InspectorGameObjectCardProps) {
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  const commit = () => {
    const next = draft.trim();
    if (!nameEditable || !onRename || !next || next === name) {
      setDraft(name);
      return;
    }
    onRename(next);
  };

  return (
    <div
      className={cn("flex min-w-0 items-center gap-2", className)}
      data-inspector="game-object"
    >
      {icon ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <input
        value={draft}
        readOnly={!nameEditable || disabled}
        aria-label="对象名称"
        title={nameEditable ? "点击修改名称，回车或移出输入框保存" : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(name);
            event.currentTarget.blur();
          }
        }}
        className={cn(
          "h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-sm font-medium text-foreground transition-colors",
          nameEditable && !disabled && "border-border bg-background focus:border-ring focus-visible:outline-none",
          (!nameEditable || disabled) && "cursor-default",
        )}
      />
    </div>
  );
}
