# OpenCode Go 本地模型供应商与桥接

## 背景

OpenCode Go 是基于本机已登录 OpenCode 订阅的文本模型通道（默认模型 `opencode-go/mimo-v2.5`），不暴露标准 API Key。旧项目 mydrama 通过「本地 OpenCode 无头服务 + OpenAI 兼容桥接」接入；本项目沿用同一套契约，保证两个项目可以共用同一台机器上的本地服务。

## 决策

- 供应商注册为内置 `opencode`（`shared/types/llm.ts`、`server/src/llm/providers.ts`），默认指向 `http://127.0.0.1:18762/v1`。桥接会校验 Bearer 令牌，因此不采用 `requiresApiKey: false`，而是通过 `OPENCODE_API_KEY=local-opencode-go` 环境变量提供固定令牌。
- 桥接实现为仓库内零依赖 Node 脚本（`scripts/opencode-go-bridge.cjs`），从 mydrama 的 Python 桥移植，协议保持一致并做了流式扩展；启动器 `scripts/start-opencode-go-bridge.cjs` 负责拉起 `opencode serve` 与桥接，`pnpm opencode:bridge` 一键启动。
- **图片透传（2026-08-27）**：`image_url`/`input_image`（data URL 或 http(s) URL）不再替换为占位文本，而是翻译为 opencode 消息的 FilePart（`{type:"file",mime,url,filename}`，已用 opencode v1.4.3 的 400 校验差异实证该输入格式）；图片由上游交给支持视觉的模型（`opencode-go/mimo-v2.5`）。无法解析的图片地址才降级为占位文本。`capabilities.ts` 的 opencode 已移出 TEXT_ONLY，视觉槽（空间标记识别、画风识别）已从 grok-cli 切到 opencode。
- **流式翻译是必须的**：本项目的结构化输出管道（`invokeStructuredLlm`）通过 `llm.stream()` 调用模型。上游 OpenCode 只支持一次性返回，桥接把 `stream: true` 请求的完整结果按 OpenAI 兼容的 SSE chunk 序列（首帧带完整 content / tool_calls、finish 帧、`[DONE]`）单发下发。mydrama 的旧桥直接拒绝流式请求，若共用旧桥会导致本项目所有结构化任务失败（400）。
- OpenCode 会话运行在隔离 workspace（`%LOCALAPPDATA%/AINovel/opencode-go-bridge/workspace`），agent 配置（`scripts/opencode-go-text-agent.json`，agent id `novel-text`）禁止工具调用与推理输出，保证纯文本生成行为可预期。

## 当前规则

- **2026-08-27 起：文本/视觉槽已切到 Codex 订阅**（Grok 与 OpenCode Go 余额同时耗尽，见 modelCategories.ts）。
  opencode 通道保留注册与桥接（`pnpm opencode:bridge`），余额恢复后可在设置页把文本/视觉槽切回；
  桥接的图片 FilePart 透传能力保留，切回即用。


- 端口约定：`18762` 桥接（绑定 `0.0.0.0`，供 Docker 容器经 `host.docker.internal` 访问）、`18763` OpenCode serve。
- 启动器对已就绪的服务直接复用，因此 mydrama 先启动的 serve/桥接与本项目的可以互相接管同一端口；两边的桥接协议兼容，本项目版本是超集（多出流式支持）。
- 模型名必须是 `opencode-go/<model-id>` 格式，桥接会拒绝其他 provider 前缀。
- `capabilities.ts` 中 opencode 的 JSON 能力为 `json_object/json_schema` 均可用：桥接会把 `response_format` 翻译成文本输出协议注入 system prompt，实际约束仍由 Zod 校验与 JSON 修复兜底。

## 失败模式

- serve 或桥接未启动：`/health` 返回 503 `opencode_unavailable`，模型设置页连通性测试会显示该错误；运行 `pnpm opencode:bridge` 恢复。
- 上游偶发 `Session not found`（HTTP 404）：桥接用全新 session 自动重试最多 3 次，无需应用侧处理。
- 上游余额不足等错误（HTTP 401 `Insufficient balance`）不返回文本 parts，而是放在响应 `info.error`：桥接提取 `info.error.data.message` 原样抛出，应用侧与连通测试能直接看到真实原因。
- 上游空响应（200 空体）：多为 OpenCode Go 余额不足或登录过期（日志中可见 `CreditsError: Insufficient balance`，计费入口 `opencode.ai/workspace/<id>/billing`）；桥接把它归一成带余额提示的错误，而不是「意外的数据结构」。Grok Build 订阅退订后，文本与视觉槽都依赖这份额度，充值前两类任务都会失败。
- 长章节生成可达数分钟：启动器默认把桥接上游超时设为 900 秒，应用侧请求超时需要覆盖该时长（默认 `API_TIMEOUT_MS` 为 10 分钟）。
- Windows 上直接 spawn npm 全局 `.cmd` 会抛 `EINVAL`（Node CVE-2024-27980 修复后行为），启动器统一经 `cmd.exe /c` 拉起 opencode。

## 相关模块

- `shared/types/llm.ts`、`server/src/llm/providers.ts`、`server/src/llm/capabilities.ts`：供应商注册与能力声明。
- `scripts/opencode-go-bridge.cjs`、`scripts/start-opencode-go-bridge.cjs`、`scripts/opencode-go-text-agent.json`：本地桥接三件套。
- `server/src/llm/connectivity.ts`、`server/src/llm/structuredInvoke.ts`：连通性探测与结构化调用路径（流式消费方）。
- 前端 `/settings`、`/settings/model-routes`：供应商数据驱动渲染，无硬编码条目。
