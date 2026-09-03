import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyExpansionCandidate,
  parseJsonlManifest,
  selectExpansionCandidates,
} from "./modelLibraryExpansionCandidates.mjs";
import {
  appendImportHistoryEvent,
  createImportHistoryDocument,
} from "./modelLibraryImportHistory.mjs";

const policy = {
  rejectedMeshNamePatterns: [
    "(?:^|_)(?:body|door|base|shelf|drawer|leg|joint|connector|power|part)(?:_|$)",
    "(?:^|_)NN(?:_|$)",
  ],
};

test("解析 Cine57 JSONL 时忽略空行并保留完整 manifest 行", () => {
  const rows = parseJsonlManifest('\n{"package":"/Game/Office/SM_Desk_Office_08b","fbx":"desk.fbx"}\n');
  assert.deepEqual(rows, [{ package: "/Game/Office/SM_Desk_Office_08b", fbx: "desk.fbx" }]);
});

test("候选分类拒绝零件、NN 技术变体和非 Game 来源", () => {
  assert.deepEqual(
    classifyExpansionCandidate({
      meshName: "SM_Microwave_01_door",
      packagePath: "/Game/Electronics/SM_Microwave_01_door",
      policy,
    }),
    { accepted: false, reason: "component" },
  );
  assert.deepEqual(
    classifyExpansionCandidate({
      meshName: "SM_Desk_Office_NN_08a",
      packagePath: "/Game/Office/NN/SM_Desk_Office_NN_08a",
      policy,
    }),
    { accepted: false, reason: "technical-variant" },
  );
  assert.deepEqual(
    classifyExpansionCandidate({
      meshName: "SM_Desk_Office_08b",
      packagePath: "D:/UnrealWorkspace/Cine57-exported3/SM_Desk_Office_08b",
      policy,
    }),
    { accepted: false, reason: "unknown-source" },
  );
  assert.deepEqual(
    classifyExpansionCandidate({
      meshName: "SM_Desk_Office_08b",
      packagePath: "/Game/Office/LP/SM_Desk_Office_08b",
      policy,
    }),
    { accepted: true, reason: null },
  );
});

test("候选选择器只返回明确白名单中的完整对象并记录淘汰原因", () => {
  const result = selectExpansionCandidates({
    rows: [
      { package: "/Game/Office/LP/SM_Desk_Office_08b", fbx: "desk.fbx" },
      { package: "/Game/Electronics/LP/SM_Microwave_01_door", fbx: "door.fbx" },
      { package: "/Game/Office/NN/SM_Desk_Office_NN_08a", fbx: "nn.fbx" },
    ],
    selectedMeshNames: new Set(["SM_Desk_Office_08b", "SM_Microwave_01_door", "SM_Desk_Office_NN_08a"]),
    policy,
  });
  assert.deepEqual(result.candidates.map((row) => row.fbx), ["desk.fbx"]);
  assert.deepEqual(
    result.rejected.map(({ meshName, reason }) => ({ meshName, reason })),
    [
      { meshName: "SM_Microwave_01_door", reason: "component" },
      { meshName: "SM_Desk_Office_NN_08a", reason: "technical-variant" },
    ],
  );
});

test("候选选择器在转换前跳过历史上已确认不可用的模型", () => {
  const row = { package: "/Game/Props/SM_Debris_Pile_02a", fbx: "debris.fbx" };
  const history = appendImportHistoryEvent({
    history: createImportHistoryDocument(),
    row,
    status: "rejected",
    failureStage: "semantic",
    reasonCode: "ground-scatter",
    summary: "碎屑不作为前景资产",
    evidence: "curation-review-2026-09-03",
  });
  const result = selectExpansionCandidates({
    rows: [row],
    selectedMeshNames: new Set(["SM_Debris_Pile_02a"]),
    policy,
    importHistory: history,
  });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejected[0].reason, "previously-rejected");
  assert.match(result.rejected[0].assetKey, /SM_Debris_Pile_02a#/);
});

test("显式前景策展记录拒绝碎屑，但不误杀普通同名资产", () => {
  const result = classifyExpansionCandidate({
    meshName: "SM_Debris_Pile_02a",
    packagePath: "/Game/Props/SM_Debris_Pile_02a",
    policy: {
      foregroundAdmission: {
        rejectedAssets: [{ meshName: "SM_Debris_Pile_02a", reasonCode: "ground-scatter" }],
      },
    },
  });
  assert.deepEqual(result, { accepted: false, reason: "ground-scatter" });
  assert.deepEqual(
    classifyExpansionCandidate({
      meshName: "SM_Debris_Pile_Display",
      packagePath: "/Game/Props/SM_Debris_Pile_Display",
      policy: { foregroundAdmission: { rejectedAssets: [] } },
    }),
    { accepted: true, reason: null },
  );
});
