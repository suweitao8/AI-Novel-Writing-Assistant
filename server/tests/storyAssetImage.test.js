const test = require("node:test");
const assert = require("node:assert/strict");

const { buildScenePanoramaPrompt } = require("../dist/modules/novel/story-settings/application/StoryAssetImageService.js");

test("场景全景提示词只允许空环境，不把怪物或人物画进场景", () => {
  const prompt = buildScenePanoramaPrompt({
    name: "末世血角兽猎场",
    environmentPrompt: "血红雾气中的荒原，远处有巨型带血角猛兽轮廓",
    timeOfDay: null,
    weather: null,
  }, []);

  assert.match(prompt, /pure empty environment reference/);
  assert.match(prompt, /no people/);
  assert.match(prompt, /no animals/);
  assert.match(prompt, /no monsters/);
  assert.match(prompt, /environmental traces/);
  assert.match(prompt, /strict three-zone equirectangular vertical layout with two fixed boundaries: the horizon line at v=0\.5 and the sky line at v=0\.3/);
  assert.match(prompt, /fully contained between v=0\.3 and v=0\.48 with a clean safety margin/);
  assert.match(prompt, /the lower half is not a perspective view of the space: it renders as one seamless floor material seen from directly above/);
  assert.match(prompt, /hard middle-line ceiling: the lowest point of every object/);
  assert.match(prompt, /lower ground zone v=0\.52-1\.0 \(the whole bottom half below v=0\.5\) contains only one continuous clean ground/);
  assert.match(prompt, /upper sky zone v=0\.0-0\.3 contains only clean sky or ceiling/);
  assert.match(prompt, /no object, furniture leg, hard contact fragment or large shadow crosses it/);
  assert.doesNotMatch(prompt, /NO characters or only tiny background figures/);
  // 室内强化行只在 sceneType=interior 时进入，未声明类型的旧调用不混入。
  assert.doesNotMatch(prompt, /interior rule: walls, windows, doors and all furniture/);
});

test("室内场景全景提示词追加强化行：家具与墙根不落下半区", () => {
  const prompt = buildScenePanoramaPrompt({
    name: "出租屋",
    environmentPrompt: "木地板，白墙，一张床靠墙",
    timeOfDay: null,
    weather: null,
    sceneType: "interior",
  }, []);

  assert.match(prompt, /interior composition: build the picture like a theater set poster in two flat layers/);
  // 2026-08-29：室内只画裸建筑，家具不入图、后续摆放 3D 模型。
  assert.match(prompt, /the room is completely unfurnished: no beds, tables, chairs, sofas, desks, cabinets, shelves, counters, stoves, rugs with objects or any other furniture or standing props anywhere on the backdrop or the floor/);
  assert.match(prompt, /furniture is placed later as separate 3D models in the scene editor/);
  assert.match(prompt, /background-only panorama: this image is a pure backdrop for a 3D scene/);
  assert.match(prompt, /the flooring swatch stays completely empty/);
  assert.match(prompt, /wall décor rule: anything framed or hung on the walls is decorative media/);
  assert.match(prompt, /photographs appear on walls only when the scene description explicitly mentions them/);
  assert.match(prompt, /each must sit inside a proper picture frame/);
  assert.match(prompt, /photo restraint: render at most one framed photograph unless the scene description explicitly names a larger amount/);
});

test("场景全景提示词把原始描述放在背景语境中，并在末尾收口前景排除规则", () => {
  const prompt = buildScenePanoramaPrompt({
    name: "空置猎场",
    environmentPrompt: "白墙、远处山体，房间里有一张床，前景有石头",
    timeOfDay: null,
    weather: null,
    sceneType: "interior",
  }, []);

  const contextIndex = prompt.indexOf("environment-only description:");
  const policyIndex = prompt.indexOf("background layer allowed content:");
  assert.ok(contextIndex >= 0, "原始环境描述必须保留为背景语境");
  assert.ok(policyIndex >= 0, "必须声明允许的背景内容");
  assert.ok(contextIndex < policyIndex, "共享分层规则必须位于原始场景描述之后");
  assert.match(prompt, /fixed non-interactive surfaces and architecture such as walls, ceilings, floor or terrain materials/);
  assert.match(prompt, /foreground exclusion is absolute: beds, tables, chairs, sofas, desks, cabinets, shelves, counters/);
  assert.match(prompt, /near-field natural-object exclusion is absolute: never render individual rocks, stones, boulders/);
  assert.match(prompt, /scene descriptions are background context only, not an object inventory/);
  assert.match(prompt, /白墙、远处山体，房间里有一张床，前景有石头/);
});
