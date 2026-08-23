const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const dotenv = require("dotenv");

const SERVER_ROOT = path.resolve(__dirname, "..");
const SETTING_KEY = "drama.globalNarratorVoice";
const ALLOWED_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
const MIME_TYPES = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
};

dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

function readOption(argv, name) {
  const index = argv.indexOf(name);
  if (index >= 0) {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${name} 需要一个值。`);
    }
    return value;
  }
  const prefix = `${name}=`;
  const inline = argv.find((item) => item.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : undefined;
}

function requiredOption(argv, name) {
  const value = readOption(argv, name);
  if (!value?.trim()) {
    throw new Error(`缺少必填参数 ${name}。`);
  }
  return value.trim();
}

function resolveDatabasePath(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("旁白样本导入工具只支持 SQLite 的 DATABASE_URL。 ");
  }
  const rawPath = databaseUrl.slice("file:".length).split(/[?#]/, 1)[0] || "./dev.db";
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(SERVER_ROOT, rawPath);
}

function readMetadata(metadataPath) {
  if (!metadataPath) {
    return {};
  }
  const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function buildState(sourcePath, metadataPath, argv) {
  const extension = path.extname(sourcePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error(`不支持的音频格式：${extension || "无扩展名"}。`);
  }
  const stats = fs.statSync(sourcePath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error("源音频文件为空或不是普通文件。 ");
  }
  const bytes = fs.readFileSync(sourcePath);
  const metadata = readMetadata(metadataPath);
  const metadataDescription = [metadata.control, metadata.description]
    .find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
  const description = readOption(argv, "--description") ?? metadataDescription;
  const metadataSampleText = typeof metadata.text === "string" ? metadata.text.trim() : "";
  const sampleText = readOption(argv, "--sample-text") ?? metadataSampleText;
  const sampleAudioUrl = `data:${MIME_TYPES[extension]};base64,${bytes.toString("base64")}`;
  return {
    description: description || undefined,
    sampleAudioUrl,
    sampleText: sampleText || undefined,
    sampleSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    source: "legacy",
    updatedAt: new Date().toISOString(),
  };
}

function importState(state) {
  const databaseUrl = process.env.DATABASE_URL?.trim() || "file:./dev.db";
  const databasePath = resolveDatabasePath(databaseUrl);
  if (!fs.existsSync(databasePath)) {
    throw new Error(`当前数据库不存在：${databasePath}`);
  }
  const db = new Database(databasePath);
  try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'AppSetting'").get();
    if (!table) {
      throw new Error("当前数据库缺少 AppSetting 表，请先完成数据库初始化。 ");
    }
    db.prepare(`
      INSERT INTO "AppSetting" ("key", "value", "createdAt", "updatedAt")
      VALUES (@key, @value, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("key") DO UPDATE SET
        "value" = excluded."value",
        "updatedAt" = CURRENT_TIMESTAMP
    `).run({ key: SETTING_KEY, value: JSON.stringify(state) });
  } finally {
    db.close();
  }
  return databasePath;
}

function main() {
  const argv = process.argv.slice(2);
  const sourcePath = path.resolve(requiredOption(argv, "--source"));
  const metadataOption = readOption(argv, "--metadata");
  const metadataPath = metadataOption ? path.resolve(metadataOption) : undefined;
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`源音频文件不存在：${sourcePath}`);
  }
  if (metadataPath && !fs.existsSync(metadataPath)) {
    throw new Error(`元数据文件不存在：${metadataPath}`);
  }
  const state = buildState(sourcePath, metadataPath, argv);
  const databasePath = importState(state);
  console.log(`已导入系统旁白样本：${path.basename(sourcePath)} → ${databasePath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
