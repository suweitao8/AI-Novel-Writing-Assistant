-- 全局结构化 LLM 调用台账（跨通道统一底账，自动导演归因仍走 DirectorLlmUsageRecord）
CREATE TABLE "LlmUsageRecord" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "promptId" TEXT,
    "promptVersion" TEXT,
    "taskType" TEXT,
    "stage" TEXT,
    "itemKey" TEXT,
    "taskId" TEXT,
    "novelId" TEXT,
    "chapterId" TEXT,
    "entrypoint" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "strategy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "rawChars" INTEGER,
    "repairAttempts" INTEGER NOT NULL DEFAULT 0,
    "attemptIndex" INTEGER NOT NULL DEFAULT 0,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "reasoningForcedOff" BOOLEAN,
    "errorCategory" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsageRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LlmUsageRecord_taskId_recordedAt_idx" ON "LlmUsageRecord"("taskId", "recordedAt");
CREATE INDEX "LlmUsageRecord_novelId_recordedAt_idx" ON "LlmUsageRecord"("novelId", "recordedAt");
CREATE INDEX "LlmUsageRecord_recordedAt_idx" ON "LlmUsageRecord"("recordedAt");
