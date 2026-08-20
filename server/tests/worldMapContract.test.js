const test = require("node:test");
const assert = require("node:assert/strict");

// 地图场景标注与生成（novel.world.map_annotate@v3 + WorldMapService 归一/合并）：
// schema 边界、postValidate 决策完备性、mergeAnnotation 只增不改、归一行为。

const { worldMapAnnotatePrompt } = require("../dist/prompting/prompts/novel/worldMap.prompts.js");
const { promptAssetLoaderEntries } = require("../dist/prompting/registry/promptAssetLoaderEntries.js");
const {
  normalizeWorldMap,
  mergeAnnotation,
  summarizeCountries,
} = require("../dist/modules/novel/story-settings/application/WorldMapService.js");

function makeInput(overrides = {}) {
  return {
    novelTitle: "测试小说",
    scenes: [
      { name: "林家老宅", summary: "城东的老宅，主角的家。" },
      { name: "青云宗山门", summary: "城外山上的宗门山门。" },
    ],
    ...overrides,
  };
}

function makeAnnotation(overrides = {}) {
  return {
    newCountries: [{ name: "大梁国", x: 40, y: 30 }],
    newCities: [{ name: "云京城", countryName: "大梁国", x: 50, y: 50 }],
    terrain: [],
    placements: [
      { sceneName: "林家老宅", countryName: "大梁国", cityName: "云京城", x: 70, y: 60 },
      { sceneName: "青云宗山门", countryName: "大梁国", cityName: "云京城", x: 20, y: 30 },
    ],
    unplaceable: [],
    ...overrides,
  };
}

test("prompt 注册进 loader registry（novel.world.map_annotate@v3）", () => {
  const keys = promptAssetLoaderEntries.map((entry) => entry.key);
  assert.ok(keys.includes("novel.world.map_annotate@v3"), "缺少 novel.world.map_annotate@v3 注册");
});

test("空场景（生成模式）：postValidate 要求至少一个国家、placements 必须为空", () => {
  const input = { novelTitle: "测试小说", scenes: [] };
  const base = { newCountries: [{ name: "大梁国", x: 40, y: 30 }], newCities: [{ name: "云京城", countryName: "大梁国", x: 50, y: 50 }] };
  const ok = worldMapAnnotatePrompt.postValidate({ ...base, placements: [], unplaceable: [], terrain: [] }, input);
  assert.equal(ok.newCountries.length, 1);
  // 生成模式不允许杜撰场景放置（场景名单为空）。
  assert.throws(() => worldMapAnnotatePrompt.postValidate({
    ...base,
    placements: [{ sceneName: "不存在的场景", countryName: "大梁国", cityName: "云京城", x: 10, y: 10 }],
    unplaceable: [],
    terrain: [],
  }, input), /不在待标注名单/);
  // 空地图空场景却一个国家都不给，直接拒绝（否则调用方拿到的地图与之前完全一样）。
  assert.throws(() => worldMapAnnotatePrompt.postValidate({ newCountries: [], newCities: [], placements: [], unplaceable: [], terrain: [] }, input), /至少规划一个国家/);
  // 生成模式允许并接受地形分区。
  const withTerrain = worldMapAnnotatePrompt.postValidate({
    ...base,
    placements: [],
    unplaceable: [],
    terrain: [{ type: "water", points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }] }],
  }, input);
  assert.equal(withTerrain.terrain.length, 1);
});

test("标注模式禁止输出地形；地形 schema 校验顶点数量", () => {
  const input = makeInput();
  assert.throws(() => worldMapAnnotatePrompt.postValidate(
    makeAnnotation({ terrain: [{ type: "plain", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }] }),
    input,
  ), /不允许输出地形/);
  assert.throws(() => worldMapAnnotatePrompt.outputSchema.parse(
    makeAnnotation({ terrain: [{ type: "plain", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }] }),
  ));
});

test("mergeAnnotation 生成模式合入地形多边形（只追加）", () => {
  const existing = normalizeWorldMap({
    terrain: [{ id: "t-old", type: "water", label: "旧海", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }] }],
    nodes: [],
  });
  const result = mergeAnnotation(existing, {
    newCountries: [{ name: "临江省", x: 50, y: 50 }],
    newCities: [{ name: "临江市", countryName: "临江省", x: 40, y: 40 }],
    placements: [],
    unplaceable: [],
    terrain: [
      { type: "plain", label: "中部平原", points: [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }] },
      { type: "mountain", points: [{ x: 82, y: 30 }, { x: 98, y: 40 }, { x: 90, y: 60 }] },
    ],
  }, []);
  assert.equal(result.map.terrain.length, 3, "旧地形保留+两块新地形追加");
  assert.ok(result.map.terrain.some((item) => item.id === "t-old"));
  assert.equal(result.map.nodes[0].name, "临江省");
});

test("outputSchema 接受完整标注并拒绝越界坐标", () => {
  const parsed = worldMapAnnotatePrompt.outputSchema.parse(makeAnnotation());
  assert.equal(parsed.placements.length, 2);
  assert.throws(() => worldMapAnnotatePrompt.outputSchema.parse(
    makeAnnotation({ placements: [{ sceneName: "林家老宅", countryName: "大梁国", cityName: "云京城", x: 120, y: 60 }] }),
  ));
});

test("postValidate 拒绝未知场景、未知国家与遗漏决策", () => {
  const input = makeInput();
  assert.throws(() => worldMapAnnotatePrompt.postValidate(
    makeAnnotation({ placements: [{ sceneName: "不存在的场景", countryName: "大梁国", cityName: "云京城", x: 10, y: 10 }] }),
    input,
  ), /不在待标注名单/);
  assert.throws(() => worldMapAnnotatePrompt.postValidate(
    makeAnnotation({ placements: [{ sceneName: "林家老宅", countryName: "未知国", cityName: "云京城", x: 10, y: 10 }] }),
    input,
  ), /不存在/);
  assert.throws(() => worldMapAnnotatePrompt.postValidate(
    makeAnnotation({ placements: [], unplaceable: [] }),
    input,
  ), /没有给出结论/);
  // 放置 + 无法定位覆盖全部场景即可通过。
  const ok = worldMapAnnotatePrompt.postValidate(
    makeAnnotation({ placements: [{ sceneName: "林家老宅", countryName: "大梁国", cityName: "云京城", x: 10, y: 10 }], unplaceable: [{ sceneName: "青云宗山门", reason: "描述不足" }] }),
    input,
  );
  assert.equal(ok.unplaceable.length, 1);
});

test("mergeAnnotation 新建国家/城市/地点并只增不改已有节点", () => {
  const existing = normalizeWorldMap({
    nodes: [{ id: "kept-country", name: "旧国", kind: "country", summary: "人工整理", x: 80, y: 80, tier: null }],
    edges: [],
  });
  const result = mergeAnnotation(existing, makeAnnotation(), [
    { id: "scene-1", name: "林家老宅" },
    { id: "scene-2", name: "青云宗山门" },
  ]);
  const country = result.map.nodes.find((node) => node.name === "大梁国");
  assert.ok(country, "新国家已加入世界层");
  assert.equal(country.kind, "country");
  const oldCountry = result.map.nodes.find((node) => node.id === "kept-country");
  assert.equal(oldCountry.x, 80, "已有节点坐标不被改动");
  const countryMap = result.map.childMaps[country.id];
  const city = countryMap.nodes.find((node) => node.name === "云京城");
  assert.ok(city, "新城市已加入国家层");
  const cityMap = countryMap.childMaps[city.id];
  assert.equal(cityMap.nodes.length, 2, "两个场景都放进城市层");
  assert.ok(cityMap.nodes.every((node) => node.kind === "building"));
  assert.equal(result.assignments.length, 2);
  assert.equal(result.assignments[0].nodeId, cityMap.nodes[0].id);
});

test("mergeAnnotation 同名国家/城市/地点沿用已有节点", () => {
  const existing = normalizeWorldMap({
    nodes: [{ id: "country-1", name: "大梁国", kind: "country", summary: "", x: 30, y: 30, tier: null }],
    childMaps: {
      "country-1": {
        nodes: [{ id: "city-1", name: "云京城", kind: "city", summary: "", x: 50, y: 40, tier: null }],
        childMaps: {
          "city-1": {
            nodes: [{ id: "place-1", name: "林家老宅", kind: "building", summary: "", x: 15, y: 15, tier: null }],
          },
        },
      },
    },
  });
  const result = mergeAnnotation(existing, makeAnnotation(), [
    { id: "scene-1", name: "林家老宅" },
    { id: "scene-2", name: "青云宗山门" },
  ]);
  const country = result.map.nodes.find((node) => node.id === "country-1");
  assert.equal(country.x, 30, "同名国家沿用（坐标不动）");
  assert.equal(result.map.nodes.filter((node) => node.name === "大梁国").length, 1, "不重复建国家");
  const cityMap = result.map.childMaps["country-1"].childMaps["city-1"];
  assert.equal(cityMap.nodes.length, 2, "同名地点沿用、新场景补建");
  const kept = cityMap.nodes.find((node) => node.id === "place-1");
  assert.equal(kept.x, 15, "同名地点坐标不被覆盖");
  const assignment = result.assignments.find((item) => item.sceneName === "林家老宅");
  assert.equal(assignment.nodeId, "place-1", "场景挂点指向已有地点节点");
});

test("mergeAnnotation 记录无法定位的场景", () => {
  const existing = normalizeWorldMap(null);
  const result = mergeAnnotation(existing, makeAnnotation({
    placements: [{ sceneName: "林家老宅", countryName: "大梁国", cityName: "云京城", x: 70, y: 60 }],
    unplaceable: [{ sceneName: "青云宗山门", reason: "名字过于笼统" }],
  }), [
    { id: "scene-1", name: "林家老宅" },
    { id: "scene-2", name: "青云宗山门" },
  ]);
  assert.equal(result.unplaceable.length, 1);
  assert.equal(result.unplaceable[0].sceneId, "scene-2");
  assert.equal(result.assignments.length, 1);
});

test("summarizeCountries 折叠国家→城市树（地点计数）", () => {
  const existing = normalizeWorldMap({
    nodes: [
      { id: "country-1", name: "大梁国", kind: "country", summary: "", x: 30, y: 30, tier: null },
      { id: "city-x", name: "孤立城市", kind: "city", summary: "", x: 10, y: 10, tier: null },
    ],
    childMaps: {
      "country-1": {
        nodes: [{ id: "city-1", name: "云京城", kind: "city", summary: "", x: 50, y: 40, tier: null }],
        childMaps: {
          "city-1": {
            nodes: [
              { id: "p1", name: "老宅", kind: "building", summary: "", x: 10, y: 10, tier: null },
              { id: "p2", name: "山门", kind: "building", summary: "", x: 20, y: 20, tier: null },
            ],
          },
        },
      },
    },
  });
  const summary = summarizeCountries(existing);
  const country = summary.find((item) => item.name === "大梁国");
  assert.deepEqual(country.cities, [{ name: "云京城", placeCount: 2 }]);
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

test("normalizeWorldMap 接受 country kind 并兼容旧格式/空输入", () => {
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

test("normalizeWorldMap 递归处理内部地图：悬空挂点丢弃、超深丢弃、scaleKm 归一", () => {
  const normalized = normalizeWorldMap({
    scaleKm: -5,
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
  assert.ok(cityInner, "真实节点的内部地图保留");
  assert.equal(cityInner.scaleKm, 20);
  assert.equal(cityInner.nodes[0].id, "gate");
  const gateInner = cityInner.childMaps.gate;
  assert.ok(gateInner, "第二层（城市级）保留");
  assert.deepEqual(gateInner.childMaps, {}, "第四层被深度上限丢弃");
  assert.equal(normalized.childMaps["ghost-node"], undefined, "悬空挂点（节点不存在）丢弃");
});
