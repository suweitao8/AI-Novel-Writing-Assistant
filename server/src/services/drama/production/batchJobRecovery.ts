import { prisma } from "../../../db/prisma";
import { safeJsonParse } from "../utils/json";

// 与整集合成（DramaEpisodeAssemblyService）一致的中断判定窗口：
// pending/running 超过该时长视为服务重启后遗留的死任务，统一标记失败。
const STALE_BATCH_JOB_MS = 10 * 60_000;
const STALE_NOTE = "任务因服务重启中断，已自动标记失败，可重新发起。";
const INTERRUPTED_NOTE = "服务重启导致任务中断，可重新发起。";

interface BatchJobProgressErrors {
  errors?: Array<{ shotId: string; message: string }>;
}

/** 把本项目遗留的 keyframes/videos/tts 死任务标记为失败，避免任务列表永久停留在进行中。 */
export async function failStaleBatchJobs(projectId: string): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_BATCH_JOB_MS);
  const stale = await prisma.dramaBatchJob.findMany({
    where: {
      projectId,
      type: { in: ["keyframes", "videos", "tts"] },
      status: { in: ["pending", "running"] },
      updatedAt: { lt: staleBefore },
    },
  });
  for (const job of stale) {
    const progress = safeJsonParse<BatchJobProgressErrors>(job.progress, {});
    await prisma.dramaBatchJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        progress: JSON.stringify({
          ...progress,
          errors: (progress.errors ?? []).concat({ shotId: "", message: STALE_NOTE }).slice(-50),
        }),
      },
    }).catch(() => undefined);
  }
}

/**
 * 服务启动前清理上一进程遗留的活动任务。
 * 任务执行器只存在于当前进程，pending/running 状态不能跨重启继续代表真实执行。
 */
export async function recoverInterruptedDramaBatchJobs(): Promise<void> {
  const active = await prisma.dramaBatchJob.findMany({
    where: {
      type: { in: ["keyframes", "videos", "tts", "full_episode"] },
      status: { in: ["pending", "running"] },
    },
  });
  for (const job of active) {
    const progress = safeJsonParse<BatchJobProgressErrors>(job.progress, {});
    await prisma.dramaBatchJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        progress: JSON.stringify({
          ...progress,
          errors: (progress.errors ?? []).concat({ shotId: "", message: INTERRUPTED_NOTE }).slice(-50),
        }),
      },
    }).catch(() => undefined);
  }
}
