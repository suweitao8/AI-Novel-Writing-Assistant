import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_LIBRARY_PAGE_SIZE,
  getModelLibraryPage,
} from "./modelLibraryPagination.ts";

const entries = Array.from({ length: 51 }, (_, index) => `model-${index + 1}`);

test("模型库默认每页 24 条并返回正确的页切片", () => {
  assert.equal(MODEL_LIBRARY_PAGE_SIZE, 24);
  assert.deepEqual(getModelLibraryPage(entries, 1), {
    page: 1,
    totalPages: 3,
    entries: entries.slice(0, 24),
  });
  assert.deepEqual(getModelLibraryPage(entries, 3), {
    page: 3,
    totalPages: 3,
    entries: entries.slice(48),
  });
});

test("模型库页码会限制在有效范围，空结果仍有第 1 页", () => {
  assert.equal(getModelLibraryPage(entries, 0).page, 1);
  assert.equal(getModelLibraryPage(entries, 99).page, 3);
  assert.deepEqual(getModelLibraryPage([], 5), {
    page: 1,
    totalPages: 1,
    entries: [],
  });
});
