import assert from "node:assert/strict";
import test from "node:test";

import {
  getPngOutputUrl,
  rewriteCatalogMaterials,
} from "./rebuild-cine57-alpha-assets.mjs";

test("透明 baseColor 的发布路径会切换到 PNG", () => {
  assert.equal(
    getPngOutputUrl("/models/cine57/tex/grass.jpg"),
    "/models/cine57/tex/grass.png",
  );
  assert.equal(
    getPngOutputUrl("/models/cine57/tex/grass.jpeg"),
    "/models/cine57/tex/grass.png",
  );
});

test("只重写生成目录中的 baseColor 及其同源 opacity", () => {
  const source = [
    "  { id: \"grass\", materials: {\"MI_Grass\":{\"baseColor\":\"/models/cine57/tex/grass.jpg\"}}, fileName: \"SM_Grass_a.glb\" },",
    "  { id: \"opaque\", materials: {\"MI_Opaque\":{\"baseColor\":\"/models/cine57/tex/chair.jpg\",\"opacity\":\"/models/cine57/tex/chair-mask.png\"}}, fileName: \"SM_Chair.glb\" },",
  ].join("\n");

  const replacements = new Map([
    ["/models/cine57/tex/grass.jpg", "/models/cine57/tex/grass.png"],
  ]);
  const rewritten = rewriteCatalogMaterials(source, replacements, {
    "/models/cine57/tex/grass.jpg": { preserveAlpha: true },
  });

  assert.match(rewritten, /"baseColor":"\/models\/cine57\/tex\/grass\.png"/);
  assert.match(rewritten, /"opacity":"\/models\/cine57\/tex\/grass\.png"/);
  assert.match(rewritten, /"baseColor":"\/models\/cine57\/tex\/chair\.jpg"/);
  assert.match(rewritten, /"opacity":"\/models\/cine57\/tex\/chair-mask\.png"/);
});

test("已经是 PNG 的透明 baseColor 也会补齐 PlayCanvas opacityMap", () => {
  const outputUrl = "/models/cine57/tex/grass.png";
  const source = `  { id: "grass", materials: {"MI_Grass":{"baseColor":${JSON.stringify(outputUrl)}}}, },`;
  const rewritten = rewriteCatalogMaterials(source, new Map([[outputUrl, outputUrl]]), {
    [outputUrl]: { preserveAlpha: true },
  });

  assert.match(rewritten, /"baseColor":"\/models\/cine57\/tex\/grass\.png","opacity":"\/models\/cine57\/tex\/grass\.png"/);
});
