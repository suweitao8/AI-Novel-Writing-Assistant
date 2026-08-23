# 漫剧运行稳定性与就绪状态统一设计

## Background

今晚漫剧项目连续合入了分镜生成、静态横屏画面、逐镜配音、整集合成、3D 摆位台和视频页签等能力。当前运行检查发现两个相互放大的问题：

1. 开发服务在热更新、依赖优化或自动重启时，前端 `ServerStartupGate` 只显示等待动画，用户无法区分“服务正在重启”“前端正在编译”和“接口真正不可用”。这会表现为网站反复停在加载页。
2. 漫剧总览以数据库字段非空作为“已就绪”，而分镜音频分段页和整集合成页按真实 provider、数据 URL、文本/音色快照和图片状态校验。同一集因此出现总览“配音 16/16、画面 3/16”，合成状态却是“缺配音 15、只有 1 张画面”。

现场证据：

- `GET /api/health` 与前端 `5174` 当前均返回 200，说明数据服务没有整体中断。
- 浏览器硬刷新后约 8 秒进入工作台；Vite 日志曾出现 `playcanvas` 预转换失败，依赖恢复后由 Vite 重新优化成功。
- 当前项目 `cmt5tfmcf0000rcb52n3aup7l` 第 1 集的 assembly 投影报告 `withKeyframeOnly=1`、`withoutVisual=15`、`withoutAudioShotCount=15`；同一项目的 studio overview 报告 `keyframeReadyCount=3`、`audioReadyCount=16`。

## Decision

先修复漫剧的稳定性与状态契约，再扩展后续的批量并发和视觉/配音体验。所有面向用户的进度数字必须来自同一套“可用素材”判定，不再由各页面自行猜测。

### 1. 统一服务端就绪判定

新增漫剧专用的纯函数/服务边界，输入镜头、当前音频 provider 和音频分段快照，输出：

- `keyframeReady`: `keyframeData` 可解析、`status === "done"` 且 URL 非空；
- `audioReady`: 镜头没有对白/旁白时视为无需配音，否则每个解析出的音频行都必须有当前 provider 的真实音频数据，且文本哈希、音色快照匹配；
- `visualKind`: `video`、`keyframe` 或 `placeholder`。

`ComicDramaStudioService` 的 overview 统计和 `DramaEpisodeAssemblyService` 的 assembly 状态都调用同一边界。统计字段继续保持现有 API 名称和镜头粒度，避免前端破坏性迁移。

### 2. 明确启动门状态

保留开发环境的 `/api/health` 门禁，但把状态拆成可识别的检查阶段：

- 首次检查：连接本地创作服务；
- 超过短暂启动窗口：显示正在重连并保留“重新检查”；
- 探针请求失败：显示可恢复错误和最近一次检查结果；
- 服务恢复：立即卸载门禁进入工作台。

不在启动页加入实现细节或长教程，只提供当前状态、重试动作和必要的错误信息。所有交互使用现有语义 token、`Button`、`toast`/状态组件，不引入新 UI 库。

### 3. 任务与页面刷新约定

- 生成分镜、生成画面、生成配音和合成启动成功后，统一失效 project、audio segments、overview、assembly 查询；
- 任务处于 pending/running 或短暂异步落库窗口时继续轮询；
- 任务失败时保留可重试入口，不把失败任务误显示为完成；
- 不触发整集生成、不修改现有用户数据，不做数据库重置或迁移。

## Scope

本批次包含：

- 服务端就绪判定边界及 overview/assembly 接线；
- 漫剧启动门的可恢复状态显示；
- 针对上述行为的服务端单元/契约测试、前端契约测试；
- 当前浏览器工作台的只读启动与跨页状态回归。

本批次不包含：

- 重新整合已经进入 `main` 的 3D、视频页签、响度和旁白实现；
- 整体替换图片或配音 provider；
- 数据库结构迁移、历史素材批量重算；
- 与漫剧无关的小说、移动端或自动导演测试失败。

## Acceptance Criteria

1. 对同一集、同一组镜头，studio overview 的画面/配音就绪数与 assembly 的真实可用数一致。
2. 旧的非空但无效 JSON、错误 provider、文本或音色已变化的音频都不会计入 ready。
3. 无对白镜头不会被错误标为缺配音；有对白镜头必须逐行满足真实音频条件。
4. API 失败时启动页仍提供可操作的重试和可读错误；服务恢复后不需要手动改 URL。
5. 新增回归测试先红后绿；目标服务端漫剧测试与客户端相关契约测试通过，类型检查通过。
6. 浏览器硬刷新当前漫剧项目后能进入工作台，并能在“分镜/成片”之间看到一致的素材统计。

## Risks and Rollback

- 统计口径收紧后，历史项目可能显示更少的 ready，这是对真实素材状态的纠正，不执行破坏性数据修复。
- 若音频分段投影与镜头级旧字段无法安全复用，保留旧字段作为输入，但以统一判定结果作为输出；异常行只显示缺失，不自动覆盖用户音频。
- 任何需要数据库写入的修复必须另立任务、先备份并获得明确授权；本设计不包含此类操作。

## Related Modules

- `server/src/services/drama/studio/ComicDramaStudioService.ts`
- `server/src/services/drama/audio/DramaAudioSegmentsService.ts`
- `server/src/services/drama/video/DramaEpisodeAssemblyService.ts`
- `client/src/components/layout/ServerStartupGate.tsx`
- `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`
- `client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx`
