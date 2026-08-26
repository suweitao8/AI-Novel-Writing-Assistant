# Codex 本地供应商与桥接（图片 + 文本/视觉）

## 背景

mydrama 项目通过本机已登录的 Codex 订阅（Codex CLI 内置 `image_generation` 工具）生成图片，不需要真实 API Key。本项目沿用同一套本地桥接契约（端口 18766），保证两个项目可以共用同一台机器上的桥。

## 决策

- 供应商注册为内置 `codex`（`shared/types/llm.ts`、`server/src/llm/providers.ts`），名称显示为「Codex 图片」，默认指向 `http://127.0.0.1:18766/v1`，固定令牌 `CODEX_API_KEY=codex-bridge-local`。
- **文本/视觉通道**：桥新增 `POST /v1/chat/completions`，经 `codex exec --json`（read-only 沙箱、隔离 CODEX_HOME、`-i` 图片附件）转发文本与图片理解请求。JSON 能力声明为 true/true：`response_format` 由桥翻译成输出协议注入 agent prompt（工具调用走 `__codex_tool_call__` 信封协议），Zod 校验兜底。文本槽/视觉槽/图片槽已统一指向 codex。
- **模型锁（性价比策略）**：订阅额度统一在 `gpt-5.6-luna` 一个模型上，文本/视觉/图片三路同一 agent 驱动。落地为三层约束：注册表 `models` 仅此一项且 `supportsModelList=false`（设置页直接渲染注册表模型，不引入远程列表里的其它选项）；桥侧 `resolveChatModel` 对请求传入的任何模型名（含 `codex/` 前缀、供应商名、空值）一律钳制回落到配置的文本模型；`CODEX_TEXT_MODEL` / `CODEX_IMAGE_AGENT_MODEL` 只是运维兜底，不是用户可选开关。账号下其它 slug（gpt-5.5 / gpt-5.4 / gpt-5.4-mini）经 CLI 可用但产品通道不开放。
- **思考深度默认**：文本/视觉默认 `model_reasoning_effort=high`。实测小改写任务 low/medium/high/xhigh 总耗时 12.5s / 10.5s / 13.7s / 19.3s——low 与 high 差距仅秒级，因为 CLI 启动与注入内容等固定开销占大头；复杂结构化任务才是推理耗时增长点，也正是质量收益点，所以默认 high 不伤性价比。如需降档设 `CODEX_TEXT_REASONING_EFFORT`。图片通道的 agent 只做轻量规划（出图耗大头在 `image_generation` 工具本身），显式固定 low（`CODEX_IMAGE_AGENT_EFFORT` 可调），防止上游 CLI 默认值漂移拖慢出图。
- **模型 slug 诊断口径**：服务端 400 有两种语义——「The '<slug>' model is not supported when using Codex with a ChatGPT account」表示该 slug 对账号不存在（如 `luna`、`gpt-5.6`、`gpt-5.6-mini`）；「The 'gpt-5.6-luna' model requires a newer version of Codex」表示 slug 正确但本机 CLI 太旧，`npm i -g @openai/codex@latest` 升级即可（gpt-5.6-luna 实测在 0.149.1 可用，0.137.0 被拒）。另外 CLI 会自动加载 `~/.agents/skills` 与用户指令（约 +2 万 input tokens，大部分命中缓存），属正常现象；`--ignore-user-config` 只屏蔽 config.toml，不屏蔽 skills 注入。
- 图片模型走 `ProviderImageSettingsService` 的既有通道：`ImageModelProvider` 增加 `codex`，选项显示 `gpt-5.6-luna`（Images 协议占位 id，桥的图片生成实际由同一 luna agent 驱动、忽略请求体 model），env 读取 `CODEX_IMAGE_MODEL`，持久化在 `AppSetting`（key `provider.imageModel.codex`）。
- 桥接实现为仓库内零依赖 Node 脚本（`scripts/codex-image-bridge.cjs`），从 mydrama 的 Python 桥移植，协议一致；启动器 `scripts/start-codex-image-bridge.cjs` 对应 `pnpm codex:image`。
- Codex 桥支持 `size` → 宽高比（竖版封面 1024x1536 → 2:3）、`quality`、参考图（multipart `/images/edits`）与透明背景。**2026-08-22 起角色与道具的资产参考图（状态图/四视图/道具透视图）一律走 Codex 并要求透明底**：CLI 图片工具没有 `background` 字段，桥把 `background=transparent` 翻译成 agent prompt 硬约束（真 alpha 通道 PNG，禁止实底/棋盘格/地面），应用侧提示词与 `TRANSPARENT_IMAGE_OPTIONS`（background=transparent + output_format=png）双保险。Grok Build 固定输出 16:9 横版且不支持透明底与参考图编辑，仍只承担场景全景与无参考图封面。
- **edits（带参考图）路径会把透明底压平（2026-08-23 实测确认）**：提示词透明指令在纯生成路径有效（产出带 alpha），但 edits 路径（`-i` 参考附件）实测稳定返回 3 通道不透明纯色底 PNG，提示词救不回来。兜底是服务端确定性抠底 `server/src/services/image/backgroundKeying.ts` 的 `ensureTransparentBackground`：runner 落盘前（`resolveImageBytes` → 抠底 → `writeImageBytes`）对「请求了 background=transparent 且 outputFormat=png 且结果无 alpha」的图，采样四边主色（4bit 量化分桶，占比 ≥50% 才算纯色底——风景/场景底不碰），从边缘洪水填充与主色欧氏距离 ≤30 的连通像素置 alpha=0，主体保留；两个安全阀：边缘无主色原样返回、抠掉比例 >92% 原样返回（防整图纯色抠成空图）。契约锁定在 server/tests/backgroundKeying.test.js（含真实压平图验证口径：背景抠掉、四面板主体保留）。已带 alpha 的图直接原样返回不做二次处理。

## 当前规则

- 端口约定：`18766` 桥接（绑定 `0.0.0.0`，供 Docker 容器经 `host.docker.internal` 访问）。
- 业务路由规则（2026-08-22/23 起）：`resolveAssetImageProvider` 里 kind=character/prop（透明底）/kind=scene（2:1 全景）无条件走 Codex；无参考图封面默认 `grok_build`，带参考图回退 Codex。不要在新调用点绕开 `assetProviderRouting` 硬编码通道。
- 桥的请求体是 OpenAI Images 兼容：JSON `{model, prompt, n, size, quality, background, response_format}`，`size` 会被翻译成宽高比与目标尺寸、`background=transparent` 会被翻译成透明底硬约束写进 agent prompt；带参考图时先由 `server/src/services/image/referenceImageFiles.ts` 按业务顺序把本地路径、服务端相对 URL、HTTP(S) URL 或 data URL 准备成本地文件，再走 multipart `/images/edits`，每一张图都作为独立 `image` 字段传给 CLI 的 `-i`。桥同时接收 `reference_labels`，把角色、场景、道具和摆位草图的用途按附件顺序写入 agent prompt；不会再把多张参考图压缩成单个 `input_image_url`，JSON 路径收到该字段会明确报错而不是静默丢参考。
- CLI 调用要点：`codex exec --ignore-user-config --ephemeral --json --enable image_generation -C <workdir> --skip-git-repo-check -s danger-full-access -m <agentModel> -c model_reasoning_effort="<effort>" -`，agent prompt 从 stdin 传入；每次调用使用隔离的临时 `CODEX_HOME`（只复制 `auth.json`/`cap_sid`），产物从该目录的 `generated_images` 下按 mtime 挑选本次新生成的图片。
- 并发上限默认 4（`CODEX_IMAGE_MAX_CONCURRENCY`），单次生成超时默认 900 秒（`CODEX_IMAGE_TIMEOUT_SECONDS`）。
- **应用侧超时（2026-08-23 同日二次调整：默认 180 秒快速失败）**：`IMAGE_GENERATION_HTTP_TIMEOUT_MS` 默认 3 分钟（`server/src/config/imageGeneration.ts`）。当天历程：300s → 900s（对齐桥预算，等慢图）→ 用户实测后决定收回 180s——超过 3 分钟大概率是环境问题（代理断开、桥异常），快速失败优于干等；因为桥已支持「客户端断开即杀 codex」（下一条），提前断开**不再**白烧订阅额度或占并发槽，900s 时代的教训已由断开终止根治。前端「生成中」实时显示已耗时，用户也可随时点「终止」。需要更长等待设 `IMAGE_GENERATION_HTTP_TIMEOUT_MS`（上限 900s）。
- **桥跟随客户端断开终止（2026-08-23）**：HTTP 客户端断开（服务端超时/取消）即 kill 本次 codex 进程并释放并发槽，不再为无人等待的请求跑满预算；每次请求在桥日志里记录 `done/failed ... in <ms>` 耗时行，排查慢请求先看这里（`%LOCALAPPDATA%\AINovel\codex-image-bridge\logs`）。
- **分镜参考图与场景光照契约（2026-08-24）**：分镜生成的参考顺序固定为「已确认摆位草图 → 出场角色当前状态图/角色设计稿 → 镜头地点的场景默认状态图 → 画面点名的道具图」。角色状态图和场景状态图不能只停留在预览元数据，必须在最终 multipart 请求中分别出现；桥日志中的 `refs=<数量>` 是实际附件数量证据。场景状态图是所有同场镜头的唯一光照基准，提示词锁定光源方向、色温、明暗比例、阴影和空气透视，并禁止角色单独打主光或镜头自行改成暖黄、冷蓝、血红、霓虹等新光照。没有场景状态图时只能使用结构化的场景状态事实，不能伪称已经有图像光照锚点。
- **参考图任务的失败策略**：参考图准备失败（URL 无法读取、data URL 非图片、本地文件不可读）必须在 Provider 请求前失败，禁止退化为无参考生成；显式指定不支持参考图的 provider 必须报错，默认路由会把带参考图的请求送到 Codex。批量分镜任务创建、旧 progress 读取和镜头处理统一把缺省 `useCharacterRefImages` 视为 `true`，避免旧任务恢复时悄悄关闭角色参考图。

## 失败模式

- **前端长时间「生成中」最后超时**：codex 通道单图本来就要数分钟（复杂四视图可能超过 5 分钟），不是卡死。排查顺序：桥日志的 `done/failed in <ms>` 耗时行 → 业务表 `image.status`（`generating` = 还在跑或进程退出未愈合，`error` 带 `timed out after ...ms` = 服务端超时）→ 桥并发槽是否被占满。服务重启时卡在 `generating` 的状态由 `interruptedStateHealer` 启动愈合为 error。
- codex CLI 未安装：桥 `/health` 返回 `ready: false`，`pnpm codex:image` 会在 120 秒后报错；可设置 `CODEX_IMAGE_EXECUTABLE` 指定路径。
- codex 登录态失效：CLI 以非零退出码结束，桥返回 502 并透传 stderr 尾部，任务层按现有图片任务重试规则处理。
- CLI 正常结束但没有新图片文件：桥报「Codex 结束运行但没有产出图片文件」，通常是订阅侧图片工具被拒或额度问题。
- 分镜结果角色外观漂移或同一场景光线跳变：先查看 `/keyframe/prepare` 返回的 `referenceImages`，再核对桥日志的 `refs` 与 `reference_labels`；如果预览有角色/场景但日志为 `refs=0`，问题在请求组装或 Provider 通道，不在提示词。若 `refs` 正确但仍漂移，再检查场景状态图是否为空、是否选错状态，以及最终提示词末尾的场景光照契约是否存在。
- Windows 直接 spawn npm 全局 `.cmd` 会抛 `EINVAL`（CVE-2024-27980 修复后行为），桥与启动器统一经 `cmd.exe /c` 启动，prompt 走 stdin 防止 `.cmd` 分词。

## 相关模块

- `shared/types/llm.ts`、`server/src/llm/providers.ts`、`server/src/llm/capabilities.ts`：供应商注册与能力声明。
- `server/src/services/settings/ProviderImageSettingsService.ts`：图片模型选项与持久化。
- `server/src/services/image/provider.ts`：OpenAI Images 兼容请求（JSON + multipart），codex 走通用分支，无特判。
- `scripts/codex-image-bridge.cjs`、`scripts/start-codex-image-bridge.cjs`：本地桥接与启动器。
- 前端 `/settings` 供应商卡片与封面 / 角色图对话框：数据驱动渲染，自动出现 codex 选项。
- 姊妹页面：[OpenCode Go 本地模型供应商与桥接](./opencode-go-provider.md)（文本通道，同为本地订阅桥接模式）。
