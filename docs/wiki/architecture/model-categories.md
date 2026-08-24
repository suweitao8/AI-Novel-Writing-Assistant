# 模型能力类别（文本 / 图片 / 音频）

## 背景

产品早期把“模型厂商”作为一等配置面：内置十余家厂商加自定义厂商，每个厂商单独配置 Key、模型、地址，另设 11 类任务模型路由与结构化备用模型。对目标用户（写作新手）来说认知负担过重：用户实际通常只有一个可用供应商，却被要求理解厂商、任务路由、请求协议等概念；未配置路由时系统会回退到固定厂商（DeepSeek），并抛出“未配置 DeepSeek 的 API Key”。

## 决策

- 模型配置面向能力而不是厂商：文本模型 / 图片模型 / 音频模型。
- 每类能力绑定一个内部 provider 槽位，定义在 `server/src/llm/modelCategories.ts`：`text=grok-cli`（Grok Build 文本本地桥）、`image=grok_build`（Grok Build 图片本地桥）、`audio=indextts25`（IndexTTS 2.5 本地语音 API）。带参考图的图片任务由业务路由自动回退到兼容 `/images/edits` 的 Codex 图片桥。
- 槽位的服务地址、API Key、模型均可编辑；更换供应商时修改槽位配置即可，产品不再提供按厂商维度逐个配置的界面。
- 所有任务路由统一解析到文本槽：`resolveModel` 的 provider/model 一律来自文本槽当前配置，路由行仅保留温度与结构化协议偏好，避免历史路由把任务钉在已不再使用的供应商上。

## 当前规则

- `resolveModel(taskType)`：provider 固定为文本槽；model 来自 `resolveTextModelId()`（已保存配置 > 环境变量 > 注册表默认值）；温度优先取 `modelRouteConfig` 行，缺省用 `TASK_ROUTE_DEFAULTS` 的任务级默认温度。
- `factory.resolveLLMClientOptions` 在未显式指定 provider 时回退文本槽，禁止回退任何固定厂商。
- 运行时全部调用点同样禁止固定厂商默认值（如 `?? "deepseek"`、`fallbackProvider: "deepseek"`）：未显式指定供应商时一律回退 `getTextModelProvider()`。新增代码遵循同一规则，否则会出现“未配置 DeepSeek 的 API Key”一类错误。
- 图片生成类调用点（封面、角色立绘、漫画分格/场景、剧照等）无参考图时回退图片槽 `getImageModelProvider()`；带参考图时由 `resolveImageProviderForReferences` 自动选择兼容参考图的 Codex；文本类与图片类默认值不可混用。
- 存量数据里遗留的 provider 值（如拆书记录中的 deepseek）不再被文字任务读取；重新入队时会回写为文本槽当前供应商。
- 知识库向量（RAG embedding）是独立通道，有专属设置面与默认供应商，不属于文本/图片槽管辖。
- `/api/settings/model-categories` 返回三槽状态；前端模型设置页只渲染三张卡片，见 `client/src/pages/settings/models/`。
- 音频槽的合成入口统一走 `server/src/services/audio/speechProvider.ts`（`synthesizeAudioSpeech`），配置解析顺序与文本/图片槽一致（已保存配置 > 环境变量 > 注册表默认值）；短剧配音链通过 `services/drama/audio/IndexTTS25TTSProvider.ts` 适配为 TTS provider。协议契约见 `docs/wiki/architecture/indextts25-audio-provider.md`。
- 音频槽的连通测试走 `POST /api/settings/model-categories/audio/test`：合成一句固定短语验证地址、密钥与模型整体可用，不复用文本模型的对话探测。
- `LLMSelector` 只展示文本槽的模型列表；`llm-selection` 保存的历史选择只有落在文本槽供应商上时才沿用其模型，否则回落文本槽当前模型（`client/src/lib/llmSelection.ts` 的 `resolvePreferredLLMSelection`）。
- 新手引导（QuickSetup）只配置文本槽：检测通过后写入全部任务路由的温度与协议偏好，并保存全局选择。
- 订阅通道判定：槽位供应商为本机桥（grok-cli/codex）且服务地址仍指向本机地址时，`/model-categories` 返回 `usesLocalSubscription=true`，设置页显示“已连接本机订阅通道”说明而不是密钥输入框；服务地址改为外部供应商后自动恢复密钥填写方式。状态中的 `hasApiKey` 表示已保存或环境变量提供的密钥是否生效（界面不回显密钥内容）。
- 结构化备用模型（structured-fallback）机制保留在服务端，无设置入口；存量启用配置继续生效。
- 存量数据兼容：`APIKey` 表与 `modelRouteConfig` 表结构不变；旧路由行的 provider/model 字段被忽略，只读温度与协议。
- 新增其他能力类别时：在 `modelCategories.ts` 增加槽位，扩展 `/model-categories` 返回值与设置页卡片，能力入口收敛到一个服务模块（参照 `services/audio/` 的做法）。

## 故障模式

- 文本槽未配置且无环境变量时，全部文字任务会在构建客户端阶段报“未配置 … 的 API Key”，需要在模型设置中配置文本模型。
- 历史路由行指向旧供应商时不再生效，统一回落文本槽；排障时可检查 `modelRouteConfig` 行的协议偏好是否异常（协议偏好仍会被采用）。
- 本地桥接服务未启动（18764 Grok Build 文本 / 18767 Grok Build 图片 / 18766 Codex 参考图图片 / 9005 IndexTTS 2.5 音频 API）时连通测试失败；`pnpm dev` 会自动启动这些开发依赖，单独启动服务端时分别执行 `pnpm grok:bridge`、`pnpm codex:image`、`pnpm indextts25:api`。音频 API 的正式实现与健康校验见 `docs/wiki/architecture/indextts25-audio-provider.md`。

## 相关模块

- `server/src/llm/modelCategories.ts`：槽位定义与文本模型解析。
- `server/src/llm/modelRouter.ts`：任务路由解析（统一走文本槽）。
- `server/src/llm/factory.ts`：LLM 客户端构建与密钥/地址解析。
- `server/src/routes/settings.ts`：`/api/settings/model-categories`。
- `server/src/modules/setup/onboarding/application/QuickSetupService.ts`：新手引导。
- `client/src/pages/settings/models/`：设置页三卡片。
- `client/src/components/common/LLMSelector.tsx`、`client/src/components/layout/LLMSelectionBootstrap.tsx`、`client/src/lib/llmSelection.ts`。
- `server/src/services/audio/speechProvider.ts`：音频槽语音合成入口；`server/src/services/audio/indexTTS25.ts`：参考音频缓存与 IndexTTS 协议适配；`server/src/services/drama/audio/IndexTTS25TTSProvider.ts`：配音链适配器。
- 相关文档：`docs/wiki/architecture/grok-build-provider.md`、`docs/wiki/architecture/opencode-go-provider.md`、`docs/wiki/architecture/codex-image-provider.md`、`docs/wiki/architecture/indextts25-audio-provider.md`。
