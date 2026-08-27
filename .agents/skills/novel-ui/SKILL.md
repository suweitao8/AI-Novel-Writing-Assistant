---
name: novel-ui
description: AI-Novel-Writing-Assistant 项目专属 UI 设计规范与组件库使用指南。在本项目中新增或修改任何前端界面（页面、组件、样式、颜色、弹窗、表单、下拉选择、通知、加载状态、布局、移动端适配）时必须使用本 skill——强制复用现有设计 token 与通用组件以保证设计统一，禁止硬编码颜色、禁止绕过现有组件另造轮子。
---

# AI-Novel-Writing-Assistant UI 设计规范

本 skill 是本项目 UI 开发的唯一权威规范。目标是：任何人在任何页面写 UI，产出视觉与交互都和现有页面一致。

## 技术栈事实（不要引入替代品）

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | React 19 + Vite | `client/` 目录 |
| 样式 | Tailwind CSS v3 + CSS 变量 token | `client/tailwind.config.ts` + `client/src/index.css` |
| 基础组件 | shadcn/ui（slate 基色，仅 9 个：badge/button/card/dialog/input/select/switch/tabs/toast） | 源码在 `client/src/components/ui/`，归项目所有 |
| 图标 | lucide-react | 唯一图标库 |
| 通知 | sonner（经 `@/components/ui/toast` 封装） | 函数式 API，无 Provider |
| 动画 | framer-motion（已在依赖中，复杂动画可用） | 常规过渡用 Tailwind transition |
| 表单 | react-hook-form + zod | 复杂表单用；简单表单直接受控 state |
| 类名合并 | `cn()`（`@/lib/utils` = twMerge(clsx)） | 一切动态类名必须走 cn() |

新增 UI 依赖（新的组件库、图标库、通知库）是禁止项。需要新的 shadcn 基础组件时，用本仓库已有的 `.agents/skills/shadcn-ui` 流程安装到 `components/ui/`。

## 五条硬规则

1. **颜色只用语义 token**。写 `bg-primary`、`text-muted-foreground`、`border-border`、`bg-destructive`，不要写 `bg-slate-500`、`#3b82f6`、`bg-[#fff]`。原因：项目有三套调色板（ink/paper/night）× 明暗 × 紧凑密度，语义 token 才能自动适配全部主题。仅在组件内部 tone 语义映射处（如 WorkflowProgressBar 的 waiting=amber-500）允许调色板原色，且新代码默认不用。
2. **先找组件，再写组件**。写任何 UI 前先查 `references/components.md` 的组件目录——下文速查表覆盖 90% 场景。只有确认无可用组件后才新建，新建后若被 3+ 模块复用，移入 `components/common/`。
3. **类名合并一律 `cn()`**。条件类名、覆盖默认样式都用 `cn()` 包裹，Tailwind 类冲突靠 tailwind-merge 消解，不要手写模板字符串拼接。
4. **通知一律走 `toast`**。`import { toast } from "@/components/ui/toast"`；错误必须用 `toast.error()`（5 秒自动消失 + 关闭按钮，并自动记入"系统设置 → 最近报错日志"，不要自建报错记录）。不要用 alert/confirm/自绘 toast。
5. **触发 AI 生成的按钮一律 `AiButton`**。它自带首创引导守卫和 "AI" 徽标，见 `@/components/common/AiButton`。普通操作才用 `Button`。

## 组件速查表（需求 → 组件）

| 需求 | 用什么 | 位置 |
|---|---|---|
| 按钮 | `Button`（variant: default/secondary/outline/ghost/destructive；size: default/sm/lg/icon） | `@/components/ui/button` |
| AI 操作按钮 | `AiButton`（继承全部 ButtonProps） | `@/components/common/AiButton` |
| 徽标 | `Badge`（variant: default/secondary/destructive/outline） | `@/components/ui/badge` |
| 卡片容器 | `Card + CardHeader/CardTitle/CardDescription/CardContent/CardFooter` | `@/components/ui/card` |
| 弹窗（表单/确认级） | `Dialog + DialogContent + DialogHeader/DialogTitle/DialogDescription/DialogFooter` | `@/components/ui/dialog` |
| 弹窗（整页式：内容多、需滚动） | `Dialog + AppDialogContent`（title/description/footer 三段式，max-w-3xl） | `@/components/ui/dialog` |
| 文本输入 | `Input` | `@/components/ui/input` |
| 下拉（常规，仿原生 select 写法） | `SelectControl`（children 写 `<option>`，onChange 拿原生事件） | `@/components/common/SelectControl` |
| 下拉（带搜索/长列表） | `SearchableSelect`（options 数组 + onValueChange） | `@/components/common/SearchableSelect` |
| 下拉（带 label/helper/error 的表单字段） | `SelectField` | `@/components/common/SelectField` |
| 下拉（需要 Radix 完全控制） | `Select/SelectTrigger/SelectContent/SelectItem...` | `@/components/ui/select` |
| 开关 | `Switch`（checked/onCheckedChange） | `@/components/ui/switch` |
| 页签 | `Tabs/TabsList/TabsTrigger/TabsContent` | `@/components/ui/tabs` |
| 通知 | `toast()` / `toast.error()` / `toast.success()` | `@/components/ui/toast` |
| AI 模型选择 | `LLMSelector`（可受控可非控） | `@/components/common/LLMSelector` |
| Markdown 渲染 | `MarkdownViewer` | `@/components/common/MarkdownViewer` |
| AI 流式输出面板 | `StreamOutput`（isStreaming/content/onAbort） | `@/components/common/StreamOutput` |
| 工作流进度条 | `WorkflowProgressBar`（progress/tone: running/waiting/failed/loading/default） | `@/components/workflow/WorkflowProgressBar` |
| 全屏查看容器 | `FullscreenView` | `@/components/common/FullscreenView` |
| 任务队列展示 | taskQueue 系列（Primitives + Semantic） | `@/components/taskQueue` |
| 视觉资产选择/库 | visualAssets 系列 | `@/components/visualAssets` |
| 实时执行进度弹窗 | `LiveExecutionDialog` | `@/components/liveExecution/LiveExecutionDialog` |
| 知识库绑定 | KnowledgeBindingPanel 等 | `@/components/knowledge` |
| 图标 | lucide-react 的具名图标 | `lucide-react` |

需要了解某个组件的完整 Props：读 `references/components.md`。

## 核心代码约定

### 按钮与 AI 操作

```tsx
import { Button } from "@/components/ui/button";
import AiButton from "@/components/common/AiButton";

<Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
  {saving ? "保存中..." : "保存"}
</Button>

{/* 触发 AI 生成的按钮：AiButton 会在用户未完成首创设置时拦截点击并拉起引导 */}
<AiButton className="w-full" variant="outline" onClick={onRunAudit} disabled={running}>
  {running ? "正在运行完整审校..." : "运行完整审校"}
</AiButton>
```

### 通知

```tsx
import { toast } from "@/components/ui/toast";

toast.success("章节已保存");
toast.error("Prompt 处理失败", { description: errMessage }); // 错误必须带可读描述
toast("已加入队列", { description: "可在任务中心查看进度" });
// Toaster 已在 main.tsx 全局挂载，页面里不要再挂
```

### 弹窗

```tsx
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

<Dialog open={open} onOpenChange={setOpen}>
  <AppDialogContent
    title="选择视觉资产"
    description="从资产库中为当前章节选择一张图片"
    footer={
      <>
        <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
        <Button onClick={handleConfirm} disabled={!selected}>确定</Button>
      </>
    }
  >
    {/* 可滚动内容区 */}
  </AppDialogContent>
</Dialog>
```

### 下拉选择（默认用 SelectControl，写法最接近原生）

```tsx
import SelectControl from "@/components/common/SelectControl";

<SelectControl
  className="h-9 rounded-md border bg-background px-2 text-sm"
  value={depth}
  onChange={(e) => setDepth(e.target.value)}
  disabled={pending}
>
  <option value="shallow">快速</option>
  <option value="deep">深度</option>
</SelectControl>
```

## 布局与落位规则

- 所有页面挂在 `AppLayout`（Navbar + Sidebar + Outlet）下，路由在 `client/src/router/index.tsx`，全部 `lazy()` 加载。
- 新页面放 `client/src/pages/<模块>/`，页面私有组件放同目录 `components/` 子目录，页面级 hooks 放 `hooks/` 子目录。
- 跨模块复用 ≥3 次的组件进 `client/src/components/common/`；成体系的模块组件用独立目录 + `index.ts` 桶导出 + README（参照 `taskQueue/`、`visualAssets/`）。
- 颜色/间距等 token 细节、自定义工具类清单：读 `references/design-tokens.md`。
- 页面结构、表单、加载/空/错误状态、移动端适配的完整模式：读 `references/patterns.md`。

## 主题适配（写任何 UI 时默认满足）

- 三维主题系统：mode（light/dark/system）× palette（ink/paper/night）× density（comfortable/compact），由 `ThemeProvider` 写到 `<html>` 的 class 和 `data-theme`/`data-density`。
- 只要全程用语义 token，六种组合自动正确。写死颜色是最常见的返工原因。
- 不要假设背景是白色或前景是黑色；不要写 `text-black`、`bg-white`。
- 暗色下新 UI 至少做一次 class="dark" 心算检查（对比度、边框可见性）。

## 状态完备性 checklist（每个交互组件必须有）

- [ ] 加载中：按钮 `disabled` + 文案切换（"生成中..."）；长任务配 WorkflowProgressBar 或 StreamOutput。
- [ ] 空状态：无数据时给出引导文案和下一步动作，不留白屏。
- [ ] 错误：`toast.error(msg, { description })`，可恢复的操作保留重试入口。
- [ ] 禁用态：前置条件不满足时 disabled 并能从 UI 看出原因。
- [ ] 中文文案面向用户视角（做什么/下一步是什么），禁止"迁移/升级/之前/现在"等过程性叙述（AGENTS.md UI Copy Rules）。

## 验证

UI 改动默认只跑 `pnpm --filter @ai-novel/client typecheck` 级别的代码检查；浏览器/截图验收由用户完成（AGENTS.md Verification Reuse Rules）。

## 参考

- `references/design-tokens.md` — 全部颜色 token 表（三调色板 × 明暗）、圆角/密度、字体、自定义工具类。
- `references/components.md` — 全部可复用组件的精确 Props 与真实用法示例。
- `references/patterns.md` — 新页面/表单/弹窗/流式输出/移动端适配的落地模式。
