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
  const staticEntries = MODEL_LIBRARY.filter((entry) => entry.fileUrl.startsWith("/models/cine57/"));
  assert.equal(MODEL_VISUAL_REVIEWS.length, staticEntries.length);
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

test("普通缩略图证据不能替代真实详情页预览", () => {
  const entry = MODEL_LIBRARY.find((candidate) => candidate.id === "desk-set-01a");
  assert.ok(entry);
  const review = getVisualReviewById(entry.id);
  assert.ok(review);

  const errors = validateModelVisualReview({
    library: [entry],
    reviews: [{ ...review, reviewEvidence: "standard-thumbnail-audit-2026-09-02", preview: undefined }],
  });
  assert.ok(errors.some((error) => error.includes("actual 3D preview evidence")));
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

test("实际三维预览审核必须绑定可复现的资源证据", () => {
  const entry = MODEL_LIBRARY.find((candidate) => candidate.id === "desk-set-01a");
  assert.ok(entry);
  const review = getVisualReviewById(entry.id);
  assert.ok(review);

  const errors = validateModelVisualReview({
    library: [entry],
    reviews: [{
      ...review,
      reviewEvidence: "model-preview-audit-2026-08-31",
      preview: {
        previewPath: `/models/${entry.id}`,
        assetSha256: "pending-browser-preview",
        renderer: "model-detail-v1",
        renderedAt: "2026-08-31",
        textureStatus: "opaque",
        browserAudit: "model-library-preview-browser-audit.json",
        screenshotCaptured: true,
      },
    }],
    assetSha256ById: new Map([[entry.id, "a".repeat(64)]]),
  });
  assert.ok(errors.some((error) => error.includes("assetSha256")));
});

test("发布门禁必须消费已完成的浏览器详情预览审计", () => {
  const entry = MODEL_LIBRARY.find((candidate) => candidate.id === "desk-set-01a");
  assert.ok(entry);
  const review = getVisualReviewById(entry.id);
  assert.ok(review);

  const errors = validateModelVisualReview({
    library: [entry],
    reviews: [review],
    browserPreviewAuditById: new Map([[entry.id, { ready: false, screenshotCaptured: false }]]),
  });
  assert.ok(errors.some((error) => error.includes("completed browser preview audit")));
});

test("缺少复核证据时返回字段错误而不是让门禁崩溃", () => {
  const entry = MODEL_LIBRARY.find((candidate) => candidate.id === "desk-set-01a");
  assert.ok(entry);
  const review = getVisualReviewById(entry.id);
  assert.ok(review);

  const errors = validateModelVisualReview({
    library: [entry],
    reviews: [{ ...review, reviewEvidence: undefined }],
  });
  assert.ok(errors.some((error) => error.includes("reviewEvidence")));
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
