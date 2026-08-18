# 可复用组件目录（精确 API）

路径均在 `client/src/` 下。所有动态类名经 `cn()`（`@/lib/utils`）合并。

## 一、shadcn 基础组件（components/ui/，共 9 个，源码归项目所有）

### Button

```tsx
import { Button } from "@/components/ui/button";
```

- variant：`default`（主操作，bg-primary）| `secondary` | `outline`（描边）| `ghost`（幽灵/hover 态）| `destructive`（危险）
- size：`default`(h-10) | `sm`(h-9) | `lg`(h-11) | `icon`(h-10 w-10 方形图标钮)
- Props：`asChild?: boolean`（用 Slot 把样式传给子元素，如 asChild 包 react-router 的 Link）+ 原生 button 属性
- 导出：`Button`、`buttonVariants`（在非 button 元素上复用按钮样式时用）

### Badge

- variant：`default` | `secondary` | `destructive` | `outline`
- 例：`<Badge variant="secondary">模型</Badge>`

### Card

导出 `Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter`，全部只收原生 div 属性 + className。页面分区的默认容器。

### Dialog

导出 `Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, AppDialogContent`。

- 小弹窗：`Dialog > DialogContent(max-w-lg) > DialogHeader(DialogTitle + DialogDescription) + 内容 + DialogFooter`
- **整页式弹窗（内容多、需滚动时首选）**：

```tsx
type AppDialogContentProps = DialogContentProps & {
  title: React.ReactNode;        // 必填
  description?: React.ReactNode;
  footer?: React.ReactNode;      // 有值才渲染底栏
  headerClassName?: string;
  bodyClassName?: string;        // body 区自带 overflow-y-auto
  footerClassName?: string;
};
// 结构：max-w-3xl、max-h-[calc(100dvh-2rem)]，头(带边框)/可滚动体/底(带边框) 三段
```

### Input

`Input` + `InputProps`（原生 input 属性）。表单输入默认高度与 Button default(h-10) 对齐。

### Select（Radix 原语）

导出 `Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton`。
仅在需要完全自定义结构时直接用；常规场景用 SelectControl / SearchableSelect / SelectField。

### Switch

`checked` + `onCheckedChange?: (checked: boolean) => void`（注意：不是 onChange）。

### Tabs

`Tabs(value? defaultValue?) > TabsList > TabsTrigger(value)` + `TabsContent(value)`。

### Toast（sonner 封装）

```tsx
import { toast, Toaster } from "@/components/ui/toast";
```

- `toast(message, data?)`：与 sonner 完全兼容，支持 `duration`、`description`、`action`、`closeButton`、`dismissible`；`toast.success/loading/promise` 亦可用。
- `toast.error(message, data?)`：自动合并 `ERROR_TOAST_DEFAULTS = { duration: Infinity, closeButton: true, dismissible: true }`——错误通知常驻直至用户关闭。
- `Toaster` 已在 `main.tsx` 挂载（richColors、top-right、offset 20/移动 12），业务代码不要重复挂载。

## 二、通用组件（components/common/，跨模块复用）

### AiButton（默认导出）— AI 操作按钮统一入口

```tsx
Props = ButtonProps & { children: ReactNode; contentClassName?: string; badgeClassName?: string }
```

行为：onClick 前经 `useCreationSetup().requireCreationSetup()` 守卫——用户未完成首创设置时拦截点击（preventDefault + stopPropagation）并拉起引导；通过则调用原 onClick。内容渲染为 `AiActionLabel`（自带 "AI" 小徽标）。任何触发 AI 生成/审校/改写的按钮都用它。

### AiActionLabel（默认导出）— "AI" 徽标 + 文本

`{ children: ReactNode; className?: string; badgeClassName?: string }`。AiButton 内部已用；需要非按钮位置标注 AI 语义时单独用。

### SelectControl（默认导出）— 常规下拉，仿原生 select 写法

```tsx
{
  children: ReactNode;                       // 必须是 <option> 列表（可 Fragment 包裹）
  value?: string | number | readonly string[] | null;
  defaultValue?: 同上;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;  // 原生事件形状：e.target.value
  placeholder?: string;                       // 默认 "请选择"
  className?: string; triggerClassName?: string; contentClassName?: string;
  // 其余原生 select 属性透传：disabled/id/name/required/aria-label...
}
```

空值哨兵：`__select_control_empty__`。项目内使用量最大的下拉（52 文件），表单里的默认选择。

### SearchableSelect（默认导出）— 可搜索下拉

```tsx
interface SearchableSelectOption { value: string; label?: string; keywords?: string[]; disabled?: boolean }
{
  options: SearchableSelectOption[];          // 必填
  onValueChange: (value: string) => void;     // 必填
  value?: string;
  placeholder?: string;        // "请选择"
  searchPlaceholder?: string;  // "搜索"
  emptyText?: string;          // "没有可选项"
  disabled?: boolean;
  className?: string; triggerClassName?: string; contentClassName?: string;
}
```

自带搜索框，Enter 选中第一个可用项，外点/ESC 关闭。长列表（模型、角色、章节）用它。

### SelectField — 带 label 的表单下拉字段

```tsx
interface SelectFieldOption { value: string; label: string; disabled?: boolean }
{
  options: SelectFieldOption[]; onValueChange: (v: string) => void;   // 必填
  value?: string;
  label?: string; description?: string; helperText?: string; error?: string;
  required?: boolean; disabled?: boolean;
  placeholder?: string; emptyText?: string;
  className?: string; triggerClassName?: string; contentClassName?: string;
}
```

配置表单里"标签 + 说明 + 错误信息"齐全的字段用它，不要手拼 label + SelectControl。

### LLMSelector（默认导出）— AI 模型选择

```tsx
interface LLMSelectorValue { provider: LLMProvider; model: string; temperature?: number; maxTokens?: number }
{
  value?: LLMSelectorValue; onChange?: (v: LLMSelectorValue) => void;
  showModel?: boolean;              // true
  showParameters?: boolean;         // false，显示温度/maxTokens 表单
  showCompactTemperature?: boolean; // false
  compact?: boolean; showBadge?: boolean; showHelperText?: boolean; className?: string;
}
```

非受控（不传 value/onChange）时读写全局 `useLLMStore` 并持久化——全局默认模型选择就是这种用法；受控时走 onChange。所有需要用户选模型的地方用它，不要自己写。

### MarkdownViewer（默认导出）— Markdown 渲染

`{ content: string }` 唯一 Prop。react-markdown + rehypeHighlight，自带代码块滚动与换行处理。AI 输出的静态展示用它。

### StreamOutput — AI 流式输出面板

```tsx
{ isStreaming: boolean; content: string; onAbort?: () => void; title?: string; emptyText?: string }
```

流式中显示"停止生成"按钮（传 onAbort 才有）。SSE 流式生成的标准展示容器（配 `useSSE` / `useLlmLiveFeed`）。

### FullscreenView — 可全屏容器

```tsx
{
  title: ReactNode; children: ReactNode;   // 必填
  description?: ReactNode; meta?: ReactNode; actions?: ReactNode;
  fullscreen?: boolean;                    // 受控
  defaultFullscreen?: boolean; onFullscreenChange?: (next: boolean) => void;
  toggleLabel?: string; exitLabel?: string;
  className?: string; fullscreenClassName?: string;
  headerClassName?: string; bodyClassName?: string; fullscreenBodyClassName?: string;
}
```

全屏时锁定 body 滚动、ESC 退出。图谱/时间线/长文查看用它。

### AiRevisionWorkspace — AI 修订工作台

Plate 富文本编辑器封装的 AI 修订结果对比/应用面板。目前独立使用中，改动前先确认引用方。

## 三、工作流与领域通用组件

### WorkflowProgressBar（`@/components/workflow/WorkflowProgressBar`，默认导出）

```tsx
type WorkflowProgressTone = "running" | "waiting" | "failed" | "loading" | "default";
{ progress: number; tone?: WorkflowProgressTone; className?: string }
```

`progress` 兼容 0~1（比例）与 0~100（百分比），内部 `normalizeProgressPercent` 归一。tone 映射：running=主色+扫光动画、waiting=amber、failed=destructive、loading=slate、default=primary。自动导演/章节生成等长任务进度统一用它。

### TaskQueue 系列（`@/components/taskQueue`，桶导出）

任务队列展示原语（Primitives）与语义组件（Semantic），导出 `TaskQueueMetricItem`、`TaskQueueSeverity` 等类型。任务中心/AI 舵机/恢复入口的任务态展示一律复用，语义色（severity）不要自配。

### LiveExecutionDialog（`@/components/liveExecution/LiveExecutionDialog`）

实时执行进度弹窗，任务实时输出场景用（配 `live-execution-scrollbar`）。

### 视觉资产（`@/components/visualAssets`，桶导出）

VisualAssetPickerDialog 等：资产选择/库/详情。

### 知识库（`@/components/knowledge`）

KnowledgeBindingPanel（绑定面板）、KnowledgeDocumentPicker（文档选择）。

### 布局（`@/components/layout`）

- `AppLayout`：Navbar + Sidebar + Outlet 整壳，路由根布局。
- `Navbar`：顶栏（LLMSelector、ThemeToggle、版本徽标），Props `workspaceNavMode?: "workspace" | "project"`。
- `Sidebar`：左侧导航。
- `mobile/MobileSiteShell` + `mobileSiteNavigation` + `useIsMobileViewport`：移动端站点外壳，创意中心等站点级页面用；AppLayout 按视口切换。

### 主题（`@/components/theme`）

- `ThemeProvider`（main.tsx 挂载）：mode/palette/density 三维主题。
- `ThemeToggle`（无 Props）：light→dark→system 循环切换钮。

## 四、相关 hooks 与工具

- `useSSE`（`@/hooks/useSSE`）：SSE 流式数据。
- `useLlmLiveFeed`（`@/hooks/useLlmLiveFeed`）：LLM 实时输出。
- `useViewportSize`（`@/hooks/useViewportSize`）：视口尺寸。
- `useCreationSetup`（onboarding 上下文）：AiButton 守卫来源，首创引导流程相关。
- `cn()`（`@/lib/utils`）：唯一类名合并函数。
