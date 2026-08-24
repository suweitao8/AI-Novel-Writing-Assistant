# 漫剧分镜参考图与场景光照一致性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让分镜首帧真正上传镜头所需的全部角色/场景/道具参考图，并用场景状态图建立跨镜头稳定的光照契约。

**Architecture:** 在 `services/image` 内把 URL/data URL/本地路径统一准备成有序本地文件，Provider 通过 multipart 一次上传全部附件；Codex 桥接器只消费 multipart，并显示附件标签。分镜视觉层新增纯函数光照契约，最终追加到首帧 Prompt，批量任务的参考图默认与恢复行为保持开启。

**Tech Stack:** TypeScript、Node 20 `fetch`/`FormData`、Codex Image Bridge、Node `node:test`、现有 Prompt Registry、Prisma 只读查询。

---

### Task 1: 锁定多参考图传输行为的失败测试

**Files:**
- Create: `server/tests/imageProviderReferences.test.js`
- Modify: `server/src/services/image/types.ts`
- Modify: `server/src/services/image/runtime/types.ts`
- Modify: `server/src/services/image/runtime/runner.ts`
- Test: `server/tests/imageProviderRouting.test.js`

- [ ] **Step 1: Write the failing tests**

在 `server/tests/imageProviderReferences.test.js` 中先写以下契约测试。测试使用 data URL，避免数据库和外部网络：

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateImagesByProvider } = require("../dist/services/image/provider.js");

test("Codex reference generation uploads every ordered reference image", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ data: [{ b64_json: "AAAA" }] }) };
  };
  try {
    await generateImagesByProvider({
      sceneType: "chapter_illustration",
      provider: "codex",
      model: "gpt-image-2",
      prompt: "分镜首帧",
      size: "1536x864",
      count: 1,
      refImages: [
        "data:image/png;base64,iVBORw0KGgo=",
        "data:image/png;base64,iVBORw0KGgo=",
        "data:image/png;base64,iVBORw0KGgo=",
      ],
      referenceImages: [
        { kind: "asset", label: "叶晨 · 默认状态图" },
        { kind: "asset", label: "叶竹 · 默认状态图" },
        { kind: "scene", label: "叶晨大学出租屋 · 默认状态图" },
      ],
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://127.0.0.1:18766/v1/images/edits");
    assert.equal(requests[0].options.body.getAll("image").length, 3);
    assert.deepEqual(
      JSON.parse(requests[0].options.body.get("reference_labels")),
      ["叶晨 · 默认状态图", "叶竹 · 默认状态图", "叶晨大学出租屋 · 默认状态图"],
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("reference preparation failure aborts before a prompt-only request", async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    return { ok: true, json: async () => ({ data: [{ b64_json: "AAAA" }] }) };
  };
  try {
    await assert.rejects(
      generateImagesByProvider({
        sceneType: "chapter_illustration",
        provider: "codex",
        model: "gpt-image-2",
        prompt: "分镜首帧",
        size: "1536x864",
        count: 1,
        refImages: ["/api/novels/missing/settings/state-images/scene/x/y"],
      }),
      /参考图|reference/i,
    );
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});
```

在 `server/tests/imageProviderRouting.test.js` 里补充：显式指定 `grok` 且传入参考图必须抛出“不支持参考图”的错误；`grok_build` 的既有路由测试继续保留。

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm --filter @ai-novel/server prisma:generate
pnpm --filter @ai-novel/server build
node --test server/tests/imageProviderReferences.test.js server/tests/imageProviderRouting.test.js
```

Expected: 新增 multipart 测试失败，因为当前 Provider 只使用第一条路径/URL并走 JSON，`reference_labels` 不存在；失败前不要修改生产代码。

- [ ] **Step 3: Add the runtime metadata type needed by the request**

在 `server/src/services/image/types.ts` 的 `ImageProviderGenerateInput` 增加：

```ts
referenceImages?: Array<{ kind: string; label: string }>;
```

在 `server/src/services/image/runtime/runner.ts` 调用 `generateImagesByProvider` 时透传 `opts.referenceImages`。只使用类型字段，不改变状态持久化结构。

- [ ] **Step 4: Run the same focused tests again**

Run the command from Step 2. Expected: tests仍在参考文件准备/Provider multipart部分失败，说明测试已经进入正确的实现边界。

---

### Task 2: 实现有序参考文件准备和 Provider 多附件上传

**Files:**
- Create: `server/src/services/image/referenceImageFiles.ts`
- Modify: `server/src/services/image/provider.ts`
- Modify: `server/src/services/image/types.ts`
- Modify: `server/src/services/image/runtime/runner.ts`
- Test: `server/tests/imageProviderReferences.test.js`

- [ ] **Step 1: Write the reference file preparation contract**

在 `referenceImageFiles.ts` 定义以下接口和行为：

```ts
export interface PreparedReferenceImageFiles {
  filePaths: string[];
  cleanup: () => Promise<void>;
}

export async function prepareReferenceImageFiles(input: {
  refImagePaths?: readonly string[];
  refImages?: readonly string[];
  signal?: AbortSignal;
}): Promise<PreparedReferenceImageFiles>;
```

实现要求：

1. `refImagePaths` 有值时逐个 `fs.access`，保留全部顺序；不存在立即抛错。
2. 没有本地路径时逐个处理 `refImages`：`data:` 解码到临时文件；`http(s):` 使用带 `signal` 的 `fetch`；相对 `/api/...` URL 使用 `IMAGE_REFERENCE_BASE_URL`，未配置时使用 `http://127.0.0.1:${process.env.PORT ?? 3000}`。
3. 响应非 2xx、内容为空或无法识别为图片时抛出包含参考图序号和来源 URL 的错误；不能返回空列表继续生成。
4. 临时目录使用 `fs.mkdtemp(path.join(os.tmpdir(), "ai-novel-image-reference-"))`，所有成功或失败路径都通过 `cleanup` 删除；调用方在 `finally` 中执行清理。
5. 不读取数据库、不修改资产文件、不对 URL 做关键词替换；该模块只负责传输准备。

- [ ] **Step 2: Implement multipart upload for all prepared files**

在 `provider.ts`：

1. 删除 `requestBody.input_image_url = input.refImages[0]` 逻辑。
2. 将 `generateWithFileRef` 的入参由单个 `refImagePath` 改为 `readonly string[]`，对每个路径读取并执行：

```ts
form.append("image", new Blob([fileBuffer], { type: inferMimeType(filePath) }), path.basename(filePath));
```

3. 参考图标签存在时追加：

```ts
form.append("reference_labels", JSON.stringify((input.referenceImages ?? []).map((item) => item.label)));
```

4. 在 `generateImagesByProvider` 中创建请求控制器后调用 `prepareReferenceImageFiles`；有参考图时统一走 `/images/edits`，成功、失败、取消都在 `finally` 清理临时目录。没有参考图时才走 `/images/generations`。
5. `assertImageProviderReferenceSupport` 对 `grok_build` 和 `grok` 都拒绝参考图，错误必须明确写出 Provider 不支持；不得回落到 prompt-only 请求。
6. `referenceImages` 只作为标签输入，不把 URL 再拼回 prompt；运行时仍由 `runner` 保存成功生成的引用元数据。

- [ ] **Step 3: Run focused tests to verify the implementation passes**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/imageProviderReferences.test.js server/tests/imageProviderRouting.test.js
```

Expected: 两个 Provider 测试文件全部 PASS；请求捕获结果只能有一个 `/images/edits` 请求，且 `getAll("image")` 数量等于参考图数量。

- [ ] **Step 4: Add local path regression coverage**

在同一测试文件创建一个临时 PNG 文件，传入三个 `refImagePaths`，断言 multipart 包含三个 `image` 文件；测试结束删除临时文件。该测试锁住此前 `input.refImagePaths?.[0]` 的回归。

- [ ] **Step 5: Run typecheck for the touched server modules**

Run:

```powershell
pnpm --filter @ai-novel/server typecheck
```

Expected: 当前分支新增代码不产生 TypeScript 错误；若仍有仓库基线错误，记录错误文件和是否触及本次改动，不扩大修复范围。

---

### Task 3: 让 Codex 桥接器消费全部附件并暴露实际数量

**Files:**
- Modify: `scripts/codex-image-bridge.cjs`
- Create: `scripts/codex-image-bridge.test.cjs`

- [ ] **Step 1: Write bridge contract tests**

测试从源码导出/调用纯函数（必要时把 `parseMultipart`、`buildAgentPrompt` 提取为带 `module.exports` 的测试接口），验证：

```js
test("multipart bridge keeps every image part and labels them in order", () => {
  const parsed = parseMultipart(contentType, multipartBodyWithThreeImages);
  assert.equal(parsed.files.length, 3);
  assert.deepEqual(JSON.parse(parsed.fields.reference_labels), ["叶晨", "叶竹", "场景"]);
  const prompt = buildAgentPrompt({
    hasReferences: true,
    referenceLabels: ["叶晨", "叶竹", "场景"],
    aspectRatio: "16:9",
    imageSize: "1K",
    prompt: "分镜首帧",
  });
  assert.match(prompt, /1\. 叶晨/);
  assert.match(prompt, /2\. 叶竹/);
  assert.match(prompt, /3\. 场景/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test scripts/codex-image-bridge.test.cjs
```

Expected: `buildAgentPrompt` 尚未输出标签清单，或测试接口尚未导出，得到明确失败。

- [ ] **Step 3: Implement bridge label parsing and prompt manifest**

在 `codex-image-bridge.cjs`：

1. multipart 解析后读取 `fields.reference_labels`，严格解析为字符串数组，非法值视为空数组。
2. 把 `referenceLabels` 传入 `generateOne`、`generateCodexImage` 和 `buildAgentPrompt`。
3. `buildAgentPrompt` 在参考图说明后追加“附件顺序与用途”清单；没有标签时仍保留通用参考图说明。
4. JSON `POST /v1/images/generations` 如果收到 `input_image_url`，返回明确错误 `reference_images_require_multipart_edits`，防止未来又静默丢参考图。
5. 日志同时输出 `refs=<实际文件数量>` 和标签数量；实际文件数量来自 `references.length`，不来自持久化元数据。

- [ ] **Step 4: Run bridge tests and source-level checks**

Run:

```powershell
node --test scripts/codex-image-bridge.test.cjs
node --check scripts/codex-image-bridge.cjs
```

Expected: tests PASS，桥接器语法检查 PASS。

---

### Task 4: 建立场景光照契约并接入首帧 Prompt v2

**Files:**
- Create: `server/src/services/drama/visual/sceneLightingContract.ts`
- Modify: `server/src/prompting/prompts/drama/shotKeyframe.prompts.ts`
- Modify: `server/src/prompting/registry/promptAssetLoaderEntries.ts`
- Modify: `server/src/services/drama/visual/DramaShotKeyframeService.ts`
- Create: `server/tests/dramaSceneLightingContract.test.js`
- Modify: `server/tests/dramaShotKeyframeBlockingSketch.test.js`

- [ ] **Step 1: Write pure lighting contract tests**

在 `dramaSceneLightingContract.test.js` 先写：

```js
const { buildSceneLightingContract, buildSceneLightingAvoidInstructions } = require(
  "../dist/services/drama/visual/sceneLightingContract.js",
);

test("scene state image is the sole lighting anchor", () => {
  const text = buildSceneLightingContract({
    sceneName: "叶晨大学出租屋",
    stateLabel: "默认",
    sceneType: "interior",
    timeOfDay: "morning",
    weather: "cloudy",
    hasReferenceImage: true,
  });
  assert.match(text, /场景光照契约/);
  assert.match(text, /状态图.*唯一|唯一.*状态图/);
  assert.match(text, /光源方向|色温|阴影/);
  assert.match(buildSceneLightingAvoidInstructions(), /暖黄|冷蓝|血红|霓虹/);
});

test("scene without a state image does not claim an image anchor", () => {
  const text = buildSceneLightingContract({
    sceneName: "公交站",
    sceneType: "exterior",
    timeOfDay: "night",
    weather: "rainy",
    hasReferenceImage: false,
  });
  assert.doesNotMatch(text, /状态图中的/);
  assert.match(text, /夜|雨/);
});
```

在 `dramaShotKeyframeBlockingSketch.test.js` 增加源码契约：Prompt 使用 v2，光照契约在 `visualPrompt` 与角色内容之后传入，摆位草图仍是第一张参考图。

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/dramaSceneLightingContract.test.js server/tests/dramaShotKeyframeBlockingSketch.test.js
```

Expected: 新模块不存在或 Prompt 没有 `lightingContract` 字段，测试失败。

- [ ] **Step 3: Implement the pure lighting contract**

`sceneLightingContract.ts` 导出：

```ts
export interface SceneLightingContractInput {
  sceneName: string;
  stateLabel?: string | null;
  sceneType?: string | null;
  timeOfDay?: string | null;
  weather?: string | null;
  hasReferenceImage: boolean;
}

export function buildSceneLightingContract(input: SceneLightingContractInput): string;
export function buildSceneLightingAvoidInstructions(): string;
```

有状态图时明确“以场景状态图为唯一光照基准”；无状态图时只根据结构化时间/天气形成固定契约。负向约束必须包括禁止无剧情依据的暖黄、冷蓝、血红、霓虹、强逆光、强轮廓光、强体积光和新的主光方向。

- [ ] **Step 4: Add the Prompt v2 input and registry entry**

在 `DramaShotKeyframePromptInput` 增加 `lightingContract?: string | null`，把该行放在角色一致性与禁止文字之后，确保它是首帧 Prompt 的最后一条视觉约束。将 Prompt Asset 的版本与注册表键从 `v1` 升为 `v2`，保持 id `drama.shot.keyframe` 不变。

- [ ] **Step 5: Connect the contract in `DramaShotKeyframeService`**

在 `resolveNovelSettingSources` 的场景 DTO 中保留初始状态的 `label`，在构造 prompt 前匹配一次当前地点：

```ts
const matchedScene = matchSceneByName(settings.scenes, shot.location);
const lightingContract = matchedScene
  ? buildSceneLightingContract({
      sceneName: matchedScene.name,
      stateLabel: matchedScene.stateLabel,
      sceneType: matchedScene.sceneType,
      timeOfDay: matchedScene.timeOfDay,
      weather: matchedScene.weather,
      hasReferenceImage: Boolean(matchedScene.imageUrl),
    })
  : null;
```

把 `lightingContract` 传给 `buildDramaShotKeyframePrompt`，把 `buildSceneLightingAvoidInstructions()` 加入 negative prompt。参考图逻辑复用同一个 `matchedScene`，确保提示词声明的场景锚点与实际上传的场景图是同一条记录。

- [ ] **Step 6: Run the focused lighting tests**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/dramaSceneLightingContract.test.js server/tests/dramaShotKeyframeBlockingSketch.test.js server/tests/dramaArtStyle.test.js
```

Expected: 光照契约、Prompt v2、资产风格既有测试全部 PASS。

---

### Task 5: 修复批量恢复的参考图默认值

**Files:**
- Modify: `server/src/services/drama/production/DramaBatchOrchestrator.ts`
- Create: `server/tests/dramaBatchReferencePolicy.test.js`

- [ ] **Step 1: Write the failing recovery test**

导出一个纯函数 `resolveDramaBatchUseCharacterRefImages(value)`，测试：

```js
const { resolveDramaBatchUseCharacterRefImages } = require(
  "../dist/services/drama/production/DramaBatchOrchestrator.js",
);

test("legacy batch progress defaults reference images to enabled", () => {
  assert.equal(resolveDramaBatchUseCharacterRefImages(undefined), true);
  assert.equal(resolveDramaBatchUseCharacterRefImages(null), true);
  assert.equal(resolveDramaBatchUseCharacterRefImages(false), false);
  assert.equal(resolveDramaBatchUseCharacterRefImages(true), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/dramaBatchReferencePolicy.test.js
```

Expected: export 不存在或旧值返回 `false`，测试失败。

- [ ] **Step 3: Implement and use the policy**

在 `DramaBatchOrchestrator.ts` 增加：

```ts
export function resolveDramaBatchUseCharacterRefImages(value: boolean | null | undefined): boolean {
  return value ?? true;
}
```

在创建任务、读取旧 progress 和 `processShot` 调用处统一使用该函数；不能再出现 `nextProgress.useCharacterRefImages ?? false`。

- [ ] **Step 4: Run the policy test and source guard**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/dramaBatchReferencePolicy.test.js
rg -n "useCharacterRefImages \?\? false" server/src/services/drama/production/DramaBatchOrchestrator.ts
```

Expected: test PASS，`rg` 无输出。

---

### Task 6: 更新长期开发 Wiki、发布说明并完成回归

**Files:**
- Create or modify: `docs/wiki/debugging/drama-storyboard-reference-and-lighting.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Write the Wiki entry**

记录稳定知识而不是文件变更清单，至少包含 `Background / Root Cause / Current Rule / Failure Modes / Diagnosis / Related Modules`：

- `referenceImages` 元数据不等于 Provider 已经收到附件。
- Codex JSON generations 不读取 `input_image_url`；参考图必须走 multipart edits。
- 资产状态图是分镜角色和场景的唯一视觉来源，场景状态图同时承担光照锚点。
- 参考下载/读取失败必须阻断，不能用无参考图片伪造成功。
- 排查时同时检查持久化元数据、Provider 请求附件数量、Codex 桥日志和最终图片。

- [ ] **Step 2: Apply release-note workflow for the visible behavior change**

运行 `git status --short` 和 `git diff` 检查最终 Git 范围。本次会改变分镜生成的可见结果和失败反馈，因此在 `docs/releases/release-notes.md` 的 `### 2026-08-24` 合并一条用户视角说明，并刷新 README 的 `## 最新更新`；只描述参考图一致性和场景光照稳定性，不写文件路径、Provider 名称或测试信息。

- [ ] **Step 3: Run focused verification**

Run:

```powershell
pnpm --filter @ai-novel/server prisma:generate
pnpm --filter @ai-novel/server build
node --test server/tests/imageProviderReferences.test.js server/tests/imageProviderRouting.test.js server/tests/dramaSceneLightingContract.test.js server/tests/dramaShotKeyframeBlockingSketch.test.js server/tests/dramaArtStyle.test.js server/tests/dramaBatchReferencePolicy.test.js
node --test scripts/codex-image-bridge.test.cjs
node --check scripts/codex-image-bridge.cjs
git diff --check
```

Expected: 所有本次新增/修改的聚焦测试 PASS；任何与工作树数据库或无关 LLM 场景有关的全量测试问题单独记录，不用破坏性数据库命令修复。

- [ ] **Step 4: Capture real request evidence**

在当前运行服务上调用一个仅准备、不生成的分镜接口，确认同时出现叶晨、叶竹和场景的镜头返回三条参考图；使用请求捕获测试证明三条 URL 被转成三个 multipart 文件。若 Codex bridge 当前可用且配额允许，生成一个镜头并检查 `.logs` 中 `refs=3`；若配额不可用，记录外部配额阻断，不用 Grok Build 无参考降级来制造假成功。

- [ ] **Step 5: Commit the implementation unit**

确认 `git status --short` 只包含本任务文件，运行 `git diff --cached --check`，然后：

```powershell
git add -- server scripts docs
git commit -s -m "fix: preserve storyboard references and scene lighting"
```

不使用 `--no-verify`，不在 `main` 上提交。
