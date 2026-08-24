# 漫剧配音（Voice Stage）设计与显示契约

## 背景

漫剧工作台的「配音」阶段最初只是一个跳转卡片（统计 + 链接到旧 Drama 工作台）。2026-08-19 参考旧项目 mydrama（D:\Github\mydrama，小说转短剧产品）的 voice-stage 配音体系，把逐行配音的界面与显示逻辑完整搬到漫剧工作台内。

## mydrama 原始设计（搬移依据）

- **旁白/对白二分**：带 `旁白` 标记或没有说话人前缀的是「旁白」（项目旁白音色），其余有角色名的是「对白」（角色音色）。mydrama 用 beat.audio_type 表达，本项目由 `parseDialogueLines` 统一归类；历史格式 `旁白（语气）：内容` 也必须归为旁白并丢弃行内语气。
- **一行一分段**：显示层按「行」组织（mydrama 的 AudioSegment），每行三态：可播放 / 已过期 / 未生成。过期判定来自生成时快照与当前状态的对比（mydrama 用 voice sha + text sha，本项目用 textHash + voiceKey）。
- **音色描述生成（design 模式）**：不克隆音频，用一句文字描述（年龄/性别/语气/节奏）作为情绪控制提示，让 IndexTTS 2.5 用固定样句合成一段参考音。角色继续按角色资产维护；旁白统一由系统设置维护，所有漫剧项目共用一份旁白参考样本。
- **批量只补缺失**：Generate missing / Redo all 两种批量模式；重配时未变化的行复用已有音频，不做全量重合成。

## 当前实现

### 数据契约

- `DramaShot.dialogue`（JSON 前的原始文本）：每行 `角色名（语气）：台词`、`旁白：内容` 或无前缀旁白行，由 `DramaDialogueAudioService.parseDialogueLines` 解析；只有角色对白产生 `emotion`，旁白不显示也不透传行内语气。
- `DramaShot.dialogueAudioData`（JSON）：
  - `items[].type`：`dialogue | narration`；
  - `items[].textHash`：生成时该行文本的 sha256 前 16 位；
- `items[].voiceKey`：生成时音色指纹（对白包含 voiceId/行内语气/角色提示/语速/状态样本；旁白为 `narrator|narration-v2|描述|sampleSha256`）。旁白指纹带语义版本，避免历史上按对白控制生成的旧音频继续被当作可用素材。
- `items[].audioUrl`：base64 data URL（视频合成阶段直接消费，不可改此约定）。
- TTS 请求必须显式携带 `audioType`：旁白使用 `narration`，不透传说话人；角色对白使用 `dialogue`，并透传角色名。提供方只能执行这一语义，不得把所有请求硬编码为对白或根据缺省字段猜测。
- `AppSetting` 的 `drama.globalNarratorVoice`（JSON）是系统旁白唯一权威来源：`{description, sampleAudioUrl, sampleText, sampleSha256, source, updatedAt}`。合成与 stale 投影都读取它，旁白请求把 `sampleAudioUrl` 交给 IndexTTS 2.5 适配层缓存并作为 `/tts` 的 `audio` 参考文件。
- `DramaProject.narratorVoiceData` 只保留为兼容迁移来源。系统设置首次读取且全局 key 为空时，会从第一个有有效旧旁白的项目迁移一次并写入 `AppSetting`；旧项目旁白接口仍保留，但委托系统设置服务，不再写回项目字段。
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
- `GET/PATCH/POST /settings/narrator-voice[/design]`：系统旁白音色读取、描述保存和生成试听。旧的 `GET/PATCH/POST /drama/projects/:id/narrator-voice[/design]` 仅为兼容入口，实际读写同一份系统设置。
- `server/scripts/import-drama-narrator-voice.cjs --source <音频路径> [--metadata <JSON路径>]`：一次性把旧项目已经生成的旁白参考音频导入当前 SQLite 的 `AppSetting`。导入工具只接受显式路径，不依赖旧项目目录，也不删除音频或数据库数据。

### 前端

`client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx`：系统级旁白音色页面，提供描述保存、生成/重新生成试听和原生播放器。`client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx` 只显示当前章节的一行一镜配音列表；批量工具栏固定为「生成分镜 / 生成配音或重新配音 / 合成」，章节由 `ComicDramaStudioPage` 顶栏工作区传入，不再在列表内重复选择章节或维护项目级音色面板。任务运行时轮询项目与分段列表。

## 失败模式 / 注意

- 修改旁白描述或角色音色后，已有音频会自然变为 stale（voiceKey 变化），UI 标「已过期」——这是特性不是 bug，提示用户补配。
- 如果旁白整体听起来像角色对白、出现角色式控制语气，应先检查 TTS 提供方是否丢失 `audioType`；旁白应走 `narration` 控制且不带角色说话人，修复后依靠 `narration-v2` 指纹让旧音频重新生成。
- 行内增删台词会使 lineIndex 错位，同镜多行可能集体过期——按镜重配即可恢复。
- 音频以 data URL 存于 `dialogueAudioData`，角色试听存于 `voiceProfile`，系统旁白试听存于 `AppSetting` 的 `drama.globalNarratorVoice.sampleAudioUrl`；都不要改成文件路径引用，视频合成链路依赖 data URL。旁白 voice key 保存 SHA-256 指纹而不是把完整样本重复写入每一行。
- 说话人不在角色列表时**不报错**：透传角色名让语音服务按名字描述音色（容忍分镜里的临时角色名）。

## 未搬部分（mydrama 有、本项目暂缓）

- 年龄段音色槽（child/youth/middle/elder 四槽 + 身份覆盖）——等漫剧出现「同一角色多年龄段」需求再做。
- 音色参考音频上传/录音/裁剪（ffmpeg 15s 规范化）仍未纳入页面；当前只支持通过显式路径导入旧项目样本，导入时计算 SHA-256。
- 对白行情绪取「引号外旁白文本」（dialogue_emotion_prompt）的自动推导。

## 相关模块

- `server/src/services/drama/audio/`（DialogueAudio/Segments/VoiceDesign 三个服务）
- `server/src/services/drama/production/DramaBatchOrchestrator.ts`（tts force 透传）
- `client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx`（全局旁白音色配置）
- `client/src/components/audio/IndexTTS25VoiceControls.tsx`（IndexTTS 2.5 模型音色与参考音频控件）
- 旧项目对照：`mydrama src/novelvideo/seedance2_i2v/voice_clone.py`、`frontend/src/components/episode/voice-stage.tsx`、`audio/segmentation.py`

## 来源

旧项目知识索引见 `docs/wiki/architecture/mydrama-asset-index.md`。
