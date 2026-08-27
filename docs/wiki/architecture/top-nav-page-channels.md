# 顶部导航栏与页面之间的上收通道（页签 + 操作区）

## 背景

漫剧开发主线（2026-08-27 起）把站点导航收敛为顶部一级四 tab（漫剧/记录/画风/系统）。
随后用户要求：页面自己的二级/三级页签、以及页面头部的操作按钮（章节切换、引用/解析/
生成、分镜预览切换与合成等）也全部上收到导航栏，页身只留内容。这样做的产品动机是：
初级用户的视线不需要在「页头工具条」和「全局导航」之间来回切换，一条导航栏承载全部
层级与操作入口。

## 决策

导航栏与页面之间不通过路由嵌套或全局状态同步 UI，而是用 `PageTabsContext`
（`client/src/components/layout/PageTabsContext.tsx`）提供的两条通道：

1. **页签通道（数据注册）**：页面用 `useRegisterPageTabs(enabled, rows)` 声明
   二级/三级页签行（`PageTabRow`：key/label/active/onSelect）。注册内容是可序列化
   数据，effect 以 `JSON.stringify(rows)` 为依赖，只在实际页签结构变化时重注册。
   页签内联渲染在 TopNav 第一行中间（一级导航与右侧操作区之间的 `flex-1` 预留区），
   整组居中；用户明确要求不单独占用第二行。
2. **操作区通道（DOM 槽位 + portal）**：TopNav 在「AI 实况」左侧挂出一个
   `navActionsSlot`（一个普通 div，`empty:hidden`，无内容时塌缩）。页面通过
   `usePageNavActionsSlot()` 拿到该 DOM 节点，用 `createPortal` 把自己的工具按钮
   渲染进去。

操作区为什么用 portal 而不是和页签一样的「注册 ReactNode 到 context state」：
工具按钮依赖大量页面运行时状态（保存中/生成中/章节标题/分镜传送目标等）。如果把
ReactNode 存进 context state，页面每次渲染产生新节点，effect 依赖引用比较会丢注册、
依赖节点身份又会无限 setState 循环，只能靠 useMemo 约束，脆弱。portal 方案里按钮
仍渲染在页面组件树内、天然随页面状态更新，context 只共享一个稳定的 DOM 槽位。

## 当前规则

- 需要上收页签的页面：桌面端调用 `useRegisterPageTabs(!isMobileViewport, rows)`；
  移动端没有 TopNav（MobileSiteShell），页签必须保留在页内。
- 需要上收操作按钮的页面：`const slot = usePageNavActionsSlot()`，在返回的 JSX 顶部
  `{slot ? createPortal(<工具按钮/>, slot) : null}`。不要把按钮状态复制进 context。
- 分镜页签等「子面板自带工具」沿用双层 portal：页面在操作区里放一个挂 ref 的容器，
  子面板（如 ShotVoiceListPanel）再把自己的工具传送到该容器。ref 挂载条件跟随
  当前子页签，切走子页签时子面板工具自然消失。
- TopNav 页签区（第一行中间 `flex-1`）内层 `mx-auto` 居中；页签内容超宽时自动
  收敛为左对齐横向滚动，不裁切、不换行、不挤掉右侧操作按钮。
- 操作区槽位为空时必须不可见（`empty:hidden`），避免残留间距。

## 示例

- 漫剧工作室 `client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx`：
  同时使用两条通道（stage/sub 页签注册 + `navActionsPortal` 工具按钮上收），
  移动端 fallback 到页头内 SubTabRow。
- 系统设置 `client/src/pages/settings/components/SettingsShell.tsx`：只注册页签行。

## 失败模式

- 症状：导航栏页签消失或闪烁 → 排查是否在 rows 里放了每次渲染变化的非序列化字段，
  或页面卸载时未走 `useRegisterPageTabs` 的清理（该 hook 已自带清理，别手写注册）。
- 症状：操作按钮不出现 → 槽位是 TopNav 挂载后才置位的 state，页面首帧 portal 为
  null 属正常；若持续为空，检查是否处于移动端布局（无 TopNav）或 stage 条件不满足。
- 症状：操作按钮状态不更新 → 检查是否把按钮复制成了独立状态/二次注册，正确做法是
  portal 直接引用页面自身的 state 与 mutation。

## 相关模块

- `client/src/components/layout/PageTabsContext.tsx`（通道定义）
- `client/src/components/layout/TopNav.tsx`（槽位挂载 + 页签条渲染）
- `client/src/components/layout/AppLayout.tsx`（Provider 与槽位 state 宿主）

## 来源文档

- 2026-08-27 导航栏层级化页签与操作按钮上收（codex/nav-hierarchical-tabs、
  codex/nav-actions-in-topbar）
