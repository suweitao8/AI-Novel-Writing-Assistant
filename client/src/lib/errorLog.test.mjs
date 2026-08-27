import test from "node:test";
import assert from "node:assert/strict";
import {
  clearErrorLog,
  ERROR_LOG_UPDATED_EVENT,
  readErrorLog,
  recordErrorLog,
} from "./errorLog.ts";

function installFakeStorage() {
  const store = new Map();
  let eventCount = 0;
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => {
        store.set(key, String(value));
      },
      removeItem: (key) => {
        store.delete(key);
      },
    },
    dispatchEvent: () => {
      eventCount += 1;
      return true;
    },
  };
  return {
    get eventCount() {
      return eventCount;
    },
    savedCount: () => {
      const raw = store.get("ai-novel.error-log.v1");
      return raw ? JSON.parse(raw).length : 0;
    },
  };
}

test("records errors newest first and persists to storage", () => {
  const fake = installFakeStorage();
  recordErrorLog("第一个错误");
  recordErrorLog("第二个错误", "详细描述");

  const entries = readErrorLog();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].message, "第二个错误");
  assert.equal(entries[0].description, "详细描述");
  assert.equal(entries[1].message, "第一个错误");
  assert.ok(entries[0].id);
  assert.ok(entries[0].time);
  assert.ok(fake.eventCount >= 2);
  assert.equal(fake.savedCount(), 2);
});

test("caps the log at 100 entries", () => {
  installFakeStorage();
  for (let index = 0; index < 130; index += 1) {
    recordErrorLog(`错误 ${index}`);
  }
  const entries = readErrorLog();
  assert.equal(entries.length, 100);
  assert.equal(entries[0].message, "错误 129");
  assert.equal(entries.at(-1).message, "错误 30");
});

test("clear removes every entry and notifies listeners", () => {
  const fake = installFakeStorage();
  recordErrorLog("待清空错误");
  const before = readErrorLog().length;
  clearErrorLog();

  assert.ok(before > 0);
  assert.deepEqual(readErrorLog(), []);
  assert.equal(fake.savedCount(), 0);
});

test("ignores blank messages without touching storage", () => {
  const fake = installFakeStorage();
  recordErrorLog("   ");
  assert.deepEqual(readErrorLog(), []);
  assert.equal(fake.eventCount, 0);
});

test("exported update event name is stable", () => {
  assert.equal(ERROR_LOG_UPDATED_EVENT, "ai-novel:error-log-updated");
});
