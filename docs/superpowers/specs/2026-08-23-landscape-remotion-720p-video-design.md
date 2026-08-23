# 横屏 16:9 Remotion 漫剧成片链路设计

## 背景

当前漫剧工作台已经能把保存的章节脚本接入分镜、首帧和配音流程，也有整集合成入口；但底层仍使用 `local_ffmpeg` 生成 1080×1920 竖屏片段，并把整集按竖屏规格拼接。目标产品只允许横屏视频，开发阶段先使用 1280×720（16:9）验证速度和链路，后续再切换到 1920×1080。

## 决策

1. 所有漫剧视频输出统一为横屏 16:9。当前默认 profile 为 `720p`：1280×720、24fps；保留 `1080p` profile（1920×1080、24fps）作为后续切换目标，但不作为当前默认。
2. Remotion 是整集画面时间轴的唯一渲染器。ffmpeg 只负责把音频片段规范化、拼接并与 Remotion 无声视频封装，同时执行最终 ffprobe 校验。
3. 新增独立 workspace package `video/`，持有 Remotion Composition 和可复用的横屏视频 props 类型；服务端通过明确的 renderer port 调用它，不把 React/Remotion 依赖塞进 API 业务模块。
4. 服务端继续负责读取 DramaEpisode、整理镜头/首帧/配音和字幕时间轴，生成临时 `public` 素材目录与 props JSON，调用 Remotion 渲染无声视频，再封装音频并把产物写入现有 `generated-videos` 目录。
5. 首帧图是镜头画面的首选来源；没有首帧时由 Remotion 渲染横屏占位卡。已有本地视频片段可作为兼容输入，但不能改变最终 16:9 输出规格。

## 数据流

```text
Chapter.expectation
  -> DramaEpisode / DramaStoryboard / DramaShot
  -> keyframe + dialogueAudioData
  -> server timeline builder
  -> video/public/<job>/ + props.json
  -> Remotion DramaEpisodeVideo (silent 1280x720)
  -> normalized audio timeline (PCM/WAV)
  -> ffmpeg mux (video copy + AAC audio)
  -> ffprobe: 16:9, 1280x720, video stream, audio stream, duration
  -> DramaEpisode.assembledVideoData + SRT + UI preview
```

时间轴规则保持音频驱动：一条有效配音对应一条字幕；镜头没有有效配音时使用 `shot.durationSec`，再退回 3 秒静音。片头、片尾和无素材镜头都必须进入同一条视频/音频时间轴，避免封装后音画漂移。

## 模块边界

- `video/`：Remotion Composition、props schema、横屏场景/字幕/占位卡渲染；不读数据库，不调用 API。
- `server/src/services/drama/video/DramaRemotionRenderer.ts`：renderer port adapter，管理临时 public 目录、props、Remotion CLI 进程和无声视频结果。
- `server/src/services/drama/video/DramaEpisodeAssemblyService.ts`：数据库装配、音频时间轴、SRT、Remotion 调用、音频封装、结果状态和清理。
- `server/src/services/drama/video/renderProfile.ts`：唯一的分辨率/FPS 配置入口，拒绝非 16:9 profile。
- `client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx`：沿用现有入口和轮询，展示横屏开发规格、Remotion 阶段和结果；不在前端拼接媒体。

## 错误与恢复

- 单镜缺首帧、视频片段或配音时，继续用横屏占位/静音并记录 warning；只要 Remotion、音频封装和最终校验成功，整集任务为 `done`。
- Remotion 进程失败、ffmpeg 不可用、音频封装失败或 ffprobe 不满足合同时，整集任务为 `failed`，不得写入可播放的 `done` 结果。
- 临时目录在成功、失败和进程终止路径都清理；现有 stale-job 恢复规则继续适用。
- 音频扩展名按 data URL MIME 推断，`audio/wav` 不得伪装成 `.mp3`。

## 验证合同

1. 单元测试验证 720p/1080p profile、16:9 拒绝规则、秒到帧转换、字幕/镜头时间轴和 MIME 扩展名。
2. 服务端聚焦测试验证 assembly 调用 Remotion renderer、音频 mux、降级 warning 不会把成功产物标成 failed，以及失败校验会阻断 done 状态。
3. `video/` package 通过 Remotion bundle/render smoke test，使用本地占位图和短静音素材生成真实 MP4。
4. 最终使用 ffprobe 读取真实产物，断言当前开发合同为 H.264 1280×720 24fps + AAC 音频，且视频/音频都存在。
5. 前端类型检查和漫剧流程契约测试通过；UI 只验证代码级契约，实际浏览器交互由用户验收。

## 非目标

- 本阶段不引入竖屏兼容模式。
- 本阶段不把 1920×1080 设为默认，也不做多档用户选择界面。
- 本阶段不改造外部 I2V provider，只保证已有首帧/本地视频素材能进入横屏 Remotion 时间轴。
