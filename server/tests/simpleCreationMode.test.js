const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildWorkflowSeedPayload } = require("../dist/services/novel/director/runtime/flows/novelDirectorHelpers.js");
const { directorCandidateResponseSchema } = require("../dist/services/novel/director/runtime/flows/novelDirectorSchemas.js");
const {
  DirectorProductionExperienceService,
  buildProductionExperienceSeed,
  parseSelectedExperience,
} = require("../dist/services/novel/director/commands/DirectorProductionExperienceService.js");
const { prisma } = require("../dist/db/prisma.js");
const {
  guardSimpleCreationUserWrites,
  isDramaStudioChapterWorkspaceWrite,
  isSimpleCreationWriteAllowed,
} = require("../dist/modules/novel/http/simpleCreationWriteGuard.js");

const confirmRuntimeSource = fs.readFileSync(
  path.resolve(__dirname, "../src/services/novel/director/runtime/flows/novelDirectorConfirmRuntime.ts"),
  "utf8",
);
const outlinePhaseSource = fs.readFileSync(
  path.resolve(__dirname, "../src/services/novel/director/phases/novelDirectorStructuredOutlinePhase.ts"),
  "utf8",
);
const productionExperienceServiceSource = fs.readFileSync(
  path.resolve(__dirname, "../src/services/novel/director/commands/DirectorProductionExperienceService.ts"),
  "utf8",
);
const pipelineRuntimeSource = fs.readFileSync(
  path.resolve(__dirname, "../src/services/novel/director/novelDirectorPipelineRuntime.ts"),
  "utf8",
);

function candidate(title) {
  return {
    workingTitle: title,
    titleOptions: [],
    logline: "主角必须解决一个足以推动长篇故事的危机。",
    positioning: "清晰的长篇类型定位",
    sellingPoint: "稳定兑现读者期待",
    coreConflict: "主角与长期阻力持续对抗",
    protagonistPath: "从被动求生走向主动承担",
    endingDirection: "完成核心承诺",
    hookStrategy: "用迫近危险和连续兑现推动追读",
    progressionLoop: "发现问题、作出选择、承担后果并升级目标",
    whyItFits: "承接用户的一句话灵感",
    recommendedWritingPlatform: "fanqie_free",
    writingPlatformReason: "适合高冲突、快推进的移动端长篇阅读。",
    toneKeywords: ["紧张", "成长"],
    targetChapterCount: 120,
  };
}

function directorSeed() {
  const directorInput = {
    idea: "一座城市只剩七天。",
    candidate: candidate("七日之城"),
    runMode: "auto_to_ready",
  };
  return {
    ...buildWorkflowSeedPayload(directorInput),
    directorInput,
  };
}

test("legacy explicit auto_to_ready seed remains compatible", () => {
  const seed = buildWorkflowSeedPayload({
    idea: "一座城市只剩七天。",
    runMode: "auto_to_ready",
  });
  assert.equal(seed.runMode, "auto_to_ready");
  assert.equal(seed.productionExperience, undefined);
});

test("fast-start director waits for the user to choose a production experience", () => {
  assert.doesNotMatch(confirmRuntimeSource, /productionExperience:\s*"simple"/);
  assert.doesNotMatch(confirmRuntimeSource, /creationExperience:\s*"simple"/);
  assert.match(outlinePhaseSource, /checkpointType:\s*continueSimpleProduction\s*\?\s*"chapter_batch_ready"\s*:\s*"production_experience_required"/);
  assert.doesNotMatch(outlinePhaseSource, /checkpointType:\s*fastStart\s*\?/);
});

test("production handoff converts the same seed to full-book simple creation", () => {
  const seed = directorSeed();
  const nextSeed = buildProductionExperienceSeed(seed, "simple");
  assert.equal(parseSelectedExperience(nextSeed), "simple");
  assert.equal(nextSeed.runMode, "full_book_autopilot");
  assert.equal(nextSeed.directorInput.runMode, "full_book_autopilot");
  assert.equal(nextSeed.autoExecutionPlan.mode, "book");
  assert.equal(nextSeed.autoExecutionPlan.autoReview, true);
  assert.equal(nextSeed.autoExecutionPlan.autoRepair, true);
  assert.equal(nextSeed.autoApproval.enabled, true);
  assert.ok(nextSeed.autoApproval.approvalPointCodes.includes("chapter_execution_continue"));
  assert.ok(nextSeed.autoApproval.approvalPointCodes.includes("replan_continue"));
});

test("simple creation can be selected while preparation continues", () => {
  assert.match(productionExperienceServiceSource, /experience !== "simple"/);
  assert.match(productionExperienceServiceSource, /creationExperience: "simple"/);
  assert.match(outlinePhaseSource, /currentNovel[\s\S]*creationExperience/);
  assert.match(pipelineRuntimeSource, /earlySimpleSelection/);
  assert.match(pipelineRuntimeSource, /buildFullBookAutopilotExecutionPlan/);
});

test("early simple selection keeps the current task and only changes its experience", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    taskUpdate: prisma.novelWorkflowTask.update,
    novelUpdate: prisma.novel.update,
    transaction: prisma.$transaction,
  };
  let taskUpdate = null;
  let novelUpdate = null;
  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "director-task-1",
    lane: "auto_director",
    novelId: "novel-1",
    status: "running",
    checkpointType: null,
    seedPayloadJson: JSON.stringify(directorSeed()),
  });
  prisma.novelWorkflowTask.update = async (input) => {
    taskUpdate = input;
    return input;
  };
  prisma.novel.update = async (input) => {
    novelUpdate = input;
    return input;
  };
  prisma.$transaction = async (operations) => Promise.all(operations);
  const commandService = {
    enqueueContinueCommand: async () => {
      throw new Error("early selection must not create a second command");
    },
  };

  try {
    const result = await new DirectorProductionExperienceService(commandService).select("director-task-1", "simple");
    assert.equal(result.workflowTaskId, "director-task-1");
    assert.equal(result.targetRoute, "/novels/novel-1/simple");
    assert.equal(result.backgroundStarted, true);
    assert.equal(JSON.parse(taskUpdate.data.seedPayloadJson).productionExperience, "simple");
    assert.equal(novelUpdate.data.creationExperience, "simple");
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.novelWorkflowTask.update = originals.taskUpdate;
    prisma.novel.update = originals.novelUpdate;
    prisma.$transaction = originals.transaction;
  }
});

test("professional handoff keeps preparation-only mode without auto execution", () => {
  const seed = directorSeed();
  const nextSeed = buildProductionExperienceSeed(seed, "professional");
  assert.equal(parseSelectedExperience(nextSeed), "professional");
  assert.equal(nextSeed.runMode, "auto_to_ready");
  assert.equal(nextSeed.autoExecutionPlan, undefined);
});

test("director candidate contract requires exactly two directions", () => {
  assert.equal(directorCandidateResponseSchema.safeParse({
    candidates: [candidate("方向一"), candidate("方向二")],
  }).success, true);
  assert.equal(directorCandidateResponseSchema.safeParse({
    candidates: [candidate("只有一个方向")],
  }).success, false);
});

test("simple creation write boundary allows reads, exports, settings and outline workbenches", () => {
  assert.equal(isSimpleCreationWriteAllowed("GET", "/book/simple-shelf"), true);
  assert.equal(isSimpleCreationWriteAllowed("GET", "/book/export"), true);
  assert.equal(isSimpleCreationWriteAllowed("POST", "/book/export-as-document"), true);
  assert.equal(isSimpleCreationWriteAllowed("POST", "/book/creation-experience/professional"), true);
  assert.equal(isSimpleCreationWriteAllowed("POST", "/book/creation-experience/simple"), true);
  // 设定中心与空白小说大纲工作台是简易模式的正式编辑入口。
  assert.equal(isSimpleCreationWriteAllowed("PUT", "/book/settings/scenes/scene-1"), true);
  assert.equal(isSimpleCreationWriteAllowed("POST", "/book/settings/ensure"), true);
  assert.equal(isSimpleCreationWriteAllowed("PUT", "/book/outline"), true);
  assert.equal(isSimpleCreationWriteAllowed("POST", "/book/outline/expand"), true);
  assert.equal(isSimpleCreationWriteAllowed("PUT", "/book/outline/chapters"), true);
  // 其余正文与章节写入仍然只读。
  assert.equal(isSimpleCreationWriteAllowed("PUT", "/book"), false);
  assert.equal(isSimpleCreationWriteAllowed("DELETE", "/book/chapters/chapter-1"), false);
  assert.equal(isSimpleCreationWriteAllowed("POST", "/book/chapters/chapter-1/generate"), false);
});

test("drama studio chapter workspace writes only cover outline-level endpoints", () => {
  // 漫剧工作室的单章工作台：本章大纲保存、手动建章、单章细纲推理与保存。
  // 守卫挂在 router.use("/:id")，这里传的是剥掉 /:id 前缀后的运行时形状（/chapters/...）。
  assert.equal(isDramaStudioChapterWorkspaceWrite("PUT", "/chapters/chapter-1"), true);
  assert.equal(isDramaStudioChapterWorkspaceWrite("POST", "/chapters"), true);
  assert.equal(isDramaStudioChapterWorkspaceWrite("POST", "/chapters/chapter-1/detail-outline/preview"), true);
  assert.equal(isDramaStudioChapterWorkspaceWrite("POST", "/chapters/chapter-1/reference-draft/preview"), true);
  assert.equal(isDramaStudioChapterWorkspaceWrite("POST", "/chapters/chapter-1/reference-extract/preview"), true);
  assert.equal(isDramaStudioChapterWorkspaceWrite("PUT", "/chapters/chapter-1/reference-draft/preview"), false);
  assert.equal(isDramaStudioChapterWorkspaceWrite("POST", "/chapters/chapter-1/reference-draft"), false);
  assert.equal(isDramaStudioChapterWorkspaceWrite("PUT", "/chapters/chapter-1/detail-outline"), true);
  // 删除与生成等其余章节端点不属于工作台，仍然只读。
  assert.equal(isDramaStudioChapterWorkspaceWrite("DELETE", "/chapters/chapter-1"), false);
  assert.equal(isDramaStudioChapterWorkspaceWrite("POST", "/chapters/chapter-1/generate"), false);
  assert.equal(isDramaStudioChapterWorkspaceWrite("PUT", ""), false);
  assert.equal(isDramaStudioChapterWorkspaceWrite("PUT", "/chapters/chapter-1/execution-contract"), false);
});

test("simple creation guard allows chapter workspace only for comic-drama novels", async () => {
  const originals = {
    novelFindUnique: prisma.novel.findUnique,
  };
  const requests = {};
  prisma.novel.findUnique = async () => ({ creationExperience: "simple", productionKind: "comic_drama" });

  // 守卫挂在 router.use("/:id")：params.id 是小说 id，path 已剥掉 /:id 前缀。
  function fakeRequest(method, path) {
    return { method, path, params: { id: "book-1" } };
  }
  function captureNext(key) {
    return (error) => {
      requests[key] = error ?? null;
    };
  }

  try {
    // 漫剧小说（productionKind=comic_drama，含还没生成分镜的新项目）：单章工作台写入放行。
    await guardSimpleCreationUserWrites(fakeRequest("PUT", "/chapters/chapter-1"), {}, captureNext("dramaPutChapter"));
    await guardSimpleCreationUserWrites(fakeRequest("POST", "/chapters"), {}, captureNext("dramaPostChapter"));
    await guardSimpleCreationUserWrites(fakeRequest("POST", "/chapters/chapter-1/detail-outline/preview"), {}, captureNext("dramaPreview"));
    await guardSimpleCreationUserWrites(fakeRequest("POST", "/chapters/chapter-1/reference-draft/preview"), {}, captureNext("dramaReference"));
    assert.equal(requests.dramaPutChapter, null);
    assert.equal(requests.dramaPostChapter, null);
    assert.equal(requests.dramaPreview, null);
    assert.equal(requests.dramaReference, null);

    // 漫剧小说也不能绕过破坏性写入与正文生成。
    await guardSimpleCreationUserWrites(fakeRequest("DELETE", "/chapters/chapter-1"), {}, captureNext("dramaDelete"));
    await guardSimpleCreationUserWrites(fakeRequest("POST", "/chapters/chapter-1/generate"), {}, captureNext("dramaGenerate"));
    assert.ok(requests.dramaDelete instanceof Error);
    assert.equal(requests.dramaDelete.statusCode, 409);
    assert.ok(requests.dramaGenerate instanceof Error);
    assert.equal(requests.dramaGenerate.statusCode, 409);

    // 普通简易小说（productionKind=novel）：单章工作台同样只读。
    prisma.novel.findUnique = async () => ({ creationExperience: "simple", productionKind: "novel" });
    await guardSimpleCreationUserWrites(fakeRequest("PUT", "/chapters/chapter-1"), {}, captureNext("plainPutChapter"));
    assert.ok(requests.plainPutChapter instanceof Error);
    assert.equal(requests.plainPutChapter.statusCode, 409);
  } finally {
    prisma.novel.findUnique = originals.novelFindUnique;
  }
});
