# 漫剧视频真实默认通道与任务闭环设计

日期：2026-08-21  
状态：已确认（继续迭代默认采用本轮推荐方案）

## 背景与问题

漫剧视频阶段已经有两类通道：`local_ffmpeg` 可以在本机使用首帧图和配音合成真实 MP4，`mock` 只用于联调。当前默认值分散在视频提示词服务、HTTP 路由、批量编排、客户端页面和 API 函数中，多处仍指向 `mock`。因此用户进入视频阶段后，可能看到任务已创建，却得到一个永远保持排队且没有视频结果的占位任务。

本地 `ffmpeg` 已安装并可执行，现有本地通道已经负责：

- 读取镜头首帧图或参考图；
- 读取已生成的 VoxCPM2 台词音频；
- 以 Ken Burns 动效合成 MP4；
- 通过本地视频文件路由提供 `resultUrl`；
- 通过 `getTask` 将进程产物或错误文件映射为成功/失败状态。

缺口不是再增加一个 provider，而是让已有真实通道成为一致的默认，并让页面自动消费任务状态。

## 目标

1. 统一视频默认通道解析：显式环境配置优先，已注册的 `local_ffmpeg` 次之，最后回退 `mock`。
2. 单镜、批量、提示词记录和前端选择器使用同一个默认契约。
3. `queued/running` 任务自动刷新，进入 `succeeded/failed` 后停止刷新。
4. 失败任务在当前提示词卡片中直接支持重试，并保留 provider 的失败原因。
5. 本地或外部 provider 返回 `resultUrl` 后，镜头卡片可直接播放，并保留新窗口打开链接。
6. 保留 `mock` provider 的显式选择能力，现有联调行为和 HTTP provider 不被破坏。

## 非目标

- 不删除 `mock` provider，也不把外部视频服务硬编码进核心业务。
- 不改变视频提示词的 Prompt Schema、版本淘汰规则或整集合成流程。
- 不自动提交外部视频服务的付费任务；自动动作只查询已创建任务的状态。
- 不把失败任务静默重置为成功；失败原因必须继续可见。

## 方案

### 1. 服务端默认 provider 解析

在 `server/src/services/drama/video/VideoProviderPort.ts` 的 registry 附近提供单一解析函数：

```ts
export function resolveDefaultVideoProvider(): string {
  const configured = process.env.DRAMA_VIDEO_DEFAULT_PROVIDER?.trim();
  if (configured && videoProviderRegistry.has(configured)) {
    return configured;
  }
  if (videoProviderRegistry.has("local_ffmpeg")) {
    return "local_ffmpeg";
  }
  return "mock";
}
```

registry 需要提供只读 `has` 能力，并在 provider 列表中标记 `isDefault`。如果环境变量指定了未注册 provider，忽略该值并继续走真实本地通道，不能让页面因为配置残留而不可用。

以下服务统一调用该解析函数：

- `DramaVideoPromptService.generateVideoPromptForShot` 新建提示词时写入默认 provider；
- `DramaVideoPromptService.createProviderTask` 未传 provider 时解析默认值；
- `server/src/modules/drama/http/dramaRoutes.ts` provider-task 路由的 body 缺省值；
- `DramaBatchOrchestrator` 的视频任务默认值。

客户端 `/api/drama/video-providers` 返回 `isDefault`，`DramaProjectPage` 和 API 调用不再把 `mock` 写死。显式选择 `mock` 仍然按用户选择发送。

### 2. 任务状态轮询与失败重试

`DramaVisualPanel` 根据当前项目中的活动视频提示词筛选出有 `providerTaskId` 且状态为 `queued` 或 `running` 的任务。存在这些任务时，以约 2.5 秒间隔调用现有的 `refreshDramaVideoProviderTask`，完成后失效项目查询缓存；没有活动任务时销毁定时器。轮询必须有并发保护，避免上一轮查询未结束时重复发起同一批刷新。

视频提示词卡片的操作状态如下：

| 当前状态 | 操作 |
| --- | --- |
| 没有 providerTaskId | 创建视频任务 |
| queued/running | 刷新状态（自动轮询仍开启） |
| succeeded 且有 resultUrl | 播放视频、打开结果 |
| failed | 显示失败原因、重试视频任务 |

重试调用同一个 `createProviderTask`，沿用当前提示词版本和参考素材；服务端写入新的 providerTaskId，清空旧的 `resultUrl` 与 `failureReason`，状态重新采用 provider 返回值。该动作不重新生成 Prompt，也不触碰历史提示词。

### 3. 结果播放

`VideoPromptDetails` 在存在 `resultUrl` 时渲染原生 `<video controls preload="metadata">`。只有浏览器无法直接播放或用户需要下载时，才使用现有“查看生成结果”链接。远程 HTTP provider 的 URL 原样使用；`local_ffmpeg` 的相对地址继续由前端 API 代理解析。

## 错误处理

- 默认 provider 配置为未知值：服务端回退 `local_ffmpeg` 或 `mock`，不抛出启动错误。
- provider 创建任务同步失败：沿用现有错误中间件，提示词记录为失败并保留错误信息。
- provider 查询失败：刷新接口返回错误，前端停止本轮刷新并保留当前状态，下一次用户刷新可重试查询。
- 本地 ffmpeg 异步失败：`LocalFfmpegVideoProvider.getTask` 读取 `.err` 后返回 `failed`，卡片显示尾部错误信息。
- 任务刷新只对当前非 `superseded` 提示词进行，历史版本不参与轮询或重试。

## 模块边界

- provider 解析与能力标记归 `services/drama/video`，不进入 React 组件或批量业务分支。
- provider 状态查询仍通过 `DramaVideoPromptService` 与现有 HTTP 路由，不直接从前端访问文件系统。
- React 只负责根据服务端状态调度刷新、投影操作和播放链接。
- `mock`、HTTP provider、local ffmpeg provider 继续实现同一 `VideoProviderPort`。

## 测试与验收

### 服务端

- registry 在无覆盖配置时把 `local_ffmpeg` 标为默认；显式环境值优先；未知环境值回退。
- provider 列表包含 `isDefault`，且仅有一个默认 provider。
- 提示词生成、单镜创建、批量创建缺省 provider 时使用 `local_ffmpeg`。
- 显式传入 `mock` 时仍创建 mock 任务。
- 失败任务重试会清空旧结果并写入新 providerTaskId，历史提示词不可重试。
- 既有 HTTP provider、local ffmpeg 状态映射和漫剧管线回归测试继续通过。

### 客户端

- 视频 provider 选择器初始选中服务端标记的默认通道。
- queued/running 任务自动刷新，终态停止刷新。
- failed 卡片出现“重试视频任务”，succeeded 卡片出现可播放视频。
- 客户端类型检查和生产构建通过。

### 运行态

- `GET /api/drama/video-providers` 返回 `local_ffmpeg` 且标记为默认。
- 当前漫剧页面能显示本地合成通道，视频卡片无控制台错误。
- 不执行真实视频生成作为自动验收动作，避免未经用户确认消耗外部资源；使用 provider 列表、状态映射和页面交互证据验证链路。

