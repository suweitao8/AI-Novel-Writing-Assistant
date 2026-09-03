const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const runnerSource = fs.readFileSync(
  path.join(__dirname, "run_native_animation_import.cjs"),
  "utf8",
);

test("原生 UE5 导入入口只发布 Anim57 四条徒手攻击动作，并固定原生待机基础姿势", () => {
  assert.match(runnerSource, /target !== "UE5-native"/);
  assert.match(runnerSource, /sourceProject !== "Anim57"/);
  assert.match(runnerSource, /selection\.clips\.length !== 4/);
  assert.match(runnerSource, /SOURCE_ROOT = "\/Game\/Characters\/Mannequins\/Anims\/Unarmed\/Attack"/);
  assert.match(runnerSource, /EXPECTED_SKELETON = "\/Game\/Characters\/Mannequins\/Meshes\/SK_Mannequin\.SK_Mannequin"/);
  assert.match(runnerSource, /BASE_POSE_SOURCE = "\/Game\/Characters\/Mannequins\/Anims\/Unarmed\/MM_Idle"/);
  assert.match(runnerSource, /nativeBasePose/);
});

test("原生导入使用 UE GLTFExporter 和成对 Manny/Quinn 输出，不调用旧重定向脚本", () => {
  assert.match(runnerSource, /export_ue5_native_character_assets\.py/);
  assert.match(runnerSource, /CINE57_ANIMATION_NATIVE_OUTPUT_DIR/);
  assert.match(runnerSource, /UE5_Manny_Animations\.glb/);
  assert.match(runnerSource, /UE5_Quinn_Animations\.glb/);
  assert.doesNotMatch(runnerSource, /retarget_ual2\.py/);
  assert.doesNotMatch(runnerSource, /UAL2_AnimationBase\.glb/);
});

test("原生导入分别对两套同骨架成品运行目录质量门禁", () => {
  assert.match(runnerSource, /verify-manny\.log/);
  assert.match(runnerSource, /verify-quinn\.log/);
  assert.match(runnerSource, /nativeAssemblyManifest/);
});
