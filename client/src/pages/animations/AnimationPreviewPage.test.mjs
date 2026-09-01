import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageDir = import.meta.dirname;
const pageSource = readFileSync(
  path.join(pageDir, "AnimationPreviewPage.tsx"),
  "utf8",
);
const librarySource = readFileSync(
  path.join(pageDir, "AnimationLibraryPage.tsx"),
  "utf8",
);
const routerSource = readFileSync(
  path.join(pageDir, "..", "..", "router", "index.tsx"),
  "utf8",
);
const blockingPageSource = readFileSync(
  path.join(pageDir, "..", "drama", "comicDrama", "DramaBlocking3DPage.tsx"),
  "utf8",
);

test("动画入口卡片跳转到独立预览路由，而不是打开弹窗", () => {
  assert.match(librarySource, /<Link/);
  assert.match(librarySource, /to=\{`\/animations\/\$\{entry\.id\}`\}/);
  assert.doesNotMatch(librarySource, /Dialog|openAnimationPreview/);
  assert.match(routerSource, /path: "animations\/:animationId"/);
});

test("独立预览页提供可访问帧轴和关键帧保存流程", () => {
  assert.match(pageSource, /useParams/);
  assert.match(pageSource, /import \{ Switch \} from "@\/components\/ui\/switch"/);
  assert.match(pageSource, /data-animation-preview-page/);
  assert.match(pageSource, /data-animation-preview-canvas/);
  assert.match(pageSource, /type="range"/);
  assert.match(pageSource, /aria-label=\{`\$\{entry\.name\} 帧轴`\}/);
  assert.match(pageSource, /viewer\?\.setFrame\(/);
  assert.match(pageSource, /const \[loop, setLoop\] = useState\(true\)/);
  assert.match(pageSource, /loop: true/);
  assert.match(pageSource, /isLooping\(\)/);
  assert.match(pageSource, /viewerRef\.current\?\.setLoop\(nextLoop\)/);
  assert.match(
    pageSource,
    /<Switch[\s\S]*checked=\{loop\}[\s\S]*onCheckedChange=\{handleLoopChange\}/,
  );
  assert.match(pageSource, /step="1"/);
  assert.match(pageSource, /第 \{displayFrame\} 帧 \/ 共 \{displayFrameCount\} 帧/);
  assert.doesNotMatch(pageSource, /时间轴|秒|timeSeconds|setTime/);
  assert.match(pageSource, /capturePreviewFrame\(\)/);
  assert.match(pageSource, /setAnimationKeyframe\(/);
  assert.match(pageSource, /clearAnimationKeyframe\(/);
  assert.match(
    pageSource,
    /clearAnimationKeyframe\(entry\.id\);[\s\S]*capturePreviewFrame\(\)/,
  );
  assert.match(pageSource, /viewer\?\.fitView\(\)/);
  assert.match(pageSource, /viewer\?\.resetView\(\)/);
  assert.match(pageSource, /重新加载/);
  assert.match(pageSource, /handle\?\.cancel\(\)/);
});

test("动画详情不与主预览并发创建独立 HDRI 缩略图上下文", () => {
  assert.match(pageSource, /disposeAnimationThumbnailStudio\(\)/);
  assert.doesNotMatch(
    pageSource,
    /if \(!getAnimationKeyframe\(entry\.id, entry\.frameRate\)\) ensureAnimationThumbnail\(entry\)/,
  );
  assert.match(
    pageSource,
    /if \(!initialKeyframe\)[\s\S]*capturePreviewFrame\(\)/,
  );
  const disposeIndex = pageSource.indexOf("await disposeAnimationThumbnailStudio()");
  const openIndex = pageSource.indexOf("handle = openAnimationPreview(");
  assert.ok(
    disposeIndex >= 0 && openIndex > disposeIndex,
    "详情页必须等待缩略图工作室结束后再创建可见 HDRI 预览",
  );
});

test("离开动画库列表时释放缩略图 HDRI 工作室", () => {
  assert.match(
    librarySource,
    /useEffect\(\(\) => \{\s*return \(\) => \{\s*void disposeAnimationThumbnailStudio\(\);/,
  );
});

test("分镜姿势下拉只呈现当前统一 UAL2 文件支持的选项", () => {
  assert.match(blockingPageSource, /getAvailablePoses\(\)/);
  assert.match(blockingPageSource, /availablePoses\.map\(\(pose\)/);
});
