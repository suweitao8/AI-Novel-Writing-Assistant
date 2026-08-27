import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Unity Inspector 顶部的 GameObject 名字段：
 * 图标 + 可编辑名称（失焦 / 回车提交），右侧展示对象类型。
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
  /** 对象类型标签（Unity 里是 Tag/Layer 行的位置）。 */
  kindLabel: string;
  /** 名称下的一行补充说明（如所属状态）。 */
  metaLine?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function InspectorGameObjectCard({
  icon,
  name,
  nameEditable = false,
  onRename,
  kindLabel,
  metaLine,
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
    setDraft(next);
    onRename(next);
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted/30 p-2.5",
        className,
      )}
      data-inspector="game-object"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground ring-1 ring-border">
          {icon}
        </span>
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
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border">
          {kindLabel}
        </span>
      </div>
      {metaLine ? (
        <div className="mt-1.5 min-w-0 pl-9 text-[11px] leading-4 text-muted-foreground">{metaLine}</div>
      ) : null}
    </div>
  );
}
