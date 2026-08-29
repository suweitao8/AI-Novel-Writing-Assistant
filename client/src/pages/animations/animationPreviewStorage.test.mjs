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
  STORAGE_KEY,
  clearAnimationKeyframe,
  getAnimationKeyframe,
  setAnimationKeyframe,
  subscribeAnimationKeyframes,
} = await import("./animationPreviewStorage.ts");

test("ignores malformed persisted keyframes and persists valid captures", () => {
  storage.setItem(STORAGE_KEY, JSON.stringify({
    broken: { dataUrl: "not-an-image", timeSeconds: -1 },
    missingTime: { dataUrl: "data:image/png;base64,AAAA" },
  }));

  assert.equal(getAnimationKeyframe("broken"), null);
  assert.equal(getAnimationKeyframe("missingTime"), null);

  const events = [];
  const unsubscribe = subscribeAnimationKeyframes((changedId) => events.push(changedId));
  const saved = setAnimationKeyframe(
    "walk-forward",
    "data:image/png;base64,AAAA",
    0.42,
  );

  assert.deepEqual(saved, {
    animationId: "walk-forward",
    dataUrl: "data:image/png;base64,AAAA",
    timeSeconds: 0.42,
    updatedAt: saved.updatedAt,
  });
  assert.equal(getAnimationKeyframe("walk-forward")?.dataUrl, "data:image/png;base64,AAAA");
  assert.equal(getAnimationKeyframe("walk-forward")?.timeSeconds, 0.42);
  assert.deepEqual(events, ["walk-forward"]);

  const persisted = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(persisted["walk-forward"].timeSeconds, 0.42);

  unsubscribe();
  clearAnimationKeyframe("walk-forward");
  assert.equal(getAnimationKeyframe("walk-forward"), null);
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
    1.25,
  );

  assert.equal(isolated.getAnimationKeyframe("idle-stand")?.dataUrl, saved.dataUrl);
  assert.equal(isolated.getAnimationKeyframe("idle-stand")?.timeSeconds, 1.25);
});
