export type DramaEpisodePreparationType = "keyframes" | "tts";

export type DramaEpisodePreparationStatus = "pending" | "running" | "paused" | "done" | "failed";

export interface DramaEpisodePreparationJob {
  id: string;
  type: DramaEpisodePreparationType;
  status: DramaEpisodePreparationStatus;
}

export interface DramaEpisodePreparationTask {
  type: DramaEpisodePreparationType;
  jobId?: string;
  start?: () => Promise<string>;
}

interface PrepareDramaEpisodeAssetsOptions {
  tasks: DramaEpisodePreparationTask[];
  getJobs: () => Promise<DramaEpisodePreparationJob[]>;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const TYPE_LABELS: Record<DramaEpisodePreparationType, string> = {
  keyframes: "分镜画面",
  tts: "配音",
};

function waitForNextPoll(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, delayMs));
  });
}

/**
 * 合成前的素材准备协调器：同一批次的画面与配音任务并发创建，之后统一等待任务进入终态。
 * 已有任务只等待，不再次创建；失败或暂停会阻止调用方继续启动视频合成。
 */
export async function prepareDramaEpisodeAssets({
  tasks,
  getJobs,
  pollIntervalMs = 2500,
  timeoutMs = 30 * 60 * 1000,
}: PrepareDramaEpisodeAssetsOptions): Promise<Partial<Record<DramaEpisodePreparationType, "done">>> {
  if (tasks.length === 0) {
    return {};
  }

  const jobIdsByType = new Map<DramaEpisodePreparationType, string>();
  const startedJobs = await Promise.all(
    tasks.map(async (task) => {
      const jobId = task.jobId ?? await task.start?.();
      if (!jobId) {
        throw new Error(`${TYPE_LABELS[task.type]}任务未能创建，请重试。`);
      }
      jobIdsByType.set(task.type, jobId);
      return jobId;
    }),
  );

  if (startedJobs.length === 0) {
    return {};
  }

  const deadline = Date.now() + Math.max(0, timeoutMs);
  const result: Partial<Record<DramaEpisodePreparationType, "done">> = {};

  while (true) {
    const jobs = await getJobs();
    let allDone = true;

    for (const task of tasks) {
      const jobId = jobIdsByType.get(task.type);
      const job = jobs.find((candidate) => candidate.id === jobId);
      if (!job) {
        allDone = false;
        continue;
      }

      if (job.status === "failed" || job.status === "paused") {
        throw new Error(`${TYPE_LABELS[task.type]}任务${job.status === "paused" ? "已暂停" : "失败"}，请重试。`);
      }
      if (job.status === "done") {
        result[task.type] = "done";
      } else {
        allDone = false;
      }
    }

    if (allDone) {
      return result;
    }
    if (Date.now() >= deadline) {
      throw new Error("等待素材任务超时，请重试。");
    }

    await waitForNextPoll(pollIntervalMs);
  }
}
