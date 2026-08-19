# 漫剧整集合成（full_episode）

## 背景

漫剧链路在「逐镜视频」之前已经齐备（分镜→首帧→配音→逐镜 mp4），但一直缺最后一公里：把一集的所有镜头拼成一支可发布的成片。旧项目 mydrama 沉淀了一整套经过实战验证的 ffmpeg 成片逻辑（见 `docs/wiki/architecture/mydrama-asset-index.md` 视频成片簇），本页记录搬移后的本项目实现与运行契约。

## 决策

- **音频驱动一切**：每个镜头的目标时长 = 该镜全部台词音频的 ffprobe 实测时长之和（无配音时用 `shot.durationSec`，再退 3s）。字幕时间轴与镜头片段共用同一份时长，保证永不漂移。
- **一行台词 = 一段音频 = 一条字幕**：不二次切分文本。有音频时字幕逐行对齐音频；无音频的镜头按台词断句后按字数权重分配时长。
- **逐镜归一化再拼接**：所有镜头片段先归一化为 1080x1920 / 30fps / H.264+AAC / 2400k 的统一规格（时长精确等于该镜目标时长），然后用 concat demuxer `-c copy` 无损拼接。规格统一是 `-c copy` 可行的前提，改动编码参数必须同步改所有片段类型。
- **时长适配三级策略**（搬自 mydrama adjust_video_duration）：视频片段比目标短 ≤0.1s 忽略；长了裁剪；缺口 ≤1.5x 用 `setpts` 变速；>1.5x 用 `tpad stop_mode=clone` 冻结末帧。
- **画面降级链**：优先用逐镜视频片段（DramaVideoPrompt.resultUrl）→ 退化为首帧图 + Ken Burns 四效果轮换（推入/拉出/左右平移，按镜序）→ 再退化为深色占位卡。合成本身不触发任何 AI 生成，缺素材只降级不阻断。
- **失败兜底**：单镜合成失败先用占位卡+原音频重试，再失败退静音占位卡；整集任务只有 ffmpeg 不可用或拼接失败这类全局错误才会 failed。

## 当前规则

- 入口：视频工作台（DramaProjectPage 分镜与视频页签）底部「整集合成」卡片。
- 路由：
  - `GET /api/drama/projects/:id/episodes/:order/assembly` — 素材就绪度（视频片段/首帧兜底/占位/缺配音计数）+ 最近成片 + 进行中任务。
  - `POST /api/drama/projects/:id/episodes/:order/assembly` — 启动合成，body `{burnSubtitles?, includeTitleCard?, includeEndCard?}`（默认全 true）。
  - `GET /api/drama/subtitle-files/:fileId` — 下载 SRT。
- 任务模型：复用 `DramaBatchJob`，`type="full_episode"`；progress JSON 在通用字段（total/done/failed/errors）外增加 `phase`（prepare/clips/concat/subtitles/done）与产物字段 `videoUrl/srtUrl/durationSec/error`。客户端轮询 assembly 状态端点（2.5s）而非 project 轮询。
- 产物：`storage/generated-videos/ep_{episodeId}_{ts}.mp4` + 同名 `.srt`；每次合成都产生新 fileId，历史产物保留不覆盖。
- 结果记录：`DramaEpisode.assembledVideoData` JSON `{status: assembling|done|error, videoUrl, srtUrl, durationSec, shotCount, burnedSubtitles, generatedAt, warnings[]}`；warnings 是逐镜降级明细，合成仍然算完成。
- 片头卡 3s（剧名 · 第 N 集）、片尾卡 2s（敬请期待下集）；drawtext 依赖字体探测（env `DRAMA_FFMPEG_FONT_FILE` → Windows msyh/simhei → mac PingFang → linux wqy/dejavu），找不到字体退化为纯黑卡，不失败。
- 字幕烧录：SRT 经 `subtitles` 滤镜 + `force_style`（FontSize=44/Bold/Outline=2/MarginV=140，竖屏 1080x1920 比例）；`burnSubtitles=false` 时字幕只提供 SRT 下载不进画面。字幕换行按 18 字符/行（`wrapSubtitleText`），断句规则见下。
- 断句规则（搬自 mydrama narrated_timeline，红线：只改分组不改文字）：引号外句末标点（。！？!?…）切分 → 超过 42 字的子句退到逗号级标点再切 → 短于 8 字的碎片并入前一条。

## 关键模块

| 模块 | 职责 |
|---|---|
| `server/src/services/drama/video/DramaEpisodeAssemblyService.ts` | 合成主流程：素材计划 → 逐镜归一化片段 → 片头片尾卡 → 拼接 → 字幕 → 产物落盘 → DramaBatchJob/DramaEpisode 状态 |
| `server/src/services/drama/video/ffmpegUtils.ts` | ffmpeg/ffprobe 子进程、时长探测、滤镜路径转义、字体探测、ffmpeg 可用性断言 |
| `server/src/services/drama/video/subtitleText.ts` | 字幕断句与换行（纯文本逻辑，可单测） |
| `server/src/modules/drama/http/dramaRoutes.ts` | assembly GET/POST + subtitle-files 路由 |
| `client/src/pages/drama/components/DramaVisualPanel.tsx` `AssemblySection` | 就绪度统计、选项、进度（phase 标签）、成片播放、SRT 下载、重新合成 |
| `client/src/api/drama.ts` | `DramaAssembledVideoData` / `DramaEpisodeAssemblyStatus` 类型与两个 API |

## 失败模式

- **本机没有 ffmpeg**：POST 直接 400，文案提示安装 ffmpeg；不会创建半途任务。
- **服务重启中断合成**：任务停留在 running；下次启动合成时超过 10 分钟未更新的 running 任务自动标 failed（「服务重启导致合成中断，请重新合成」），不会永久卡死入口。
- **音频比视频片段长很多**（I2V 固定 5s 片段配长台词）：>1.5x 走冻结末帧，画面末尾静止但音画时间轴正确；这是 mydrama 验证过的折中。
- **外部视频 URL 下载失败 / 本地片段文件丢失**：该镜退化为首帧图或占位卡，进 warnings，不阻断整集。
- **concat `-c copy` 要求所有片段同规格**：所有片段（含卡片）都由同一条 encode 参数产出；若未来改分辨率/码率，必须全链路同步修改。

## 未搬部分（来自 mydrama，后续触发条件见资产索引）

- 首尾帧过渡提示词（keyframe_prompt_builder，接入真实 I2V 后端后才需要）。
- Remotion 时间轴渲染路径（解说剧专用，当前本地 ffmpeg 路径已覆盖竖屏漫剧）。
- 整集素材 zip 导出（当前提供 SRT 下载 + 成片播放，素材包打包未做）。

## 相关模块

- `docs/wiki/workflows/comic-drama-voice-overdub.md` — 配音三态与 dialogueAudioData 契约（合成的音频来源）。
- `docs/wiki/architecture/mydrama-asset-index.md` — 成片簇资产登记与剩余待搬项。
