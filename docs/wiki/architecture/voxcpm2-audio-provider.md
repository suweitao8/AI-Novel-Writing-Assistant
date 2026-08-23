# VoxCPM2 本地音频供应商

## 背景

产品需要角色配音与朗读能力（音频模型槽位）。与文本（OpenCode 订阅桥）、图片（Codex 订阅桥）一致，音频选择了本机部署的 VoxCPM2 语音模型：本地 GPU 推理、不消耗云端额度、支持音色克隆。接入方式对齐旧项目 mydrama 已验证的桥接协议，两侧共享同一个本机服务。

## 决策

- 音频槽位绑定 `voxcpm2` 内置供应商（`server/src/llm/providers.ts`），默认服务地址 `http://127.0.0.1:18761/v1`，默认模型 `voxcpm2`。
- 桥接服务是 OpenAI `/v1/audio/speech` 兼容协议的独立进程：本机 `D:\Github\VoxCPM\openai_speech_server.py`（FastAPI，直接加载本地 VoxCPM2 模型；默认 18761，启动时预载模型）。mydrama 仓库的 `scripts/voxcpm2_openai_bridge.py`（Gradio worker 版）是声音设计口径的参照实现，不得作为本项目的运行桥接。
- 根目录 `pnpm dev` / `pnpm dev:log` 会先执行 `pnpm voxcpm2:bridge`：复用已通过 `/health` 与 `/v1/models` 双重校验的正式桥，未运行时按 `VOXCPM2_ROOT`、`VOXCPM2_BRIDGE_PYTHON` 启动它，并等待模型加载完成。这样开发服务器不会在音频桥尚未就绪时先对外提供“可生成”页面。
- **声音设计走 `(control)` 指令前缀（2026-08-22 修复，对齐 mydrama 验证过的口径）**：对白/独白 control = `「{speaker}的中文声音；{emotion_prompt}」`，emotion 缺省时兜底「自然口语化、像真实人物交流，不要播音腔，不要新闻播报感」；旁白 control = emotion 或「以自然、清晰、连贯的中文旁白语气朗读」；最终喂给模型的是 `({control}){text}`（VoxCPM2 的 instruct 声音设计格式）。`metadata.audio_url`（base64 data URL 或宿主机路径）解码后走 `reference_wav_path` 参考克隆。**禁止回到「把角色名拼进正文（`名字说：`）」的做法**——那会让模型凭空乱猜音色，实测产出极低沉的机械怪声；也禁止丢掉 `emotion_prompt` 不传。
- 合成入口唯一化：`server/src/services/audio/speechProvider.ts` 的 `synthesizeAudioSpeech`。任何新音频消费方（朗读、有声书等）都必须走这个入口，不要在业务代码里直接 fetch 桥接地址。
- 响度统一也放在这个公共出口：对桥接返回的 PCM16 WAV 只统计高于 -40 dBFS 的有效语音样本，将 RMS 归一到约 -18 dBFS，并把峰值限制在 -1 dBFS 以内；非 WAV 音频保持原样。VoxCPM2 的 `normalize=true` 只做文字规范化，不能替代这层音频响度处理。

## 当前规则

### 协议契约（与桥接实现严格对应）

- 端点：`POST {baseURL}/audio/speech`（`baseURL` 不以 `/audio/speech` 结尾时自动拼接）。
- 认证：`Authorization: Bearer <apiKey>`，未配置时默认 `local-voxcpm2`；密钥错误返回 401 `{"error":"invalid_api_key"}`。
- 请求体：`{ "model": string, "input": string, "metadata": object }`。
- `metadata` 支持的字段：
  - `audio_type`：`narration`（旁白，默认）/ `dialogue`（对白）/ `thought`（内心独白）；对白/独白类会结合 `speaker` 构造「某角色的中文声音」control 指令（见上方声音设计规则）；
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
- **角色状态音色的 AI 估算（2026-08-22 用户要求）**：生成状态音色时，音色描述为空、或只是共享归一化预填的通用占位（含 `GENERIC_CHARACTER_VOICE_PROMPT_TAIL`「自然清晰的说话声音」尾缀）→ 先走 `novel.character.voice_profile@v1`（选角配音导演：按性别/年龄段/外貌/画面提示词/状态变化推断一条中文音色描述，基线「像真人日常交流」，禁止无依据的沙哑/低沉/机械音）再合成；估算结果只写 `voice.prompt`（本次生成），不回填状态表单——用户显式填写的音色提示词永远优先；估算失败时通用占位仍可兜底合成，只有真正为空才 400。服务在 `StoryAssetStateVoiceService`（`estimateVoiceProfile` 依赖可注入，契约锁定在 `tests/storyAssetStateVoice.test.js`）。

## 故障模式

- 桥接未启动：18761 端口无响应或 404，设置页“测试连接”/音色生成报「上游模型服务连接失败」；正常启动链会自动拉起，单独运行服务端时执行 `pnpm voxcpm2:bridge`。启动器只接受正式 FastAPI 桥的 `/health` + `/v1/models` 响应，不会把旧 Gradio 桥误判为可用。
- 音色极低沉、机械/怪物感（2026-08-22 实测教训）：旧版桥把 emotion_prompt 丢掉、还把「角色名说：」拼进正文，模型只能凭空乱猜音色。修复后若再出现，先查桥日志 `[bridge] synth ... emotion=yes/no ref=yes/no` 确认 control 与参考克隆是否生效，再查 emotion_prompt 内容是否过度戏剧化。
- `GET /health` 返回 `model_loaded=false`：正式桥仍在加载模型或记录了加载错误，等待启动器完成；若持续失败，查看 `VOXCPM2` 桥日志。
- 合成返回 502 `VoxCPM2 ...`：worker 侧生成失败（显存不足、参考音频损坏等），错误信息会透传给调用方。
- 请求中文文本出现 `utf-8 codec can't decode` 类错误：调用侧把文本按非 UTF-8 编码发出（例如 Windows shell 直接内联中文 JSON），需确保请求体以 UTF-8 编码发送。
- 空音频：`speechProvider` 校验字节为空并抛错，不会把空文件当成功结果。
- 旁白比角色试听明显小：先检查生成结果的有效语音响度；如果两条链路都经过同一个 `synthesizeAudioSpeech`，公共出口会自动统一 PCM16 WAV。历史上已经保存的旧样本不会被静默改写，重新生成后才会使用统一响度。

## 相关模块

- `server/src/services/audio/speechProvider.ts`：合成入口、槽位配置解析、连通探测。
- `server/src/config/audioSpeech.ts`：超时配置。
- `server/src/llm/providers.ts` / `server/src/llm/modelCategories.ts`：供应商注册与音频槽位。
- `server/src/routes/settings.ts`：`/model-categories` 与音频连通测试路由。
- `server/src/services/drama/audio/`：TTS 端口、VoxCPM2 适配器、对白配音服务。
- 相关文档：`docs/wiki/architecture/model-categories.md`。
