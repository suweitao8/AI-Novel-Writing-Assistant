const test = require("node:test");
const assert = require("node:assert/strict");

// 世界地图（novel.world.map@v1 + WorldMapService 归一）：schema 边界、草稿 id 对齐、保存归一行为。

const { worldMapPrompt } = require("../dist/prompting/prompts/novel/worldMap.prompts.js");
const { promptAssetLoaderEntries } = require("../dist/prompting/registry/promptAssetLoaderEntries.js");
const {
  normalizeWorldMap,
  resolveDraftIds,
} = require("../dist/modules/novel/story-settings/application/WorldMapService.js");

function makeLocations(count) {
  return Array.from({ length: count }, (_, index) => ({
    name: `地点${index + 1}号`,
    kind: index % 2 === 0 ? "city" : "wild",
    summary: `这个世界里的关键地点${index + 1}，承担故事功能。`,
    x: 10 + index * 8,
    y: 20 + index * 6,
    tier: index === 0 ? "capital" : undefined,
  }));
}

test("prompt 注册进 loader registry（novel.world.map@v1）", () => {
  const keys = promptAssetLoaderEntries.map((entry) => entry.key);
  assert.ok(keys.includes("novel.world.map@v1"), "缺少 novel.world.map@v1 注册");
});

test("outputSchema 接受 3～12 个地点与坐标", () => {
  const parsed = worldMapPrompt.outputSchema.parse({
    overview: "末世废土：幸存者据点环绕危机四伏的城市废墟分布。",
    locations: makeLocations(5),
    paths: [{ fromName: "地点1号", toName: "地点2号", label: "南下商路" }],
  });
  assert.equal(parsed.locations.length, 5);
  assert.equal(parsed.locations[0].tier, "capital");
});

test("outputSchema 拒绝越界坐标与过少地点", () => {
  const base = { overview: "一段足够长的世界格局总述。", paths: [] };
  assert.throws(() => worldMapPrompt.outputSchema.parse({
    ...base,
    locations: makeLocations(2),
  }));
  assert.throws(() => worldMapPrompt.outputSchema.parse({
    ...base,
    locations: [{ ...makeLocations(1)[0], x: 120 }],
  }));
});

test("postValidate 拒绝悬空连线、重复地点与过近坐标", () => {
  const overview = "一段足够长的世界格局总述。";
  assert.throws(() => worldMapPrompt.postValidate({
    overview,
    locations: makeLocations(3),
    paths: [{ fromName: "地点1号", toName: "不存在的地点", label: "通路" }],
  }), /已存在的地点/);
  assert.throws(() => worldMapPrompt.postValidate({
    overview,
    locations: [...makeLocations(3), { ...makeLocations(1)[0], x: 80, y: 80 }],
    paths: [],
  }), /不能重复/);
  assert.throws(() => worldMapPrompt.postValidate({
    overview,
    locations: [
      { ...makeLocations(2)[0], x: 50, y: 50 },
      { ...makeLocations(2)[1], x: 52, y: 51 },
    ],
    paths: [],
  }), /过于接近/);
});

test("resolveDraftIds 同名沿用已有 id，新地点生成新 id", () => {
  const draft = {
    overview: "总述内容超过八个字，描述整体格局。",
    locations: makeLocations(3),
    paths: [{ fromName: "地点1号", toName: "地点3号", label: "东进干道" }],
  };
  const existing = [
    { id: "keep-me", name: "地点1号" },
    { id: "keep-too", name: "地点2号" },
  ];
  const resolved = resolveDraftIds(draft, existing);
  assert.equal(resolved.nodes[0].id, "keep-me");
  assert.equal(resolved.nodes[1].id, "keep-too");
  assert.notEqual(resolved.nodes[2].id, "keep-me");
  assert.equal(resolved.edges.length, 1);
  assert.equal(resolved.edges[0].fromId, "keep-me");
  assert.equal(resolved.edges[0].toId, resolved.nodes[2].id);
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

test("normalizeWorldMap 兼容旧格式（无坐标无 overview）与空输入", () => {
  const legacy = normalizeWorldMap({
    nodes: [{ id: "old", name: "旧地点", kind: "city", summary: "旧数据" }],
    edges: [],
  });
  assert.equal(legacy.overview, "");
  assert.equal(legacy.nodes[0].x, null);
  assert.equal(legacy.nodes[0].tier, null);
  assert.equal(legacy.scaleKm, null);
  assert.deepEqual(legacy.terrain, []);
  assert.deepEqual(legacy.childMaps, {});
  const empty = normalizeWorldMap(null);
  assert.deepEqual(empty, { overview: "", scaleKm: null, terrain: [], nodes: [], edges: [], childMaps: {} });
});

test("normalizeWorldMap 归一地形多边形：类型兜底、坐标夹紧、少于三点的丢弃", () => {
  const normalized = normalizeWorldMap({
    terrain: [
      { id: "t1", type: "water", label: "东海", points: [{ x: -10, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }] },
      { id: "t2", type: "volcano", label: "熔岩区", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }] },
      { id: "t3", type: "mountain", label: "北岭", points: [{ x: 0, y: 0 }, { x: 9, y: 9 }] },
    ],
  });
  assert.equal(normalized.terrain.length, 2);
  const water = normalized.terrain.find((item) => item.id === "t1");
  assert.equal(water.points[0].x, 0);
  const volcano = normalized.terrain.find((item) => item.id === "t2");
  assert.equal(volcano.type, "plain");
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
  assert.ok(gateInner, "第二层（城区级）保留");
  assert.deepEqual(gateInner.childMaps, {}, "第四层被深度上限丢弃");
  assert.equal(normalized.childMaps["ghost-node"], undefined, "悬空挂点（节点不存在）丢弃");
});
