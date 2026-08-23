# 脚本到分镜与视频合成设计

## Background

漫剧工作室的小说阶段把用户编辑的本章脚本保存到 `Chapter.expectation`。现有 Drama 分镜管线只从 `DramaEpisode.content` 读取台本，并且工作室首页用 `Chapter.content` 是否为空判断是否可以创建 DramaProject。因此，脚本已经准备好、资产也已经准备好的章节，无法进入分镜管线：项目不会创建，分镜页入口也会被禁用。

## Decision

在漫剧工作室增加一条面向当前章节的桥接命令，不把 `Chapter.expectation` 伪装成小说正文，也不改变旧的完整 Drama 工作台接口。

1. 脚本页顶栏增加 AI 操作按钮“生成”。它只作用于当前选中的章节。
2. 服务端根据小说和章节脚本创建或复用 `source=novel_import` 的 DramaProject，同步内容源资产，并把当前章节的 `expectation` 写入对应的 `DramaEpisode.content`。
3. 桥接命令完成后直接调用现有 `DramaStoryboardService` 生成当前集分镜；成功后前端切到“分镜”页。
4. 分镜列表没有分镜时的按钮统一显示“生成”。已有分镜后显示“合成”，调用现有整集合成服务，生成竖屏 MP4 与 SRT，并展示运行进度、失败信息和最终视频。
5. 旧的 `/api/drama/projects/:id/...` 路由和独立 DramaProject 工作台继续保留，避免影响已有项目。

## Data Flow

```text
Chapter.expectation
  -> POST /api/drama/studio/:novelId/chapters/:order/storyboard
  -> find/create DramaProject(source=novel_import, sourceRef=novelId)
  -> assembleSourceBundle (角色/场景/道具等源资产同步)
  -> upsert DramaEpisode(projectId, order, content=expectation, status=scripted)
  -> DramaStoryboardService.generateStoryboard
  -> DramaStoryboard + DramaShot
  -> 分镜页“合成”
  -> DramaEpisodeAssemblyService.startAssembly
  -> MP4/SRT + 轮询状态
```

重复点击同一章节时复用项目和分集，不创建重复 DramaProject。重新生成分镜沿用现有版本化行为，不删除历史产物；合成任务由现有服务拒绝并发任务。

## UI Contract

- “生成”使用项目 `AiButton`，脚本没有内容、正在自动保存或保存失败时不可提交。
- 点击后按钮进入 loading/disabled 状态，成功提示“第 N 集分镜已生成”，并切换到“分镜”页。
- 分镜页当前集没有镜头时显示“生成”；有镜头时显示“合成”。
- “合成”使用已有整集合成状态契约：运行中显示阶段与进度，失败显示可重试错误，完成后显示视频播放器、时长和字幕下载入口。
- 所有状态反馈走项目 `toast`，不增加解释性冗余文案。

## Error Handling

- 当前章节不存在或脚本为空：返回 400，前端显示可读错误，不创建项目。
- 项目创建、内容源同步、分集写入或模型生成失败：事务内的数据保持一致，按钮恢复可重试状态。
- FFmpeg 不可用、合成任务重复或合成阶段失败：沿用现有 assembly 错误与轮询契约，不伪造成功视频。

## Verification

- 服务层测试：脚本为空拒绝；项目可复用；当前章节脚本写入 DramaEpisode；生成调用使用同步后的 episode。
- HTTP/契约测试：桥接路由参数、错误状态和成功返回结构。
- 前端契约测试：脚本页出现“生成”入口；分镜页在无分镜/有分镜时分别出现“生成”/“合成”；loading、disabled 和失败提示存在。
- 运行 shared build、服务端目标测试、客户端目标测试和 typecheck；完成后对当前漫剧工作室执行一次真实浏览器流程验证。
