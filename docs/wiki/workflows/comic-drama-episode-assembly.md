# 漫剧整集合成（full_episode）

## 背景

漫剧链路在「分镜→首帧→配音」之后需要一个稳定的成片出口：把一集的所有镜头合成横屏 16:9 视频。旧项目 mydrama 的音频驱动和 ffprobe 经验仍然保留，但本项目的画面时间轴统一由独立 `video/` 包中的 Remotion Composition 负责。

## 决策

- **音频驱动一切**：每个镜头的目标时长 = 该镜全部台词音频的 ffprobe 实测时长之和（无配音时用 `shot.durationSec`，再退 3s）。字幕时间轴与镜头片段共用同一份时长，保证永不漂移。
- **一行台词 = 一段音频 = 一条字幕**：不二次切分文本。有音频时字幕逐行对齐音频；无音频的镜头按台词断句后按字数权重分配时长。
- **静态首帧画面**：镜头使用首帧图循环填充自己的时间段，不能添加推拉、平移或其它运镜；Remotion 与本地 ffmpeg 通道必须保持同一静态画面合同。
- **统一画面合同**：开发默认 profile 为 1280x720 / 24fps；发布 profile 可切换为 1920x1080 / 24fps。两个 profile 都必须通过横屏 16:9 校验，项目不再产生竖屏成片。
- **Remotion 单一画面出口**：整合器先建立连续场景和字幕帧范围，再由 `DramaEpisodeVideo` 一次渲染无声 H.264 画面；不再逐镜编码后用 concat demuxer 拼视频。
- **音频与画面解耦但共用时长**：ffmpeg 只把每行配音规范化为 44100Hz、双声道 PCM WAV，拼成整集音频并在最后一步与 Remotion 画面封装为 AAC；没有配音的镜头用同长度静音 WAV。
- **画面降级链**：优先用首帧图；没有首帧图时使用已有本地视频的第一帧；仍缺素材则由 Remotion 渲染深色占位卡。合成本身不触发任何 AI 生成，缺素材只进入 warnings，不阻断可播放成片。
- **出口校验**：最终 MP4 必须存在 H.264 视频流、AAC 音频流、profile 分辨率和 24fps；ffprobe 校验失败才把整集任务标为 failed。

## 当前规则

- 入口：视频工作台（DramaProjectPage 分镜与视频页签）底部「整集合成」卡片。
- 路由：
  - `GET /api/drama/projects/:id/episodes/:order/assembly` — 素材就绪度（视频片段/首帧兜底/占位/缺配音计数）+ 最近成片 + 进行中任务。
  - `POST /api/drama/projects/:id/episodes/:order/assembly` — 启动合成，body `{burnSubtitles?, includeTitleCard?, includeEndCard?}`（默认全 true）。
  - `GET /api/drama/subtitle-files/:fileId` — 下载 SRT。
- 任务模型：复用 `DramaBatchJob`，`type="full_episode"`；progress JSON 在通用字段（total/done/failed/errors）外增加 `phase`（prepare/audio/render/mux/done）与产物字段 `videoUrl/srtUrl/durationSec/error`。客户端轮询 assembly 状态端点（2.5s）而非 project 轮询。
- 产物：`storage/generated-videos/ep_{episodeId}_{ts}.mp4` + 同名 `.srt`；每次合成都产生新 fileId，历史产物保留不覆盖。
- 结果记录：`DramaEpisode.assembledVideoData` JSON `{status: assembling|done|error, videoUrl, srtUrl, durationSec, shotCount, burnedSubtitles, generatedAt, warnings[]}`；warnings 是逐镜降级明细，合成仍然算完成。
- 片头卡 3s（剧名 · 第 N 集）、片尾卡 2s（敬请期待下集）由 Remotion 直接渲染，不依赖本机字体探测。
- 字幕渲染：`burnSubtitles=true` 时由 Remotion 在横屏画面底部渲染字幕；`burnSubtitles=false` 时只生成 SRT 下载，不把字幕绘入画面。字幕换行按 18 字符/行（`wrapSubtitleText`），断句规则见下。
- 断句规则（搬自 mydrama narrated_timeline，红线：只改分组不改文字）：引号外句末标点（。！？!?…）切分 → 超过 42 字的子句退到逗号级标点再切 → 短于 8 字的碎片并入前一条。

## 关键模块

| 模块 | 职责 |
|---|---|
| `server/src/services/drama/video/DramaEpisodeAssemblyService.ts` | Prisma 任务入口：素材计划、状态投影、结果落库与可恢复告警 |
| `server/src/services/drama/video/DramaRemotionEpisodeAssembler.ts` | 场景/字幕时间轴、音频 WAV 规范化、Remotion 渲染、最终 mux、ffprobe 出口校验 |
| `server/src/services/drama/video/DramaRemotionRenderer.ts` | 隔离 `video/` workspace，复制临时 public 素材并调用 Remotion Composition |
| `server/src/services/drama/video/renderProfile.ts` | 720p/1080p profile 与横屏 16:9 合同 |
| `server/src/services/drama/video/ffmpegUtils.ts` | ffmpeg/ffprobe 子进程、时长探测和 ffmpeg 可用性断言 |
| `server/src/services/drama/video/subtitleText.ts` | 字幕断句与换行（纯文本逻辑，可单测） |
| `server/src/modules/drama/http/dramaRoutes.ts` | assembly GET/POST + subtitle-files 路由 |
| `client/src/pages/drama/components/DramaVisualPanel.tsx` `AssemblySection` | 就绪度统计、选项、进度（phase 标签）、成片播放、SRT 下载、重新合成 |
| `client/src/api/drama.ts` | `DramaAssembledVideoData` / `DramaEpisodeAssemblyStatus` 类型与两个 API |

## 失败模式

- **本机没有 ffmpeg**：POST 直接 400，文案提示安装 ffmpeg；不会创建半途任务。Remotion CLI 和 Chromium 由 `video/` workspace 提供。
- **服务重启中断合成**：任务停留在 running；下次启动合成时超过 10 分钟未更新的 running 任务自动标 failed（「服务重启导致合成中断，请重新合成」），不会永久卡死入口。
- **Remotion 长渲染停在 render**：`DramaRemotionRenderer` 以 pipe 接收子进程输出时，stdout 和 stderr 都必须持续消费并只保留尾部日志；否则 Remotion 输出填满系统管道后会阻塞，表现为任务一直 running、中间视频文件不再增长。排查时同时检查子进程 CPU、临时输出更新时间和 API 的 `phase`，不要先改前端轮询或降低分辨率掩盖问题。
- **配音比脚本时长长**：镜头场景时长取配音总时长，Remotion 场景和字幕一起延长，不再依赖逐镜视频片段的变速/冻结策略。
- **本地片段文件丢失**：该镜退化为首帧图或占位卡，进 warnings，不阻断整集。
- **Remotion 或 ffprobe 合同失败**：无法确认最终 MP4 为目标横屏规格时，整集任务失败并保留错误，不把不符合规格的文件标成可播放成片。

## 当前明确不在主链路的能力

- 首尾帧过渡提示词（keyframe_prompt_builder，接入真实 I2V 后端后才需要）。
- 整集素材 zip 导出（当前提供 SRT 下载 + 成片播放，素材包打包未做）。

## 相关模块

- `docs/wiki/workflows/comic-drama-voice-overdub.md` — 配音三态与 dialogueAudioData 契约（合成的音频来源）。
- `docs/wiki/architecture/mydrama-asset-index.md` — 成片簇资产登记与剩余待搬项。
