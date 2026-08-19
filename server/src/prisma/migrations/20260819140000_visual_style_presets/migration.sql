-- 画面风格：自定义风格表（内置预设代码内置，不入库）
CREATE TABLE "VisualStyle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "name" TEXT,
    "styleInstructions" TEXT NOT NULL,
    "avoidInstructions" TEXT NOT NULL,
    "styleTag" TEXT NOT NULL,
    "styleFamily" TEXT NOT NULL DEFAULT 'live_action',
    "animationSubtype" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "VisualStyle_key_key" ON "VisualStyle"("key");
