# 短篇"编辑正文"编辑器增强：搜索高亮 + 行号 + 统计 设计文档

- 日期：2026-08-19
- 状态：已定稿（用户未答复澄清问题，按推荐默认执行，见"决策记录"）
- 范围：`client/` 纯前端改动，不改服务端契约、不改数据模型

## 背景与问题

小说列表 → 编辑小说（短篇）→ 短篇小说工作台 →"直接编辑"进入的"编辑正文"模式，
当前实现是每段一个原生 `<textarea>`（`ShortStoryStudioPage.tsx`），除顶栏总字数外没有任何编辑辅助：

- 无法在正文中查找内容（人名、地名、情节关键词要靠自己肉眼找）；
- 没有行号/段落定位，无法回答"改哪里"的定位问题；
- 没有行数、段落数、当前光标位置等统计信息。

长篇章节编辑器（plate/Slate 内核）已有 P1/P2 段落序号与 AI diff 红绿高亮，
短篇入口与其体验差距明显。

## 目标

在保持现有分段保存模型完全不变的前提下，为短篇"编辑正文"模式提供：

1. **搜索高亮**：输入关键字后，正文所有匹配处实时着色；可跳转上一个/下一个，当前激活匹配有明显区分。
2. **行号**：编辑区左侧行号栏，按逻辑行编号、跨段累计（全篇行号），软换行对齐该行首个视觉行（VS Code 软换行式）。
3. **底部统计**：字数（去空白，沿用现有口径）、总行数、段落数、当前光标所在 行:列。

## 非目标（明确不做）

- 手动荧光标注（需标注数据持久化与随编辑漂移的区间维护，二期另立设计）。
- 长篇章节编辑器（plate）的同款搜索/统计——技术栈不同（Slate decorate），二期统一。
- 阅读态（非编辑模式）的搜索高亮。
- 正则、大小写敏感等高级搜索选项——初级用户用不上，保持大小写不敏感子串匹配。

## 决策记录（用户未答复，按推荐默认）

| 问题 | 采用 |
| --- | --- |
| 高亮类型 | 搜索高亮（不做手动荧光标记） |
| 行数呈现 | 行号栏 + 底部统计 |
| 覆盖范围 | 仅短篇"编辑正文"（本页） |

## 方案选型

### 备选

- A. 换用 plate 富文本编辑器统一长短篇内核：能力最强，但短篇的分段草稿/保存模型
  （`updateShortStorySegment` 逐段 + 版本乐观锁）需要重构为整体文本↔分段映射，风险高。
- B. 保持 textarea，叠加"背板高亮 + 镜像测量行号"的经典增强方案：零契约变更，纯展示层。
- C. 只做跳转选中（`setSelectionRange`）不做全量着色：实现最简单，但满足不了"所有匹配同时高亮"。

**选定 B**。理由：本任务是编辑体验补强，不应触碰生产/保存链路；textarea 无法原生渲染局部着色，
背板（backdrop）层 + 透明背景 textarea 是成熟做法；行号通过镜像测量逻辑行高度实现，
配合"textarea 自动增高到内容高度（无内部滚动）"后两层天然对齐，不需要滚动同步 hack。

## 架构与组件

新目录：`client/src/pages/shortStory/components/storyBodyEditor/`

- `StoryBodyEditor.tsx`：编辑模式外壳。持有全篇 draft 文本（`drafts` 仍由页面持有，本组件只读消费 + 回写回调）、
  搜索关键字、激活匹配索引、光标位置；渲染 搜索工具条 + 分段编辑区 + 状态栏。
- `StorySegmentField.tsx`：单段编辑单元 = 行号槽 + 高亮背板 + 自动增高 textarea，三者共享同一份排版样式常量。
- `storyTextMetrics.ts`：纯函数模块（可单测）：
  - `joinSegmentDrafts(drafts, order)` —— 与服务端一致：trim、滤空、`\n\n` 连接；
  - `countTextMetrics(text)` —— 字数（`replace(/\s+/g,"").length`）、逻辑行数、非空段落数；
  - `findMatches(text, keyword)` —— 大小写不敏感子串匹配，返回全局区间数组；
  - `offsetToLineCol(text, offset)` —— 光标偏移 → 行:列。
- `useMirrorLineMeasure.ts`：hook。用隐藏镜像 div（与 textarea 同排版）逐逻辑行测量换行后高度，
  产出每逻辑行 `{ line, top }`；ResizeObserver + 150ms 防抖，只在文本或宽度变化时重测。

页面侧改动（`ShortStoryStudioPage.tsx`）：把 308-320 行的内联分段 textarea 区块替换为 `<StoryBodyEditor>`，
drafts/changedSegments/saveMutation 逻辑原样保留；本页因此减负（符合长文件治理方向）。

## 交互细节

- 搜索工具条位于编辑卡片顶栏右侧（编辑态显示）：输入框 + "N 处" 计数 + 上一个/下一个按钮 + 关闭。
  - `Ctrl/Cmd+F`（编辑卡片内）聚焦搜索框并 `preventDefault`；`Esc` 清空关键字并还回正文焦点。
  - `Enter` 下一个、`Shift+Enter` 上一个；循环跳转。
  - 激活匹配 `scrollIntoView({ block: "center" })` 并短暂闪烁描边（一次性动画，不常驻）。
- 高亮着色（语义 token）：
  - 普通匹配：`bg-primary/20`；
  - 激活匹配：`bg-amber-200/80 dark:bg-amber-400/30` + `ring-1 ring-amber-400/70`。
  - 背板文字本身透明（`text-transparent`），只有 mark 可见，透过透明背景的 textarea 与正文重叠。
- 行号：跨段累计的逻辑行号，右对齐、`text-muted-foreground`、当前光标所在行号加粗高亮（`text-foreground`）；
  窄屏（< sm）隐藏行号槽，统计保留。
- 状态栏：编辑卡片底部一条 `text-xs text-muted-foreground`：`字数 X · 行数 Y · 段落 Z · 第 L 行 C 列`。
  光标位置由当前 focus 的 textarea `selectionStart` 换算为全篇偏移（前面各段 draft 长度 + `\n\n` 累加）。

## 边界与错误处理

- 空关键字：无高亮、计数隐藏、跳转按钮禁用。
- 无匹配：显示"0 处"，按钮禁用，正文无 mark。
- 匹配跨段不可能出现（分段以 `\n\n` 为界，关键字内不含 `\n` 时天然不跨界；含 `\n` 的关键字按整篇匹配也能背板着色，因为背板按段渲染含段落分隔——实现时按"段内匹配"简化：先按段查找，跨段关键字不匹配，可接受并在代码注释说明）。
- IME：搜索输入与正文编辑均为原生控件行为，不做拦截。
- 性能：每段匹配结果 `useMemo`（依赖该段文本与关键字）；行高测量防抖 150ms；段落数通常 ≤ 20、单段 ≤ 数千字，量级安全。
- 深色模式：全部用语义 token/透明度，不硬编码色值（novel-ui 约束）。

## 测试与验证

- `storyTextMetrics.ts` 补纯函数单测（若 client 已有 vitest 基建则落 `*.test.ts`；无基建则以 typecheck + 页面冒烟为界并明示）。
- `pnpm --filter client typecheck`（或项目等效命令）通过。
- 浏览器 UI 验收按项目惯例留给用户。

## 发布记录

用户可见改动 → 更新 `docs/releases/release-notes.md` 与 `README.md` 最新更新块（同一日期合并）。
本改动无架构/契约沉淀价值，不新增 wiki 页（在提交说明中明示）。
