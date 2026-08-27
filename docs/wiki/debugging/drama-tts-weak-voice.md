# 漫剧配音"有气无力"（VoxCPM2 生成发虚无力）

## 背景

用户反馈漫剧角色配音"有气无力"：语气平、劲头不足。排查发现配音默认走 VoxCPM2 本地桥（`http://127.0.0.1:18761`，外部仓库 `D:\Github\VoxCPM\openai_speech_server.py`），该服务调用 `model.generate()` 时从未传 `cfg_value` / `inference_timesteps`，一直在跑引擎内置默认 `cfg=2.0 / steps=10`。官方对这两个参数的口径：cfg 越低生成越自由发散（不贴控制前缀与参考音色）、步数越低质量越差。实测同一句台词：默认参数下引擎原始输出有效 RMS 仅 -25 dBFS、峰值 -11 dBFS（整体发虚），显式传 `cfg=2.6 / steps=20` 后 RMS 升到 -15 dBFS、峰值 -1 dBFS，表达明显更有力。

## 决策

合成强度参数必须由应用侧显式下发，不允许落在引擎默认值上：

- 应用侧（`server/src/services/audio/speechProvider.ts`）在 VoxCPM2 的 `metadata` 里固定携带 `cfg_value`（默认 2.6，区间 1–3）与 `inference_timesteps`（默认 20，区间 1–50），可用环境变量 `VOXCPM2_TTS_CFG_VALUE`、`VOXCPM2_TTS_INFERENCE_TIMESTEPS` 回调。
- 引擎侧（VoxCPM 仓库 `openai_speech_server.py`）从 `metadata` 读取同名键并钳位后传给 `generate()`，旧请求不传时也用增强后的默认（2.6/20），并在 `[bridge]` 日志行输出 `cfg=`/`steps=` 便于核对。
- 公共出口的有效语音响度目标从 -18 dBFS RMS 提到 -16 dBFS（`DEFAULT_AUDIO_TARGET_RMS_DBFS`），峰值保护（-1 dBFS 天花板 + 压缩器）不变。

## 当前规则

- 排查"配音发虚/无力/平淡"类问题时，按顺序核对三层：
  1. 引擎合成参数：请求里是否带了 `cfg_value`/`inference_timesteps`，值是多少（看桥接 stderr 的 `[bridge] synth ... cfg= steps=` 行）；
  2. 参考音频：角色克隆用的试听/参考样本本身是否在弱参数下生成（弱参考会持续把克隆输出拉弱，需要重新生成试听）；
  3. 出口响度：`normalizePcm16WavVolume` 的目标 RMS（当前 -16）与峰值天花板（-1 dBFS）。
- 调大 `inference_timesteps` 会近似线性增加合成耗时（10→20 约翻倍），批量配音变慢时优先下调该值而不是 cfg。
- 修改 `openai_speech_server.py` 后必须重启 VoxCPM2 桥接服务才生效。

## 失败模式

- 只调响度归一、不动合成参数：输出变响但语气依旧发虚，因为能量是归一化"拉"上来的，表达力没有变。
- 角色参考音频是用旧弱参数生成的试听：即使新参数生效，克隆目标本身平淡，输出仍旧平淡——需在设置里重新生成角色试听。
- 引擎侧默认值与官方 Gradio demo 相同（2.0/10），容易误以为"默认即合理"；demo 是给用户手动调参的起点，不是服务质量保证。

## 相关模块

- `server/src/services/audio/speechProvider.ts`（合成参数下发、响度归一出口）
- `server/src/services/audio/audioLoudness.ts`（响度目标常量）
- `D:\Github\VoxCPM\openai_speech_server.py`（本地引擎服务，外部仓库）
- `server/src/services/drama/audio/`（漫剧配音 provider 与业务层）
