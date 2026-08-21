# Grok Build 本地订阅通道与基础资产路由

## 背景

本机已登录的 Grok Build 订阅可以通过 `grok` CLI 直接生成文字和图片。产品需要把它接入现有的 OpenAI 兼容调用链，同时保持参考图任务的能力边界清晰：Grok Build 图片输出固定为横版 16:9，不承担参考图编辑。

## 决策

- 文本槽默认使用本机 Grok CLI 通道，模型为 `grok-cli/grok-4.6`，服务地址为 `http://127.0.0.1:18764/v1`。桥接把一次性 CLI 结果翻译成 OpenAI completion，并必须把 `stream: true` 翻译成兼容 SSE，因为结构化调用链消费的是流式接口。
- 无参考图的角色设计稿、场景基础图和道具基础图默认使用 `grok_build` 图片通道，模型为 `grok-build-image`，服务地址为 `http://127.0.0.1:18767`。
- Grok Build 基础图片统一生成并归一化为 1280×720 PNG。图片提示词只允许一次 `image_gen`，并明确禁止 shell、代码、文件编辑和网页工具，避免订阅 CLI 把图片任务变成普通代理任务。
- 带参考图的状态图或资产图继续走当前图片槽位（默认 Codex），因为 Grok Build 通道不支持 `/v1/images/edits`。如果调用方误把参考图交给 `grok_build`，服务端在发 HTTP 请求前直接报错，不静默丢参考图。
- 本地 bridge bearer 是应用内部默认值，不写入数据库，也不要求用户填写 API Key。用户只需保持本机 Grok CLI 登录态有效。

## 当前规则

- `grok-cli` 只承担文本；`grok_build` 只承担无参考图的基础图片；封面和带参考图的图片仍由图片槽位配置决定。
- `StoryAssetImageService` 的场景与道具首张基础图走 Grok Build；`DramaCharacterImageService` 的角色设计稿走 Grok Build；`StoryAssetStateImageService` 根据是否找到上游状态参考图在 Grok Build 与图片槽位之间选择。
- 老的 `ImageGenerationService` 角色任务同样按参考图资产 ID 选择默认 provider：没有参考图走 Grok Build，有参考图走图片槽位；显式指定 provider 仍保留给用户或上层工作流。
- bridge 启动器只负责本机文本/图片子进程，不负责 API、前端或数据库。`pnpm grok:bridge` 会复用健康的 18764/18767 服务，并等待两个 `/health` 都 ready；`pnpm dev` 会在开发服务启动前执行同一检查。
- 生成测试不得为了验证连通性而调用真实 Grok 额度。单元测试使用注入的 executor/generator；真实环境检查只验证 `/health` 和 `/v1/models`。

## 故障模式与排查

1. 页面提示本地创作服务未连接：先在项目根目录执行 `pnpm grok:bridge`，确认 `http://127.0.0.1:18764/health` 与 `http://127.0.0.1:18767/health` 返回 `ready: true`，再重试页面。
2. `/health` 返回 `ready: false`：检查 `grok` CLI 是否安装并且本机登录态有效；可用 `GROK_CLI_PATH` 指定 CLI 路径。不要把订阅 token 写入项目 `.env` 或日志。
3. 文本结构化任务失败但普通调用正常：检查文本 bridge 是否仍为本项目版本；旧的只支持一次性返回、拒绝 SSE 的桥不能直接替代本项目 bridge。
4. 参考图任务报“不支持参考图”：这是能力边界保护，应该让任务使用 Codex 或其他支持 `/images/edits` 的图片槽位，而不是重试 Grok Build。
5. 生成超时或没有图片产物：查看 `%LOCALAPPDATA%\\AINovel\\grok-build-bridge\\logs` 下对应 bridge 日志，确认订阅额度、CLI 登录态和本机图片工具可用性。

## 相关模块

- `shared/types/llm.ts`、`server/src/llm/providers.ts`、`server/src/llm/modelCategories.ts`：provider 注册与文本/图片槽位。
- `server/src/services/image/assetProviderRouting.ts`：基础资产与参考图的默认 provider 选择。
- `server/src/services/image/provider.ts`：图片请求体、默认 bearer 和参考图能力保护。
- `scripts/grok-cli-core.cjs`、`scripts/grok-cli-bridge.cjs`：文本 CLI 适配与 OpenAI/SSE bridge。
- `scripts/grok-build-image-core.cjs`、`scripts/grok-build-image-bridge.cjs`：图片 CLI 适配、产物归一化与 OpenAI Images bridge。
- `scripts/start-grok-build-bridge.cjs`：本机两个 bridge 的健康检查与复用启动。
