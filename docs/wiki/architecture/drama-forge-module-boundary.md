# 短剧创作模块边界

更新日期：2026-08-27

## 背景

短剧创作模块的目标不是给小说详情页增加一个下游改编按钮，而是提供独立的横屏漫剧创作链路。小说只是内容来源之一，原创灵感和外部文本也必须能进入同一条短剧产线。

如果短剧能力直接调用小说业务服务，后续会出现三个问题：

- 原创和文本导入会被迫伪装成小说。
- 角色、事实、质量闸和视频提示词会继承小说生产链的约束，难以服务短剧节奏。
- 未来拆分为独立短剧产品时，需要重写核心引擎。

## 当前规则

`server/src/services/drama` 是独立 bounded context。它可以依赖 Prisma、LLM、Prompt Runner、任务队列、文件导出和图片/视频等平台基础设施，但不得依赖 `services/novel` 或 `modules/novel` 的业务实现。

短剧模块与小说模块的唯一内容接触点是 `NovelSourceAdapter`。该 adapter 只能通过 Prisma 只读读取小说、章节、角色和事实数据，并把它们转成 `SourceBundle`。短剧核心服务只能消费 `SourceBundle`、`DramaCharacter`、`DramaFact`、`DramaEpisode` 等自有模型。

## 跨上下文合同（2026-08-27 收敛）

drama 与 novel 共用的「场景 3D 环境 / 空间标记 / 场景状态归一化」是数据合同，不是 novel 领域逻辑。实现统一放在 shared，两侧只 import shared：

- `@ai-novel/shared/utils/scene3dEnvironment`：3D 环境默认值、范围限制、序列化与迁移（novel 侧 `StoryScene3dEnvironment.ts` 是兼容门面，仅 re-export）。
- `@ai-novel/shared/utils/scene3dMarkers`：空间标记集合归一化、可行走地面合成、旧标记环境迁移（novel 侧 `StoryScene3dMarkers.ts` 同为门面）。
- `@ai-novel/shared/utils/storyAssetSceneStates`：`normalizeSceneStates` 场景状态合成（novel 侧 `StorySettingsStatePolicy.ts` re-export）。

drama 需要的小说侧 prompt 资产（如身高估算 `novel.character.heightEstimate@v1`）必须通过 `prompting/registry` 的 `getRegisteredPromptAsset(id, version)` 间接调用，不得直接 import `prompting/prompts/novel/**`。守卫测试 `server/tests/dramaDecoupling.test.js` 按 import 路径段强制这两条规则；新增共用规则时优先扩展 shared 合同或 registry，而不是放松守卫。

## SourceBundle 防腐层

所有内容来源都必须先转成 `SourceBundle`：

- `novel_import`：读取本系统小说快照。
- `original`：用 AI 从灵感和题材生成标准内容包。
- `text_import`：用 AI 从导入文本解析标准内容包。

策略、分集大纲、台本、质量闸、分镜和视频提示词不得为某一种来源写分支逻辑。来源差异只允许存在于 adapter 和内容包质量检查阶段。

## Prompt 规则

短剧产品级 prompt 必须位于 `server/src/prompting/prompts/drama/` 并注册到 `server/src/prompting/registry.ts`。服务层可以通过 PromptAsset 调用结构化输出，但不得在 service 内新增未注册 prompt 字符串。

结构化输出失败应修 schema、prompt、上下文装配或 JSON repair，不得用关键词匹配作为产品行为兜底。

## 视频生成边界

视频生成通过 `VideoProviderPort` 接入。短剧核心只生成和保存 `DramaVideoPrompt`，然后把任务交给 provider adapter。

Provider 替换不得影响：

- SourceBundle。
- 策略与分集。
- 台本与质量闸。
- 分镜模型。
- 角色视觉锚点。

当前默认 provider 由 `VideoProviderPort` 统一解析：优先使用已注册的 `DRAMA_VIDEO_DEFAULT_PROVIDER`，否则使用已注册的 `local_ffmpeg`，最后才回退到 `mock`。`local_ffmpeg` 负责使用首帧图和配音生成横屏 16:9 本地视频素材；整集合成由 Remotion Composition 统一完成，`mock` 只用于显式联调，不应成为业务入口散落的硬编码默认值。接入新的真实 provider 时应新增 adapter，不应把供应商字段写入核心策略或分镜规则。

视频任务创建与状态查询必须保持异步 provider 边界：前端只轮询当前提示词的 queued/running 任务，终态由 provider 回执投影为 succeeded/failed；失败重试沿用同一提示词和参考素材，更新 providerTaskId 并清除旧的 resultUrl/failureReason，不重新生成 Prompt，也不让历史 superseded 记录重新进入生产链。

## 失败模式

- 如果 `services/drama` 直接 import novel 业务路径，低耦合守卫测试应失败。
- 如果新增短剧 prompt 未注册，Prompt Runner 会拒绝执行。
- 如果 `original` 或 `text_import` 绕过 AI 结构化解析，短剧模块会退回固定规则生成，违背 AI-first 规则。
- 如果视频 provider 逻辑进入台本或分镜服务，后续更换供应商会污染核心产线。

## 相关模块

- `server/src/services/drama/source/SourceContentPort.ts`
- `server/src/services/drama/source/NovelSourceAdapter.ts`
- `server/src/services/drama/source/OriginalSourceAdapter.ts`
- `server/src/services/drama/source/TextImportSourceAdapter.ts`
- `server/src/services/drama/DramaScriptService.ts`
- `server/src/services/drama/DramaQualityGate.ts`
- `server/src/services/drama/DramaStoryboardService.ts`
- `server/src/services/drama/DramaVideoPromptService.ts`
- `server/src/services/drama/video/VideoProviderPort.ts`
- `server/src/prompting/prompts/drama/drama.prompts.ts`
