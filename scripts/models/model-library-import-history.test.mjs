import assert from "node:assert/strict";
import test from "node:test";

import {
  appendImportHistoryEvent,
  buildImportAssetKey,
  buildImportSourceFingerprint,
  createImportHistoryDocument,
  findImportHistoryRecord,
  shouldSkipImportCandidate,
  validateImportHistoryDocument,
} from "./modelLibraryImportHistory.mjs";

const ROW = {
  package: "\\Game\\Props\\SM_Debris_Pile_02a",
  objectPath: "/Game/Props/SM_Debris_Pile_02a.SM_Debris_Pile_02a",
  fbx: "D:/UnrealWorkspace/Cine57-exported6/SM_Debris_Pile_02a.fbx",
  fbxSha256: "a".repeat(64),
};

test("导入历史资产键只由规范化包路径和 Mesh 组成", () => {
  assert.equal(
    buildImportAssetKey({ packagePath: ROW.package, meshName: "SM_Debris_Pile_02a" }),
    "/Game/Props/SM_Debris_Pile_02a#SM_Debris_Pile_02a",
  );
});

test("源行字段顺序变化不改变指纹，源文件指纹变化会触发新审查", () => {
  const first = buildImportSourceFingerprint(ROW);
  const reordered = buildImportSourceFingerprint({
    fbxSha256: ROW.fbxSha256,
    fbx: ROW.fbx,
    objectPath: ROW.objectPath,
    package: ROW.package,
  });
  const changed = buildImportSourceFingerprint({ ...ROW, fbxSha256: "b".repeat(64) });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test("同一源指纹的已拒绝模型在转换前返回 previously-rejected", () => {
  const history = appendImportHistoryEvent({
    history: createImportHistoryDocument({ generatedAt: "2026-09-03T00:00:00.000Z" }),
    row: ROW,
    status: "rejected",
    failureStage: "semantic",
    reasonCode: "ground-scatter",
    summary: "碎屑堆没有前景使用价值",
    evidence: "curation-review-2026-09-03",
    reviewedAt: "2026-09-03T00:00:00.000Z",
  });

  const result = shouldSkipImportCandidate({ row: ROW, history });
  assert.equal(result.skip, true);
  assert.equal(result.reason, "previously-rejected");
  assert.equal(result.assetKey, "/Game/Props/SM_Debris_Pile_02a#SM_Debris_Pile_02a");
  assert.equal(findImportHistoryRecord(history, result.assetKey)?.reasonCode, "ground-scatter");
});

test("源指纹变化不会继承旧的拒绝结论", () => {
  const history = appendImportHistoryEvent({
    history: createImportHistoryDocument(),
    row: ROW,
    status: "rejected",
    failureStage: "texture",
    reasonCode: "missing-texture",
    summary: "缺少贴图",
    evidence: "texture-gate-2026-09-03",
  });
  const result = shouldSkipImportCandidate({
    row: { ...ROW, fbxSha256: "c".repeat(64) },
    history,
  });
  assert.equal(result.skip, false);
  assert.equal(result.reason, "source-changed");
});

test("重复导入历史会保留事件并更新当前结论", () => {
  const first = appendImportHistoryEvent({
    history: createImportHistoryDocument(),
    row: ROW,
    status: "rejected",
    failureStage: "preview",
    reasonCode: "broken-preview",
    summary: "详情页预览异常",
    evidence: "preview-audit-1",
  });
  const second = appendImportHistoryEvent({
    history: first,
    row: ROW,
    status: "approved",
    failureStage: null,
    reasonCode: null,
    summary: "修复后通过预览",
    evidence: "preview-audit-2",
  });
  const record = findImportHistoryRecord(second, buildImportAssetKey({ packagePath: ROW.package, meshName: "SM_Debris_Pile_02a" }));
  assert.equal(record.status, "approved");
  assert.equal(record.events.length, 2);
  assert.equal(record.events[0].reasonCode, "broken-preview");
  assert.equal(record.events[1].status, "approved");
});

test("导入历史拒绝重复资产键和非法状态", () => {
  const valid = appendImportHistoryEvent({
    history: createImportHistoryDocument(),
    row: ROW,
    status: "rejected",
    failureStage: "geometry",
    reasonCode: "too-small",
    summary: "模型过小",
    evidence: "geometry-audit-2026-09-03",
  });
  assert.deepEqual(validateImportHistoryDocument(valid), []);
  assert.ok(validateImportHistoryDocument({
    ...valid,
    entries: [valid.entries[0], valid.entries[0]],
  }).some((error) => error.includes("duplicate")));
  assert.ok(validateImportHistoryDocument({
    ...valid,
    entries: [{ ...valid.entries[0], status: "unknown" }],
  }).some((error) => error.includes("status")));
});
