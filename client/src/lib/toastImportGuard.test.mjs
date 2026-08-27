import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// 通知统一走 @/components/ui/toast 封装（含报错日志记录、5 秒自动消失）。
// 直接从 sonner 引入会绕过报错日志——用这条守卫测试在测试阶段拦下。
const CLIENT_SRC_ROOT = path.resolve(import.meta.dirname, "..");
const ALLOWED_FILES = new Set([
  path.join(CLIENT_SRC_ROOT, "components", "ui", "toast.tsx"),
]);
const SONNER_IMPORT_PATTERN = /from\s+["']sonner["']/;

function listTsFiles(dir, collected = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      listTsFiles(fullPath, collected);
      continue;
    }
    if (/\.(tsx|ts|mjs)$/.test(entry) && !entry.endsWith(".test.mjs")) {
      collected.push(fullPath);
    }
  }
  return collected;
}

test("sonner 只允许被统一的 toast 封装引用", () => {
  const offenders = [];
  for (const filePath of listTsFiles(path.join(CLIENT_SRC_ROOT, "..", "src"))) {
    if (ALLOWED_FILES.has(filePath)) {
      continue;
    }
    const content = readFileSync(filePath, "utf8");
    if (SONNER_IMPORT_PATTERN.test(content)) {
      offenders.push(path.relative(CLIENT_SRC_ROOT, filePath));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `以下文件绕过了统一 toast 封装直接引用 sonner，请改为 import { toast } from "@/components/ui/toast"：\n${offenders.join("\n")}`,
  );
});
