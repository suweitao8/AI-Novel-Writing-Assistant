const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDramaCharacterSheetPrompt } = require("../dist/services/drama/DramaCharacterImageService.js");

test("drama character sheets reuse the canonical four-panel production board contract", () => {
  const prompt = buildDramaCharacterSheetPrompt(
    {
      name: "叶晨",
      archetype: "末世重生男主",
      persona: "冷静、克制",
      visualAnchor: JSON.stringify({
        description: "青年男性，深色短发，精瘦结实，五官俊朗",
      }),
    },
    ["虚幻引擎5级写实3D电影渲染"],
  );

  assert.match(prompt, /ONE production character reference board/);
  assert.match(prompt, /four equal-width vertical panels/);
  assert.match(prompt, /PANEL 1.*front face close-up/is);
  assert.match(prompt, /PANEL 2.*exact 90-degree side face close-up/is);
  assert.match(prompt, /PANEL 3.*front full body/is);
  assert.match(prompt, /PANEL 4.*back full body/is);
  assert.match(prompt, /handsome, commercially appealing leading-man protagonist/i);
  assert.match(prompt, /青年男性，深色短发，精瘦结实，五官俊朗/);
  assert.match(prompt, /虚幻引擎5级写实3D电影渲染/);
  assert.doesNotMatch(prompt, /摄影棚布光/);
  assert.doesNotMatch(prompt, /专业戏服设计/);
});
