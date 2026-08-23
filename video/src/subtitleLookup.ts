import type { DramaVideoSubtitle } from "./types";

export interface DramaSubtitleLookupRange {
  startFrame: number;
  endFrame: number;
  subtitle: DramaVideoSubtitle;
}

/**
 * Creates disjoint ranges whose selected cue exactly matches Array.find() over
 * the original subtitle list, including legacy timelines that contain overlaps.
 */
export function buildDramaSubtitleLookup(
  subtitles: readonly DramaVideoSubtitle[],
): DramaSubtitleLookupRange[] {
  const events = new Map<number, { starts: number[]; ends: number[] }>();
  const addEvent = (frame: number, key: "starts" | "ends", index: number) => {
    const event = events.get(frame) ?? { starts: [], ends: [] };
    event[key].push(index);
    events.set(frame, event);
  };

  subtitles.forEach((subtitle, index) => {
    const startFrame = Math.max(0, subtitle.startFrame);
    const endFrame = startFrame + Math.max(0, subtitle.durationInFrames);
    if (endFrame <= startFrame) {
      return;
    }
    addEvent(startFrame, "starts", index);
    addEvent(endFrame, "ends", index);
  });

  const boundaries = [...events.keys()].sort((left, right) => left - right);
  const active = new Set<number>();
  const ranges: DramaSubtitleLookupRange[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const frame = boundaries[index]!;
    const event = events.get(frame)!;
    event.ends.forEach((subtitleIndex) => active.delete(subtitleIndex));
    event.starts.forEach((subtitleIndex) => active.add(subtitleIndex));
    const endFrame = boundaries[index + 1]!;
    if (active.size === 0 || endFrame <= frame) {
      continue;
    }
    const earliestIndex = Math.min(...active);
    ranges.push({ startFrame: frame, endFrame, subtitle: subtitles[earliestIndex]! });
  }
  return ranges;
}

export function findActiveSubtitle(
  ranges: readonly DramaSubtitleLookupRange[],
  frame: number,
): DramaVideoSubtitle | undefined {
  let low = 0;
  let high = ranges.length - 1;
  let candidate: DramaSubtitleLookupRange | undefined;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const range = ranges[middle]!;
    if (range.startFrame <= frame) {
      candidate = range;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return candidate && frame < candidate.endFrame ? candidate.subtitle : undefined;
}
