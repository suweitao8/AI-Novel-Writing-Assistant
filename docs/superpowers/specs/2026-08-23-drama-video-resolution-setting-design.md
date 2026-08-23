# 漫剧视频输出分辨率设置设计

## 背景

漫剧视频已经统一走 Remotion 的横屏 16:9 合成链路，当前开发阶段使用 1280×720（720P）可以缩短渲染验证时间，正式产出需要切换到 1920×1080（1080P）。目前分辨率主要由服务端环境变量决定，用户无法在通用设置中切换，且不同的导出入口需要共享同一个选择。

## 目标

- 在“系统设置 → 设置总览”提供一个“视频输出”设置卡片。
- 默认使用 720P（1280×720，24fps）。
- 用户可以切换到 1080P（1920×1080，24fps）。
- 后续新的视频合成、本地 FFmpeg 视频任务和时间线导出统一读取该设置。
- 视频任务启动时固定本次任务的分辨率；设置变更不影响正在运行或已经生成的视频。
- 保留环境变量作为数据库设置不可用时的兼容回退，并继续由统一的渲染配置模块校验横屏 16:9 约束。

## 非目标

- 不重新渲染已经生成的视频。
- 不在每个项目或每个分镜中增加独立的分辨率选择。
- 不改变 24fps、Remotion 时间线、字幕样式、图片规格或音频合成规则。
- 不新增另一套视频渲染器；Remotion 仍然是整集合成的实现。

## 方案

### 1. 统一渲染配置

继续以 `server/src/services/drama/video/renderProfile.ts` 作为分辨率定义和 16:9 校验的唯一纯函数入口，补充可枚举的 720P/1080P 配置选项和按 ID 解析能力。

新增设置服务 `DramaVideoRenderProfileSettingsService`，使用现有 `AppSetting` key/value 表保存选择：

```text
key: drama.videoRenderProfile
value: 720p | 1080p
```

读取顺序为数据库设置、环境变量 `DRAMA_VIDEO_PROFILE`、720P 默认值。数据库值和接口提交值都必须经过渲染配置解析，非法值返回校验错误，不允许进入合成链路。

设置服务同时提供：

- 读取当前配置和可选配置列表；
- 保存配置；
- 为服务端视频任务获取已配置的 `DramaRenderProfile`。

### 2. 设置 API

在现有认证设置路由下增加：

- `GET /api/settings/drama-video-render-profile`
- `PUT /api/settings/drama-video-render-profile`，请求体为 `{ "profile": "720p" | "1080p" }`

响应包含当前完整配置（ID、宽、高、帧率）及可选项，前端不自行维护分辨率与尺寸映射。

### 3. 设置总览 UI

新增 `DramaVideoRenderProfileCard`，在 `SettingsOverviewPage` 直接渲染。卡片使用现有设计系统的 Card、SelectControl 和 Button/状态反馈模式：

- 标题：视频输出；
- 选择项：720P（1280×720）、1080P（1920×1080）；
- 选择后显式保存，保存期间控件禁用；
- 显示当前尺寸和 24fps；
- 加载、保存成功和失败状态完整可见；
- 使用 React Query 缓存，并在成功保存后失效/刷新设置查询。

该设置放在通用设置总览，不绑定具体剧集或项目。现有视频资产不会因设置变更自动更新。

### 4. 视频链路接入

- `DramaEpisodeAssemblyService` 在启动任务时读取一次配置并传入 `DramaRemotionEpisodeAssembler`，确保同一个任务内的状态展示和实际合成使用同一 profile。
- `LocalFfmpegVideoProvider` 在创建视频任务时读取配置，并将 profile 的宽高用于 FFmpeg 输出。
- `DramaExportService` 的 timeline JSON 使用同一配置输出 width、height、fps。
- `DramaRemotionEpisodeAssembler`、`DramaRemotionRenderer` 保持通过参数接收 profile，不直接访问数据库，维持渲染层的纯度和可测试性。

### 5. 错误与兼容

- 未保存设置时使用 720P。
- `AppSetting` 表不可用时，设置服务退回环境变量/720P，避免设置读取失败阻断视频服务启动；保存操作仍返回明确错误。
- 非法数据库值或非法 API 请求直接失败并说明可选值。
- 读取当前配置失败时，设置页面显示错误状态，不能静默显示一个可能错误的选择。

## 验证策略

- 服务端单元测试覆盖默认 720P、保存 1080P、非法 profile 和配置读取回退。
- 服务端契约测试覆盖三个视频入口使用已配置 profile，而不是重新读取固定环境默认值。
- 前端契约/类型检查覆盖设置 API、query key、设置卡片和总览挂载。
- 运行服务端构建、客户端类型检查和相关视频测试。
- 若当前主工作区的本地服务仍被其他并发改动阻断，只报告该环境限制，不修改并发文件；代码级验证仍需通过。

## 影响范围

服务端设置服务与设置路由、视频渲染 profile、整集合成/本地 FFmpeg/时间线导出；客户端设置 API、query key、系统设置总览；开发 wiki 与用户可见发布说明同步记录这一长期配置规则。
