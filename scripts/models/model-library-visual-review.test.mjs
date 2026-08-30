import assert from "node:assert/strict";
import test from "node:test";

import { MODEL_LIBRARY } from "../../client/src/config/modelLibrary.ts";
import {
  MODEL_VISUAL_REVIEWS,
  getVisualReviewById,
  validateModelVisualReview,
} from "./modelLibraryVisualReview.mjs";
import { getCatalogOverride } from "./modelLibraryPolicy.mjs";

test("每个已发布模型都有截图确认且已批准的视觉复核记录", () => {
  const errors = validateModelVisualReview({ library: MODEL_LIBRARY });
  assert.deepEqual(errors, []);
  const staticEntries = MODEL_LIBRARY.filter((entry) => !entry.previewAppearance);
  assert.equal(MODEL_VISUAL_REVIEWS.length, staticEntries.length);
});

test("角色预览条目不混入 Cine57 静态模型视觉审核", () => {
  const character = MODEL_LIBRARY.find((entry) => entry.previewAppearance);
  assert.ok(character);
  assert.deepEqual(validateModelVisualReview({ library: [character] }), []);
});

test("视觉复核绑定稳定 ID、mesh 和 GLB 文件名", () => {
  const entry = MODEL_LIBRARY.find((candidate) => candidate.id === "desk-set-01a");
  assert.ok(entry);
  const review = getVisualReviewById(entry.id);
  assert.ok(review);

  const errors = validateModelVisualReview({
    library: [entry],
    reviews: [{ ...review, fileName: "wrong.glb" }],
  });
  assert.ok(errors.some((error) => error.includes("fileName")));
});

test("未批准或目录外的视觉复核记录不能通过", () => {
  const entry = MODEL_LIBRARY.find((candidate) => candidate.id === "desk-set-01a");
  assert.ok(entry);
  const review = getVisualReviewById(entry.id);
  assert.ok(review);

  const errors = validateModelVisualReview({
    library: [entry],
    reviews: [
      { ...review, reviewStatus: "pending" },
      { ...review, id: "not-in-catalog", meshName: "SM_Unknown" },
    ],
  });
  assert.ok(errors.some((error) => error.includes("approved")));
  assert.ok(errors.some((error) => error.includes("not in catalog")));
});

test("SM_Desk_Set_01a 按截图识别为烟灰缸", () => {
  const review = getVisualReviewById("desk-set-01a");
  assert.deepEqual(
    { name: review?.name, category: review?.category },
    { name: "烟灰缸", category: "日用小物" },
  );
  assert.deepEqual(getCatalogOverride("desk-set-01a"), {
    name: "烟灰缸",
    category: "日用小物",
  });
});
