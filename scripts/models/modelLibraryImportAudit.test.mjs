import assert from "node:assert/strict";
import test from "node:test";

import {
  collectCatalogBaseColorTextures,
  getPngOutputUrl,
  parseSourceAlphaProbe,
  rewriteCatalogAlphaMappings,
  shouldRepairAlphaTexture,
} from "./modelLibraryImportAudit.mjs";

test("FFmpeg 的等号和冒号输出都会保留源贴图 alpha", () => {
  const equalRecord = parseSourceAlphaProbe({
    ffprobeOutput: JSON.stringify({ streams: [{ pix_fmt: "rgba" }] }),
    ffmpegOutput: "lavfi.signalstats.YMIN=0",
  });
  const colonRecord = parseSourceAlphaProbe({
    ffprobeOutput: JSON.stringify({ streams: [{ pix_fmt: "rgba" }] }),
    ffmpegOutput: "YMIN: 0",
  });

  assert.equal(equalRecord.preserveAlpha, true);
  assert.equal(colonRecord.preserveAlpha, true);
  assert.equal(getPngOutputUrl("/models/cine57/tex/grass.jpg"), "/models/cine57/tex/grass.png");
  assert.equal(shouldRepairAlphaTexture({ ...equalRecord, outputFormat: "jpg" }), true);
});

test("目录会按 Base Color URL 去重并保留引用模型", () => {
  const textures = collectCatalogBaseColorTextures([
    {
      id: "grass-a",
      fileUrl: "/models/cine57/grass-a.glb",
      materials: { MI_Grass: { baseColor: "/models/cine57/tex/grass.jpg" } },
    },
    {
      id: "grass-b",
      fileUrl: "/models/cine57/grass-b.glb",
      materials: { MI_Grass: { baseColor: "/models/cine57/tex/grass.jpg" } },
    },
  ]);

  assert.deepEqual([...textures.values()], [{
    outputUrl: "/models/cine57/tex/grass.jpg",
    sourceName: "grass.png",
    references: [
      { modelId: "grass-a", materialName: "MI_Grass" },
      { modelId: "grass-b", materialName: "MI_Grass" },
    ],
  }]);
});

test("芝麻菜 Base Color alpha 修复会同时生成 PNG 和 opacity 映射", () => {
  const oldUrl = "/models/cine57/tex/_EnvVillage_UltimateFarming_Textures_T_Atlas_07_Basecolor.T_Atlas_07_Basecolor_baseColor.jpg";
  const newUrl = getPngOutputUrl(oldUrl);
  const source = `materials: {"MI_Arugula_Leafs":{"baseColor":${JSON.stringify(oldUrl)}}}`;
  const rewritten = rewriteCatalogAlphaMappings(
    source,
    new Map([[oldUrl, newUrl]]),
    { [oldUrl]: { preserveAlpha: true } },
  );

  assert.match(rewritten, /baseColor[^}]+\.png/);
  assert.match(rewritten, /opacity[^}]+\.png/);
});
