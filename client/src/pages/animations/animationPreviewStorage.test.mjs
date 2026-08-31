import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  clear() {
    this.#values.clear();
  }
}

const storage = new MemoryStorage();
globalThis.window = { localStorage: storage };

const {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  clearAnimationKeyframe,
  getAnimationKeyframe,
  setAnimationKeyframe,
  subscribeAnimationKeyframes,
} = await import("./animationPreviewStorage.ts");

test("ignores malformed persisted keyframes and persists valid captures", () => {
  storage.setItem(STORAGE_KEY, JSON.stringify({
    broken: { dataUrl: "not-an-image", frame: -1, frameRate: 30 },
    missingFrame: { dataUrl: "data:image/png;base64,AAAA" },
  }));

  assert.equal(getAnimationKeyframe("broken"), null);
  assert.equal(getAnimationKeyframe("missingFrame"), null);

  const events = [];
  const unsubscribe = subscribeAnimationKeyframes((changedId) => events.push(changedId));
  const saved = setAnimationKeyframe(
    "walk-forward",
    "data:image/png;base64,AAAA",
    13,
    24,
  );

  assert.deepEqual(saved, {
    animationId: "walk-forward",
    dataUrl: "data:image/png;base64,AAAA",
    frame: 13,
    frameRate: 24,
    updatedAt: saved.updatedAt,
  });
  assert.equal(getAnimationKeyframe("walk-forward")?.dataUrl, "data:image/png;base64,AAAA");
  assert.equal(getAnimationKeyframe("walk-forward")?.frame, 13);
  assert.equal(getAnimationKeyframe("walk-forward")?.frameRate, 24);
  assert.deepEqual(events, ["walk-forward"]);

  const persisted = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(persisted["walk-forward"].frame, 13);
  assert.equal(persisted["walk-forward"].frameRate, 24);
  assert.equal("timeSeconds" in persisted["walk-forward"], false);

  unsubscribe();
  clearAnimationKeyframe("walk-forward");
  assert.equal(getAnimationKeyframe("walk-forward"), null);
});

test("lazily migrates v2 seconds to the requested integer frame", async () => {
  storage.clear();
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({
    "legacy-clip": {
      dataUrl: "data:image/png;base64,CCCC",
      timeSeconds: 0.42,
      updatedAt: "2026-08-31T00:00:00.000Z",
    },
    untouched: {
      dataUrl: "data:image/png;base64,DDDD",
      timeSeconds: 1.25,
    },
  }));

  const isolated = await import("./animationPreviewStorage.ts?legacy-migration");
  const migrated = isolated.getAnimationKeyframe("legacy-clip", 24);

  assert.deepEqual(migrated, {
    animationId: "legacy-clip",
    dataUrl: "data:image/png;base64,CCCC",
    frame: 10,
    frameRate: 24,
    updatedAt: "2026-08-31T00:00:00.000Z",
  });

  const persisted = JSON.parse(storage.getItem(isolated.STORAGE_KEY));
  assert.equal(persisted["legacy-clip"].frame, 10);
  assert.equal(persisted["legacy-clip"].frameRate, 24);
  const legacy = JSON.parse(storage.getItem(isolated.LEGACY_STORAGE_KEY));
  assert.equal(legacy["legacy-clip"], undefined);
  assert.ok(legacy.untouched);
});

test("uses the in-memory cache when browser storage is unavailable", async () => {
  const unavailableStorage = {
    getItem() {
      throw new Error("storage blocked");
    },
    setItem() {
      throw new Error("storage blocked");
    },
  };
  globalThis.window = { localStorage: unavailableStorage };

  const isolated = await import("./animationPreviewStorage.ts?memory-fallback");
  const saved = isolated.setAnimationKeyframe(
    "idle-stand",
    "data:image/jpeg;base64,BBBB",
    38,
    30,
  );

  assert.equal(isolated.getAnimationKeyframe("idle-stand")?.dataUrl, saved.dataUrl);
  assert.equal(isolated.getAnimationKeyframe("idle-stand")?.frame, 38);
  assert.equal(isolated.getAnimationKeyframe("idle-stand")?.frameRate, 30);
});
