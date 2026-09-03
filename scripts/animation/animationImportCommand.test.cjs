const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const runnerSource = fs.readFileSync(
  path.join(__dirname, "run_animation_import.cjs"),
  "utf8",
);

test("UE 导出命令必须把本次运行的清单和 FBX 目录传给 Python 环境", () => {
  assert.match(
    runnerSource,
    /CINE57_ANIMATION_SELECTION/,
    "UE Python 导出必须显式收到本次 runs 的 staged selection",
  );
  assert.match(
    runnerSource,
    /CINE57_ANIMATION_OUTPUT_DIR/,
    "UE Python 导出必须显式收到本次 runs 的 FBX 输出目录",
  );
});

test("运行入口必须支持文档中的连字符参数名", () => {
  assert.match(
    runnerSource,
    /replace\(\/\-\(\[a-z\]\)\/g/,
    "--run-id 等文档参数必须映射到 runId 等运行时字段",
  );
});

test("最终清单必须回填 root-motion 的实际位移证据", () => {
  assert.match(
    runnerSource,
    /measureRootTranslation/,
    "导入完成后必须读取最终 GLB 的 root translation 轨道",
  );
  assert.match(
    runnerSource,
    /rootTranslationMaxRangeMeters/,
    "前端目录必须携带每条动作的根位移范围证据",
  );
  assert.match(
    runnerSource,
    /auditedClipCount: selection\.clips\.length/,
    "清单审计统计必须反映本次实际验收条数",
  );
});

test("运行入口使用统一的 UAL2 兼容基础包，不会误把旧 C57 动画当基础内容", () => {
  assert.match(
    runnerSource,
    /UAL2_AnimationBase\.glb/,
    "导入默认基础包必须是已剪枝的 UAL2 兼容基础包",
  );
});
