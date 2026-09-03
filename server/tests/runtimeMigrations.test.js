const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const {
  ensureRuntimeDatabaseReady,
} = require("../dist/db/runtimeMigrations.js");

const migrationsDir = path.join(__dirname, "..", "src", "prisma", "migrations.sqlite");
const allMigrationNames = fs.readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

const targetMigration = "20260318233000_book_analysis_source_cache";
const novelFactMigration = "20260812120000_novel_fact_ledger";

function createMigrationTable(database) {
  database.exec(`
    CREATE TABLE "_prisma_migrations" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function checksumForMigration(migrationName) {
  const migrationSql = fs.readFileSync(path.join(migrationsDir, migrationName, "migration.sql"), "utf8");
  return crypto.createHash("sha256").update(migrationSql).digest("hex");
}

function insertMigrationRecord(database, migrationName, options = {}) {
  database.prepare(
    `INSERT INTO "_prisma_migrations" (
      id,
      checksum,
      finished_at,
      migration_name,
      logs,
      rolled_back_at,
      started_at,
      applied_steps_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    checksumForMigration(migrationName),
    options.finishedAt ?? new Date().toISOString(),
    migrationName,
    options.logs ?? null,
    options.rolledBackAt ?? null,
    options.startedAt ?? new Date().toISOString(),
    options.appliedStepsCount ?? (options.finishedAt === null ? 0 : 1),
  );
}

function createSatisfiedBookAnalysisSourceCacheSchema(database) {
  database.exec(`
    CREATE TABLE "Novel" (
      "id" TEXT NOT NULL PRIMARY KEY
    );

    CREATE TABLE "Character" (
      "id" TEXT NOT NULL PRIMARY KEY
    );

    CREATE TABLE "BookAnalysis" (
      "id" TEXT NOT NULL PRIMARY KEY
    );

    CREATE TABLE "GenerationJob" (
      "id" TEXT NOT NULL PRIMARY KEY
    );

    CREATE TABLE "ImageGenerationTask" (
      "id" TEXT NOT NULL PRIMARY KEY
    );

    CREATE TABLE "StyleProfile" (
      "id" TEXT NOT NULL PRIMARY KEY
    );

    -- Intentionally omit StyleExtractionTask. Older partial schemas may not have
    -- optional later tables even when earlier migration records exist.

    CREATE TABLE "BookAnalysisSourceCache" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "documentVersionId" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "temperature" REAL NOT NULL,
      "notesMaxTokens" INTEGER NOT NULL,
      "segmentVersion" INTEGER NOT NULL DEFAULT 1,
      "segmentCount" INTEGER NOT NULL,
      "notesJson" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );

    CREATE UNIQUE INDEX "BookAnalysisSourceCache_documentVersionId_provider_model_temperature_notesMaxTokens_segmentVersion_key"
    ON "BookAnalysisSourceCache"("documentVersionId", "provider", "model", "temperature", "notesMaxTokens", "segmentVersion");

    CREATE INDEX "BookAnalysisSourceCache_documentVersionId_updatedAt_idx"
    ON "BookAnalysisSourceCache"("documentVersionId", "updatedAt");
  `);
}

function withDesktopRuntime(databasePath, run) {
  const previousRuntime = process.env.AI_NOVEL_RUNTIME;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.AI_NOVEL_RUNTIME = "desktop";
  process.env.DATABASE_URL = `file:${databasePath}`;

  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (previousRuntime == null) {
        delete process.env.AI_NOVEL_RUNTIME;
      } else {
        process.env.AI_NOVEL_RUNTIME = previousRuntime;
      }

      if (previousDatabaseUrl == null) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    });
}

function withRuntime({ runtime, nodeEnv, databaseUrl }, run) {
  const previousRuntime = process.env.AI_NOVEL_RUNTIME;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.AI_NOVEL_RUNTIME = runtime;
  process.env.NODE_ENV = nodeEnv;
  if (databaseUrl == null) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = databaseUrl;
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (previousRuntime == null) {
        delete process.env.AI_NOVEL_RUNTIME;
      } else {
        process.env.AI_NOVEL_RUNTIME = previousRuntime;
      }

      if (previousNodeEnv == null) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }

      if (previousDatabaseUrl == null) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    });
}

function withWebDevelopmentRuntime(databasePath, run) {
  return withRuntime({
    runtime: "web",
    nodeEnv: "development",
    databaseUrl: `file:${databasePath}`,
  }, run);
}

function withWebProductionRuntime(databasePath, run) {
  return withRuntime({
    runtime: "web",
    nodeEnv: "production",
    databaseUrl: `file:${databasePath}`,
  }, run);
}

function withWebDevelopmentPostgres(run) {
  return withRuntime({
    runtime: "web",
    nodeEnv: "development",
    databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/ai_novel",
  }, run);
}

function createTempDatabaseFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-runtime-migrations-"));
  const databasePath = path.join(tempDir, "runtime-migrations.db");
  return { tempDir, databasePath };
}

function createLegacyCharacterModelSchema(database) {
  database.exec(`
    CREATE TABLE "Novel" (
      "id" TEXT NOT NULL PRIMARY KEY
    );

    CREATE TABLE "Character" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT
    );

    CREATE TABLE "CharacterCastOptionMember" (
      "id" TEXT NOT NULL PRIMARY KEY
    );
  `);
  database.prepare(`INSERT INTO "Character" ("id", "name") VALUES (?, ?)`).run(
    "legacy-character",
    "旧角色",
  );

  const characterModelMigration = "20260903090000_character_model_profile";
  for (const migrationName of allMigrationNames) {
    if (migrationName !== characterModelMigration) {
      insertMigrationRecord(database, migrationName);
    }
  }
}

test("ensureRuntimeDatabaseReady finishes a pending migration record when schema already exists", async () => {
  const { tempDir, databasePath } = createTempDatabaseFile();
  const database = new Database(databasePath);

  try {
    createMigrationTable(database);
    createSatisfiedBookAnalysisSourceCacheSchema(database);

    for (const migrationName of allMigrationNames) {
      if (migrationName === targetMigration) {
        continue;
      }
      insertMigrationRecord(database, migrationName);
    }

    insertMigrationRecord(database, targetMigration, {
      finishedAt: null,
      startedAt: new Date().toISOString(),
      appliedStepsCount: 0,
      logs: "previous attempt failed",
    });
  } finally {
    database.close();
  }

  try {
    await withDesktopRuntime(databasePath, () => ensureRuntimeDatabaseReady());

    const verifyDb = new Database(databasePath, { readonly: true });
    try {
      const migrationRow = verifyDb.prepare(
        `SELECT finished_at, applied_steps_count
         FROM "_prisma_migrations"
         WHERE migration_name = ?
           AND finished_at IS NOT NULL
         ORDER BY started_at DESC
         LIMIT 1`,
      ).get(targetMigration);

      assert.ok(migrationRow);
      assert.ok(migrationRow.finished_at);
    } finally {
      verifyDb.close();
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("ensureRuntimeDatabaseReady records a missing migration when schema is already satisfied", async () => {
  const { tempDir, databasePath } = createTempDatabaseFile();
  const database = new Database(databasePath);

  try {
    createMigrationTable(database);
    createSatisfiedBookAnalysisSourceCacheSchema(database);

    for (const migrationName of allMigrationNames) {
      if (migrationName === targetMigration) {
        continue;
      }
      insertMigrationRecord(database, migrationName);
    }
  } finally {
    database.close();
  }

  try {
    await withDesktopRuntime(databasePath, () => ensureRuntimeDatabaseReady());

    const verifyDb = new Database(databasePath, { readonly: true });
    try {
      const migrationRow = verifyDb.prepare(
        `SELECT finished_at, applied_steps_count
         FROM "_prisma_migrations"
         WHERE migration_name = ?
           AND rolled_back_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1`,
      ).get(targetMigration);

      assert.ok(migrationRow);
      assert.ok(migrationRow.finished_at);
    } finally {
      verifyDb.close();
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("ensureRuntimeDatabaseReady creates the novel fact ledger for existing desktop databases", async () => {
  const { tempDir, databasePath } = createTempDatabaseFile();
  const database = new Database(databasePath);

  try {
    createMigrationTable(database);
    database.exec('CREATE TABLE "Novel" ("id" TEXT NOT NULL PRIMARY KEY);');
    for (const migrationName of allMigrationNames) {
      if (migrationName !== novelFactMigration) {
        insertMigrationRecord(database, migrationName);
      }
    }
  } finally {
    database.close();
  }

  try {
    await withDesktopRuntime(databasePath, () => ensureRuntimeDatabaseReady());

    const verifyDb = new Database(databasePath, { readonly: true });
    try {
      assert.ok(verifyDb.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'NovelFactEntry'`,
      ).get());
      assert.ok(verifyDb.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'NovelFactEntry_novelId_chapterOrder_idx'`,
      ).get());
    } finally {
      verifyDb.close();
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("ensureRuntimeDatabaseReady repairs character model fields for web development SQLite databases", async () => {
  const { tempDir, databasePath } = createTempDatabaseFile();
  const database = new Database(databasePath);

  try {
    createMigrationTable(database);
    createLegacyCharacterModelSchema(database);
  } finally {
    database.close();
  }

  try {
    await withWebDevelopmentRuntime(databasePath, async () => {
      await ensureRuntimeDatabaseReady();
      await ensureRuntimeDatabaseReady();
    });

    const verifyDb = new Database(databasePath, { readonly: true });
    try {
      const columns = verifyDb.prepare(`PRAGMA table_info("Character")`).all();
      assert.ok(columns.some((column) => column.name === "actorKind"));
      assert.ok(columns.some((column) => column.name === "bodyBuild"));

      const character = verifyDb.prepare(
        `SELECT "actorKind", "bodyBuild" FROM "Character" WHERE "id" = ?`,
      ).get("legacy-character");
      assert.deepEqual(character, {
        actorKind: "human",
        bodyBuild: "unknown",
      });

      const migrationRow = verifyDb.prepare(
        `SELECT finished_at, applied_steps_count
         FROM "_prisma_migrations"
         WHERE migration_name = ?
           AND rolled_back_at IS NULL
           AND finished_at IS NOT NULL`,
      ).get("20260903090000_character_model_profile");
      assert.ok(migrationRow);
      assert.equal(migrationRow.applied_steps_count, 1);
    } finally {
      verifyDb.close();
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("ensureRuntimeDatabaseReady does not mutate production web SQLite databases", async () => {
  const { tempDir, databasePath } = createTempDatabaseFile();
  const database = new Database(databasePath);

  try {
    database.exec(`
      CREATE TABLE "Novel" (
        "id" TEXT NOT NULL PRIMARY KEY
      );

      CREATE TABLE "Character" (
        "id" TEXT NOT NULL PRIMARY KEY
      );
    `);
  } finally {
    database.close();
  }

  try {
    await withWebProductionRuntime(databasePath, () => ensureRuntimeDatabaseReady());

    const verifyDb = new Database(databasePath, { readonly: true });
    try {
      const migrationTable = verifyDb.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'`,
      ).get();
      assert.equal(migrationTable, undefined);
      const actorKindColumn = verifyDb.prepare(
        `SELECT name FROM pragma_table_info('Character') WHERE name = 'actorKind'`,
      ).get();
      assert.equal(actorKindColumn, undefined);
    } finally {
      verifyDb.close();
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("ensureRuntimeDatabaseReady does not enter SQLite migration mode for web PostgreSQL", async () => {
  await withWebDevelopmentPostgres(() => ensureRuntimeDatabaseReady());
});
