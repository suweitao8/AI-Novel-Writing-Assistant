# 漫剧 Remotion 字幕阴影样式设计

## Background

当前 `DramaEpisodeVideo` 的字幕层使用半透明黑色底板包裹文字。浏览器复核现有 720p 成片后，底板成为明显的独立 UI 元素，与旧项目的字幕观感不一致。

旧项目 `mydrama/audiobook/src/ScrollingSubtitles.tsx` 使用无底板文字，并通过 `textShadow: 0 4px 12px rgba(0,0,0,.9)` 提升复杂画面上的可读性。当前项目已经采用 Remotion 作为合成引擎，因此只需要在当前 Remotion 字幕层复用这一视觉契约，不改变字幕时间轴或音频链路。

## Decision

`video/src/DramaEpisodeVideo.tsx` 的 `SubtitleLayer` 统一采用以下规则：

- 移除 `backgroundColor`、`borderRadius`、内边距和任何字幕底板。
- 字幕正文使用白色；说话人名称继续使用现有的金色强调色。
- 字体族统一为 `SimHei, "Microsoft YaHei", sans-serif`。
- 文字阴影统一为 `0 4px 12px rgba(0,0,0,.9)`，保留模糊半径以适应浅色和复杂画面。
- 保留当前底部安全区、最大宽度、换行和字幕显示时序；本次不引入旧项目的滚动上下文字幕，以避免扩大需求范围。

## Data Flow

字幕仍由服务端按音频片段生成时间范围，传递给 Remotion `DramaEpisodeVideo`。本次只改变 React 样式对象，SRT 导出、烧录开关、音频封装和 16:9 渲染配置不变。

## Verification

- 新增/更新视频组件测试，确保字幕层不再包含底板样式，并包含旧项目的阴影参数。
- 运行视频包测试、类型检查和 composition 清单检查。
- 通过当前本地 API 重新合成一集 720p 成片。
- 在内置浏览器中保留旧成片并打开新成片，确认字幕由黑色底板变为无底板模糊阴影。

## Out of Scope

- 不调整字幕内容、时间切分、SRT 格式或配音。
- 不切换 720p/1080p 渲染档位。
- 不重做场景占位画面或镜头动效。
