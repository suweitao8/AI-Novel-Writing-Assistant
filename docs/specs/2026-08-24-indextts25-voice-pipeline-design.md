# IndexTTS 2.5 音色与语音合成闭环设计

## Background

当前工作台的“生成音色”会生成一段试听音频，但角色配置只保存试听结果，后续分镜配音没有稳定读取这段音频；同时 IndexTTS 2.5 的 `speaker` 是底模/LoRA 音色名，不能直接使用剧情角色名。IndexTTS 2.5 的网页工作台还提供参考音频库和 LoRA 训练能力，但项目只接入了 `/tts` 推理接口，导致音色管理、角色绑定和实际语音合成之间断开。

## Decision

### 1. 统一音色资产语义

每个角色和全局旁白都保留两类信息：

- `sampleAudioUrl`：用于播放器展示的试听产物；
- `referenceAudioUrl`：真正传给 IndexTTS 2.5 的参考音频文件名、路径或 data URL。

如果用户只用文字描述生成音色，生成的试听结果同时物化到 IndexTTS `voices/` 目录并写入 `referenceAudioUrl`，后续分镜配音直接复用它。用户提供了参考音频时，原始参考音频优先，试听音频只负责预览。

### 2. 明确模型 speaker 与剧情角色的边界

业务角色名只用于分镜匹配和界面显示，不再映射为 IndexTTS 的 `speaker`。新增显式的 `indexTTS25Speaker` 配置：

- 缺省为 `default`；
- 只有 IndexTTS `/speakers` 返回的已训练音色才允许作为模型 speaker；
- 旁白和角色分别读取自己的配置；
- speaker 或参考音频变化会进入音色指纹，已有配音自动失效并要求重新合成。

### 3. 服务端管理边界

在业务 API 增加 IndexTTS 2.5 目录查询和参考音频保存能力：

- 查询健康状态、可用 speaker、参考音频库和网页训练入口；
- 上传/保存参考音频时使用内容 SHA-256 文件名，采用“存在则复用、不覆盖”的写入策略；
- 训练仍由 IndexTTS 2.5 自带网页工作台执行，项目不重复实现 GPU 训练流程；训练完成后刷新目录即可在角色/旁白配置中选择 LoRA speaker；
- `/tts` 推理始终由公共 `speechProvider` 入口发起，集中处理缓存、情绪能力、超时、响应错误和响度归一化。

### 4. 前端操作闭环

在漫剧配音阶段和旁白设置页提供：

- IndexTTS speaker 下拉选择；
- 参考音频库选择；
- 本地音频点击、拖拽和键盘上传；
- 生成/试听、保存描述和刷新目录状态；
- 服务不可用、上传失败、生成中、成功和空列表状态。

前端只提交业务配置，不直接写外部模型目录；保存和持久化由服务端完成。

## Scope

包含：

- IndexTTS 2.5 请求契约扩展；
- 角色/旁白参考音频和 speaker 持久化；
- 试听结果接入实际分镜配音；
- 音色目录查询、参考音频去重保存 API；
- 漫剧音色卡和系统旁白设置页的选择/上传/试听交互；
- 音色指纹失效边界、服务端契约测试和客户端类型检查。

不包含：

- 在本项目中复制 IndexTTS 2.5 的 LoRA 训练脚本或管理 GPU 训练进程；
- 删除或覆盖整合包原有 `voices/`、`runs/` 内容；
- 数据库结构迁移，继续复用现有 `voiceProfile` 和应用设置 JSON 字段。

## Acceptance Criteria

1. 文字生成角色/旁白试听后，分镜实际 `/tts` 请求使用该角色/旁白的参考音频，而不是回落到默认音频。
2. 角色名不会作为 IndexTTS `speaker` 发出；默认和已训练 speaker 可正确发送并能从目录刷新。
3. 同一参考音频重复保存不会覆盖文件，speaker/参考音频改变会使旧配音不复用。
4. 角色与旁白都能选择参考音频、上传新的参考音频并生成试听；上传控件支持点击、拖拽和键盘触发。
5. IndexTTS API 离线时目录接口返回可读状态，页面有明确错误/重试反馈；API 在线时短文本 `/tts` 返回非空音频。
6. 服务端聚焦测试、客户端类型检查和生产构建通过；浏览器能打开漫剧工作台并完成目录加载与音色卡渲染。

## Risks and Rollback

- 旧角色 JSON 没有 `referenceAudioUrl` 时兼容读取 `sampleAudioUrl`，不修改历史音频；下一次保存或生成时补齐新字段。
- 旧的 `INDEXTTS25_SPEAKER` 环境变量继续作为默认 fallback，显式角色/旁白配置优先；如果配置了不存在的 speaker，IndexTTS 会返回错误，页面保留重试入口。
- 参考音频只追加或复用，不删除外部整合包文件；回滚代码不会删除已生成的音频文件。

## Related Modules

- `server/src/services/audio/indexTTS25.ts`
- `server/src/services/audio/speechProvider.ts`
- `server/src/services/drama/audio/DramaDialogueAudioService.ts`
- `server/src/services/drama/audio/DramaVoiceDesignService.ts`
- `server/src/services/settings/GlobalNarratorVoiceSettingsService.ts`
- `client/src/pages/drama/comicDrama/VoiceStagePanel.tsx`
- `client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx`
