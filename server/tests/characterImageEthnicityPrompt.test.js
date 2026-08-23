const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CHARACTER_IMAGE_ETHNICITY_CONSTRAINT,
  appendCharacterImageEthnicityConstraint,
  buildCharacterImagePrompt,
} = require("@ai-novel/shared/imagePrompt");
const { buildImageGenerationRequestBody } = require("../dist/services/image/provider.js");
const { buildCharacterStateSheetPrompt } = require("../dist/services/drama/visual/characterStateSheet.js");

const providerSource = fs.readFileSync(path.join(__dirname, "../src/services/image/provider.ts"), "utf8");
const comicSource = fs.readFileSync(path.join(__dirname, "../src/services/comic/ComicCharacterImageService.ts"), "utf8");
const imageServiceSource = fs.readFileSync(path.join(__dirname, "../src/services/image/ImageGenerationService.ts"), "utf8");
const imagePromptSource = fs.readFileSync(path.join(__dirname, "../src/prompting/prompts/image/image.prompts.ts"), "utf8");
const promptRegistrySource = fs.readFileSync(path.join(__dirname, "../src/prompting/registry/promptAssetLoaderEntries.ts"), "utf8");

test("shared ethnicity constraint is non-empty and idempotent", () => {
  assert.match(CHARACTER_IMAGE_ETHNICITY_CONSTRAINT, /中国|Chinese/);
  const once = appendCharacterImageEthnicityConstraint("画一个角色");
  assert.equal(appendCharacterImageEthnicityConstraint(once), once);
  const padded = `  ${once}  `;
  assert.equal(appendCharacterImageEthnicityConstraint(padded), padded);
});

test("character state and legacy character prompts expose the identity constraint", () => {
  const statePrompt = buildCharacterStateSheetPrompt({
    assetName: "林澈",
    gender: "male",
    ageGroup: "youth",
    appearance: "黑色短发，清瘦",
    stateLabel: "默认",
    stateDescription: "正常状态",
    stateImagePrompt: "干净衣着",
  }, []);
  const legacyPrompt = buildCharacterImagePrompt({
    prompt: "角色立绘",
    character: { name: "林澈", role: "主角", personality: "冷静", background: "现代都市" },
  });
  assert.match(statePrompt, /中国|Chinese|East Asian/);
  assert.match(legacyPrompt, /中国|Chinese|East Asian/);
});

test("provider appends the constraint only to character scene types", () => {
  const base = { provider: "codex", model: "gpt-image-1", prompt: "画一个人物", size: "1024x1024", count: 1 };
  const character = buildImageGenerationRequestBody({ ...base, sceneType: "character" });
  const bookAnalysis = buildImageGenerationRequestBody({ ...base, sceneType: "book_analysis_character" });
  const scene = buildImageGenerationRequestBody({ ...base, sceneType: "chapter_illustration" });
  const creature = buildImageGenerationRequestBody({ ...base, prompt: "明确的非人怪物设计", sceneType: "character" });
  assert.match(String(character.prompt), /中国|Chinese|East Asian/);
  assert.match(String(bookAnalysis.prompt), /中国|Chinese|East Asian/);
  assert.match(String(creature.prompt), /explicitly non-human creature remains non-human/);
  assert.doesNotMatch(String(scene.prompt), /HUMAN CHARACTER ETHNICITY LOCK/);
});

test("provider protects both JSON and reference-edit paths and character services use the contract", () => {
  assert.equal((providerSource.match(/buildPrompt\(input\.prompt, input\.negativePrompt, input\.sceneType\)/g) ?? []).length, 2);
  assert.match(comicSource, /appendCharacterImageEthnicityConstraint|CHARACTER_IMAGE_ETHNICITY_CONSTRAINT/);
  assert.match(imageServiceSource, /appendCharacterImageEthnicityConstraint/);
  assert.match(imagePromptSource, /id:\s*"image\.character\.prompt_optimize"[\s\S]*?version:\s*"v3"/);
  assert.match(promptRegistrySource, /key:\s*"image\.character\.prompt_optimize@v3"/);
});
