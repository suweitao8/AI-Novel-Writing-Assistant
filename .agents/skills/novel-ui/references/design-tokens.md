# 设计 Token 参考（权威来源：client/tailwind.config.ts + client/src/index.css）

本文是 `client/src/index.css` 与 `client/tailwind.config.ts` 的结构化快照。以源文件为准，修改 token 必须改源文件并同步本文。

## Token 架构

所有 Tailwind 颜色映射到 `hsl(var(--xxx))` CSS 变量。变量按三个维度组合定义：

- 明暗：`:root`（亮）/ `.dark`（暗）
- 调色板：默认 ink（无 data-theme）/ `data-theme="paper"` / `data-theme="night"`
- 密度：`data-density="compact"` 仅影响 `--radius`（0.75rem → 0.55rem）

Tailwind 语义类速查（写代码只用这些）：

| 语义类 | 用途 |
|---|---|
| `bg-background` / `text-foreground` | 页面底色/正文 |
| `bg-card` / `text-card-foreground` | 卡片 |
| `bg-popover` / `text-popover-foreground` | 浮层（下拉、弹窗内浮层） |
| `bg-primary` / `text-primary-foreground` | 主操作（主按钮、强调） |
| `bg-secondary` / `text-secondary-foreground` | 次级容器、次要按钮 |
| `bg-muted` / `text-muted-foreground` | 弱化背景/说明文字（占位、辅助信息） |
| `bg-accent` / `text-accent-foreground` | hover 态、选中态底色 |
| `bg-destructive` / `text-destructive-foreground` | 危险操作、错误 |
| `bg-success` / `text-success-foreground` | 成功态（项目扩展，非 shadcn 标准） |
| `bg-warning` / `text-warning-foreground` | 警告态（项目扩展） |
| `bg-info` / `text-info-foreground` | 信息态（项目扩展） |
| `border-border` / `border-input` | 边框/输入框边框 |
| `ring-ring` | focus 环 |

工作台表面 token（`client/src/index.css`）：

| Token | 用途 |
|---|---|
| `--surface-background` | 工作台页面底色 |
| `--surface-panel` | 普通卡片、侧栏面板 |
| `--surface-subtle` | 空状态和弱化内容区 |
| `--surface-raised` | 弹窗、下拉等浮起表面 |
| `--surface-control` | 输入框、筛选器、次级控件 |
| `--surface-nav` | 半透明顶栏和移动底栏 |
| `--control-hover` / `--control-active` | 控件悬停/选中底色 |
| `--focus-ring` | 键盘聚焦环 |
| `--shadow-panel` / `--shadow-floating` | 面板/浮层阴影 |
| `--radius-panel` / `--radius-control` / `--radius-pill` | 面板、控件、胶囊圆角 |
| `--duration-fast` / `--duration-base` / `--duration-slow` | 交互与页面过渡时长 |
| `--ease-out-quint` | 工作台过渡曲线 |

## Ink 调色板（默认，无 data-theme）

### 亮色 `:root`

| Token | HSL | 视觉 |
|---|---|---|
| background | `0 0% 100%` | 纯白 |
| foreground | `222.2 84% 4.9%` | 深蓝黑 |
| card / popover | `0 0% 100%` | 白 |
| primary | `222.2 47.4% 11.2%` | 深蓝黑（主按钮是深色） |
| primary-foreground | `210 40% 98%` | 近白 |
| secondary / muted / accent | `210 40% 96.1%` | 浅灰蓝 |
| secondary-foreground / accent-foreground | `222.2 47.4% 11.2%` | 深蓝黑 |
| muted-foreground | `215.4 16.3% 46.9%` | 中灰（说明文字） |
| destructive | `0 84.2% 60.2%` | 红 |
| success | `142 60% 32%`（前景 `138 76% 97%`） | 绿 |
| warning | `32 92% 38%`（前景 `48 100% 96%`） | 橙棕 |
| info | `199 78% 36%`（前景 `204 100% 97%`） | 蓝 |
| border / input | `214.3 31.8% 91.4%` | 浅灰蓝 |
| ring | `222.2 84% 4.9%` | 深蓝黑 |
| --radius | `0.75rem` | |

### 暗色 `.dark`

| Token | HSL |
|---|---|
| background | `222 26% 8%` |
| foreground | `210 20% 94%` |
| card | `222 23% 11%` |
| popover | `222 23% 13%` |
| primary | `190 84% 63%`（冷青色主操作） |
| primary-foreground | `222 26% 8%` |
| secondary | `222 20% 16%` |
| muted | `222 18% 16%` |
| accent | `190 32% 19%` |
| accent-foreground | `190 85% 88%` |
| muted-foreground | `214 14% 68%` |
| border / input | `217 22% 24%` / `217 22% 26%` |
| ring | `190 84% 63%` |
| success | `142 55% 48%` |
| warning | `38 92% 55%` |
| info | `199 80% 58%` |

注意：暗色下 primary 是浅色、primary-foreground 是深色——所以绝不能用 `text-black` 之类的固定色搭配 primary 背景。

## Paper 调色板（`data-theme="paper"`，宣纸暖棕）

- 亮色：background `42 33% 97%`（暖白）；primary `28 55% 27%`（暗棕）；ring `28 55% 27%`
- 暗色（`:root.dark[data-theme="paper"]`）：background `28 23% 10%`；primary `36 71% 62%`（琥珀金）

## Night 调色板（`data-theme="night"`，暗夜青蓝）

- 亮色：background `198 28% 96%`；primary `166 70% 34%`（青绿 teal）
- 暗色（`.dark[data-theme="night"]`）：background `222 47% 8%`；primary `166 70% 42%`；accent-foreground `186 80% 88%`；success `155 70% 48%`

## 圆角

| Tailwind 类 | 值 |
|---|---|
| `rounded-lg` | `var(--radius)` = 0.75rem（comfortable）/ 0.55rem（compact） |
| `rounded-md` | `calc(var(--radius) - 2px)` |
| `rounded-sm` | `calc(var(--radius) - 4px)` |

工作台专用圆角：面板 `--radius-panel: 1rem`，控件 `--radius-control: 0.625rem`，胶囊 `--radius-pill: 9999px`。紧凑密度只调整通用 `--radius`，不改变面板与胶囊的语义边界。

## 字体

- 无字体文件、无 @font-face、无外链 webfont。字体栈：`"IBM Plex Sans", "Segoe UI", sans-serif`（依赖系统安装，回退 Segoe UI）。
- 不要引入新字体。需要层级对比时用 `text-sm`/`text-lg`/`font-medium`/`font-semibold` 调节。

## 布局断点与全局行为

- `darkMode: "class"`。
- `min-width: 768px`（桌面）：`html/body/#root` 固定 100% 高、`overflow: hidden`——桌面是应用式固定视口布局，页面内部自己滚动。
- `< 768px`（移动）：整页可滚动；`.mobile-route-*` 页面级 class 强制单列、按钮全宽、输入字号 16px（防 iOS 聚焦缩放）。

## 主题系统机制（client/src/components/theme/ThemeProvider.tsx）

- `mode: light | dark | system`（system 跟随 `prefers-color-scheme` 并监听变化）
- `palette: ink | paper | night` → `<html data-theme>`
- `density: comfortable | compact` → `<html data-density>`
- 持久化：localStorage key `ai-novel.theme.preference`（JSON `{mode, palette, density}`）
- `index.html` 内联脚本在 React 挂载前应用同一 key，防主题闪烁——改 key 名会破坏防闪烁，需同步两处。
- 切换入口：`ThemeToggle`（Navbar 内，light→dark→system 循环）与设置页外观分区。

## 自定义工具类（index.css @layer utilities，可直接使用）

| 类 | 用途 |
|---|---|
| `live-execution-scrollbar` | 薄滚动条（青绿色调），实时执行面板用 |
| `mobile-safe-bottom` | 移动端底部安全区 padding |
| `mobile-site-main` | 移动站点主内容区 |
| `mobile-site-section` | 移动端圆角卡片段（rounded-[1.25rem]，阴影 `0 10px 30px rgb(15 23 42/0.06)`） |
| `mobile-site-soft-section` | 移动端弱化卡片段 |
| `mobile-site-scroll-tabs` | 移动端横向滚动页签 |
| `studio-shell` / `studio-main` / `studio-page` | 工作台根容器、主滚动区、页面内容 |
| `studio-top-nav` / `studio-sidebar` | 桌面/移动导航表面 |
| `studio-card` / `studio-control` / `studio-button` / `studio-pill` | 工作台面板、控件和胶囊语义边界 |

移动端视口判断用 `useIsMobileViewport`（`@/components/layout/mobile/useIsMobileViewport`）。
