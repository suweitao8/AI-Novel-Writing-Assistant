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

test("批量配音任务持久化并发数、并发处理镜头并保留失败/跳过语义", async () => {
  clearDramaBatchModules();

  // 可变数据源：前半程没有就绪配音，后半程全部就绪用于验证跳过语义。
  let currentSegments = [];
  const shots = Array.from({ length: 4 }, (_, index) => ({
    id: `shot_${index + 1}`,
    order: index + 1,
    durationSec: 5,
    dialogue: "旁白：示例台词",
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
      findFirst: async ({ where = {} } = {}) => jobs.find((job) =>
        (!where.projectId || job.projectId === where.projectId)
        && (!where.episodeId || job.episodeId === where.episodeId)
        && (!where.type || job.type === where.type)
        && (!where.status?.in || where.status.in.includes(job.status)),
      ) ?? null,
      findUnique: async ({ where }) => jobs.find((job) => job.id === where.id) ?? null,
      update: async ({ where, data }) => {
        const job = jobs.find((item) => item.id === where.id);
        Object.assign(job, data);
        return job;
      },
    },
  };
  prisma.$transaction = async (callback) => callback({
    dramaBatchJob: prisma.dramaBatchJob,
    $executeRaw: async () => 0,
  });

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
  mockModule("../dist/services/drama/audio/DramaAudioSegmentsService.js", {
    dramaAudioSegmentsService: {
      listEpisodeAudioSegments: async () => currentSegments,
    },
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

  const failingShotIds = new Set();
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const dialogueAudioServiceStub = {
    async synthesizeShotDialogue(shotId) {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 8));
        if (failingShotIds.has(shotId)) {
          throw new Error(`tts failed: ${shotId}`);
        }
        return { items: [{ durationSec: 2 }] };
      } finally {
        active -= 1;
      }
    },
  };

  const { DramaBatchOrchestrator } = require("../dist/services/drama/production/DramaBatchOrchestrator.js");
  const buildOrchestrator = () => new DramaBatchOrchestrator({}, {}, dialogueAudioServiceStub);

  // 创建任务：默认持久化 TTS 并发数 2。
  const orchestrator = buildOrchestrator();
  const created = await orchestrator.createEpisodeBatchJob(
    "project_1",
    1,
    { type: "tts" },
    { autoStart: false },
  );
  assert.equal(JSON.parse(created.progress).concurrency, 2);

  // 恢复执行：并发值规范化为整数并按该值并发处理镜头。
  created.progress = JSON.stringify({ ...JSON.parse(created.progress), concurrency: 3.4 });
  const resumed = await orchestrator.runBatchJob(created.id);
  const resumedProgress = JSON.parse(resumed.progress);
  assert.equal(resumedProgress.concurrency, 3);
  assert.equal(maxActive, 3);
  assert.equal(calls, 4);
  assert.equal(resumed.status, "done");
  assert.equal(resumedProgress.done, 4);
  assert.equal(resumedProgress.failed, 0);
  // 并发批量配音不再伪造单一 currentShotId，避免进度误导。
  assert.equal(resumedProgress.currentShotId, undefined);
  assert.equal(resumedProgress.cost.actualUnits.seconds, 8);

  // 单镜失败不影响其余镜头，失败项进入 failedShotIds 供后续重试。
  failingShotIds.add("shot_2");
  const partial = await buildOrchestrator().createEpisodeBatchJob(
    "project_1",
    1,
    { type: "tts" },
    { autoStart: false },
  );
  const failedRun = await buildOrchestrator().runBatchJob(partial.id);
  const failedProgress = JSON.parse(failedRun.progress);
  assert.equal(failedRun.status, "failed");
  assert.deepEqual(failedProgress.failedShotIds, ["shot_2"]);
  assert.equal(failedProgress.failed, 1);

  // 全部配音就绪的整集任务逐镜跳过，不再重复合成。
  failingShotIds.clear();
  currentSegments = shots.map((shot) => ({ shotId: shot.id, status: "ready" }));
  const callsBeforeSkip = calls;
  const skippedJob = await buildOrchestrator().createEpisodeBatchJob(
    "project_1",
    1,
    { type: "tts" },
    { autoStart: false },
  );
  const skippedRun = await buildOrchestrator().runBatchJob(skippedJob.id);
  const skippedProgress = JSON.parse(skippedRun.progress);
  assert.equal(skippedRun.status, "done");
  assert.equal(skippedProgress.skipped, 4);
  assert.equal(calls - callsBeforeSkip, 0);
});

test("单镜接口与批量配音共享分镜级去重与全局合成闸门（源码契约）", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const readSource = (...parts) =>
    fs.readFileSync(path.resolve(__dirname, "..", "src", ...parts), "utf8");

  const service = readSource("services", "drama", "audio", "DramaDialogueAudioService.ts");
  assert.match(service, /new SingleFlightMap<DialogueAudioData>\(\)/);
  assert.match(
    service,
    /this\.singleFlight\.run\(shotId, \(\) => this\.executeShotDialogue\(shotId, provider, options\)\)/,
  );
  assert.doesNotMatch(service, /await adapter\.synthesize\(current\.request\)/);
  assert.match(service, /ttsSynthesisGate\.run\(\(\) => adapter\.synthesize\(current\.request\)\)/);

  const queue = readSource("services", "drama", "audio", "ttsSynthesisQueue.ts");
  assert.match(queue, /DRAMA_TTS_SYNTHESIS_CONCURRENCY/);
  assert.match(queue, /class SingleFlightMap/);
  assert.match(queue, /class TtsSynthesisGate/);

  const orchestrator = readSource("services", "drama", "production", "DramaBatchOrchestrator.ts");
  assert.match(
    orchestrator,
    /else if \(job\.type === "tts"\)[\s\S]*?normalizeDramaTtsBatchConcurrency\(nextProgress\.concurrency\)/,
  );
  assert.match(orchestrator, /input\.type === "tts"\s*\n\s*\?\s*DEFAULT_DRAMA_TTS_BATCH_CONCURRENCY/);
  assert.match(orchestrator, /job\.type === "tts"\s*\n\s*\?\s*normalizeDramaTtsBatchConcurrency\(progress\.concurrency\)/);

  const routes = readSource("modules", "drama", "http", "dramaRoutes.ts");
  assert.match(routes, /synthesizeShotDialogue\(shotId, undefined,/);
});
