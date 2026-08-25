# VoxCPM2 音频半速播放排查

## 背景

VoxCPM2 的模型输出采样率由模型自身声明。历史桥接曾把 WAV 采样率写死为 24000Hz，而 VoxCPM2 v2 的输出是 48000Hz，结果会表现为语速变慢、音调降低和机械感。

## 当前规则

- `D:\Github\VoxCPM\openai_speech_server.py` 写 WAV 时必须读取 `model.tts_model.sample_rate`，模型属性缺失才允许使用兼容回退值。
- 任何新的桥接或落盘代码都不能写死采样率；换模型版本时先核对模型声明值。
- 桥接文件修改后必须重启占用 18761 的实例，并确认没有旧 Gradio 桥抢占端口。

## 排查顺序

1. 读取生成 WAV 的 `fmt` 块确认实际采样率。
2. 检查桥接日志的模型加载和合成记录。
3. 再检查 `audio_type`、`speaker`、`emotion_prompt` 和参考音频是否正确。

历史上已经保存的错误采样率音频不会自动修复，需要重新生成状态音色、旁白试听或分镜配音。

## 相关模块

- `scripts/start-voxcpm2-bridge.cjs`
- `server/src/services/audio/speechProvider.ts`
- `server/src/services/drama/audio/DramaVoiceDesignService.ts`
- `server/src/services/drama/audio/DramaDialogueAudioService.ts`
