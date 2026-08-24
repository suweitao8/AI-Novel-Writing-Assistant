const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveDramaBatchUseCharacterRefImages,
} = require("../dist/services/drama/production/DramaBatchOrchestrator.js");

test("legacy batch progress defaults reference images to enabled", () => {
  assert.equal(resolveDramaBatchUseCharacterRefImages(undefined), true);
  assert.equal(resolveDramaBatchUseCharacterRefImages(null), true);
  assert.equal(resolveDramaBatchUseCharacterRefImages(false), false);
  assert.equal(resolveDramaBatchUseCharacterRefImages(true), true);
});
