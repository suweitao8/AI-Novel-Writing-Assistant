// 已删除的 deprecated novel facade（NovelService/NovelGenerationService/NovelPipelineService）
// 的测试替身：行为覆盖仍有价值，但生产代码零引用，不再以源码形式保留。
// 这里用 dist 里的真实构件重建 facade 时代的组装方式，仅供 tests/*.test.js 使用。

const {
  NovelCoreService,
} = require("../../dist/services/novel/NovelCoreService.js");
const {
  ChapterRuntimeCoordinator,
} = require("../../dist/services/novel/runtime/ChapterRuntimeCoordinator.js");
const {
  buildManualChapterControlPolicy,
  buildPipelineExecutionControlPolicy,
  registerChapterExecutionStageRunner,
} = require("../../dist/services/novel/production/ChapterExecutionStageRunner.js");
const {
  novelProductionOrchestrator,
} = require("../../dist/services/novel/production/NovelProductionOrchestrator.js");
const {
  createNovelApplicationServices,
} = require("../../dist/services/novel/application/NovelApplicationServices.js");
const {
  novelApplicationServiceMethodNames,
} = require("../../dist/services/novel/application/NovelApplicationContracts.js");

class LegacyNovelGenerationService {
  constructor() {
    this.core = new NovelCoreService();
    this.chapterRuntimeCoordinator = new ChapterRuntimeCoordinator();
    registerChapterExecutionStageRunner({
      getCore: () => this.core,
      getCoordinator: () => this.chapterRuntimeCoordinator,
    });
  }

  async createChapterStream(novelId, chapterId, options) {
    const result = await novelProductionOrchestrator.runStage({
      novelId,
      stage: "chapter_execution",
      policy: buildManualChapterControlPolicy(),
      trigger: "manual_generate_chapter",
      payload: {
        mode: "single_chapter_stream",
        chapterId,
        options,
        includeRuntimePackage: true,
      },
    });
    if (!result.payload) {
      throw new Error("Unified chapter execution did not return a stream payload.");
    }
    return result.payload;
  }
}

class LegacyNovelPipelineService {
  constructor() {
    this.core = new NovelCoreService();
    this.chapterRuntimeCoordinator = new ChapterRuntimeCoordinator();
    registerChapterExecutionStageRunner({
      getCore: () => this.core,
      getCoordinator: () => this.chapterRuntimeCoordinator,
    });
  }

  async startPipelineJob(novelId, options) {
    const result = await novelProductionOrchestrator.runStage({
      novelId,
      stage: "chapter_execution",
      policy: (options && options.controlPolicy) || buildPipelineExecutionControlPolicy(),
      trigger: "start_pipeline_job",
      payload: {
        mode: "pipeline_job",
        options,
      },
    });
    if (!result.payload) {
      throw new Error("Unified chapter execution did not return a pipeline job payload.");
    }
    return result.payload;
  }
}

class LegacyNovelService {
  constructor(applicationServices = createNovelApplicationServices()) {
    this.applicationServices = applicationServices;
  }

  get core() {
    return this.applicationServices.core;
  }

  set core(value) {
    this.applicationServices.core = value;
  }

  get qualityRepairCoordinator() {
    return this.applicationServices.qualityRepairCoordinator;
  }

  set qualityRepairCoordinator(value) {
    this.applicationServices.qualityRepairCoordinator = value;
  }
}

for (const methodName of novelApplicationServiceMethodNames) {
  LegacyNovelService.prototype[methodName] = function delegateNovelApplicationMethod(...args) {
    const method = this.applicationServices[methodName];
    return method(...args);
  };
}

module.exports = {
  LegacyNovelService,
  LegacyNovelGenerationService,
  LegacyNovelPipelineService,
};
