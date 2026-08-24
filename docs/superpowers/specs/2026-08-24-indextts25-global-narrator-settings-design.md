# IndexTTS 2.5 全局旁白音色入口调整设计

## 背景

IndexTTS 2.5 的音色来源目前已经能够被系统旁白设置保存，但分镜页又重复展示了一整组旁白与角色音色设置。分镜页的核心职责是查看分镜和执行配音，不应该承担全站通用音色的配置；重复入口还会让用户误以为音色是项目或分镜级配置。

## 目标

- 将 IndexTTS 2.5 的模型音色、参考音频和旁白描述统一归入「系统设置 → 旁白音色」。
- 所有项目的旁白合成继续读取同一份全局旁白设置。
- 分镜页不再渲染 IndexTTS 2.5 音色设置区域。
- 保留已有角色音色数据和后端兼容能力，避免本次入口调整造成资产丢失或数据删除。

## 方案

### 配置边界

`NarratorVoiceSettingsPage` 是 IndexTTS 2.5 全局旁白配置的唯一用户入口，继续使用现有的全局旁白 API 保存：

- `description`：旁白描述与情绪提示；
- `indexTTS25Speaker`：IndexTTS 底模或 LoRA speaker；
- `referenceAudioUrl`：稳定参考音频来源。

`DramaDialogueAudioService` 已从 `GlobalNarratorVoiceSettingsService` 读取旁白配置，本次不改变合成协议，只验证并补齐设置入口与分镜移除后的回归覆盖。

### 界面调整

- 从 `ShotVoiceListPanel` 删除 IndexTTS 2.5 旁白/角色设置区域及其导入。
- 删除仅服务该分镜入口的 `VoiceStagePanel` 展示组件，保留 API 和服务端数据结构以兼容历史项目和未来角色资产入口。
- 在系统旁白设置页补充明确的全局作用域文案，避免用户把配置理解为单个项目设置。

### 验证

- 增加/更新客户端静态回归检查，确保分镜面板不再包含 IndexTTS 设置标题或 `VoiceStagePanel` 引用。
- 保留服务端全局旁白读取、speaker/referenceAudio 透传和音色指纹失效测试。
- 执行客户端 typecheck、服务端相关测试和生产构建；运行浏览器检查系统设置可见、分镜页无重复入口。

## 非目标

- 不删除角色已有的 `voiceProfile`、参考音频或服务端角色音色 API。
- 不把角色音色强行改成全局旁白音色；角色对白仍按角色资产音色合成。
- 不重新实现 IndexTTS 2.5 的训练流程。
