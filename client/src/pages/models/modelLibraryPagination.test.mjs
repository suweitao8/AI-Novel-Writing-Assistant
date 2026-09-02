import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_LIBRARY_PAGE_SIZE,
  getModelLibraryPage,
} from "./modelLibraryPagination.ts";

const entries = Array.from({ length: 51 }, (_, index) => `model-${index + 1}`);

test("模型库固定每页 50 条并返回正确的五行页切片", () => {
  assert.equal(MODEL_LIBRARY_PAGE_SIZE, 50);
  assert.deepEqual(getModelLibraryPage(entries, 1), {
    page: 1,
    totalPages: 2,
    entries: entries.slice(0, 50),
  });
  assert.deepEqual(getModelLibraryPage(entries, 2), {
    page: 2,
    totalPages: 2,
    entries: entries.slice(50),
  });
});

test("模型库页码会限制在有效范围，空结果仍有第 1 页", () => {
  assert.equal(getModelLibraryPage(entries, 0).page, 1);
  assert.equal(getModelLibraryPage(entries, 99).page, 2);
  assert.deepEqual(getModelLibraryPage([], 5), {
    page: 1,
    totalPages: 1,
    entries: [],
  });
});
