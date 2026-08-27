import type { ReactNode } from "react";

/**
 * 只读属性行集合：label 左、value 右的紧凑两列排版，替代各处手写的 <dl>。
 * 每行 value 支持任意 ReactNode（文本、徽标或内嵌控件）。
 */
export interface InspectorPropertyItem {
  label: string;
  value: ReactNode;
}

export function InspectorPropertyList({
  items,
  className = "",
}: {
  items: InspectorPropertyItem[];
  /** 追加到 dd 的公共类（如 tabular-nums）。 */
  className?: string;
}) {
  return (
    <dl className={"grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 " + className}>
      {items.map((item) => (
        <div key={item.label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 truncate text-right">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
