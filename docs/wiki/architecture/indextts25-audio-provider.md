# IndexTTS 2.5 本地音频供应商

## Background

项目的音频槽位服务角色配音、旁白试听、状态音色和漫剧分镜配音。当前本地模型使用 `D:\Tools\yzy-index-tts-2.5-260824` 整合包：`启动.bat` 提供 9000 端口的网页工作台，网页的「API 服务」页拉起独立的 `app_api.py`，默认监听 9005。

## Decision

- 音频槽位 provider 固定为 `indextts25`，注册在 `server/src/llm/providers.ts`，默认地址 `http://127.0.0.1:9005`，默认模型标识 `index-tts-2.5`。
- 根目录 `pnpm dev` 和 `server` 的开发启动命令只调用 `scripts/start-indextts25-api.cjs`，不再启动 VoxCPM2，也不把 9000 网页进程误判成可合成 API。
- 业务统一经过 `server/src/services/audio/speechProvider.ts`；IndexTTS 协议、参考音频处理和情绪能力判断集中在 `server/src/services/audio/indexTTS25.ts`。
- `server/src/services/drama/audio/IndexTTS25TTSProvider.ts` 只负责把 `TTSGenerationRequest` 映射到公共音频入口。剧情角色名不是 IndexTTS 的 `speaker` 名，不能直接作为 speaker 发送；默认使用 `default`，如有 LoRA 则使用角色/旁白配置中的 `indexTTS25Speaker`，没有显式配置时再回落到 `INDEXTTS25_SPEAKER`。

## Current Rule

### API contract

- 健康检查：`GET http://127.0.0.1:9005/health`，启动就绪只要求 JSON `status=ok`；`model_loaded=false` 是正常的懒加载状态。
- 参考音频列表：`GET /voices`。合成：`POST /tts`，请求至少包含 `speaker`、`audio`、`text`，成功响应为 `audio/wav` 二进制。
- 默认参考音频为 `voices/测试参考音频.mp3`，可用 `INDEXTTS25_DEFAULT_REFERENCE_AUDIO` 覆盖；服务根目录可用 `INDEXTTS25_ROOT` 覆盖。
- 项目会把 data URL、HTTP(S) 音频地址或本地音频路径读取为字节，按 SHA-256 内容指纹缓存到 IndexTTS `voices/`，只新增或复用文件，不删除整合包原有音频。
- 角色和旁白的 `sampleAudioUrl` 只负责播放器预览；`referenceAudioUrl` 才是后续合成使用的稳定参考音频。文字生成的试听样本会自动物化到 `voices/` 并写入 `referenceAudioUrl`，因此“生成音色”不会停留在试听层。
- `GET /api/drama/index-tts25/catalog` 读取健康状态、已训练 speaker 和参考音频库；上传参考音频通过服务端内容寻址保存。LoRA 训练继续使用 9000 网页工作台，训练完成后刷新目录即可在业务音色卡中选择。
- 角色对白和旁白都使用参考音频克隆；情绪描述在健康状态声明 `qwen_emo=true` 时映射为 `emo_control_method=3` / `emo_text`，否则使用参考音色模式，避免低显存实例因为可选情绪模块缺失而阻断配音。
- `speed` 映射为 `duration_factor=1/speed`，并限制在 IndexTTS 支持的 0.5~2.0 范围。返回音频继续走公共 PCM16 WAV 响度归一化与 data URL 封装。

### Startup and troubleshooting

- API 启动器默认使用 `.venv\Scripts\python.exe app_api.py --host 127.0.0.1 --port 9005`，日志位于 `%LOCALAPPDATA%\AINovel\indextts25-api\logs` 或项目 `runtime/indextts25-api/logs`。
- 9000 网页由整合包的 `启动.bat` 单独负责；网页中的「API 服务 → 启动服务」也会启动相同的 9005 API。不要同时为同一端口再手动启动第二个 `app_api.py`。
- 首个真实 `/tts` 请求会加载模型，耗时较长属正常；健康检查不会提前加载模型。验证时必须额外执行一次短文本合成，并检查返回体非空且 `Content-Type` 为 `audio/wav`。
- 如果报参考音频不存在，先检查 `INDEXTTS25_ROOT\voices` 和 `/voices` 返回值；如果报模型显存不足，先停止 9000 网页工作台中占用显存的克隆配音任务，再重试 API 合成。
- 旧 VoxCPM2 的配置和历史数据不做删除，但不再属于当前 provider、启动链或默认音频槽；18761 不应由本项目重新监听。

## Failure Modes

- 9000 网页可以打开但 9005 未运行：网页进程与 API 进程是独立的，需要在网页的「API 服务」页启动，或运行 `pnpm indextts25:api`。
- 9005 `/health` 正常但首个合成失败：优先查看 API 日志和 `voices` 文件是否有效；`model_loaded=false` 本身不是失败。
- 角色名被提示为不存在的 speaker：说明调用方绕过了适配层，把剧情角色名当成了 IndexTTS LoRA 名；所有业务调用必须经过 `synthesizeAudioSpeech`。
- 生成了角色试听但后续声音回到默认：检查角色 `voiceProfile` 是否有 `referenceAudioUrl` 或旧数据是否只有 `sampleAudioUrl`；兼容读取会把旧试听作为参考音频，重新生成后应物化为 `voices/app-<sha>.<ext>`。
- 旁白/角色换参考音频后仍复用旧音频：检查 `DramaDialogueAudioService.buildDialogueVoiceKey` 是否包含 `referenceAudioUrl`；该指纹是音频缓存复用的失效边界。

## Related Modules

- `server/src/services/audio/speechProvider.ts`
- `server/src/services/audio/indexTTS25.ts`
- `server/src/services/drama/audio/IndexTTS25TTSProvider.ts`
- `scripts/start-indextts25-api.cjs`
- `server/.env.example`
- `docs/superpowers/specs/2026-08-24-index-tts-2-5-switch-design.md`
