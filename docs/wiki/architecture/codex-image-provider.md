# Codex 图片本地供应商与桥接

## 背景

mydrama 项目通过本机已登录的 Codex 订阅（Codex CLI 内置 `image_generation` 工具）生成图片，不需要真实 API Key。本项目沿用同一套本地桥接契约（端口 18766），保证两个项目可以共用同一台机器上的桥。

## 决策

- 供应商注册为内置 `codex`（`shared/types/llm.ts`、`server/src/llm/providers.ts`），名称显示为「Codex 图片」，默认指向 `http://127.0.0.1:18766/v1`，固定令牌 `CODEX_API_KEY=codex-bridge-local`。
- **该供应商只用于图片**：桥上没有 `/v1/chat/completions`，文本任务路由到 codex 会得到明确 404；`capabilities.ts` 中 codex 的 JSON 能力声明为全 false。
- 图片模型走 `ProviderImageSettingsService` 的既有通道：`ImageModelProvider` 增加 `codex`，选项 `gpt-image-2`，env 读取 `CODEX_IMAGE_MODEL`，持久化在 `AppSetting`（key `provider.imageModel.codex`）。
- 桥接实现为仓库内零依赖 Node 脚本（`scripts/codex-image-bridge.cjs`），从 mydrama 的 Python 桥移植，协议一致；启动器 `scripts/start-codex-image-bridge.cjs` 对应 `pnpm codex:image`。
- Codex 桥支持 `size` → 宽高比（竖版封面 1024x1536 → 2:3）、`quality`、参考图（multipart `/images/edits`）与透明背景。**2026-08-22 起角色与道具的资产参考图（状态图/四视图/道具透视图）一律走 Codex 并要求透明底**：CLI 图片工具没有 `background` 字段，桥把 `background=transparent` 翻译成 agent prompt 硬约束（真 alpha 通道 PNG，禁止实底/棋盘格/地面），应用侧提示词与 `TRANSPARENT_IMAGE_OPTIONS`（background=transparent + output_format=png）双保险。Grok Build 固定输出 16:9 横版且不支持透明底与参考图编辑，仍只承担场景全景与无参考图封面。

## 当前规则

- 端口约定：`18766` 桥接（绑定 `0.0.0.0`，供 Docker 容器经 `host.docker.internal` 访问）。
- 业务路由规则（2026-08-22/23 起）：`resolveAssetImageProvider` 里 kind=character/prop（透明底）/kind=scene（2:1 全景）无条件走 Codex；无参考图封面默认 `grok_build`，带参考图回退 Codex。不要在新调用点绕开 `assetProviderRouting` 硬编码通道。
- 桥的请求体是 OpenAI Images 兼容：JSON `{model, prompt, n, size, quality, background, response_format}`，`size` 会被翻译成宽高比与目标尺寸、`background=transparent` 会被翻译成透明底硬约束写进 agent prompt；带参考图时走 multipart `/images/edits`，`image` 字段的文件会作为 `-i` 参考传给 CLI（应用侧参考图必须传本地文件路径——JSON 生成路径不解析 `input_image_url`，传 URL 会静默丢参考）。
- CLI 调用要点：`codex exec --ignore-user-config --ephemeral --json --enable image_generation -C <workdir> --skip-git-repo-check -s danger-full-access -m <agentModel> -`，agent prompt 从 stdin 传入；每次调用使用隔离的临时 `CODEX_HOME`（只复制 `auth.json`/`cap_sid`），产物从该目录的 `generated_images` 下按 mtime 挑选本次新生成的图片。
- 并发上限默认 4（`CODEX_IMAGE_MAX_CONCURRENCY`），单次生成超时默认 900 秒（`CODEX_IMAGE_TIMEOUT_SECONDS`）。
- **应用侧超时必须 ≥ 桥预算（2026-08-23 教训）**：`IMAGE_GENERATION_HTTP_TIMEOUT_MS` 默认已从 300 秒上调到 900 秒（`server/src/config/imageGeneration.ts`）。角色四视图这类复杂资产图经 codex 通道经常超过 5 分钟；此前服务端 5 分钟就断开报错，而桥里的 codex 进程会把 900 秒预算跑完——白烧订阅额度、占住并发槽，重试请求排队叠加，前端表现为「一直在生成中然后超时」。
- **桥跟随客户端断开终止（2026-08-23）**：HTTP 客户端断开（服务端超时/取消）即 kill 本次 codex 进程并释放并发槽，不再为无人等待的请求跑满预算；每次请求在桥日志里记录 `done/failed ... in <ms>` 耗时行，排查慢请求先看这里（`%LOCALAPPDATA%\AINovel\codex-image-bridge\logs`）。

## 失败模式

- **前端长时间「生成中」最后超时**：codex 通道单图本来就要数分钟（复杂四视图可能超过 5 分钟），不是卡死。排查顺序：桥日志的 `done/failed in <ms>` 耗时行 → 业务表 `image.status`（`generating` = 还在跑或进程退出未愈合，`error` 带 `timed out after ...ms` = 服务端超时）→ 桥并发槽是否被占满。服务重启时卡在 `generating` 的状态由 `interruptedStateHealer` 启动愈合为 error。
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
