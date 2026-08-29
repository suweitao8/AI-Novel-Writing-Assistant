const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const creationEnvironment = require("../dist/modules/setup/onboarding/application/CreationEnvironmentService.js");
const firstNovel = require("../dist/modules/setup/onboarding/application/FirstNovelOnboardingService.js");

test("first novel onboarding sends an unready environment to model settings", async () => {
  const chapterOriginal = prisma.chapter.findFirst;
  const taskOriginal = prisma.novelWorkflowTask.findFirst;
  const novelOriginal = prisma.novel.findFirst;
  const environmentOriginal = creationEnvironment.getCreationEnvironmentReadiness;

  creationEnvironment.getCreationEnvironmentReadiness = async () => ({
    ready: false,
    provider: "codex",
    model: "gpt-5.6-luna",
  });
  prisma.chapter.findFirst = async () => null;
  prisma.novelWorkflowTask.findFirst = async () => null;
  prisma.novel.findFirst = async () => null;

  try {
    const projection = await firstNovel.getFirstNovelOnboardingProjection();
    assert.equal(projection.currentMilestone, "environment");
    assert.equal(projection.primaryAction.kind, "navigate");
    assert.equal(projection.primaryAction.route, "/settings/models");
    assert.equal(projection.primaryAction.label, "配置文本模型");
  } finally {
    prisma.chapter.findFirst = chapterOriginal;
    prisma.novelWorkflowTask.findFirst = taskOriginal;
    prisma.novel.findFirst = novelOriginal;
    creationEnvironment.getCreationEnvironmentReadiness = environmentOriginal;
  }
});

test("first novel onboarding graduates only when a readable completed chapter exists", async () => {
  const chapterOriginal = prisma.chapter.findFirst;
  const taskOriginal = prisma.novelWorkflowTask.findFirst;
  const novelOriginal = prisma.novel.findFirst;
  const environmentOriginal = creationEnvironment.getCreationEnvironmentReadiness;

  creationEnvironment.getCreationEnvironmentReadiness = async () => ({
    ready: true,
    provider: "codex",
    model: "gpt-5.6-luna",
  });
  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    title: "第一章 来电",
    order: 1,
    novelId: "novel-1",
    novel: {
      id: "novel-1",
      title: "当我拨通死亡电话",
      creationExperience: "simple",
    },
  });
  prisma.novelWorkflowTask.findFirst = async () => ({
    id: "task-1",
    novelId: "novel-1",
    status: "running",
    checkpointType: null,
    currentStage: "chapter_execution",
    currentItemLabel: "生成第二章",
    lastError: null,
    novel: {
      id: "novel-1",
      title: "当我拨通死亡电话",
      creationExperience: "simple",
    },
  });
  prisma.novel.findFirst = async () => null;

  try {
    const projection = await firstNovel.getFirstNovelOnboardingProjection();
    assert.equal(projection.graduated, true);
    assert.equal(projection.completedCount, 5);
    assert.equal(projection.primaryAction.label, "阅读第一章");
    assert.ok(projection.milestones.every((milestone) => milestone.status === "completed"));
  } finally {
    prisma.chapter.findFirst = chapterOriginal;
    prisma.novelWorkflowTask.findFirst = taskOriginal;
    prisma.novel.findFirst = novelOriginal;
    creationEnvironment.getCreationEnvironmentReadiness = environmentOriginal;
  }
});

test("first novel onboarding exposes production handoff as the single next action", async () => {
  const chapterOriginal = prisma.chapter.findFirst;
  const taskOriginal = prisma.novelWorkflowTask.findFirst;
  const novelOriginal = prisma.novel.findFirst;
  const environmentOriginal = creationEnvironment.getCreationEnvironmentReadiness;

  creationEnvironment.getCreationEnvironmentReadiness = async () => ({
    ready: true,
    provider: "codex",
    model: "gpt-5.6-luna",
  });
  prisma.chapter.findFirst = async () => null;
  prisma.novelWorkflowTask.findFirst = async () => ({
    id: "task-handoff",
    novelId: "novel-handoff",
    status: "waiting_approval",
    checkpointType: "production_experience_required",
    currentStage: "structured_outline",
    currentItemLabel: "等待选择生产方式",
    lastError: null,
    novel: {
      id: "novel-handoff",
      title: "新手的第一本书",
      creationExperience: "professional",
    },
  });
  prisma.novel.findFirst = async () => null;

  try {
    const projection = await firstNovel.getFirstNovelOnboardingProjection();
    assert.equal(projection.graduated, false);
    assert.equal(projection.currentMilestone, "production_choice");
    assert.equal(projection.primaryAction.label, "选择生产方式");
    assert.match(projection.primaryAction.route, /directorTaskId=task-handoff/);
    assert.equal(
      projection.milestones.find((milestone) => milestone.key === "production_choice").status,
      "current",
    );
  } finally {
    prisma.chapter.findFirst = chapterOriginal;
    prisma.novelWorkflowTask.findFirst = taskOriginal;
    prisma.novel.findFirst = novelOriginal;
    creationEnvironment.getCreationEnvironmentReadiness = environmentOriginal;
  }
});
