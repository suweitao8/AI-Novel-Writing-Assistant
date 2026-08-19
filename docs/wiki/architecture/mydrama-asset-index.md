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

## 本项目现状对照（2026-08-19）

漫剧链路已具备：小说 → 章节管理 → 分镜（`DramaStoryboard`/`DramaShot`）→ 首帧（`keyframeData`）→ 配音（`dialogueAudioData` + VoiceStagePanel）→ 逐镜视频（`DramaVideoPrompt.resultUrl`，LocalFfmpeg/Http/Mock 三 Provider，Ken Burns zoompan + 台词音频）。

与 mydrama 相比**尚缺**：整集合成（片段拼接/片头片尾卡）、I2V 固定时长对实际 TTS 时长的适配、字幕轨、SRT/成片导出。该缺口与 `feature/comic-drama-visual-video` 分支的开发方向一致，下表「视频成片与时间轴」簇即旧项目的可直接取材实现。

## 待搬资产（按簇分组，簇内按价值排序）

### 视频成片与时间轴（当前缺口最大）

1. **I2V 时长适配**（`generators/video_composer.py:697` adjust_video_duration）：固定 5 秒 I2V 视频适配实际 TTS 时长——目标短则裁尾；拉伸 ≤1.5x 用 `setpts+atempo` 变速；>1.5x 用 `tpad stop_mode=clone` 冻结末帧；差 <0.1s 跳过；失败回退原片。纯 ffmpeg 逻辑，可直接移植。
2. **整集合成**（`video_composer.py:156/581` compose_episode）：每镜「图+音频 `-loop 1 -shortest`」出片段 → concat demuxer 合并；片头/片尾 drawtext 文字卡（字体探测回退，失败退纯黑卡）。同文件 `KenBurnsEffect`（:63）有 4 种推拉效果按镜序轮换，强于本项目单一 zoompan。
3. **首尾帧过渡提示词**（`agents/keyframe_prompt_builder.py`：看图写 I2V 首尾帧提示词，含图像压缩与 fallback；尾帧不落库、动态取下一镜首帧）。触发条件：接入真实 I2V 后端后需要首尾帧模式。
4. **音频驱动时间轴**（`export/narrated_timeline.py:428` build_narrated_timeline）：每 beat 时长 = ffprobe 实测音频时长，silence 用 `duration_seconds`；`narrated_asset_prereq_errors`（:291）逐 beat 报缺图/缺音。这是「**beat=一个音频文件，绝不二次切分文本**」时序契约（原 `audio/segmentation.py` 模块注释）的落地参考实现；本项目视频字幕一旦引入必须遵循该契约。
5. **中文字幕断句/换行**（`narrated_timeline.py:167` split_narration_into_sentences + :71 wrap_subtitle_text）：引号外句末标点切分、超长子句再切、短碎片回并；换行只加换行不改文本，保证「一 beat 一字幕」永不漂移。
6. **硬字幕**（`video_composer.py:488` add_subtitles）：VTT→ASS→`subtitles` 滤镜，支持 force_style。
7. **SRT/整集素材导出**（`export/episode_export.py`：format_srt_time/build_srt_content + 素材 zip）。

### 分镜编辑

8. **手工分镜分数序插入**（`manual_shots.py` calculate_insert_order：前后序号取中值，空间耗尽自动全量重排；新镜继承前一镜 scene_ref/time_of_day）。适合分镜板插镜/补镜。
9. **章节解析防幻觉**（`narrated_chapter_analysis.py`：角色/场景/道具候选必须带 evidence 且 grounding 在当前章节原文，`restrict_analysis_to_current_chapter`；`sanitize_visual_depiction_assets` 剔除「视觉描写型」非实体角色）。适合拆书/章节细纲的实体抽取质量门禁。

### 图像生成与质量

10. **宫格切分**（`generators/grid_splitter.py`，纯 numpy）：自动探测格线、去白边、切分、转竖版、反向 combine。配合宫格生图一次出多帧选优。
11. **图像池**（`generators/pool_indexer.py` + models `PoolIndex`：content_hash 去重、staleness 判定、按 beat/mode/type 过滤、select_frame_from_pool 选首帧）。
12. **pHash 感知哈希查重**（`verification/similarity_detector.py`，纯逻辑：pHash + 汉明距离判相似）。
13. **场景参考图体系**（`generators/scene_reference_images.py`：场景 master/spatial_layout/reverse_master 三类参考图；models `NovelScene` base/variant 派生 + time_of_day 独立维度，`build_scene_effective_prompt` 增量合成）。
14. **角色颜色 marker 体系**（models `CharacterIdentity` + extract_char_identities_from_markers：`[C1::红衣]` 式标记从画面描述自动抽取出场角色/道具；新道具自动分配色相距离最大的颜色，`nanobanana_grid.py:287`）。

### 语音

15. **年龄段音色槽**（`seedance2_i2v/character_voice_storage.py`：child/youth/middle/elder 四槽、`normalize_age_group`/`infer_identity_age_group`；`character_voice_generation.py` `AGE_VOICE_HINTS` 槽位提示词；生成时缺样自动补 `_ensure_current_age_voice_sample`）。触发条件：漫剧出现「同一角色跨年龄段」叙事需求。
16. **音色参考音频三通道**（上传/录音/ffmpeg 裁剪 15s·mono·16kHz·64k mp3，sha256 去重 + 时间戳归档；`character_voice_storage.py:224-445`，含 `decode_recorded_audio_data_url`/`_transcode_to_mp3`/`trim_voice_sample_content`/`voice_recorder_bootstrap_js`）。触发条件：用户需要克隆真实人声而不是描述生成。注意浏览器录音是 webm/opus，需 ffmpeg 转 mp3。
17. **对白情绪自动推导**（`voice_clone.py:149-163` dialogue_emotion_prompt：台词引号外的旁白文本就是该句的情绪提示；`QUOTE_DIALOGUE_PATTERNS` 引号拆分）。触发条件：配音情绪自然度不足。
18. **按角色分声批次**（`voice_clone.py` dialogue_voice_key + same_voice_dialogue_beats：同一音色的行合成一批，减少音色切换漂移；`resolve_identity_voice_sha256` 保证音色变更即失效）。触发条件：出现同镜多行同角色。

### 流程与质量

19. **视觉校验环**（`verification/`：image_verifier 视觉模型审图、frame_verifier、consistency_verifier 角色出场一致性、sketch_color_verifier 颜色 marker 校验、version_hash 输入哈希防陈旧、failure_registry 失败登记重放）。价值高但工程量大，适合漫画格子图质量门禁复用。
20. **Planner→Reviewer→Fixer 三件套**（`agents/episode_reviewer.py` 类型化 Issue（severity: critical/warning）+ 确定性检查（`_check_chapter_continuity` 章节连续性/覆盖率）+ `episode_fixer.py` 补丁式修复 + `_fuzzy_match_character` 模糊匹配角色名）。本项目自动导演已有类似闭环，搬的是「类型化 Issue + severity + passed()」的建模方式。
21. **字面量模式**（`workflows/literal_script_writing.py`：用户文本逐字保留，LLM 只标注元数据绝不改写；`_validate_marked_text` 保证台词与原文逐字一致、scene_id 白名单校验、逐行元数据带重试/占位 fallback）。适合做「用户自带台词」的配音入口。

## 明确不搬

- `director_world/`（3D 舞台/体素世界/360 全景）——视频生成专用，与文字产品无关。
- cognee 知识图谱——本项目已有 RAG/Qdrant 路线。
- EdgeTTS/CosyVoice 双后端——本项目音频槽已统一走 OpenAI 兼容 /audio/speech（本机 VoxCPM2）。
- 计费/额度体系（shared/billing_errors）——产品形态不同。

## 使用守则

- 从 mydrama 搬代码时**先读设计文档**（如 `styles/presets/STYLE_DESIGN.md`、`audio/segmentation.py` 模块注释）——旧项目的红线（例如风格不得携带内容词、beat 不得二次切分）比代码本身更值钱。
- 搬 UI 时以「显示逻辑」为单位（状态模型、信息层级、空态文案），控件实现按本项目 novel-ui 规范重写，不要移植旧项目的组件库习惯（shadcn 快照、i18n key 体系）。
- 搬完在本页「已搬资产」表登记，并在对应 wiki 页写清「未搬部分」，防止半搬状态被误认为完成。
