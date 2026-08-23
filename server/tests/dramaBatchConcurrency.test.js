const assert = require("node:assert/strict");
const test = require("node:test");

const { runWithConcurrency } = require("../dist/services/drama/production/batchConcurrency.js");

test("bounded batch worker never exceeds the configured concurrency", async () => {
  const items = Array.from({ length: 8 }, (_, index) => index);
  const visited = [];
  let active = 0;
  let maxActive = 0;

  await runWithConcurrency(items, 3, async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, item % 2 === 0 ? 8 : 2));
    visited.push(item);
    active -= 1;
  });

  assert.equal(maxActive, 3);
  assert.deepEqual(visited.sort((left, right) => left - right), items);
  assert.equal(active, 0);
});
