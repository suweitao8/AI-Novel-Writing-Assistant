import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";
import { getAudioModelProvider } from "../../../llm/modelCategories";
import { safeJsonParse } from "../utils/json";
import { loadNovelCharacterStatesByName } from "../DramaContextAssembler";
import { globalNarratorVoiceSettingsService } from "../../settings/GlobalNarratorVoiceSettingsService";
import {
  buildDialogueVoiceKey,
  buildVoiceMap,
  findNovelCharacterStates,
  hashDialogueText,
  parseDialogueLines,
  parseShotCharacterStates,
  resolveVoiceForCharacterState,
  type DialogueAudioData,
  type DialogueLineType,
} from "./DramaDialogueAudioService";
import { isRealTTSProvider } from "./TTSProviderPort";

/** 分段状态：ready=可直接播放；stale=文本或音色已变化需重配；missing=尚未生成 */
export type DramaAudioSegmentStatus = "ready" | "stale" | "missing";

export interface DramaAudioSegment {
  shotId: string;
  shotOrder: number;
  lineIndex: number;
  type: DialogueLineType;
  speaker?: string;
  text: string;
  /** 台词行的语气（「角色（语气）：台词」），供配音与前端展示 */
  emotion?: string;
  audioUrl?: string;
  durationSec?: number;
  status: DramaAudioSegmentStatus;
}

/**
 * 逐行配音分段投影（显示层只读视图，搬自 mydrama voice-stage 的分段显示模型）：
 * 分镜台词的每一行是一条分段——旁白标记或无说话人是「旁白」，其余是「对白」；
 * 状态由「生成时快照（textHash/voiceKey）vs 当前行文本/音色绑定」判定。
 */
export class DramaAudioSegmentsService {
  async listEpisodeAudioSegments(projectId: string, episodeOrder: number): Promise<DramaAudioSegment[]> {
    const episode = await prisma.dramaEpisode.findFirst({
      where: { projectId, order: episodeOrder },
      include: {
        storyboards: {
          orderBy: [{ version: "desc" }],
          take: 1,
          include: {
            shots: { orderBy: [{ order: "asc" }] },
          },
        },
        project: { include: { characters: true } },
      },
    });
    if (!episode) {
      throw new AppError(`未找到分集：${projectId} #${episodeOrder}`, 404);
    }
    const storyboard = episode.storyboards[0];
    if (!storyboard) {
      return [];
    }
    const voiceMap = buildVoiceMap(episode.project.characters);
    const narratorVoice = await globalNarratorVoiceSettingsService.get();
    const expectedProvider = getAudioModelProvider();
    const novelStatesByName = episode.project.source === "novel_import"
      && episode.project.sourceRef?.trim()
      ? await loadNovelCharacterStatesByName(episode.project.sourceRef.trim())
      : new Map<string, StoryAssetState[]>();

    const segments: DramaAudioSegment[] = [];
    for (const shot of storyboard.shots) {
      const lines = parseDialogueLines(shot.dialogue);
      if (!lines.length) {
        continue;
      }
      const shotCharacterStates = parseShotCharacterStates(shot.characterStates);
      const audioData = safeJsonParse<DialogueAudioData | null>(shot.dialogueAudioData, null);
      const itemsByLine = new Map((audioData?.items ?? []).map((item) => [item.lineIndex, item]));
      for (const line of lines) {
        const baseVoice = line.speaker ? voiceMap.get(line.speaker.trim().toLowerCase()) : undefined;
        const stateLabel = line.speaker
          ? shotCharacterStates.get(line.speaker.trim().toLowerCase())
          : undefined;
        const statefulStates = line.speaker
          ? findNovelCharacterStates(novelStatesByName, line.speaker)
          : undefined;
        const voice = resolveVoiceForCharacterState(baseVoice, statefulStates, stateLabel, line.speaker);
        const item = itemsByLine.get(line.lineIndex);
        const textHash = hashDialogueText(line.text);
        const voiceKey = buildDialogueVoiceKey({
          type: line.type,
          voice,
          narratorDescription: narratorVoice.description,
          narratorSampleAudioUrl: narratorVoice.sampleAudioUrl,
          narratorSampleSha256: narratorVoice.sampleSha256,
          lineEmotion: line.emotion,
        });
        let status: DramaAudioSegmentStatus = "missing";
        if (
          item?.audioUrl?.startsWith("data:")
          && audioData?.provider === expectedProvider
          && item.provider === expectedProvider
          && isRealTTSProvider(expectedProvider)
        ) {
          status = item.textHash === textHash && item.voiceKey === voiceKey ? "ready" : "stale";
        }
        segments.push({
          shotId: shot.id,
          shotOrder: shot.order,
          lineIndex: line.lineIndex,
          type: line.type,
          speaker: line.speaker,
          text: line.text,
          emotion: line.emotion,
          audioUrl: status === "ready" ? item?.audioUrl : undefined,
          durationSec: status === "ready" ? item?.durationSec : undefined,
          status,
        });
      }
    }
    return segments;
  }
}

export const dramaAudioSegmentsService = new DramaAudioSegmentsService();
