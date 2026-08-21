# 本机 Grok Build 模型接入设计

## 背景

当前项目的文本模型默认走 OpenCode 本地桥接，图片模型默认走 Codex 图片桥接。旧项目已经验证过通过本机 `grok` 命令调用订阅额度的文本和图片链路，但旧实现位于另一个仓库，且文本桥接只返回一次性结果，不满足当前项目结构化调用使用的 SSE 流式协议。

本次需求是将当前模型切换到本机 Grok Build：文本任务使用 Grok CLI 订阅额度；角色、场景、道具的基础图片使用 Grok Build；现有 OpenCode、Codex 能力继续保留，方便之后切换或处理 Grok Build 不支持的图片能力。

## 目标

1. 在当前仓库内提供可启动、可健康检查、可复用的 Grok 文本桥接和 Grok Build 图片桥接，不依赖旧项目的目录、虚拟环境或运行进程。
2. 将文本模型分类默认路由切换到本机 Grok CLI，使用 `grok-4.6` 和用户本机订阅额度。
3. 将角色、场景、道具的无参考图基础资产路由到 Grok Build，并保持现有参考图、肖像比例、封面和分镜任务的兼容性。
4. 让当前 LLM 工厂和图片服务能够识别本地订阅桥接，不要求用户填写外部 API Key。
5. 为桥接协议、命令构造、结构化输出、流式响应和图片能力路由补充不消耗真实订阅额度的自动化测试。

## 非目标

- 不删除或替换现有直连 `grok` 云端 provider；`grok` 仍表示 xAI API，新增本地 provider 使用独立名称。
- 不把所有图片任务全局切换到 Grok Build。旧 Grok Build 图片 CLI 固定生成 16:9、1280x720，并且当前实现不接收参考图；全局替换会破坏肖像、封面、参考图编辑和多素材分镜流程。
- 不修改旧项目 `D:\Github\mydrama` 的代码、虚拟环境或配置。
- 不在自动化测试中调用真实 Grok 生成，以免无意消耗用户订阅额度；真实生成只在桥接启动后的人工验收阶段按需执行。
- 不执行数据库重置、删除或不可逆迁移。provider 默认值通过代码配置和现有设置解析层提供，保留已有设置数据。

## 方案选择

### 方案 A：当前仓库内置 Node 桥接（采用）

在 `scripts/` 中实现两个本地 OpenAI 兼容服务：文本桥接监听 `18764`，图片桥接监听 `18767`。桥接内部调用用户本机的 `grok.exe`，并由启动器负责定位 CLI、复用健康进程、启动隐藏子进程、保存日志和等待健康状态。

优点是当前仓库自洽、可迁移、能统一处理当前项目的协议要求；文本桥接可以补齐 `llm.stream()` 所需的 SSE 转换；图片桥接可以使用现有 `sharp` 归一化生成结果。缺点是需要维护一层本地进程管理和协议适配。

### 方案 B：直接复用旧项目 Python 桥接

让当前项目配置指向旧项目的 `grok_cli_bridge.py` 和 `grok_image_bridge.py`。实现量最小，但依赖旧项目路径和 Python 环境；旧文本桥接明确拒绝 `stream: true`，与当前结构化调用链不兼容，也会让当前仓库无法独立运行。因此不采用。

### 方案 C：服务端业务代码直接启动 Grok CLI

在每次文本或图片请求中由 Node 服务直接创建 CLI 子进程，不提供 HTTP 桥接。虽然少一个常驻服务，但会把 CLI 会话、结构化输出、SSE 和图片产物发现逻辑散落到业务服务中，难以健康检查、测试和后续替换 provider。因此不采用。

## 架构设计

### Provider 标识与端口

使用独立 provider 标识，避免将本机订阅桥接和 xAI API 混为一谈：

| 能力 | Provider | 默认模型 | 地址 | 本地凭证 |
| --- | --- | --- | --- | --- |
| 文本 | `grok-cli` | `grok-cli/grok-4.6` | `http://127.0.0.1:18764/v1` | `local-grok-cli` |
| 基础资产图片 | `grok_build` | `grok-build-image` | `http://127.0.0.1:18767` | `grok-bridge-local` |

`grok-cli` 和 `grok_build` 作为本地订阅 provider，不要求用户配置外部 API Key；本地 bearer 值只用于防止非预期的本机请求，不代表云端密钥。

### 文本桥接

新增 `scripts/grok-cli-bridge.cjs` 和对应启动器。桥接提供：

- `GET /health`：返回 CLI 是否存在、provider、模型和订阅模式。
- `GET /v1/models`：暴露 `grok-cli/grok-4.6`。
- `POST /v1/chat/completions`：接受 OpenAI 兼容消息、`response_format` 和工具参数。
- 本地 bearer 校验、请求体大小限制、超时和错误映射。
- 将消息转换为隔离临时工作目录中的 prompt 文件，使用无工具、无联网、无子代理、无记忆、自动批准的 headless CLI 参数。
- 解析 Grok CLI 的 JSON、代码围栏 JSON 和截断结果；有结构化 schema 时优先生成符合 schema 的结果。
- `stream: true` 时返回 OpenAI 兼容 SSE，并在结束时发送 `[DONE]`；非流式请求返回标准 completion。这样 `invokeStructuredLlm` 的 `llm.stream()` 和普通调用都使用同一条桥接。
- 将结构化结果映射为正文，必要时映射为单个工具调用，保持现有 OpenAI 兼容工厂不变。

桥接不得把用户 prompt 拼接进 shell 命令；所有动态内容通过临时文件或参数数组传递。每次请求使用独立会话目录，完成后清理临时文件。

### 图片桥接

新增 `scripts/grok-build-image-bridge.cjs` 和对应启动器。桥接提供 OpenAI 图片接口：

- `GET /health`：返回 CLI 是否存在和 Grok Build 图片能力状态。
- `POST /v1/images/generations`：调用一次 Grok Build 图片工具，默认每请求一张图。
- `POST /v1/images/edits`：对参考图请求返回明确的“不支持参考图编辑”错误，不伪装成成功生成。
- 固定输出为 PNG、1280x720、16:9；使用当前服务已有的 `sharp` 进行尺寸和格式归一化。
- 从 Grok 会话产物目录读取最新图片，以 base64/data URL 返回给现有图片服务。
- 限制 `n` 和请求体大小，统一处理 CLI 超时、无图片产物和图片解码失败。

Grok Build 图片提示词只负责生成一张基础资产，不允许调用 shell、修改项目文件或使用网页搜索。真实的参考图编辑、肖像比例和其他尺寸由能力路由保留给 Codex。

### Provider 路由

文本分类默认改为 `grok-cli`，OpenCode 仍保留为可切换 provider。文本主链路不增加静默 OpenCode fallback：如果 Grok 桥接不可用，系统应显示明确的 provider 不可用错误，避免用户以为正在使用 Grok 额度却实际消耗了其他模型。

图片分类仍保持 Codex 作为全局默认，以保护现有图片能力。角色、场景、道具的“基础资产生成”在服务层按能力路由到 `grok_build`：

- 只有文本提示词、无需参考图且允许 16:9 的基础资产请求走 Grok Build。
- 带参考图、要求肖像/封面/其他尺寸、参考图编辑或多素材分镜请求继续走 Codex。
- 如果调用方明确要求 Grok Build 但请求能力不兼容，返回可操作的能力错误，而不是偷偷换 provider。
- 角色、场景、道具的状态生成继续携带完整的初始状态描述；provider 只负责执行图片任务，不改变状态持久化契约。

### 生命周期

新增启动器复用旧项目已验证的生命周期约定：

- 文本和图片桥接分别检测健康状态，已健康时复用，不重复启动。
- 默认日志写入 `%LOCALAPPDATA%\\AINovel\\grok-build-bridge`，不把订阅凭证写入日志。
- 支持 `GROK_CLI_PATH` 覆盖 CLI 路径；未配置时在 Windows 使用 `~/.grok/bin/grok.exe`。
- 启动脚本等待两个 `/health` 都 ready 后才报告成功；API/frontend 重启时不改变项目固定端口 `3100` 和 `5174`。
- bridge 进程异常退出时只报告 provider 不可用，不自动切换到其他模型。

## 配置与兼容

- 在 provider 配置中注册 `grok-cli` 和 `grok_build`，标记为本地订阅 provider，并提供默认 base URL、模型和本地 bearer。
- 扩展 provider 类型和模型分类解析，使本地 provider 可以在没有数据库 APIKey 的情况下创建 OpenAI 兼容客户端。
- 保持已有 `llm.currentSelection`、APIKey 和 AppSetting 数据兼容；没有显式旧选择时，文本分类默认使用 `grok-cli`。
- 不写入用户真实 Grok 凭证；CLI 的登录状态继续由本机 Grok 工具管理。
- 启动命令和 `.env.example` 提供端口、CLI 路径、超时和本地 token 的可选覆盖。

## 测试与验收

### 自动化测试

- 文本 CLI 命令构造：模型、schema、无工具和安全参数正确传递，prompt 不通过 shell 拼接。
- 文本输出解析：标准 JSON、代码围栏 JSON、截断 JSON、空结果和错误结果。
- 文本 HTTP：健康检查、模型列表、bearer 校验、结构化请求、工具调用映射和 SSE 流式结束标记。
- 图片 CLI：一次生成、会话图片发现、PNG/1280x720 归一化、无图片产物和参考图编辑拒绝。
- Provider 路由：文本默认 `grok-cli`；角色/场景/道具基础图片走 `grok_build`；参考图和不兼容尺寸保留 Codex。
- 既有 LLM 工厂和图片服务的 focused tests、shared/server build、`git diff --check`。

### 本机验收

1. 启动两个桥接并确认 `18764`、`18767` 健康。
2. 通过 `/v1/models` 确认本机 provider 和模型可见。
3. 通过项目 API 检查当前文本路由和基础资产路由，不进行真实生成。
4. 在确认会消耗订阅额度后，再按需执行一次最小文本和一次最小图片生成，确认真实 CLI 产物能被项目读取。
5. 重启 API/frontend，确认页面仍能连接，且桥接进程可复用。

## 文档与发布

实现后更新 `docs/wiki/architecture/` 中的模型 provider 边界和 `docs/wiki/workflows/` 中的图片能力路由规则；由于模型默认和资产生成行为对用户可见，同时更新 release notes 和 README 最新更新。若只涉及内部测试或桥接实现而没有额外用户可见变化，则不额外扩展文案。

## 风险与回滚

- Grok CLI 版本或会话产物格式变化：通过 `/health`、版本记录、适配层测试和日志明确报错；provider 可暂时切回 OpenCode/Codex。
- Grok Build 不支持参考图或非 16:9：能力路由在请求进入桥接前判断，保留 Codex 处理兼容任务。
- 本机 CLI 未登录或订阅不可用：健康检查返回 not ready，文本请求直接给出 Grok provider 不可用信息，不伪造成功。
- 回滚只需恢复文本分类默认 provider 和基础资产路由，停止两个桥接；不涉及数据库破坏性操作。
