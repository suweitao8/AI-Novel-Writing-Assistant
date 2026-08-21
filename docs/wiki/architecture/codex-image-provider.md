# Codex 图片本地供应商与桥接

## 背景

mydrama 项目通过本机已登录的 Codex 订阅（Codex CLI 内置 `image_generation` 工具）生成图片，不需要真实 API Key。本项目沿用同一套本地桥接契约（端口 18766），保证两个项目可以共用同一台机器上的桥。

## 决策

- 供应商注册为内置 `codex`（`shared/types/llm.ts`、`server/src/llm/providers.ts`），名称显示为「Codex 图片」，默认指向 `http://127.0.0.1:18766/v1`，固定令牌 `CODEX_API_KEY=codex-bridge-local`。
- **该供应商只用于图片**：桥上没有 `/v1/chat/completions`，文本任务路由到 codex 会得到明确 404；`capabilities.ts` 中 codex 的 JSON 能力声明为全 false。
- 图片模型走 `ProviderImageSettingsService` 的既有通道：`ImageModelProvider` 增加 `codex`，选项 `gpt-image-2`，env 读取 `CODEX_IMAGE_MODEL`，持久化在 `AppSetting`（key `provider.imageModel.codex`）。
- 桥接实现为仓库内零依赖 Node 脚本（`scripts/codex-image-bridge.cjs`），从 mydrama 的 Python 桥移植，协议一致；启动器 `scripts/start-codex-image-bridge.cjs` 对应 `pnpm codex:image`。
- Codex 桥保留为参考图兼容通道：它支持 `size` → 宽高比（竖版封面 1024x1536 → 2:3）、`quality` 与参考图（multipart `/images/edits`）。当前无参考图的角色、场景、道具和封面默认走 Grok Build；带参考图的任务才由路由回退到 Codex。Grok Build 固定输出 16:9 横版，因此仍不承担参考图编辑与需要其他画幅的请求。

## 当前规则

- 端口约定：`18766` 桥接（绑定 `0.0.0.0`，供 Docker 容器经 `host.docker.internal` 访问）。
- 业务路由只有在请求包含参考图时才选择该桥；无参考图请求默认使用 `grok_build`，不要在新调用点把 Codex 写成无条件默认值。
- 桥的请求体是 OpenAI Images 兼容：JSON `{model, prompt, n, size, quality, response_format}`，`size` 会被翻译成宽高比与目标尺寸写进 agent prompt；带参考图时走 multipart `/images/edits`，`image` 字段的文件会作为 `-i` 参考传给 CLI。
- CLI 调用要点：`codex exec --ignore-user-config --ephemeral --json --enable image_generation -C <workdir> --skip-git-repo-check -s danger-full-access -m <agentModel> -`，agent prompt 从 stdin 传入；每次调用使用隔离的临时 `CODEX_HOME`（只复制 `auth.json`/`cap_sid`），产物从该目录的 `generated_images` 下按 mtime 挑选本次新生成的图片。
- 并发上限默认 4（`CODEX_IMAGE_MAX_CONCURRENCY`），单次生成超时默认 900 秒（`CODEX_IMAGE_TIMEOUT_SECONDS`）。
- 应用侧图片请求超时（`IMAGE_GENERATION_HTTP_TIMEOUT_MS`，默认 300 秒）需要覆盖本地生成时长，本地开发建议设 900000。

## 失败模式

- codex CLI 未安装：桥 `/health` 返回 `ready: false`，`pnpm codex:image` 会在 120 秒后报错；可设置 `CODEX_IMAGE_EXECUTABLE` 指定路径。
- codex 登录态失效：CLI 以非零退出码结束，桥返回 502 并透传 stderr 尾部，任务层按现有图片任务重试规则处理。
- CLI 正常结束但没有新图片文件：桥报「Codex 结束运行但没有产出图片文件」，通常是订阅侧图片工具被拒或额度问题。
- Windows 直接 spawn npm 全局 `.cmd` 会抛 `EINVAL`（CVE-2024-27980 修复后行为），桥与启动器统一经 `cmd.exe /c` 启动，prompt 走 stdin 防止 `.cmd` 分词。

## 相关模块

- `shared/types/llm.ts`、`server/src/llm/providers.ts`、`server/src/llm/capabilities.ts`：供应商注册与能力声明。
- `server/src/services/settings/ProviderImageSettingsService.ts`：图片模型选项与持久化。
- `server/src/services/image/provider.ts`：OpenAI Images 兼容请求（JSON + multipart），codex 走通用分支，无特判。
- `scripts/codex-image-bridge.cjs`、`scripts/start-codex-image-bridge.cjs`：本地桥接与启动器。
- 前端 `/settings` 供应商卡片与封面 / 角色图对话框：数据驱动渲染，自动出现 codex 选项。
- 姊妹页面：[OpenCode Go 本地模型供应商与桥接](./opencode-go-provider.md)（文本通道，同为本地订阅桥接模式）。
