import { prisma } from "../../../db/prisma";
import { parseDialogueLines } from "../audio/DramaDialogueAudioService";
import {
  dramaAudioSegmentsService,
  type DramaAudioSegment,
} from "../audio/DramaAudioSegmentsService";
import {
  classifyDramaVisual,
  isDramaAudioReady,
  isDramaKeyframeReady,
  type DramaVisualKind,
} from "./DramaShotReadiness";

export interface DramaReadinessShotInput {
  id: string;
  keyframeData?: string | null;
  videoReady?: boolean;
  audioLineIndexes?: number[];
}

export interface DramaReadinessSegmentInput {
  shotId: string;
  lineIndex: number;
  status?: string;
  audioUrl?: string;
}

export interface DramaShotReadiness {
  shotId: string;
  keyframeReady: boolean;
  audioReady: boolean;
  visualKind: DramaVisualKind;
}

export interface DramaEpisodeReadiness {
  shotCount: number;
  keyframeReadyCount: number;
  audioReadyCount: number;
  withVideoClip: number;
  withKeyframeOnly: number;
  withoutVisual: number;
  withoutAudioShotCount: number;
  shots: DramaShotReadiness[];
}

export interface DramaProjectReadiness {
  shotCount: number;
  keyframeReadyCount: number;
  audioReadyCount: number;
  videoPromptCount: number;
  videoReadyCount: number;
}

function toAudioProjection(segments: DramaReadinessSegmentInput[]) {
  return { status: "ready", lines: segments };
}

export function evaluateDramaShotReadiness(
  shot: DramaReadinessShotInput,
  segments: DramaReadinessSegmentInput[],
): DramaShotReadiness {
  const keyframeReady = isDramaKeyframeReady(shot.keyframeData);
  const audioReady = isDramaAudioReady(
    toAudioProjection(segments),
    (shot.audioLineIndexes ?? []).map((lineIndex) => ({ lineIndex })),
  );
  const visualKind = classifyDramaVisual({
    videoReady: shot.videoReady === true,
    keyframeReady,
  });
  return { shotId: shot.id, keyframeReady, audioReady, visualKind };
}

export function summarizeDramaEpisodeReadiness(
  shots: DramaReadinessShotInput[],
  segments: DramaReadinessSegmentInput[],
): Omit<DramaEpisodeReadiness, "shots"> & { shots: DramaShotReadiness[] } {
  const segmentsByShot = new Map<string, DramaReadinessSegmentInput[]>();
  for (const segment of segments) {
    const list = segmentsByShot.get(segment.shotId) ?? [];
    list.push(segment);
    segmentsByShot.set(segment.shotId, list);
  }

  const shotReadiness = shots.map((shot) => evaluateDramaShotReadiness(shot, segmentsByShot.get(shot.id) ?? []));
  const keyframeReadyCount = shotReadiness.filter((shot) => shot.keyframeReady).length;
  const audioReadyCount = shotReadiness.filter((shot) => shot.audioReady).length;
  const withVideoClip = shotReadiness.filter((shot) => shot.visualKind === "video").length;
  const withKeyframeOnly = shotReadiness.filter((shot) => shot.visualKind === "keyframe").length;
  const withoutVisual = shotReadiness.filter((shot) => shot.visualKind === "placeholder").length;

  return {
    shotCount: shots.length,
    keyframeReadyCount,
    audioReadyCount,
    withVideoClip,
    withKeyframeOnly,
    withoutVisual,
    withoutAudioShotCount: shots.length - audioReadyCount,
    shots: shotReadiness,
  };
}

function toSegmentInput(segment: DramaAudioSegment): DramaReadinessSegmentInput {
  return {
    shotId: segment.shotId,
    lineIndex: segment.lineIndex,
    status: segment.status,
    audioUrl: segment.audioUrl,
  };
}

export class DramaReadinessService {
  async getEpisodeReadiness(projectId: string, order: number): Promise<DramaEpisodeReadiness> {
    const episode = await prisma.dramaEpisode.findUnique({
      where: { projectId_order: { projectId, order } },
      select: {
        storyboards: {
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            shots: {
              orderBy: { order: "asc" },
              select: { id: true, dialogue: true, keyframeData: true },
            },
          },
        },
        videoPrompts: {
          where: { status: "succeeded", resultUrl: { not: null } },
          select: { shotId: true },
        },
      },
    });
    const storyboard = episode?.storyboards[0];
    if (!storyboard) {
      return {
        shotCount: 0,
        keyframeReadyCount: 0,
        audioReadyCount: 0,
        withVideoClip: 0,
        withKeyframeOnly: 0,
        withoutVisual: 0,
        withoutAudioShotCount: 0,
        shots: [],
      };
    }

    const videoReadyShotIds = new Set((episode.videoPrompts ?? []).map((prompt) => prompt.shotId).filter(Boolean));
    const segments = await dramaAudioSegmentsService.listEpisodeAudioSegments(projectId, order);
    return summarizeDramaEpisodeReadiness(
      storyboard.shots.map((shot) => ({
        id: shot.id,
        keyframeData: shot.keyframeData,
        videoReady: videoReadyShotIds.has(shot.id),
        audioLineIndexes: parseDialogueLines(shot.dialogue).map((line) => line.lineIndex),
      })),
      segments.map(toSegmentInput),
    );
  }

  async getProjectReadiness(projectId: string): Promise<DramaProjectReadiness> {
    const [episodes, videoPromptCount, videoReadyCount] = await Promise.all([
      prisma.dramaEpisode.findMany({ where: { projectId }, select: { order: true }, orderBy: { order: "asc" } }),
      prisma.dramaVideoPrompt.count({ where: { projectId } }),
      prisma.dramaVideoPrompt.count({ where: { projectId, status: "succeeded", resultUrl: { not: null } } }),
    ]);
    const episodeReadiness = await Promise.all(
      episodes.map((episode) => this.getEpisodeReadiness(projectId, episode.order)),
    );
    return episodeReadiness.reduce<DramaProjectReadiness>(
      (total, current) => ({
        shotCount: total.shotCount + current.shotCount,
        keyframeReadyCount: total.keyframeReadyCount + current.keyframeReadyCount,
        audioReadyCount: total.audioReadyCount + current.audioReadyCount,
        videoPromptCount,
        videoReadyCount,
      }),
      { shotCount: 0, keyframeReadyCount: 0, audioReadyCount: 0, videoPromptCount, videoReadyCount },
    );
  }
}

export const dramaReadinessService = new DramaReadinessService();
