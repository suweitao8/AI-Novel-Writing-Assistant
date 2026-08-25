# VoxCPM2 本地音频供应商

## 背景

音频槽位负责角色配音、旁白试听、状态音色和漫剧分镜配音。当前默认使用本机 VoxCPM2：本地 GPU 推理、不消耗云端额度，并支持通过参考音频保持音色一致。

## 决策

- 音频槽位绑定 `voxcpm2`，默认地址为 `http://127.0.0.1:18761/v1`，默认模型为 `voxcpm2`。
- 正式桥接脚本是仓库外的 `D:\Github\VoxCPM\openai_speech_server.py`。项目不复用旧版 Gradio worker 桥；启动器必须同时通过 `/health` 和 `/v1/models` 校验后才认为服务可用。
- `pnpm dev`、`pnpm dev:log` 和服务端开发入口会先执行 `pnpm voxcpm2:bridge`，已就绪的桥直接复用，未启动时按 `VOXCPM2_ROOT`、`VOXCPM2_BRIDGE_PYTHON` 启动并等待模型预热。
- 所有业务合成统一经过 `server/src/services/audio/speechProvider.ts`；短剧链通过 `VoxCPM2TTSProvider` 适配。IndexTTS 2.5 仅作为显式兼容 provider 保留，不得进入默认注册或启动链。

## 当前规则

### 协议契约

- 端点：`POST {baseURL}/audio/speech`；客户端会在自定义 base URL 末尾自动补齐 `/audio/speech`。
- 请求体：`{ model, input, metadata }`。`metadata.audio_type` 区分 `narration`、`dialogue`、`thought`；对白传 `speaker`，情绪传 `emotion_prompt`，参考音频传 `audio_url`。
- `audio_url` 只接受音频 base64 data URL 或宿主机绝对路径。历史 IndexTTS 裸文件名不是 VoxCPM2 可读路径，必须过滤并回退到有效样本。
- 客户端固定传 `should_use_prompt_for_emotion: true`；有参考音频时才传 `reference_transcript`。
- 认证使用 `Authorization: Bearer <apiKey>`；未配置时使用本地默认令牌 `local-voxcpm2`。
- 成功响应通常为 `audio/wav` 二进制；公共出口也兼容 JSON 中的 `audio` 或 `audio.url`，并拒绝空音频。

### 声音设计与数据边界

- 对白/独白由桥接层构造 `({speaker}的中文声音；{emotion})文本`，旁白保持 `narration` 语义，不把角色名或旁白标签写进正文。
- `referenceAudioUrl` 是用户明确选择的稳定参考音频；`sampleAudioUrl` 是最近一次生成的试听结果。旁白「重新设计音色」没有明确参考音频时必须走 VoxCPM2 的 Voice Design，不得把上一轮 `sampleAudioUrl` 隐式回传为 `audio_url`，否则旧音色会锁住新描述（例如男声描述改为女声仍生成男声）。设计完成后，`sampleAudioUrl` 才作为后续旁白配音的克隆参考使用。两者都以 data URL 或绝对路径传递，不把 IndexTTS 文件名发送给 VoxCPM2。
- 设计请求若发现历史 `referenceAudioUrl` 是 IndexTTS 裸文件名或其他 VoxCPM2 不可读值，应忽略该值并在成功保存新试听时清除，避免下一次重新设计继续携带失效来源。
- 默认女性旁白描述应同时约束年龄区间、女中音音域、声音距离、语速、停顿、吐字和自然语气，并明确排除播音腔、主持腔、新闻腔；只写“温和、沉稳”等抽象情绪词容易让 Voice Design 产生偏平或不稳定的听感。该规则只约束空设置时的推荐描述，不覆盖用户已经保存的自定义描述。
- 旁白和角色的音频结果继续以 `data:audio/...;base64,...` 保存，视频合成直接消费该数据 URL。音色/文本/模型指纹变化时，已有分段必须进入 `stale` 并重新生成。
- 旧的 IndexTTS 字段保留用于读写兼容，但当前设置页不展示 IndexTTS 控件，也不会把 `indexTTS25Speaker` 传入默认 VoxCPM2 请求。

### 配置与启动

- 解析顺序：已保存槽位配置 > `VOXCPM2_API_KEY`、`VOXCPM2_BASE_URL`、`VOXCPM2_MODEL` > 注册表默认值。
- `VOXCPM2_ROOT` 默认 `D:\Github\VoxCPM`，桥接默认端口 18761；单独排查时执行 `pnpm voxcpm2:bridge`。
- `AUDIO_SPEECH_HTTP_TIMEOUT_MS` 默认适合本地 GPU 长耗时合成；禁止为了绕过端口占用改成其他端口，应该确认并处理同一项目的旧进程。
- 设置页音频槽的“测试连接”走 `probeAudioSpeechChannel`，实际合成固定短句，不以只返回 HTTP 200 的健康检查替代真实验证。

## 故障模式

- 18761 无响应或 `/v1/models` 没有 `voxcpm2`：检查桥接启动器输出、`%LOCALAPPDATA%\AINovel\voxcpm2-bridge\logs` 和 VoxCPM 目录，不要把 9000 网页进程当成 API。
- `/health` 返回 `model_loaded=false`：模型尚未预热完成；持续失败时查看桥接错误，不要让服务端先对外宣称可生成。
- 语速慢、音调低：先检查桥接写 WAV 使用 `model.tts_model.sample_rate`，VoxCPM2 v2 不能写死 24000Hz。
- 音色回到默认：检查 `referenceAudioUrl`/`sampleAudioUrl` 是否为有效 data URL 或绝对路径，以及 `voiceKey` 是否包含当前参考音频指纹。
- 重新设计旁白后性别或音色始终跟上一轮一样：先检查设计请求是否误把当前 `sampleAudioUrl` 当作 `audio_url`；无明确参考音频时应完全不传 `audio_url`，让描述进入 Voice Design 模式。
- 女性旁白偏平、疏离或播音感明显：先检查描述是否只包含性别和情绪形容词；使用包含音域、距离、语速、停顿和反播音约束的完整描述重新设计，并确认没有隐式参考音频。
- 旁白像角色对白：检查 `audio_type=narration` 和请求中没有 `speaker`；修复后依靠 `narration-v2` 指纹重新生成历史音频。

## 相关模块

- `server/src/services/audio/speechProvider.ts`
- `server/src/services/drama/audio/VoxCPM2TTSProvider.ts`
- `server/src/services/drama/audio/DramaDialogueAudioService.ts`
- `scripts/start-voxcpm2-bridge.cjs`
- `server/src/llm/modelCategories.ts` / `server/src/llm/providers.ts`
- `docs/wiki/debugging/voxcpm-bridge-sample-rate.md`
