const assert = require("node:assert/strict");
const test = require("node:test");

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

function clearDramaBatchModules() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes("\\dist\\services\\drama\\production\\")
      || key.includes("/dist/services/drama/production/")
      || key.includes("\\dist\\services\\drama\\audio\\")
      || key.includes("/dist/services/drama/audio/")
      || key.includes("\\dist\\services\\drama\\video\\")
      || key.includes("/dist/services/drama/video/")
      || key.includes("\\dist\\services\\drama\\visual\\")
      || key.includes("/dist/services/drama/visual/")
      || key.includes("\\dist\\services\\drama\\DramaVideoPromptService")
      || key.includes("/dist/services/drama/DramaVideoPromptService")
      || key.includes("\\dist\\db\\prisma.js")
      || key.includes("/dist/db/prisma.js")
      || key.includes("\\dist\\llm\\modelCategories.js")
      || key.includes("/dist/llm/modelCategories.js")
      || key.includes("\\dist\\middleware\\errorHandler.js")
      || key.includes("/dist/middleware/errorHandler.js")
    ) {
      delete require.cache[key];
    }
  }
}

function installOrchestratorStubs() {
  const shots = Array.from({ length: 4 }, (_, index) => ({
    id: `shot_${index + 1}`,
    order: index + 1,
    durationSec: 5,
    dialogue: null,
    keyframeData: null,
    blockingSketchData: null,
    dialogueAudioData: null,
  }));
  const episode = {
    id: "episode_1",
    storyboards: [{ id: "storyboard_1", createdAt: new Date("2026-08-24T00:00:00.000Z"), shots }],
    videoPrompts: [],
  };
  const jobs = [];
  const prisma = {
    dramaEpisode: {
      findUnique: async () => episode,
    },
    dramaBatchJob: {
      create: async ({ data }) => {
        const job = {
          id: `batch_job_${jobs.length + 1}`,
          createdAt: new Date("2026-08-24T00:00:00.000Z"),
          updatedAt: new Date("2026-08-24T00:00:00.000Z"),
          ...data,
        };
        jobs.push(job);
        return job;
      },
      findUnique: async ({ where }) => jobs.find((job) => job.id === where.id) ?? null,
      update: async ({ where, data }) => {
        const job = jobs.find((item) => item.id === where.id);
        Object.assign(job, data);
        return job;
      },
    },
  };

  mockModule("../dist/db/prisma.js", { prisma });
  mockModule("../dist/llm/modelCategories.js", {
    getImageModelProvider: () => "openai",
    getAudioModelProvider: () => "mock",
  });
  mockModule("../dist/middleware/errorHandler.js", {
    AppError: class AppError extends Error {
      constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
      }
    },
  });
  mockModule("../dist/services/drama/utils/json.js", {
    safeJsonParse: (raw, fallback) => {
      try {
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
  });
  mockModule("../dist/services/drama/production/batchJobRecovery.js", {
    failStaleBatchJobs: async () => undefined,
  });
  mockModule("../dist/services/drama/DramaVideoPromptService.js", {
    DramaVideoPromptService: class DramaVideoPromptService {},
  });
  mockModule("../dist/services/drama/audio/DramaDialogueAudioService.js", {
    DramaDialogueAudioService: class DramaDialogueAudioService {},
  });
  mockModule("../dist/services/drama/audio/TTSProviderPort.js", {
    isRealTTSProvider: () => false,
    ttsProviderRegistry: { resolve: () => ({ currency: "CNY", costPerSecond: 0 }) },
  });
  mockModule("../dist/services/drama/visual/DramaShotKeyframeService.js", {
    DramaShotKeyframeService: class DramaShotKeyframeService {},
  });
  mockModule("../dist/services/drama/visual/DramaShotBlockingSketchContracts.js", {
    parseBlockingSketchData: () => null,
  });
  mockModule("../dist/services/drama/video/VideoProviderPort.js", {
    resolveDefaultVideoProvider: () => "mock",
    videoProviderRegistry: { resolve: () => ({ currency: "CNY", costPerSecond: 0 }) },
  });

  return { jobs, shots };
}

test("批量任务会持久化并在恢复时使用规范化后的并发值，同时保留失败镜头重试语义", async () => {
  const previousCost = process.env.DRAMA_IMAGE_COST_PER_IMAGE_OPENAI;
  process.env.DRAMA_IMAGE_COST_PER_IMAGE_OPENAI = "1.25";
  clearDramaBatchModules();
  const { jobs, shots } = installOrchestratorStubs();
  const failingShotIds = new Set();
  let active = 0;
  let maxActive = 0;
  const keyframeService = {
    async generateKeyframe(shotId) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 8));
        if (failingShotIds.has(shotId)) {
          throw new Error(`image failed: ${shotId}`);
        }
      } finally {
        active -= 1;
      }
    },
  };
  const { DramaBatchOrchestrator } = require("../dist/services/drama/production/DramaBatchOrchestrator.js");
  const orchestrator = new DramaBatchOrchestrator(keyframeService, {}, {});

  try {
    const created = await orchestrator.createEpisodeBatchJob(
      "project_1",
      1,
      { type: "keyframes", provider: "openai" },
      { autoStart: false },
    );
    assert.equal(JSON.parse(created.progress).concurrency, 4);

    created.progress = JSON.stringify({ ...JSON.parse(created.progress), concurrency: 2.9 });
    maxActive = 0;
    const resumed = await orchestrator.runBatchJob(created.id);
    const resumedProgress = JSON.parse(resumed.progress);
    assert.equal(resumedProgress.concurrency, 2);
    assert.equal(maxActive, 2);
    assert.equal(resumedProgress.done, 4);
    assert.equal(resumedProgress.failed, 0);

    failingShotIds.add("shot_2");
    failingShotIds.add("shot_4");
    maxActive = 0;
    const failedJob = await orchestrator.createEpisodeBatchJob(
      "project_1",
      1,
      { type: "keyframes", provider: "openai" },
      { autoStart: false },
    );
    const failed = await orchestrator.runBatchJob(failedJob.id);
    const failedProgress = JSON.parse(failed.progress);
    assert.equal(failed.status, "failed");
    assert.equal(maxActive, 4);
    assert.equal(active, 0);
    assert.equal(failedProgress.done, 2);
    assert.equal(failedProgress.failed, 2);
    assert.deepEqual(failedProgress.failedShotIds.sort(), ["shot_2", "shot_4"]);
    assert.deepEqual(
      failedProgress.errors.map((item) => item.shotId).sort(),
      ["shot_2", "shot_4"],
    );
    assert.equal(failedProgress.cost.actualUnits.images, 2);
    assert.equal(failedProgress.cost.actual, 2.5);

    failingShotIds.clear();
    const retryJob = await orchestrator.createEpisodeBatchJob(
      "project_1",
      1,
      { type: "keyframes", provider: "openai", failedShotIds: ["shot_2", "shot_4"] },
      { autoStart: false },
    );
    const retried = await orchestrator.runBatchJob(retryJob.id);
    const retryProgress = JSON.parse(retried.progress);
    assert.equal(retried.status, "done");
    assert.equal(retryProgress.total, 2);
    assert.equal(retryProgress.done, 2);
    assert.equal(retryProgress.failed, 0);
    assert.deepEqual(retryProgress.targetShotIds, ["shot_2", "shot_4"]);
    assert.equal(jobs.length, 3);
    assert.equal(shots.length, 4);
  } finally {
    if (previousCost === undefined) {
      delete process.env.DRAMA_IMAGE_COST_PER_IMAGE_OPENAI;
    } else {
      process.env.DRAMA_IMAGE_COST_PER_IMAGE_OPENAI = previousCost;
    }
  }
});
