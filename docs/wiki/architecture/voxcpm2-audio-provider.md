# VoxCPM2 本地音频供应商

## 背景

产品需要角色配音与朗读能力（音频模型槽位）。与文本（OpenCode 订阅桥）、图片（Codex 订阅桥）一致，音频选择了本机部署的 VoxCPM2 语音模型：本地 GPU 推理、不消耗云端额度、支持音色克隆。接入方式对齐旧项目 mydrama 已验证的桥接协议，两侧共享同一个本机服务。

## 决策

- 音频槽位绑定 `voxcpm2` 内置供应商（`server/src/llm/providers.ts`），默认服务地址 `http://127.0.0.1:18761/v1`，默认模型 `voxcpm2`。
- 桥接服务是 OpenAI `/v1/audio/speech` 兼容协议的独立进程（mydrama 仓库 `scripts/voxcpm2_openai_bridge.py`），把 HTTP 请求翻译为 VoxCPM2 Gradio worker 调用并序列化生成请求。
- 合成入口唯一化：`server/src/services/audio/speechProvider.ts` 的 `synthesizeAudioSpeech`。任何新音频消费方（朗读、有声书等）都必须走这个入口，不要在业务代码里直接 fetch 桥接地址。

## 当前规则

### 协议契约（与桥接实现严格对应）

- 端点：`POST {baseURL}/audio/speech`（`baseURL` 不以 `/audio/speech` 结尾时自动拼接）。
- 认证：`Authorization: Bearer <apiKey>`，未配置时默认 `local-voxcpm2`；密钥错误返回 401 `{"error":"invalid_api_key"}`。
- 请求体：`{ "model": string, "input": string, "metadata": object }`。
- `metadata` 支持的字段：
  - `audio_type`：`narration`（旁白，默认）/ `dialogue`（对白）/ `thought`（内心独白）；对白类会结合 `speaker` 构造「某角色的中文声音」控制文本；
  - `speaker`：说话角色名；
  - `emotion_prompt`：情感/语气提示；
  - `audio_url`：音色克隆参考音频，支持 base64 `data:` URL 或宿主机文件路径；不传则走音色设计模式；
  - `reference_transcript`：参考音频的文字内容（仅在有参考音频时有效）；
  - `should_use_prompt_for_emotion`：布尔，客户端固定传 `true`；
  - `cfg` / `normalize` / `denoise` / `inference_timesteps`：采样参数，一般不需要传。
- 响应：成功返回 `Content-Type: audio/mpeg` 的二进制；失败返回 `{ "error": string }` JSON（4xx/5xx）。`speechProvider` 同时兼容 JSON 内含音频 URL 的返回（`audio` 字符串或 `audio.url`）。

### 配置与解析

- 解析顺序与文本/图片槽一致：`APIKey` 表已保存配置 > 环境变量（`VOXCPM2_API_KEY` / `VOXCPM2_BASE_URL` / `VOXCPM2_MODEL`）> 注册表默认值。
- `requiresApiKey: false`：设置页音频卡片显示“API Key（可选）”，本地部署无需填写。
- `supportsModelList: false`：桥接不提供 `/models`，`modelCatalog.getProviderModels` / `refreshProviderModels` 对该供应商直接返回注册表模型，保存配置时不会再报“模型列表刷新失败”。
- 超时：`AUDIO_SPEECH_HTTP_TIMEOUT_MS`（默认 600000ms，范围 30000–1800000，见 `server/src/config/audioSpeech.ts`）；本地 GPU 合成较慢，长文本请预留足够时间。

### 消费方

- 模型设置音频卡片：状态来自 `/api/settings/model-categories`；连通测试走 `POST /api/settings/model-categories/audio/test`（`probeAudioSpeechChannel` 合成固定短语「音频通道连接测试。」，返回耗时与字节数）。
- 短剧对白配音链：`server/src/services/drama/audio/VoxCPM2TTSProvider.ts` 把 `TTSProviderPort` 请求映射为 `audioType=dialogue` + speaker + emotion，合成结果以 `data:audio/mpeg;base64,...` 形式写入 `DramaShot.dialogueAudioData`。
- 文本模型能力表（`llm/capabilities.ts`）：`voxcpm2` 的 JSON 能力固定为 false，防止被任务路由误选为文本模型。

## 故障模式

- 桥接未启动：18761 端口无响应或 404，设置页“测试连接”报连接失败；启动 mydrama 仓库的 `scripts/voxcpm2_openai_bridge.py`（前置条件：本机 VoxCPM2 Gradio 服务在 7860 端口可用）。
- `GET /health` 返回 `worker_ready=false`：Gradio worker 未就绪，等 worker 启动完成后再试。
- 合成返回 502 `VoxCPM2 ...`：worker 侧生成失败（显存不足、参考音频损坏等），错误信息会透传给调用方。
- 请求中文文本出现 `utf-8 codec can't decode` 类错误：调用侧把文本按非 UTF-8 编码发出（例如 Windows shell 直接内联中文 JSON），需确保请求体以 UTF-8 编码发送。
- 空音频：`speechProvider` 校验字节为空并抛错，不会把空文件当成功结果。

## 相关模块

- `server/src/services/audio/speechProvider.ts`：合成入口、槽位配置解析、连通探测。
- `server/src/config/audioSpeech.ts`：超时配置。
- `server/src/llm/providers.ts` / `server/src/llm/modelCategories.ts`：供应商注册与音频槽位。
- `server/src/routes/settings.ts`：`/model-categories` 与音频连通测试路由。
- `server/src/services/drama/audio/`：TTS 端口、VoxCPM2 适配器、对白配音服务。
- 相关文档：`docs/wiki/architecture/model-categories.md`。
