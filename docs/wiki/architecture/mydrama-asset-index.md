# mydrama 旧项目资产索引（开发规范备忘）

## 背景

`D:\Github\mydrama` 是本产品的前身实验项目（Python FastAPI + React，小说转短剧/视频生成）。它不是本仓库的依赖，但其中沉淀了大量经过实战验证的设计；本页是它的**可搬资产索引**，供后续开发对照取用，避免旧项目知识随仓库废弃而丢失。搬移任何资产时：先读本页对应条目，再进旧项目核对实现，落地后在条目上标注「已搬」与本项目位置。

## 已搬资产

| 资产 | 旧项目位置 | 本项目落地 | 备注 |
|---|---|---|---|
| 画面风格预设体系 | `src/novelvideo/styles/presets/`（6 预设 + STYLE_DESIGN.md 红线） | `shared/types/visualStyle.ts` + `services/visualStyle/` + `modules/visual-style/`（见 `docs/wiki/architecture/visual-style-presets.md`） | styleTag 年代词禁令、custom-shadows-preset 语义一并搬入 |
| 参考图风格分析（design 思路） | `generators/style_analyzer.py` | `visual_style.analyze@v1` PromptAsset | 需视觉模型才能真正可用 |
| 配音分段显示模型 | `frontend/src/components/episode/voice-stage.tsx` | `VoiceStagePanel.tsx`（见 `docs/wiki/workflows/comic-drama-voice-overdub.md`） | 旁白/对白二分 + 三态（就绪/过期/未生成） |
| 音色描述生成（design 模式） | `seedance2_i2v/character_voice_generation.py`、`services/global_narrator_voice.py` | `DramaVoiceDesignService`（角色音色 + 项目旁白） | 描述→固定样句试听，不克隆 |
| sha 过期判定 | `voice_audio_records.py`（voice sha + text sha → missing/stale/current） | `DialogueAudioItem.textHash/voiceKey` + `DramaAudioSegmentsService` | 思路搬移，实现简化 |
| 批量只补缺失 | `generate_seedance2_dialogue_audio_for_voice`（skipped_existing） | batch-jobs tts `force` 语义 + 行级复用 | |

## 待搬资产（按价值排序）

1. **年龄段音色槽**（`character_voice_storage.py`：child/youth/middle/elder 四槽、身份级覆盖 `resolve_character_voice`、`voice_samples_by_age_group`）。触发条件：漫剧出现「同一角色跨年龄段」叙事需求。
2. **音色参考音频三通道**（上传/录音/ffmpeg 裁剪 15s·mono·16kHz·64k mp3，sha256 去重 + 时间戳归档；`character_voice_storage.py:224-445`）。触发条件：用户需要克隆真实人声而不是描述生成。注意浏览器录音是 webm/opus，需 ffmpeg 转 mp3。
3. **对白情绪自动推导**（`voice_clone.py:149-163` dialogue_emotion_prompt：台词引号外的旁白文本就是该句的情绪提示）。触发条件：配音情绪自然度不足。
4. **按角色分声批次**（`same_voice_dialogue_beats`：同一音色的行合成一批，减少音色切换漂移）。触发条件：出现同镜多行同角色。
5. **视觉校验环**（`verification/`：视觉模型审图、一致性/连续性校验、感知哈希相似度去重、prompt 输入哈希防陈旧）。价值高但工程量大，适合漫画格子图质量门禁复用。
6. **Planner→Reviewer→Fixer 三件套**（`agents/episode_planner/reviewer/fixer`：类型化 Issue 模型 + 确定性检查 + LLM 审查 + 修复器）。本项目自动导演已有类似闭环，搬的是「类型化 Issue + severity + passed()」的建模方式。
7. **Beat=一个音频文件的时序契约**（`audio/segmentation.py`：绝不二次切分文本，字幕与音频永不漂移）。本项目视频字幕若引入，必须遵循此契约。
8. **字面量模式**（`workflows/literal_script_writing.py`：用户文本逐字保留，LLM 只标注元数据绝不改写）。适合做「用户自带台词」的配音入口。

## 明确不搬

- `director_world/`（3D 舞台/体素世界/360 全景）——视频生成专用，与文字产品无关。
- cognee 知识图谱——本项目已有 RAG/Qdrant 路线。
- EdgeTTS/CosyVoice 双后端——本项目音频槽已统一走 OpenAI 兼容 /audio/speech（本机 VoxCPM2）。
- 计费/额度体系（shared/billing_errors）——产品形态不同。

## 使用守则

- 从 mydrama 搬代码时**先读设计文档**（如 `styles/presets/STYLE_DESIGN.md`、`audio/segmentation.py` 模块注释）——旧项目的红线（例如风格不得携带内容词、beat 不得二次切分）比代码本身更值钱。
- 搬 UI 时以「显示逻辑」为单位（状态模型、信息层级、空态文案），控件实现按本项目 novel-ui 规范重写，不要移植旧项目的组件库习惯（shadcn 快照、i18n key 体系）。
- 搬完在本页「已搬资产」表登记，并在对应 wiki 页写清「未搬部分」，防止半搬状态被误认为完成。
