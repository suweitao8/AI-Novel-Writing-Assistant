# 音色/配音半速播放（VoxCPM 桥采样率写死）

## 背景

本地语音走 VoxCPM2 桥接：`D:/Github/VoxCPM/openai_speech_server.py`（端口 18761，**在主仓库之外、不进 git**）。服务端 `server/src/services/audio/speechProvider.ts` 只做 HTTP 透传，不感知采样率；`StoryAssetStateVoiceService` / `DramaVoiceDesignService` 把返回的 WAV 以 dataUrl 落库。2026-08-22 用户反馈生成的音色「完全不像人声、语速被放慢、音调偏低」。

## 根因

桥接写文件时写死了 `sf.write(..., samplerate=24000)`，而 VoxCPM2 的音频 VAE 是 16k 编码、**48k 输出**（`pretrained_models/VoxCPM2/config.json` 的 `out_sample_rate: 48000`）。48k 波形配上 24k 的 WAV 头，播放时整体**慢一倍、低一个八度、机械感**——这正是「不像人声 + 语速放慢」的完整症状，与提示词无关。官方参考实现（VoxCPM 仓库的 `app.py`、`src/voxcpm/cli.py`）一律使用 `model.tts_model.sample_rate`。

## 当前规则

- 桥接写 WAV 必须取 `model.tts_model.sample_rate`（2026-08-22 已修，属性缺失才回落 24000）。
- **换代模型时采样率会变**（VoxCPM v1 输出 24k、v2 输出 48k），任何桥接/落盘代码不得写死采样率。
- 排查「合成听感不对」的顺序：先读库里 WAV 头确认采样率，再怀疑控制指令/提示词。
- 桥接改完必须重启进程才生效；确认只有一个实例占用 18761（曾出现双实例并存：`.venv` 旧实例 + 系统 Python 实例，实际服务的是后启动的那个）。

## 排查命令

```bash
# 读库中试样的真实采样率（24 为 WAV fmt 块 rate 偏移）
cd server && node -e "
const db = require('better-sqlite3')('dev.db', { readonly: true });
const c = db.prepare(\"SELECT statesJson FROM Character WHERE id='<id>'\").get();
const s = JSON.parse(c.statesJson).states.find((x) => x.voice?.sampleAudioUrl);
console.log(Buffer.from(s.voice.sampleAudioUrl.split(',')[1], 'base64').readUInt32LE(24) + 'Hz');
"
# 桥接健康与重启
curl http://127.0.0.1:18761/health
cd /d/Github/VoxCPM && ./.venv/Scripts/python.exe openai_speech_server.py --port 18761
```

## 失效模式

- 历史坏样本不会自愈：24k 头的旧音频需重新生成（状态音色点「生成音色」、分镜配音重新合成）。
- 桥接进程由人工/独立脚本启动（不在 dev 启动链内），机器重启后需确认 18761 存活，否则音色/配音会报「语音合成失败」类连接错误。

## 相关模块

- `server/src/services/audio/speechProvider.ts`（透传层，无需改动）
- `modules/novel/story-settings/application/StoryAssetStateVoiceService.ts`、drama 配音链（dataUrl 落库方）
- `docs/wiki/debugging/codex-image-bridge-econnrefused.md`（1876x 本地通道端口表：18761 voxcpm2）
