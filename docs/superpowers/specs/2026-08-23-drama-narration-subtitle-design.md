# 漫剧旁白字幕纯正文设计

## Background

当前音频数据已经区分 `type: narration | dialogue`，但整集合成在组装 `DramaAssemblyAudioLine` 时只保留了 `speaker`。因此旧数据或当前测试数据中的 `speaker: "旁白"` 会被 Remotion 当成普通说话人，画面显示为黄色的「旁白：」前缀。

## Decision

把已有的台词类型沿着整集合成链路传到 Remotion 时间轴：

- `DramaEpisodeAssemblyService` 从已保存的音频条目读取 `type`；旧条目没有 `type` 时，仅按明确的空 speaker/`旁白` 旧格式做兼容推断。
- `DramaAssemblyAudioLine`、`DramaVideoTimelineSubtitle` 和 `DramaVideoSubtitle` 增加可选的 `type` 字段。
- `type === "narration"` 时，Remotion 只显示正文，正文整条为白色并使用现有模糊阴影；不渲染 speaker 标签。
- 对白继续显示角色名和冒号，角色名保留金色强调。
- SRT 与画面字幕采用同一规则：旁白只写正文，对白保留角色名前缀。

字幕时序、换行、底部安全区、配音文件和横屏渲染配置均保持不变。

## Verification

- 组装器测试验证旁白时间轴保留 `narration` 类型且 SRT 不包含「旁白：」；对白仍保留角色名前缀。
- Remotion 组件契约测试验证旁白分支不渲染 speaker 标签，并继续使用无底板模糊阴影。
- 运行视频包测试、服务端构建和相关服务端测试。
- 重新合成当前 720p 章节，在内置浏览器中确认旁白是一整条白色正文、对白仍有角色名。

## Out of Scope

- 不改变脚本编辑器中的「旁白：」文本格式。
- 不改变配音生成、音色选择、字幕切分和 SRT 时间码。
- 不处理主工作树中其他并行任务的未提交或冲突文件。
