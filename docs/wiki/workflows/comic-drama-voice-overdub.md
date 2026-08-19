# 漫剧配音（Voice Stage）设计与显示契约

## 背景

漫剧工作台的「配音」阶段最初只是一个跳转卡片（统计 + 链接到旧 Drama 工作台）。2026-08-19 参考旧项目 mydrama（D:\Github\mydrama，小说转短剧产品）的 voice-stage 配音体系，把逐行配音的界面与显示逻辑完整搬到漫剧工作台内。

## mydrama 原始设计（搬移依据）

- **旁白/对白二分**：每条台词行有说话人是「对白」（角色音色），没有说话人是「旁白」（项目旁白音色）。mydrama 用 beat.audio_type 表达，本项目用台词行是否匹配 `说话人：` 前缀表达。
- **一行一分段**：显示层按「行」组织（mydrama 的 AudioSegment），每行三态：可播放 / 已过期 / 未生成。过期判定来自生成时快照与当前状态的对比（mydrama 用 voice sha + text sha，本项目用 textHash + voiceKey）。
- **音色描述生成（design 模式）**：不克隆音频，用一句文字描述（年龄/性别/语气/节奏）作为情绪控制提示，让 VoxCPM2 用固定样句合成一段参考音。角色与旁白共用同一套「描述→试听」流程。
- **批量只补缺失**：Generate missing / Redo all 两种批量模式；重配时未变化的行复用已有音频，不做全量重合成。

## 当前实现

### 数据契约

- `DramaShot.dialogue`（JSON 前的原始文本）：每行 `说话人：台词` 或无前缀旁白行，由 `DramaDialogueAudioService.parseDialogueLines` 解析。
- `DramaShot.dialogueAudioData`（JSON）：
  - `items[].type`：`dialogue | narration`；
  - `items[].textHash`：生成时该行文本的 sha256 前 16 位；
  - `items[].voiceKey`：生成时音色指纹（voiceId|emotion/voicePrompt|speed，旁白为 `narrator|描述`）；
  - `items[].audioUrl`：base64 data URL（视频合成阶段直接消费，不可改此约定）。
- `DramaProject.narratorVoiceData`（JSON）：`{description, sampleAudioUrl, updatedAt}` 项目旁白音色。
- `DramaCharacter.voiceProfile`（JSON）：扩展 `{voicePrompt, sampleAudioUrl, sampleUpdatedAt}`；`voicePrompt` 无显式 emotion 时作为该角色台词的情绪提示传入。

### 状态判定（服务端算好，显示层只读）

`GET /drama/projects/:id/episodes/:order/audio-segments`（`DramaAudioSegmentsService`）输出每行分段的 `status`：

| 状态 | 判定 | 显示 |
|---|---|---|
| ready | 有 data URL 且 textHash、voiceKey 均与当前一致 | 绿点 + 播放器 |
| stale | 有 data URL 但文本或音色指纹变化 | 黄点 + 「已过期：台词或音色修改过，需要重新配音」，不显示播放器 |
| missing | 无音频 | 灰点 + 「未生成」 |

### 关键端点

- `POST /drama/projects/:id/shots/:shotId/audio`：单镜重配（`force:false` 只重合成该镜中变化/缺失的行；`force:true` 全镜重合成）。
- `POST /drama/projects/:id/episodes/:order/batch-jobs` type=tts：批量，`force:false`=只补缺失与过期，`force:true`=全部重配（orchestrator 透传 force，且估算把 force 模式下所有镜头计为可计费）。
- `POST /drama/projects/:id/characters/:characterId/voice-design`：角色音色描述→试听样音（存入 voiceProfile）。
- `GET/PATCH/POST /drama/projects/:id/narrator-voice[/design]`：项目旁白音色描述与试听。

### 前端

`client/src/pages/drama/comicDrama/VoiceStagePanel.tsx`：左列=分集/通道选择 + 汇总行（共 N 行 · 就绪 X · 需重配 Y（对白/旁白））+ 批量按钮 + 分段卡片列表；右列=旁白音色卡 + 角色音色卡（状态点：已就绪/待生成/未配置）。任务运行时轮询分段列表（2.5s）。

## 失败模式 / 注意

- 修改旁白描述或角色音色后，已有音频会自然变为 stale（voiceKey 变化），UI 标「已过期」——这是特性不是 bug，提示用户补配。
- 行内增删台词会使 lineIndex 错位，同镜多行可能集体过期——按镜重配即可恢复。
- 音频以 data URL 存于 `dialogueAudioData`，音色试听存于 voiceProfile/narratorVoiceData；都不要改成文件路径引用，视频合成链路依赖 data URL。
- 说话人不在角色列表时**不报错**：透传角色名让语音服务按名字描述音色（容忍分镜里的临时角色名）。

## 未搬部分（mydrama 有、本项目暂缓）

- 年龄段音色槽（child/youth/middle/elder 四槽 + 身份覆盖）——等漫剧出现「同一角色多年龄段」需求再做。
- 音色参考音频上传/录音/裁剪（ffmpeg 15s 规范化）与 sha256 去重归档。
- 对白行情绪取「引号外旁白文本」（dialogue_emotion_prompt）的自动推导。

## 相关模块

- `server/src/services/drama/audio/`（DialogueAudio/Segments/VoiceDesign 三个服务）
- `server/src/services/drama/production/DramaBatchOrchestrator.ts`（tts force 透传）
- `client/src/pages/drama/comicDrama/VoiceStagePanel.tsx`
- 旧项目对照：`mydrama src/novelvideo/seedance2_i2v/voice_clone.py`、`frontend/src/components/episode/voice-stage.tsx`、`audio/segmentation.py`

## 来源

旧项目知识索引见 `docs/wiki/architecture/mydrama-asset-index.md`。
