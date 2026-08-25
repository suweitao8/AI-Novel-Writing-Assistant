import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(fileURLToPath(new URL("..", import.meta.url)), "src/components/common/LightboxImage.tsx"),
  "utf8",
);

test("LightboxImage 支持按原图自然比例展示，避免 object-contain 产生水平留白", () => {
  assert.match(source, /fit\?: "cover" \| "contain" \| "natural"/);
  assert.match(source, /fit === "natural"/);
  assert.match(source, /h-auto/);
});
