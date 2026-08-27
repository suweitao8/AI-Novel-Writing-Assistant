import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { dramaStoryboardPrompt } from "../../prompting/prompts/drama/drama.prompts";
import { dramaContextAssembler } from "./DramaContextAssembler";
import type { DramaLLMOptions } from "./DramaStrategyService";

export interface DramaShotUpdateInput {
  action?: string;
  dialogue?: string;
  shotSize?: string;
  location?: string;
  durationSec?: number;
}

const SHOT_TEXT_LIMITS = {
  action: 1000,
  dialogue: 500,
  shotSize: 40,
  location: 40,
} as const;

export class DramaStoryboardService {
  async generateStoryboard(projectId: string, episodeOrder: number, options: DramaLLMOptions = {}) {
    const context = await dramaContextAssembler.buildEpisodeContext(projectId, episodeOrder);
    if (!context.episode.content?.trim()) {
      throw new Error(`第 ${episodeOrder} 集尚未生成台本，不能生成分镜。`);
    }
    const result = await runStructuredPrompt({
      asset: dramaStoryboardPrompt,
      promptInput: {
        content: context.episode.content,
        charactersDigest: context.charactersDigest,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.35,
      },
    });
    const output = result.output;
    const storyboard = await prisma.$transaction(async (tx) => {
      const created = await tx.dramaStoryboard.create({
        data: {
          projectId,
          episodeId: context.episode.id,
          summary: output.summary,
          status: "draft",
        },
      });
      await tx.dramaShot.createMany({
        data: output.shots.map((shot) => ({
          storyboardId: created.id,
          order: shot.order,
          shotSize: shot.shotSize ?? null,
          durationSec: shot.durationSec ?? null,
          location: shot.location ?? null,
          action: shot.action,
          dialogue: shot.dialogue ?? null,
          characterRefs: shot.characterRefs?.length ? JSON.stringify(shot.characterRefs) : null,
          characterStates: shot.characterStates?.length ? JSON.stringify(shot.characterStates) : null,
          visualPrompt: shot.visualPrompt ?? null,
        })),
      });
      return tx.dramaStoryboard.findUnique({
        where: { id: created.id },
        include: { shots: { orderBy: { order: "asc" } } },
      });
    });
    return storyboard;
  }

  async getStoryboard(storyboardId: string) {
    return prisma.dramaStoryboard.findUnique({
      where: { id: storyboardId },
      include: { shots: { orderBy: { order: "asc" } } },
    });
  }

  /**
   * 手动编辑单个镜头（台词/动作/景别/时长/场景）。
   * 台词改动不需要动配音数据：配音段的过期判定基于生成时的台词指纹比对，
   * 改完台词该段会在配音工作台自动标记"已过期，需重配"。首帧同理不动（重生成即可）。
   */
  async updateShot(projectId: string, shotId: string, input: DramaShotUpdateInput) {
    const shot = await prisma.dramaShot.findFirst({
      where: { id: shotId, storyboard: { projectId } },
      select: { id: true },
    });
    if (!shot) {
      throw new AppError("没有找到这个镜头。", 404);
    }

    const data: Record<string, string | number | null> = {};
    if (input.action !== undefined) {
      const value = input.action.trim();
      if (!value || value.length > SHOT_TEXT_LIMITS.action) {
        throw new AppError(`镜头动作需要 1～${SHOT_TEXT_LIMITS.action} 字。`, 400);
      }
      data.action = value;
    }
    if (input.dialogue !== undefined) {
      const value = input.dialogue.trim();
      if (value.length > SHOT_TEXT_LIMITS.dialogue) {
        throw new AppError(`台词不能超过 ${SHOT_TEXT_LIMITS.dialogue} 字。`, 400);
      }
      data.dialogue = value || null;
    }
    for (const key of ["shotSize", "location"] as const) {
      const raw = input[key];
      if (raw === undefined) {
        continue;
      }
      const value = raw.trim();
      if (value.length > SHOT_TEXT_LIMITS[key]) {
        throw new AppError(`${key} 不能超过 ${SHOT_TEXT_LIMITS[key]} 字。`, 400);
      }
      data[key] = value || null;
    }
    if (input.durationSec !== undefined) {
      const value = Math.round(input.durationSec);
      if (!Number.isFinite(value) || value < 1 || value > 60) {
        throw new AppError("镜头时长需要 1～60 秒。", 400);
      }
      data.durationSec = value;
    }
    if (Object.keys(data).length === 0) {
      throw new AppError("没有要更新的内容。", 400);
    }

    return prisma.dramaShot.update({ where: { id: shotId }, data });
  }
}

export const dramaStoryboardService = new DramaStoryboardService();
