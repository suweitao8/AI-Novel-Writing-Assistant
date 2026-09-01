# 网站工作台视觉系统边界

## Background

当前产品同时承载小说、漫剧、模型、动画和系统设置等创作入口。页面数量增加后，如果每个页面分别决定背景、卡片、按钮和间距，暗色工作台会逐渐出现材质、圆角、焦点反馈和移动端行为不一致的问题。

参考 `D:\Github\mydrama` 的创作工作台，当前网站采用“低对比冷墨背景 + 分层面板 + 紧凑导航 + 语义化控件”的视觉语言。这个方向服务于新手创作者：页面需要有明确层级，但不能让装饰、重复状态或过大的留白抢走主要操作的注意力。

## Decision

视觉系统分成三层：

1. **语义 token**：`client/src/index.css` 负责背景、面板、控件、浮层、边框、焦点、阴影、圆角和动效时长。token 通过现有 `ink / paper / night` 调色板继承，不允许页面自行引入一套颜色。
2. **共享原语**：`components/ui` 的 Card、Button、Input、Badge、Select、Tabs、Dialog 和 Toast 负责统一材质与交互反馈。调用方可以用 `className` 调整布局，但不应重新定义基础控件的视觉语义。
3. **工作台壳层**：`AppLayout`、`TopNav`、`Sidebar` 和 `MobileSiteShell` 负责导航层级、滚动边界和安全区；页面只负责自己的业务内容，不复制桌面/移动两棵导航树。

## Current Rule

- 普通产品页面根节点使用 `studio-page`，桌面主内容使用 `studio-main`；共享壳层分别使用 `studio-shell`、`studio-top-nav` 和 `studio-sidebar`。
- 普通面板使用 `studio-card` 或 `Card`，表单控件使用现有 `Input`、`SelectControl`、`Button` 等原语。颜色、边框和阴影通过语义 token 或 Tailwind 的语义类表达。
- `3D`、视频、Canvas 和编辑器视口属于专用渲染表面。它们可以保留自己的黑色画布、网格、取景器和 WebGL 生命周期，不应为了追求页面统一而套入普通 `studio-card`。
- 顶栏保留当前路由、页签和操作槽位，侧栏保留全部分组、入口和 badge 查询。视觉重构不得借机删除业务入口或改变路由。
- 所有异步控件仍需要默认、悬停、键盘聚焦、禁用、加载、空、错误和成功状态。图标按钮需要可读的 `aria-label`，弹窗继续交给 Radix 处理焦点、Esc 和遮罩关闭。
- `prefers-reduced-motion: reduce` 下关闭工作台页面进入动效和过渡；新增动效只能表达状态变化，不能成为信息的唯一载体。
- 修改 token 后需要同时检查三种 palette 和 compact density；不要在页面中添加 `dark:` 补丁来掩盖硬编码颜色。

## Examples

- 顶部导航使用 `studio-top-nav`，入口链接保留图标和当前状态，二级页签使用胶囊容器；页面正文通过 `studio-main` 与导航形成稳定的滚动边界。
- 资产、设置和列表页面使用 Card 的默认面板层级；空状态使用虚线边框和 `surface-subtle`，错误状态使用短提示与可重试按钮。
- 移动端只调整壳层排列：顶栏、更多入口和底部导航复用同一材质，页面内容继续使用现有 `mobile-site-main` 的滚动、安全区和路由类。

## Failure Modes

- 页面出现白底、黑字或某个页面独有的 slate 色：先检查是否绕过了语义 token，尤其是 `bg-background`、`bg-card` 与共享原语的组合顺序。
- 卡片出现多层边框、标题和操作区间距异常：检查调用方是否用额外的外层 Card 包住了已有面板，或用 `rounded-* / shadow-*` 覆盖了原语默认值。
- 移动端出现横向溢出或底部内容被遮挡：检查是否绕过 `MobileSiteShell`、`mobile-site-main` 和 safe-area padding；不要复制一份只为移动端存在的页面树。
- 3D 视口变成普通卡片颜色、Canvas 黑屏或全屏编辑器滚动失效：撤销对专用画布容器的 `studio-card` 套用，只保留页面外层壳层标记。
- 加入新入口后顶部或侧栏出现重复链接：先确认它属于哪一级导航，复用现有 `PageTabsContext` 或 nav group，不在页面内部再造一套全局导航。

## Related Modules

- `client/src/index.css`
- `client/src/components/layout/AppLayout.tsx`
- `client/src/components/layout/TopNav.tsx`
- `client/src/components/layout/Sidebar.tsx`
- `client/src/components/layout/mobile/MobileSiteShell.tsx`
- `client/src/components/ui/`
- `client/src/components/theme/ThemeProvider.tsx`

## Source Documents

- `docs/superpowers/specs/2026-09-01-website-visual-redesign-design.md`
- `docs/superpowers/plans/2026-09-01-website-visual-redesign.md`
- `.agents/skills/novel-ui/SKILL.md`
- `D:\Github\mydrama\frontend\src\index.css`
