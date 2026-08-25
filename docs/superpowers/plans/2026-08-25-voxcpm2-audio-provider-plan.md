# VoxCPM2 音频主通道恢复实施计划

## 1. 先锁定失败契约

- 更新 `server/tests/audioSpeech.test.js` 和 `server/tests/dramaVoiceRouting.test.js`，先断言默认 provider 为 `voxcpm2`、请求发往 `/v1/audio/speech`、旁白/对白 metadata 正确，以及旧 IndexTTS 文件名不会被作为 VoxCPM2 参考音频发送。
- 恢复并更新 `scripts/start-voxcpm2-bridge.test.cjs` 与 `scripts/dev-orchestration-policy.test.cjs`，先断言开发启动链依赖 18761 的正式桥。
- 更新 `client/tests/globalNarratorVoiceSettingsContracts.test.js`，先断言设置页不再挂载 IndexTTS 目录控件，仍保留保存描述和生成试听操作。

## 2. 恢复 provider 与启动链

- 在 `shared/types/llm.ts`、`server/src/llm/providers.ts`、`server/src/llm/modelCategories.ts`、`server/src/llm/capabilities.ts` 中恢复 `voxcpm2`，保留 `indextts25` 为显式兼容 provider 但不绑定音频槽位。
- 恢复 `scripts/start-voxcpm2-bridge.cjs`，并让根目录 `dev`/`dev:log`、服务端 `dev:api` 在 API 启动前幂等等待 18761 就绪。
- 更新 `server/.env.example`，把 VoxCPM2 作为默认本地音频配置；IndexTTS 配置仅保留为非默认说明。

## 3. 恢复公共合成与短剧适配

- 在 `server/src/services/audio/speechProvider.ts` 恢复 VoxCPM2 OpenAI 兼容请求、二进制/JSON 音频响应读取、错误传播和响度归一化。
- 给音频槽位解析增加显式 provider override，让保留的 IndexTTS 目录/协议代码不会误读 VoxCPM2 地址；默认调用仍严格使用 VoxCPM2。
- 恢复 `VoxCPM2TTSProvider` 并注册为默认短剧 provider；IndexTTS provider 不进入默认 registry。
- 让 `DramaDialogueAudioService`、`DramaVoiceDesignService`、`GlobalNarratorVoiceSettingsService` 使用 VoxCPM2 的描述/情绪控制语义，并对历史 IndexTTS 文件名执行兼容降级，不触发 IndexTTS 目录写入。

## 4. 收回 IndexTTS 前端入口

- 恢复 `NarratorVoiceSettingsPage` 的通用旁白描述/试听界面，移除 catalog 查询、speaker 选择和 IndexTTS 参考音频上传控件。
- 保留客户端 API 类型中的可选历史字段以读取旧数据，但当前页面不提交 IndexTTS 专用字段。

## 5. 文档与验证

- 恢复/更新 VoxCPM2 架构与桥接排障 wiki，并修正模型类别、故事设定和漫剧配音文档中的默认 provider 说明；保留 IndexTTS 文档作为暂存兼容说明。
- 运行服务端音频/路由/设置契约测试、工作流测试、客户端契约测试、服务端/客户端 typecheck 和构建。
- 在当前本机服务上检查 18761 `/health`、`/v1/models`，再用设置页和分镜配音入口做真实回归；不以 9005 作为前置条件。

## 提交边界

- 设计文档单独提交；实现、测试/契约、文档和发布说明按可独立验证的单元提交。
- 每次提交前只暂存本单元文件，使用 `git commit -s`，不修改主分支。
- 合并前检查 release notes、wiki、`git diff --check` 和目标分支工作区状态。
