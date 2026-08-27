import { Move3D } from "lucide-react";
import type { ReactNode } from "react";

import { InspectorComponentSection } from "./InspectorComponentSection";
import { InspectorNumberField, InspectorVector3Field } from "./InspectorVector3Field";

export interface InspectorTransformValue {
  position: [number, number, number];
  yawDeg: number;
  /** 整体等比缩放；不支持单轴缩放。 */
  scale: number;
}

export interface InspectorTransformSectionProps {
  value: InspectorTransformValue;
  /** 任一分量提交时返回补丁；不传则整节只读。 */
  onCommit?: (patch: Partial<InspectorTransformValue>) => void;
  disabled?: boolean;
  /** 折叠节底部的动作区（如聚焦按钮）。 */
  footer?: ReactNode;
  hint?: ReactNode;
  className?: string;
}

// 布局数据只保存 Y 轴旋转（yawDeg），X/Z 两格按 Unity 字段位展示但锁定。
const ROTATION_LOCKED_AXES = [true, false, true] as const;

/**
 * Unity Inspector 的 Transform 组件节：位置 / 旋转各三个纯数字输入，
 * 缩放为单值整体等比缩放。
 */
export function InspectorTransformSection({
  value,
  onCommit,
  disabled = false,
  footer,
  hint,
  className,
}: InspectorTransformSectionProps) {
  const readOnly = disabled || !onCommit;
  return (
    <InspectorComponentSection title="Transform" icon={<Move3D className="h-3.5 w-3.5" aria-hidden="true" />} className={className}>
      <div className="space-y-2">
        <InspectorVector3Field
          label="位置"
          value={value.position}
          step={0.1}
          disabled={readOnly}
          onCommit={(position) => onCommit?.({ position })}
        />
        <InspectorVector3Field
          label="旋转"
          value={[0, value.yawDeg, 0]}
          disabledAxes={ROTATION_LOCKED_AXES}
          step={5}
          disabled={readOnly}
          onCommit={(rotation) => onCommit?.({ yawDeg: rotation[1] })}
        />
        <div className="flex items-center gap-2" data-inspector="uniform-scale">
          <span className="w-10 shrink-0 text-xs text-muted-foreground">缩放</span>
          <InspectorNumberField
            value={value.scale}
            step={0.1}
            min={0.05}
            disabled={readOnly}
            onCommit={(scale) => onCommit?.({ scale })}
          />
        </div>
      </div>
      {hint}
      {footer}
    </InspectorComponentSection>
  );
}
