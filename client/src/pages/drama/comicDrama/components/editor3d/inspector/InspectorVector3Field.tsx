import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const AXES = ["X", "Y", "Z"] as const;
const AXIS_COLORS = ["text-red-500", "text-emerald-500", "text-sky-500"] as const;

function formatNumber(value: number, precision = 2): string {
  return String(Number(value.toFixed(precision)));
}

/**
 * 单个数值输入：失焦 / 回车提交，非法输入回退到当前值。
 * Unity Transform 数字字段的简化版（无拖拽调值）。
 */
export interface InspectorNumberFieldProps {
  label?: string;
  /** 轴标（X/Y/Z）或旋转的方向标；与 label 二选一渲染。 */
  axis?: "X" | "Y" | "Z";
  value: number;
  onCommit?: (value: number) => void;
  step?: number;
  min?: number;
  /** 单位后缀（米 / °）。 */
  suffix?: string;
  disabled?: boolean;
  precision?: number;
}

export function InspectorNumberField({
  label,
  axis,
  value,
  onCommit,
  step = 0.1,
  min,
  suffix,
  disabled = false,
  precision = 2,
}: InspectorNumberFieldProps) {
  const [draft, setDraft] = useState(() => formatNumber(value, precision));

  useEffect(() => {
    setDraft(formatNumber(value, precision));
  }, [value, precision]);

  const commit = () => {
    if (disabled || !onCommit) {
      setDraft(formatNumber(value, precision));
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatNumber(value, precision));
      return;
    }
    const next = Math.max(min ?? -Infinity, Number(parsed.toFixed(precision)));
    if (next === value) {
      setDraft(formatNumber(value, precision));
      return;
    }
    setDraft(formatNumber(next, precision));
    onCommit(next);
  };

  return (
    <label className="flex min-w-0 flex-1 items-center gap-1">
      {axis ? (
        <span className={cn("w-3 shrink-0 text-center text-[11px] font-semibold", AXIS_COLORS[AXES.indexOf(axis)])}>
          {axis}
        </span>
      ) : label ? (
        <span className="shrink-0 text-muted-foreground">{label}</span>
      ) : null}
      <span className="relative flex min-w-0 flex-1 items-center">
        <input
          type="number"
          value={draft}
          step={step}
          min={min}
          disabled={disabled}
          aria-label={[label, axis].filter(Boolean).join(" ")}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(formatNumber(value, precision));
              event.currentTarget.blur();
            }
          }}
          className={cn(
            "h-7 min-w-0 w-full rounded-md border border-border bg-background px-1.5 text-xs tabular-nums text-foreground transition-colors focus:border-ring focus-visible:outline-none disabled:cursor-default disabled:bg-muted/40 disabled:text-muted-foreground",
            suffix && "pr-6",
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-1.5 text-[10px] text-muted-foreground">{suffix}</span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * Unity Transform 的 Position / Scale 行：X/Y/Z 三个数字输入。
 * onChange 在任一轴提交时返回完整三元组；不传则整行只读。
 */
export interface InspectorVector3FieldProps {
  label: string;
  value: readonly [number, number, number] | number[];
  onCommit?: (value: [number, number, number]) => void;
  step?: number;
  min?: number;
  /** 单位后缀（米）。 */
  suffix?: string;
  disabled?: boolean;
  /** 按轴锁定（如旋转只有 Y 轴可改时锁定 X/Z，字段展示为禁用）。 */
  disabledAxes?: readonly [boolean, boolean, boolean];
  className?: string;
}

export function InspectorVector3Field({
  label,
  value,
  onCommit,
  step = 0.1,
  min,
  suffix = "",
  disabled = false,
  disabledAxes,
  className,
}: InspectorVector3FieldProps) {
  const commitAxis = (axisIndex: number, axisValue: number) => {
    if (!onCommit) return;
    const next: [number, number, number] = [value[0], value[1], value[2]];
    next[axisIndex] = axisValue;
    onCommit(next);
  };

  return (
    <div className={cn("flex items-center gap-2", className)} data-inspector="vector3">
      <span className="w-10 shrink-0 text-xs text-muted-foreground">{label}</span>
      {AXES.map((axis, index) => (
        <InspectorNumberField
          key={axis}
          axis={axis}
          value={value[index] ?? 0}
          onCommit={(axisValue) => commitAxis(index, axisValue)}
          step={step}
          min={min}
          suffix={suffix}
          disabled={disabled || !onCommit || Boolean(disabledAxes?.[index])}
        />
      ))}
    </div>
  );
}
