const test = require("node:test");
const assert = require("node:assert/strict");

// 地图场景标注（novel.world.map_annotate@v4 单层平面地图 + WorldMapService 归一/合并）：
// schema 边界、postValidate 决策完备性、mergeAnnotation 只增不改、归一行为。

const { worldMapAnnotatePrompt } = require("../dist/prompting/prompts/novel/worldMap.prompts.js");
const { promptAssetLoaderEntries } = require("../dist/prompting/registry/promptAssetLoaderEntries.js");
const {
  normalizeWorldMap,
  mergeAnnotation,
} = require("../dist/modules/novel/story-settings/application/WorldMapService.js");

function makeInput(overrides = {}) {
  return {
    novelTitle: "测试小说",
    terrainEmpty: true,
    scenes: [
      { name: "林家老宅", summary: "城东的老宅，主角的家。" },
      { name: "青云观山门", summary: "城外北山上的道观山门。" },
    ],
    ...overrides,
  };
}

function makeAnnotation(overrides = {}) {
  return {
    terrain: [],
    placements: [
      { sceneName: "林家老宅", x: 70, y: 60, kind: "building" },
      { sceneName: "青云观山门", x: 20, y: 30, kind: "wild" },
    ],
    unplaceable: [],
    ...overrides,
  };
}

const PENDING = [
  { id: "scene-1", name: "林家老宅", summary: "城东的老宅，主角的家。" },
  { id: "scene-2", name: "青云观山门", summary: "城外北山上的道观山门。" },
];

test("prompt 注册进 loader registry（novel.world.map_annotate@v4）", () => {
  const keys = promptAssetLoaderEntries.map((entry) => entry.key);
  assert.ok(keys.includes("novel.world.map_annotate@v4"), "缺少 novel.world.map_annotate@v4 注册");
});

test("postValidate 拒绝未知场景与遗漏决策；全部无法定位也合法", () => {
  const input = makeInput();
  assert.throws(() => worldMapAnnotatePrompt.postValidate(
    makeAnnotation({ placements: [{ sceneName: "不存在的场景", x: 10, y: 10 }] }),
    input,
  ), /不在待标注名单/);
  assert.throws(() => worldMapAnnotatePrompt.postValidate(
    makeAnnotation({ placements: [], unplaceable: [] }),
    input,
  ), /没有给出结论/);
  const allUnplaceable = worldMapAnnotatePrompt.postValidate(
    makeAnnotation({
      placements: [],
      unplaceable: [
        { sceneName: "林家老宅", reason: "描述不足" },
        { sceneName: "青云观山门", reason: "名字过于笼统" },
      ],
    }),
    input,
  );
  assert.equal(allUnplaceable.unplaceable.length, 2);
  // 放置 + 无法定位组合覆盖全部场景即可通过。
  const mixed = worldMapAnnotatePrompt.postValidate(
    makeAnnotation({
      placements: [{ sceneName: "林家老宅", x: 10, y: 10 }],
      unplaceable: [{ sceneName: "青云观山门", reason: "描述不足" }],
    }),
    input,
  );
  assert.equal(mixed.placements.length, 1);
});

test("地形只在 terrainEmpty 时允许输出；顶点数量由 schema 校验", () => {
  assert.throws(() => worldMapAnnotatePrompt.postValidate(
    makeAnnotation({ terrain: [{ type: "plain", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }] }),
    makeInput({ terrainEmpty: false }),
  ), /不允许再输出 terrain/);
  const withTerrain = worldMapAnnotatePrompt.postValidate(
    makeAnnotation({ terrain: [{ type: "water", points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }] }] }),
    makeInput({ terrainEmpty: true }),
  );
  assert.equal(withTerrain.terrain.length, 1);
  assert.throws(() => worldMapAnnotatePrompt.outputSchema.parse(
    makeAnnotation({ terrain: [{ type: "plain", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }] }),
  ));
});

test("outputSchema 接受完整标注、拒绝越界坐标与未知 kind", () => {
  const parsed = worldMapAnnotatePrompt.outputSchema.parse(makeAnnotation());
  assert.equal(parsed.placements.length, 2);
  assert.throws(() => worldMapAnnotatePrompt.outputSchema.parse(
    makeAnnotation({ placements: [{ sceneName: "林家老宅", x: 120, y: 60 }] }),
  ));
  assert.throws(() => worldMapAnnotatePrompt.outputSchema.parse(
    makeAnnotation({ placements: [{ sceneName: "林家老宅", x: 10, y: 10, kind: "country" }] }),
  ));
});

test("mergeAnnotation 为场景建节点（带 kind 与场景摘要）并记录无法定位", () => {
  const existing = normalizeWorldMap(null);
  const result = mergeAnnotation(existing, makeAnnotation({
    placements: [{ sceneName: "林家老宅", x: 70, y: 60, kind: "building" }],
    unplaceable: [{ sceneName: "青云观山门", reason: "名字过于笼统" }],
  }), PENDING);
  assert.equal(result.map.nodes.length, 1);
  assert.equal(result.map.nodes[0].kind, "building");
  assert.equal(result.map.nodes[0].summary, "城东的老宅，主角的家。");
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].sceneId, "scene-1");
  assert.equal(result.assignments[0].nodeId, result.map.nodes[0].id);
  assert.equal(result.unplaceable.length, 1);
  assert.equal(result.unplaceable[0].sceneId, "scene-2");
});

test("mergeAnnotation 同名地点沿用已有节点且不覆盖人工坐标", () => {
  const existing = normalizeWorldMap({
    nodes: [{ id: "place-1", name: "林家老宅", kind: "region", summary: "人工整理", x: 15, y: 15, tier: null }],
  });
  const result = mergeAnnotation(existing, makeAnnotation(), PENDING);
  assert.equal(result.map.nodes.length, 2, "同名沿用、新场景补建");
  const kept = result.map.nodes.find((node) => node.id === "place-1");
  assert.equal(kept.x, 15, "已有节点坐标不被覆盖");
  const assignment = result.assignments.find((item) => item.sceneName === "林家老宅");
  assert.equal(assignment.nodeId, "place-1", "场景挂点指向已有地点节点");
  const created = result.map.nodes.find((node) => node.name === "青云观山门");
  assert.equal(created.kind, "wild");
});

test("mergeAnnotation 地形只追加、已有地形保留", () => {
  const existing = normalizeWorldMap({
    terrain: [{ id: "t-old", type: "water", label: "旧海", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }] }],
    nodes: [],
  });
  const result = mergeAnnotation(existing, {
    placements: [],
    unplaceable: [],
    terrain: [
      { type: "plain", label: "中部平原", points: [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }] },
      { type: "mountain", points: [{ x: 82, y: 30 }, { x: 98, y: 40 }, { x: 90, y: 60 }] },
    ],
  }, []);
  assert.equal(result.map.terrain.length, 3, "旧地形保留+两块新地形追加");
  assert.ok(result.map.terrain.some((item) => item.id === "t-old"));
});

test("normalizeWorldMap 夹紧坐标、剔除悬空/自环/重复连线与重复 id", () => {
  const normalized = normalizeWorldMap({
    overview: "  总述  ",
    nodes: [
      { id: "a", name: "甲城", kind: "city", summary: "s", x: 130, y: -5, tier: "capital" },
      { id: "a", name: "重复id", kind: "city", summary: "s", x: 10, y: 10 },
      { id: "b", name: "乙镇", kind: "weird-kind", summary: "s", x: 40, y: "bad" },
      { id: "c", name: "丙哨站", kind: "wild", summary: "s", x: 60, y: 60 },
    ],
    edges: [
      { fromId: "a", toId: "b", label: "国道" },
      { fromId: "a", toId: "missing", label: "悬空" },
      { fromId: "c", toId: "c", label: "自环" },
      { fromId: "b", toId: "a", label: "重复" },
      { fromId: "b", toId: "c", label: "山道" },
    ],
  });
  assert.equal(normalized.overview, "总述");
  assert.equal(normalized.nodes.length, 3);
  const a = normalized.nodes.find((node) => node.id === "a");
  assert.equal(a.x, 100);
  assert.equal(a.y, 0);
  const b = normalized.nodes.find((node) => node.id === "b");
  assert.equal(b.kind, "other");
  assert.equal(b.y, null);
  assert.equal(normalized.edges.length, 2);
  assert.ok(normalized.edges.every((edge) => ["国道", "山道"].includes(edge.label)));
});

test("normalizeWorldMap 兼容旧 country kind 与旧格式/空输入", () => {
  const withCountry = normalizeWorldMap({
    nodes: [{ id: "c1", name: "大梁国", kind: "country", summary: "s", x: 30, y: 30 }],
  });
  assert.equal(withCountry.nodes[0].kind, "country");
  const legacy = normalizeWorldMap({
    nodes: [{ id: "old", name: "旧地点", kind: "city", summary: "旧数据" }],
    edges: [],
  });
  assert.equal(legacy.nodes[0].x, null);
  const empty = normalizeWorldMap(null);
  assert.deepEqual(empty, { overview: "", scaleKm: null, terrain: [], nodes: [], edges: [], childMaps: {} });
});

test("normalizeWorldMap 旧层级 childMaps 兼容读取：悬空挂点丢弃、超深丢弃", () => {
  const normalized = normalizeWorldMap({
    nodes: [{ id: "city-a", name: "甲城", kind: "city", summary: "", x: 50, y: 50, tier: null }],
    childMaps: {
      "city-a": {
        overview: "甲城内部",
        scaleKm: 20,
        nodes: [{ id: "gate", name: "南门", kind: "building", summary: "", x: 50, y: 80, tier: null }],
        edges: [],
        childMaps: {
          gate: {
            overview: "再深一层",
            nodes: [{ id: "too-deep", name: "深层", kind: "building", summary: "", x: 10, y: 10, tier: null }],
            edges: [],
            childMaps: {
              "too-deep": {
                overview: "第四层",
                nodes: [],
                edges: [],
              },
            },
          },
        },
      },
      "ghost-node": { overview: "悬空内部地图", nodes: [], edges: [] },
    },
  });
  assert.equal(normalized.scaleKm, null);
  const cityInner = normalized.childMaps["city-a"];
  assert.ok(cityInner, "旧层级数据保留（兼容读取）");
  assert.equal(cityInner.nodes[0].id, "gate");
  assert.deepEqual(cityInner.childMaps.gate.childMaps, {}, "第四层被深度上限丢弃");
  assert.equal(normalized.childMaps["ghost-node"], undefined, "悬空挂点（节点不存在）丢弃");
});
