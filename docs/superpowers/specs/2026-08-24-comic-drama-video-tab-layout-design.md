# 漫剧工作台分镜与视频页签归属设计

## Background

当前漫剧工作台的整集合成结果同时出现在「当前 · 分镜」和「当前 · 成片」两个页签。分镜页还把三个批量操作放在镜头列表内部，导致页签上方的操作区没有与「参考」和「脚本」保持一致，且用户需要在两个位置理解同一份视频结果。

## Goals

1. 将「成片」页签更名为「视频」。
2. 将整集合成的完整内容——输出配置、合成进度、播放、下载字幕、打开新窗口和警告——只放在「视频」页签。
3. 「分镜」页只保留镜头/配音列表，以及上层操作栏中的批量生成画面、批量生成配音和合成入口。
4. 将三个批量操作渲染到当前页签上方的 Tab 行操作槽，与参考页的「引用/解析」、脚本页的「生成」保持同一层级。
5. 批量画面按钮固定显示「生成分镜」，不显示待生成数量，不显示前置图片图标。

## Non-goals

- 不改变服务端合成 API、任务状态、轮询或视频输出格式。
- 不删除分镜、配音、逐镜画面和 3D/2D 摆位能力。
- 不把分镜组件的查询和 mutation 状态复制到页面层。

## Decision

### 页签内容边界

`ComicDramaStudioPage` 将 `CURRENT_TAB_LABELS.video` 改为「视频」，并将视频页继续作为 `VideoSection` 的唯一承载位置。`ShotVoiceListPanel` 删除底部 `DramaEpisodeAssemblyResultPanel`，因此分镜页不再渲染完整视频、进度、字幕选项、下载链接或合成警告。视频页继续使用 `DramaEpisodeAssemblyPanel`，保留现有合成状态和结果展示。

### 操作栏出口

父页在当前页签的上层 Tab 行保留一个操作槽，并把该槽的 DOM 节点传给 `ShotVoiceListPanel`。分镜组件在有分镜时通过 React portal 将三个已有操作按钮渲染到该槽：

1. `生成分镜`：批量补齐缺失画面；保留 pending/disabled 状态，不显示数量，不显示图片图标。
2. `生成配音` / `重新配音`：沿用现有状态文案与禁用规则。
3. `合成`：沿用 `DramaEpisodeAssemblyButton` 与现有合成 controller。

组件内部仍保留这些 mutation、轮询数据和 disabled 判断；portal 只改变 DOM 落点，不改变调用链。切换页签或卸载分镜组件时 portal 自动卸载，操作槽不会残留旧按钮。

### 交互与视觉

- 复用现有 `Button`、`Tabs`、`DramaEpisodeAssemblyButton` 和语义 Tailwind token。
- 上层操作槽继续使用现有 `SubTabRow` 的响应式布局；桌面端靠右，窄屏自动换行。
- 异步按钮保持 disabled、spinner/文案切换和已有 toast 错误反馈。
- 不新增图标库、颜色或组件依赖；portal 目标使用语义 DOM 容器，不改变键盘 Tab 顺序。

## Verification

- 更新现有 contract tests，证明完整合成结果只存在于视频页，分镜列表不再引用 `DramaEpisodeAssemblyResultPanel`。
- 增加 contract assertions，证明视频页签文字为「视频」、上层操作槽接收 `toolbarTarget`，且批量画面按钮不含数量插值和 `ImageIcon`。
- 运行分镜相关客户端测试与 `pnpm --filter @ai-novel/client typecheck`。
- 使用实际漫剧工作台页面确认：分镜页不显示视频播放器，三个按钮位于 Tab 行；视频页显示播放器、进度、字幕选项和下载入口。
