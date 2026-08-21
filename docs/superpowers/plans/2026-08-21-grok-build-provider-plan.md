# 本机 Grok Build Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前仓库接入本机 Grok CLI 文本桥接和 Grok Build 图片桥接，并把文本默认路由与角色/场景/道具基础资产路由切换到本机订阅通道。

**Architecture:** 新增两个独立的 Node OpenAI 兼容桥接：文本桥接在 18764，将 Grok CLI 的一次性结果转换为当前 LangChain 所需的非流式/SSE 响应；图片桥接在 18767，将 Grok Build 会话图片归一化为 1280x720 PNG。server 只通过 provider 配置和一个能力路由选择 provider，不把 CLI 进程细节放入业务服务；参考图和不兼容画幅继续走 Codex。

**Tech Stack:** Node.js 22、Node `http`/`child_process`/`fs`、`sharp`、TypeScript、Node test runner、Prisma provider settings、LangChain OpenAI-compatible client。

---

## 文件边界

- Modify: `shared/types/llm.ts` — 注册 `grok-cli` 与 `grok_build` 内置 provider。
- Modify: `server/src/llm/providers.ts` — provider 默认地址、模型、本地 token 和无 API Key 规则。
- Modify: `server/src/llm/modelCategories.ts` — 文本槽切换到 `grok-cli`，维护本地订阅 provider 集合。
- Modify: `server/src/llm/capabilities.ts`, `server/src/llm/structuredOutput.ts` — 让 Grok CLI 桥接使用 JSON object/schema 结构化契约。
- Modify: `server/src/services/settings/ProviderImageSettingsService.ts` — 注册 Grok Build 图片模型和环境覆盖。
- Modify: `server/src/services/image/provider.ts` — 组装 Grok Build 图片请求、拒绝参考图、使用本地默认 bearer。
- Create: `server/src/services/image/assetProviderRouting.ts` — 角色/场景/道具基础资产的能力路由，参考图回到全局图片 provider。
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetImageService.ts` — 场景/道具无参考基础图默认 Grok Build。
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts` — 无参考状态图走 Grok Build，有参考状态图走 Codex。
- Modify: `server/src/services/drama/DramaCharacterImageService.ts` — 漫剧角色基础设计稿默认 Grok Build。
- Modify: `server/src/services/image/ImageGenerationService.ts` — 无参考角色/拆书角色图默认 Grok Build，带参考图继续 Codex，封面保持全局图片 provider。
- Create: `scripts/grok-cli-core.cjs` — CLI 路径、headless 命令、输出解析和 prompt/schema 组装的纯函数/执行器。
- Create: `scripts/grok-cli-bridge.cjs` — Grok 文本 HTTP bridge、auth、health、models、completion 和 SSE。
- Create: `scripts/grok-build-image-core.cjs` — Grok Build 图片 prompt、会话产物、固定尺寸 PNG 归一化和 CLI 执行器。
- Create: `scripts/grok-build-image-bridge.cjs` — Grok Build 图片 HTTP bridge、auth、generations 和明确拒绝 edits。
- Create: `scripts/start-grok-build-bridge.cjs` — 复用/启动两个 bridge、日志和就绪等待。
- Modify: `package.json` — 增加 `grok:bridge`，让 `pnpm dev` 在 API/frontend 前确保两个 bridge 就绪。
- Create: `server/tests/grokCliBridge.test.js` — CLI 命令、输出、HTTP auth、schema/tool mapping、SSE。
- Create: `server/tests/grokBuildImageBridge.test.js` — 图片 prompt、固定 PNG、HTTP generations、auth、edits 拒绝。
- Create: `server/tests/startGrokBuildBridge.test.js` — 启动器参数和健康进程复用计划。
- Create: `server/tests/imageProviderRouting.test.js` — 基础资产与参考图 provider 路由。
- Modify: `server/tests/llmProviders.test.js`, `server/tests/modelRouter.test.js`, `server/tests/imageGenerationConfig.test.js` — provider 注册、文本默认路由和图片请求契约。
- Create/Modify: `docs/wiki/architecture/grok-build-provider.md`, `docs/wiki/workflows/comic-drama-workflow.md` — 记录桥接边界、能力路由、故障诊断。
- Modify: `docs/releases/release-notes.md`, `README.md` — 记录用户可见的模型与基础资产生成变化，保留历史记录。

### Task 1: 注册 provider 契约并写失败测试

**Files:**
- Test: `server/tests/llmProviders.test.js`, `server/tests/modelRouter.test.js`, `server/tests/imageProviderRouting.test.js`, `server/tests/imageGenerationConfig.test.js`
- Modify: `shared/types/llm.ts`, `server/src/llm/providers.ts`, `server/src/llm/modelCategories.ts`, `server/src/llm/capabilities.ts`, `server/src/llm/structuredOutput.ts`, `server/src/services/settings/ProviderImageSettingsService.ts`
- Create: `server/src/services/image/assetProviderRouting.ts`

- [ ] **Step 1: 添加 provider 和路由的失败测试**

  在现有 Node test 文件中加入以下行为断言：

  ```js
  assert.ok(SUPPORTED_PROVIDERS.includes("grok-cli"));
  assert.ok(SUPPORTED_PROVIDERS.includes("grok_build"));
  assert.equal(PROVIDERS["grok-cli"].requiresApiKey, false);
  assert.equal(PROVIDERS.grok_build.defaultModel, "grok-build-image");
  assert.equal(getTextModelProvider(), "grok-cli");
  assert.equal(resolveAssetImageProvider({ kind: "scene", hasReference: false }), "grok_build");
  assert.equal(resolveAssetImageProvider({ kind: "character", hasReference: true }), "codex");
  ```

  同时断言 `getImageModelOptions("grok_build")` 返回 `grok-build-image`，以及 `buildImageGenerationRequestBody` 对 Grok Build 不附加 Codex 的尺寸/质量字段。

- [ ] **Step 2: 运行失败测试，确认失败原因是 provider 尚未注册**

  Run: `pnpm --filter @ai-novel/server build; node --test server/tests/llmProviders.test.js server/tests/modelRouter.test.js server/tests/imageProviderRouting.test.js server/tests/imageGenerationConfig.test.js`

  Expected: FAIL with missing `grok-cli`/`grok_build` provider or missing routing export, not with test syntax errors.

- [ ] **Step 3: 实现最小 provider 契约**

  将两个字符串加入 `shared/types/llm.ts`；在 `PROVIDERS` 中加入：

  ```ts
  "grok-cli": {
    name: "Grok Build 文本",
    baseURL: "http://127.0.0.1:18764/v1",
    defaultModel: "grok-cli/grok-4.6",
    models: ["grok-cli/grok-4.6"],
    envKey: "GROK_CLI_API_KEY",
    envBaseURLKey: "GROK_CLI_BASE_URL",
    envModelKey: "GROK_CLI_MODEL",
    defaultApiKey: "local-grok-cli",
    requiresApiKey: false,
    supportsModelList: false,
  },
  grok_build: {
    name: "Grok Build 图片",
    baseURL: "http://127.0.0.1:18767",
    defaultModel: "grok-build-image",
    models: ["grok-build-image"],
    envKey: "GROK_IMAGE_BRIDGE_API_KEY",
    envBaseURLKey: "GROK_IMAGE_BRIDGE_URL",
    envModelKey: "GROK_IMAGE_MODEL",
    defaultApiKey: "grok-bridge-local",
    requiresApiKey: false,
    supportsModelList: false,
  },
  ```

  扩展 `ProviderConfig` 与 provider secret resolution，使 `defaultApiKey` 只作为本机 bridge bearer 默认值使用；不把该值写入数据库。文本分类改为 `grok-cli`，本地订阅集合增加两个 provider。

  在 structured output profile 中让 `grok-cli` 支持 `json_object` 和 `json_schema`；在 `capabilities.ts` 的穷举 provider map 中增加 `grok-cli` 与 `grok_build`，图片 provider 的结构化能力设为 false。`ProviderImageSettingsService` 增加 `grok_build` 模型选项和 `GROK_IMAGE_MODEL` 环境覆盖。

  `assetProviderRouting.ts` 只暴露纯函数：无参考的 `character`/`scene`/`prop` 返回 `grok_build`，有参考返回 `getImageModelProvider()`；其他场景始终返回全局图片 provider。

- [ ] **Step 4: 运行测试确认 provider 层通过**

  Run: `pnpm --filter @ai-novel/server build; node --test server/tests/llmProviders.test.js server/tests/modelRouter.test.js server/tests/imageProviderRouting.test.js server/tests/imageGenerationConfig.test.js`

  Expected: 新增断言 PASS；若旧测试失败，只处理由 provider 列表穷举造成的类型/快照更新，不修改无关业务行为。

- [ ] **Step 5: Commit**

  ```powershell
  git add shared/types/llm.ts server/src/llm server/src/services/settings/ProviderImageSettingsService.ts server/src/services/image/assetProviderRouting.ts server/tests/llmProviders.test.js server/tests/modelRouter.test.js server/tests/imageProviderRouting.test.js server/tests/imageGenerationConfig.test.js
  git commit -s -m "feat: register local grok build providers"
  ```

### Task 2: 实现 Grok 文本 bridge（先测试后代码）

**Files:**
- Test: `server/tests/grokCliBridge.test.js`
- Create: `scripts/grok-cli-core.cjs`, `scripts/grok-cli-bridge.cjs`

- [ ] **Step 1: 写失败测试**

  测试 `buildGrokCliCommand` 生成参数数组而不是 shell 字符串，并包含 `--prompt-file`、`--verbatim`、`--output-format json`、`--tools ""`、`--no-plan`、`--disable-web-search`、`--no-subagents`、`--no-memory`、`--json-schema` 和 `--cwd`。测试 `parseGrokCliOutput` 能解析 `{text}`、代码围栏 JSON 和带前缀的最长 JSON 对象。

  使用注入的 `execute` 函数启动测试 bridge，断言：无 bearer 返回 401；非流式 schema 请求返回标准 `choices[0].message.content`；工具 schema 返回工具调用；`stream:true` 返回两帧 chunk、结束帧和 `data: [DONE]`。

- [ ] **Step 2: 运行失败测试**

  Run: `node --test server/tests/grokCliBridge.test.js`

  Expected: FAIL because the bridge modules do not exist.

- [ ] **Step 3: 实现纯核心模块**

  `grok-cli-core.cjs` 实现并导出：

  - `resolveGrokCliPath(explicit)`：优先 `GROK_CLI_PATH`，再查 `grok`，再查 `os.homedir()/.grok/bin/grok(.exe)`。
  - `buildGrokCliCommand({ executable, promptPath, model, reasoningEffort, systemPrompt, schemaJson, cwd })`：返回参数数组，禁止 shell 拼接。
  - `buildGrokTranscript(messages)`：保留 system 内容并按 role 拼接 user/assistant/tool 内容。
  - `extractOutputSchema(body)`：从 `response_format.json_schema.schema` 或首个 function tool 的 parameters 提取 JSON schema。
  - `parseGrokCliOutput(stdout)`：解析 CLI JSON 的 `text`/content，容忍代码围栏和前缀文本，无法解析时抛出带上下文的错误。
  - `runGrokCli(input, dependencies)`：在 `fs.mkdtemp` 创建隔离目录，写 prompt/schema 文件，用 `spawn` 参数数组运行，超时 kill，返回最终文本；依赖注入只用于测试。

- [ ] **Step 4: 实现 HTTP bridge**

  `grok-cli-bridge.cjs` 使用 Node `http`，导出 `createGrokCliBridgeServer(options)` 和 `main()`：

  - `/health` 返回 `ready`、provider、model、subscription；`/v1/models` 返回注册模型。
  - POST body 限制 32 MB，校验 bearer `GROK_CLI_API_KEY` 或 `local-grok-cli`。
  - `/v1/chat/completions` 校验 messages/model，调用 core executor，把结果包装为 OpenAI completion。
  - stream 请求使用一次性结果生成兼容 SSE：首帧 delta 带 role/content 或 tool_calls，第二帧只带 finish_reason，按 `stream_options.include_usage` 添加 usage，最后 `[DONE]`。
  - 不处理未知路径、无 prompt、非法 JSON 或 CLI 失败；统一返回 JSON error，不泄露命令行 token。

- [ ] **Step 5: 运行测试确认通过**

  Run: `node --test server/tests/grokCliBridge.test.js`

  Expected: 全部 bridge unit/HTTP tests PASS，且不调用真实 `grok.exe`。

- [ ] **Step 6: Commit**

  ```powershell
  git add scripts/grok-cli-core.cjs scripts/grok-cli-bridge.cjs server/tests/grokCliBridge.test.js
  git commit -s -m "feat: add grok cli text bridge"
  ```

### Task 3: 实现 Grok Build 图片 bridge（先测试后代码）

**Files:**
- Test: `server/tests/grokBuildImageBridge.test.js`
- Create: `scripts/grok-build-image-core.cjs`, `scripts/grok-build-image-bridge.cjs`

- [ ] **Step 1: 写失败测试**

  测试图片 agent prompt 强制 `image_gen` 一次、`aspect_ratio: 16:9`、禁止 shell/code/web，并保留用户 prompt。用 `sharp` 创建非 1280x720 的测试图片，断言 `normalizeGrokBuildImage` 输出 PNG 且尺寸为 1280x720。启动注入 fake generator 的 HTTP bridge，断言有效 generation 返回 b64、错误 token 返回 401、`/v1/images/edits` 返回 422 且明确说明不支持参考图。

- [ ] **Step 2: 运行失败测试**

  Run: `node --test server/tests/grokBuildImageBridge.test.js`

  Expected: FAIL because bridge modules do not exist.

- [ ] **Step 3: 实现图片核心模块**

  `grok-build-image-core.cjs` 实现并导出：

  - 常量 `GROK_BUILD_PROVIDER`、`GROK_BUILD_MODEL`、`1280x720`、`16:9`。
  - `buildGrokBuildPrompt(prompt)`：校验非空/长度，写入安全的 user prompt 包装。
  - `resolveGrokHome()`、`getSessionImageDir()`、`findLatestGrokImage()`：按 Grok session 目录发现 jpg/jpeg/png/webp 最新产物。
  - `normalizeGrokBuildImage(source)`：`sharp(source).rotate().resize(1280, 720).png().toBuffer()`。
  - `runGrokBuildImage({ prompt, workdir, timeout, executable })`：以参数数组调用 `--no-alt-screen --always-approve --max-turns 6 --tools image_gen --output-format plain --session-id ... -p ...`，超时终止，并返回归一化 PNG buffer。

- [ ] **Step 4: 实现图片 HTTP bridge**

  `grok-build-image-bridge.cjs` 导出 `createGrokBuildImageBridgeServer(options)` 和 `main()`：

  - `/health` 检查 CLI 路径并返回 `provider: grok_build`；`/v1/models` 返回 `grok-build-image`。
  - `POST /v1/images/generations` 要求 bearer、解析 prompt/model/n、限制 `n` 为 1–4，每张图单独调用 generator，返回 OpenAI `data[].b64_json`。
  - `POST /v1/images/edits` 在读取 multipart body 前直接返回 422 `reference_images_not_supported`，避免误把二进制当 JSON。
  - 将临时目录清理放在每次请求 finally，错误只返回有限长度的 message。

- [ ] **Step 5: 运行测试确认通过**

  Run: `node --test server/tests/grokBuildImageBridge.test.js`

  Expected: 全部图片 core/HTTP tests PASS，测试不启动真实 Grok CLI。

- [ ] **Step 6: Commit**

  ```powershell
  git add scripts/grok-build-image-core.cjs scripts/grok-build-image-bridge.cjs server/tests/grokBuildImageBridge.test.js
  git commit -s -m "feat: add grok build image bridge"
  ```

### Task 4: 接入图片请求契约和业务路由

**Files:**
- Modify: `server/src/llm/factory.ts`, `server/src/services/image/provider.ts`, `server/src/services/image/ImageGenerationService.ts`, `server/src/modules/novel/story-settings/application/StoryAssetImageService.ts`, `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`, `server/src/services/drama/DramaCharacterImageService.ts`
- Test: `server/tests/imageGenerationConfig.test.js`, `server/tests/imageProviderRouting.test.js`, `server/tests/storyAssetStateImage.test.js`, `server/tests/dramaCharacterStateSource.test.js`

- [ ] **Step 1: 为 provider default token 写失败测试**

  断言 `resolveLLMClientOptions("grok-cli")` 在没有数据库 APIKey/环境 key 时仍返回 `apiKey: "local-grok-cli"`、默认地址和模型；图片 secret resolution 对 `grok_build` 返回 `grok-bridge-local`，并且仍不要求用户配置 API Key。

- [ ] **Step 2: 运行失败测试**

  Run: `pnpm --filter @ai-novel/server build; node --test server/tests/imageGenerationConfig.test.js`

  Expected: FAIL because provider default token and image provider behavior are not implemented.

- [ ] **Step 3: 接入 factory 与图片 provider**

  在 `factory.ts` 使用 `getProviderDefaultApiKey` 参与 apiKey resolution；在图片 provider 使用同一默认值。`buildImageGenerationRequestBody` 对 `grok_build` 只发送 model/prompt/n/response_format，不发送不兼容的 size/quality；显式带参考图时抛出 `grok_build 不支持参考图，请切换到 Codex 图片通道。`。保留现有 direct `grok` 行为。

- [ ] **Step 4: 接入业务路由**

  `StoryAssetImageService.generateSceneImage` 和 `generatePropImage` 将 provider 设置为 `resolveAssetImageProvider({ kind, hasReference: false })`；`StoryAssetStateImageService.generateStateImage` 根据是否找到 ancestor image 选择 Grok Build/Codex，并把最终 provider 传给 `runImageGeneration`。`ImageGenerationService` 的 character/book-analysis-character 默认 provider 使用同一能力路由，已配置 `referenceImageAssetIds` 时选择 Codex；novel cover 仍使用全局图片 provider。`DramaCharacterImageService` 的默认角色设计稿 provider 改用基础资产 provider；关键帧不改。

- [ ] **Step 5: 运行 focused tests**

  Run: `pnpm --filter @ai-novel/server build; node --test server/tests/imageGenerationConfig.test.js server/tests/imageProviderRouting.test.js server/tests/storyAssetStateImage.test.js server/tests/dramaCharacterStateSource.test.js`

  Expected: provider resolution、参考图分流和旧状态契约全部 PASS。

- [ ] **Step 6: Commit**

  ```powershell
  git add server/src/llm/factory.ts server/src/services/image/provider.ts server/src/services/image/ImageGenerationService.ts server/src/modules/novel/story-settings/application/StoryAssetImageService.ts server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts server/src/services/drama/DramaCharacterImageService.ts server/tests/imageGenerationConfig.test.js server/tests/imageProviderRouting.test.js server/tests/storyAssetStateImage.test.js server/tests/dramaCharacterStateSource.test.js
  git commit -s -m "feat: route base assets through grok build"
  ```

### Task 5: 添加 bridge 启动器、开发入口和文档

**Files:**
- Create: `scripts/start-grok-build-bridge.cjs`
- Test: `server/tests/startGrokBuildBridge.test.js`
- Modify: `package.json`
- Create/Modify: `docs/wiki/architecture/grok-build-provider.md`, `docs/wiki/workflows/comic-drama-workflow.md`, `docs/releases/release-notes.md`, `README.md`

- [ ] **Step 1: 写启动器参数/复用失败测试**

  为启动器导出纯 `parseArgs` 和 `buildBridgeLaunchPlan`，测试默认端口 18764/18767、环境变量覆盖和两个子进程参数都正确；健康进程应被复用而不是重复 spawn。

- [ ] **Step 2: 实现启动器**

  参照现有 `start-opencode-go-bridge.cjs` 和 `start-codex-image-bridge.cjs`：日志写入 `%LOCALAPPDATA%\\AINovel\\grok-build-bridge\\logs`，隐藏 detached spawn 两个 bridge，分别等待 `/health` ready，支持 `GROK_CLI_PATH`、端口、模型和 timeout 参数，成功后打印 provider/地址。启动器只负责本机进程，不启动 API/frontend。

- [ ] **Step 3: 更新开发脚本和文档**

  在 root `package.json` 增加 `grok:bridge`，将 `pnpm dev` 的 bridge readiness 放在 `dev:raw` 前。wiki 记录 provider 边界、SSE 要求、图片能力限制和诊断命令；release notes/README 只写用户能看到的“文本默认使用本机 Grok Build 订阅、角色/场景/道具基础图走 Grok Build、参考图任务保留兼容通道”，不写内部文件名和实现过程。

- [ ] **Step 4: 运行文档和脚本检查**

  Run: `node --check scripts/grok-cli-core.cjs; node --check scripts/grok-cli-bridge.cjs; node --check scripts/grok-build-image-core.cjs; node --check scripts/grok-build-image-bridge.cjs; node --check scripts/start-grok-build-bridge.cjs; node --test server/tests/startGrokBuildBridge.test.js; pnpm check:docs-manifest; git diff --check`

  Expected: all commands PASS，文档 manifest 无新增违规路径。

- [ ] **Step 5: Commit**

  Before commit run `readme-release-updater` to inspect the user-visible Git scope, then:

  ```powershell
  git add package.json scripts/start-grok-build-bridge.cjs docs/wiki docs/releases/release-notes.md README.md
  git commit -s -m "docs: document grok build model routing"
  ```

### Task 6: 完整验证与本机服务验收

- [ ] **Step 1: 运行本次 focused suite**

  Run:

  ```powershell
  pnpm --filter @ai-novel/server build
  node --test server/tests/grokCliBridge.test.js server/tests/grokBuildImageBridge.test.js server/tests/llmProviders.test.js server/tests/modelRouter.test.js server/tests/imageProviderRouting.test.js server/tests/imageGenerationConfig.test.js
  pnpm --filter @ai-novel/client typecheck
  git diff --check
  ```

  Expected: 本次新增/触及测试 PASS；记录现有 full-suite 的 Prisma/数据库和 runner hang 基线，不将其伪装成全绿。

- [ ] **Step 2: 启动并检查两个本机 bridge**

  Run: `pnpm grok:bridge`

  Expected: 18764 和 18767 的 `/health` ready，`/v1/models` 分别显示 `grok-cli/grok-4.6` 和 `grok-build-image`。只进行 health/models，不触发真实生成。

- [ ] **Step 3: 重启当前 API/frontend 并验证连接**

  按现有项目脚本在固定端口 `3100`/`5174` 重启，不换端口；检查 API 健康、模型分类解析和前端连接。若已有项目进程占用固定端口，只停止确认属于本项目的 stale dev process。

- [ ] **Step 4: 可选真实配额验收**

  在用户明确知道会消耗 Grok 订阅额度的前提下，执行一次最小文本和一次最小基础资产图片请求；检查返回内容、图片尺寸和状态持久化。若不执行真实生成，明确报告只完成了桥接协议和健康检查验收。

- [ ] **Step 5: 最终工作区检查**

  Run: `git status --short; git worktree list --porcelain`

  确认只包含本任务文件，保留主工作区 `server/backups/` 未跟踪备份和现有第二 worktree，不删除用户数据。
