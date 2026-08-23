# 漫剧素材就绪判定与服务重启恢复

## Background

漫剧工作台同时展示脚本、关键帧、配音和整集合成状态。仅检查 JSON 字段非空会把旧音频、损坏关键帧或切换音色后的过期素材误判为可用，导致工作台统计、合成状态和实际合成结果互相矛盾。开发服务重启时，数据库里的 `pending/running` 任务也不能继续代表当前进程正在执行。

## Decision

所有漫剧“是否可用”的摘要统一经过 `server/src/services/drama/readiness/`：

- 关键帧必须是可解析 JSON，状态为 `done`，且包含非空 URL。
- 配音按脚本当前解析出的每一行判断；每一行都必须存在、状态为 `ready`，并有当前音色/文本/模型对应的 `data:audio/` 地址。
- 视觉资源按视频结果、关键帧、占位图顺序分类；缺图是可恢复告警，不阻塞静态画面合成。
- 工作台统计、整集合成预检和整集合成实际取用都消费同一份分段投影，不能重新读取 `dialogueAudioData` 做“非空即完成”判断。

## Current Rule

服务启动完成数据库准备后，会把上一进程遗留的漫剧画面、视频提示、配音和整集合成活动任务标记为失败，并保留可重新发起的入口。批量任务创建在同一进程内按项目、分集和任务类型串行化；若已有同类型活动任务，重复请求复用该任务，不再创建第二条任务。

前端启动页在开发环境持续探测 `/api/health`。服务未响应与 HTTP 错误分别显示，页面仍会自动重试，并提供手动重新检查入口。短暂的依赖优化或服务重启不应被误报成数据库故障。

## Failure Modes

- 页面统计显示配音已完成，但合成提示“没有可测量的真实配音”：优先检查文本哈希、音色键和当前音频模型是否已变化，确认是否应为 `stale`。
- 切换章节后另一章的配音任务仍显示为进行中：检查前端任务投影是否同时按 `episodeId` 和任务类型过滤。
- 服务重启后任务永久显示“生成中”：检查启动恢复是否覆盖该任务类型，避免只在用户再次点击创建时才清理。
- 选中的镜头跨章节残留：检查选择集合是否在 storyboard 身份变化时清空，并在同一 storyboard 刷新时过滤已不存在的镜头 ID。

## Related Modules

- `server/src/services/drama/readiness/DramaShotReadiness.ts`
- `server/src/services/drama/readiness/DramaReadinessService.ts`
- `server/src/services/drama/audio/DramaAudioSegmentsService.ts`
- `server/src/services/drama/production/batchJobRecovery.ts`
- `client/src/components/layout/ServerStartupGate.tsx`
