import assert from "node:assert/strict";
import test from "node:test";
import {
  clearRememberedTab,
  createRememberedTabStorageKey,
  readRememberedTab,
  writeRememberedTab,
} from "./rememberedTabs.ts";

const values = ["all", "flowers", "grass"];

function installStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  return {
    data,
    restore() {
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
    },
  };
}

test("remembered tab keys are namespaced, versioned, and scope isolated", () => {
  assert.equal(
    createRememberedTabStorageKey("models:library-category"),
    "ai-novel.remembered-tab.v1:models%3Alibrary-category",
  );
  assert.notEqual(
    createRememberedTabStorageKey("drama-project:project-a:main-stage"),
    createRememberedTabStorageKey("drama-project:project-b:main-stage"),
  );
});
test("reads only valid values and falls back for missing or stale values", () => {
  const key = createRememberedTabStorageKey("models:library-category");
  const fake = installStorage({ [key]: "flowers" });
  try {
    assert.equal(readRememberedTab("models:library-category", "all", values), "flowers");
    fake.data.set(key, "removed-category");
    assert.equal(readRememberedTab("models:library-category", "all", values), "all");
    fake.data.delete(key);
    assert.equal(readRememberedTab("models:library-category", "all", values), "all");
  } finally {
    fake.restore();
  }
});

test("writes valid values and rejects invalid values without changing storage", () => {
  const scope = "models:library-category";
  const key = createRememberedTabStorageKey(scope);
  const fake = installStorage({ [key]: "all" });
  try {
    assert.equal(writeRememberedTab(scope, "grass", values), true);
    assert.equal(fake.data.get(key), "grass");
    assert.equal(writeRememberedTab(scope, "removed-category", values), false);
    assert.equal(fake.data.get(key), "grass");
  } finally {
    fake.restore();
  }
});

test("storage failures degrade to defaults and never escape to the page", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem() {
        throw new Error("storage blocked");
      },
      setItem() {
        throw new Error("storage blocked");
      },
      removeItem() {
        throw new Error("storage blocked");
      },
    },
  };
  try {
    assert.equal(readRememberedTab("models:library-category", "all", values), "all");
    assert.equal(writeRememberedTab("models:library-category", "grass", values), false);
    assert.doesNotThrow(() => clearRememberedTab("models:library-category"));
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});
