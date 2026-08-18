import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * 程序化生成的小说封面。
 *
 * 作品没有用户上传或 AI 生成的封面时统一使用本组件：按标题稳定取一组配色，
 * 直接把书名渲染成封面，不依赖任何图片资源，也不再展示通用占位图。
 * 封面属于作品视觉（artwork），与主题 token 无关，因此使用固定的精选色板。
 */

const COVER_PALETTES: ReadonlyArray<{ from: string; to: string; accent: string }> = [
  { from: "#1c2f4a", to: "#3d6d96", accent: "#9ecbe8" }, // 深海蓝
  { from: "#33254f", to: "#6c4a86", accent: "#d9b8ec" }, // 暮紫
  { from: "#173d2e", to: "#33795b", accent: "#a9e3c3" }, // 松绿
  { from: "#4a2323", to: "#8c4632", accent: "#efb89a" }, // 赭红
  { from: "#28323f", to: "#51606f", accent: "#c4d0dc" }, // 岩灰
  { from: "#1f3a38", to: "#2f6d68", accent: "#a3ded6" }, // 黛青
  { from: "#3f2f1c", to: "#7d5f30", accent: "#ecd39c" }, // 秋金
  { from: "#2b2540", to: "#4a3f6b", accent: "#c3b8e8" }, // 夜蓝紫
];

/** 全角字符按 1 个宽度单位，半角按 0.5，保证中英文混排换行近似等宽。 */
function charUnits(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  const isFullWidth =
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x3000 && code <= 0x303f);
  return isFullWidth ? 1 : 0.5;
}

function wrapTitleLines(title: string, maxUnitsPerLine: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  let width = 0;
  for (const ch of title) {
    const units = charUnits(ch);
    if (width + units > maxUnitsPerLine && current) {
      lines.push(current);
      if (lines.length >= maxLines) {
        // 已到行数上限：最后一行收尾改为省略号
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 1))}…`;
        return lines;
      }
      current = ch;
      width = units;
    } else {
      current += ch;
      width += units;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickPalette(title: string): (typeof COVER_PALETTES)[number] {
  const normalized = title.trim() || "未命名作品";
  return COVER_PALETTES[hashString(normalized) % COVER_PALETTES.length];
}

interface NovelProgrammaticCoverProps {
  title: string;
  /** 封面底部的小字说明，例如“短篇 / 长篇原创”。 */
  label?: string;
  /** 纵版用于独立封面场景，横版用于列表缩略图等紧凑场景。 */
  orientation?: "portrait" | "landscape";
  className?: string;
}

export default function NovelProgrammaticCover(props: NovelProgrammaticCoverProps) {
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const title = props.title.trim() || "未命名作品";
  const palette = pickPalette(title);
  const isLandscape = props.orientation === "landscape";
  const lines = wrapTitleLines(title, isLandscape ? 12 : 7, isLandscape ? 2 : 4);
  const maxLineUnits = Math.max(...lines.map((line) => Array.from(line).reduce((sum, ch) => sum + charUnits(ch), 0)));
  const fontSize = isLandscape
    ? (maxLineUnits <= 5 ? 30 : maxLineUnits <= 8 ? 26 : 22)
    : (maxLineUnits <= 3 ? 30 : maxLineUnits <= 5 ? 26 : 22);
  const lineHeight = fontSize * 1.4;
  const centerY = isLandscape ? 100 : 150;
  const firstLineY = centerY - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;
  const textX = isLandscape ? 20 : 22;

  return (
    <svg
      viewBox={isLandscape ? "0 0 300 200" : "0 0 200 300"}
      role="img"
      aria-label={`《${title}》封面`}
      preserveAspectRatio="xMidYMid slice"
      className={cn("h-full w-full select-none", props.className)}
    >
      <defs>
        <linearGradient id={`npc-${gradientId}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={palette.from} />
          <stop offset="100%" stopColor={palette.to} />
        </linearGradient>
      </defs>
      <rect width={isLandscape ? 300 : 200} height={isLandscape ? 200 : 300} fill={`url(#npc-${gradientId})`} />
      <circle cx={isLandscape ? 252 : 168} cy={isLandscape ? 38 : 52} r={86} fill="#ffffff" opacity="0.05" />
      <circle cx={isLandscape ? 46 : 30} cy={isLandscape ? 174 : 262} r={104} fill="#000000" opacity="0.10" />
      <rect x={textX} y={isLandscape ? 26 : 38} width={isLandscape ? 36 : 30} height={3.5} rx={1.75} fill={palette.accent} />
      {lines.map((line, index) => (
        <text
          key={index}
          x={textX}
          y={firstLineY + index * lineHeight}
          fontSize={fontSize}
          fontWeight={700}
          fill="#ffffff"
          opacity="0.96"
          letterSpacing="1"
        >
          {line}
        </text>
      ))}
      {props.label ? (
        <text x={textX} y={isLandscape ? 176 : 274} fontSize="11" fill="#ffffff" opacity="0.72" letterSpacing="3">
          {props.label}
        </text>
      ) : null}
    </svg>
  );
}
