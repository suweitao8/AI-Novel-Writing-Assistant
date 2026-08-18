# UI 开发模式（本项目落地范式）

## 1. 新增页面

1. 建目录 `client/src/pages/<module>/`，入口 `index.tsx` 或 `<Module>Page.tsx`；页面私有组件放 `<module>/components/`，页面级 hooks 放 `<module>/hooks/`。
2. 在 `client/src/router/index.tsx` 注册路由，一律 `lazy(() => import(...))`，自动挂在 `AppLayout` 下（无需手包布局）。旧路径迁移时保留 redirect（项目惯例，如 `/chat` → `/creative-hub`）。
3. 页面骨架：顶部页头（标题 + 主操作按钮）+ Card 分区；分区标题用 `CardHeader/CardTitle/CardDescription`，说明文字用 `text-muted-foreground`。

```tsx
// 页面骨架示意
<Card>
  <CardHeader>
    <CardTitle>章节审校</CardTitle>
    <CardDescription>运行完整审校后可查看逐项问题与修复建议</CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">{/* ... */}</CardContent>
  <CardFooter className="justify-end gap-2">{/* 操作区 */}</CardFooter>
</Card>
```

4. 受 featureFlags 门控的功能（见 `client/src/config/featureFlags.ts`）要在路由和入口同时判断。

## 2. 表单

- 简单表单（≤3 字段）：受控 state + 受控组件即可。
- 复杂表单：react-hook-form + zod（依赖已装）。下拉字段用 `SelectField`（自带 label/description/error），不要手拼。
- 提交按钮必须有 pending 态：`disabled={submitting}` + 文案切换（"保存中..."）。
- 校验错误就近显示在字段下方（`text-sm text-destructive`），不要只弹 toast。

## 3. 弹窗

- 内容少（确认、单字段）：`Dialog + DialogContent`（max-w-lg）+ `DialogHeader/DialogFooter`。
- 内容多（选择列表、多步操作）：`Dialog + AppDialogContent`，footer 放"取消/确定"，确定按钮按前置条件 disabled。
- 弹窗开关用受控 `open/onOpenChange`，不用 DialogTrigger（便于程序化打开与关闭时机控制）。
- 关闭前有未保存内容时二次确认。

## 4. AI 生成与流式反馈（本项目最高频场景）

标准组合：

```tsx
import AiButton from "@/components/common/AiButton";
import StreamOutput from "@/components/common/StreamOutput";
import MarkdownViewer from "@/components/common/MarkdownViewer";
import WorkflowProgressBar from "@/components/workflow/WorkflowProgressBar";
import { toast } from "@/components/ui/toast";
```

流程要点：

1. 触发按钮用 `AiButton`（自带首创引导守卫 + AI 徽标）。
2. 运行中：按钮 disabled + 文案"正在..."；有进度数值时 `WorkflowProgressBar tone="running"`。
3. 流式输出用 `StreamOutput`（isStreaming/content/onAbort），结束后同一区域切换 `MarkdownViewer` 展示最终结果。
4. 失败：`toast.error("xx失败", { description })`；有可重试语义时保留重试按钮。
5. 长任务接入任务中心（taskQueue 语义组件），不要只做页面内进度——刷新页面会丢。
6. SSE 数据用 `useSSE` / `useLlmLiveFeed`，不要手写 EventSource。

## 5. 通知规范

- 成功：`toast.success("已保存")`——短句，不带技术细节。
- 失败：`toast.error(用户能懂的标题, { description: 具体原因 })`——error 自动常驻 + 关闭按钮。
- 进行中：`toast.loading` / `toast.promise`（sonner 原生可用）。
- 通知文案面向动作结果（"章节已导出"），不写过程叙述（"已迁移到新管线"）。

## 6. 加载 / 空 / 错误状态

- 加载：骨架屏或居中 spinner + 说明文字；按钮内联 pending 文案。
- 空状态：一段引导文案（这个区域做什么、用户下一步点什么）+ 引导按钮。禁止纯白屏/纯图标。
- 错误状态：区域级错误在区域内显示 + 重试；全局操作失败走 toast.error。
- 禁用原因可见：按钮 disabled 时旁边给 `text-muted-foreground` 的原因说明。

## 7. 移动端适配

项目是混合式适配（无独立移动组件树）：

- 视口判断：`useIsMobileViewport`（`@/components/layout/mobile/useIsMobileViewport`）。
- 站点级页面（创意中心类）：走 `MobileSiteShell` 外壳，分区用 `mobile-site-section` / `mobile-site-soft-section` 工具类。
- 页面级适配：桌面组件 + `<768px` 媒体查询覆盖（index.css 中 `.mobile-route-*` 模式）；新页面如需页面级移动覆盖，在 index.css 追加对应 `.mobile-route-<page>` 规则并保持单列、按钮全宽。
- 移动端输入框字号保持 16px（防 iOS 聚焦缩放）；底部操作加 `mobile-safe-bottom`。
- 移动视图内部继续复用桌面通用组件（WorkflowProgressBar、toast、taskQueue 等），不要为移动端复制一份平行组件。

## 8. 组件沉淀规则

- 出现第 3 个使用方时，把组件提升到 `components/common/`（通用）或独立领域目录。
- 成体系模块（5+ 组件）用独立目录 + `index.ts` 桶导出 + README（参照 `components/taskQueue/`、`components/visualAssets/`）。
- 状态逻辑与 UI 分离：纯逻辑抽 `.ts` 文件并可配 `.test.mjs`（参照 `novelWorkspaceRailState` 模式）。
- 遵守 AGENTS.md 架构规则：单文件 ~1200 行内；通用 `utils` 超 300 行需拆分。

## 9. 主题与暗色自检清单

- [ ] 全程语义 token，无 `bg-white/text-black/bg-slate-*` 等固定色（tone 映射类组件内部除外）。
- [ ] 暗色下边框可见（border-border，不要 border-gray-*）。
- [ ] 语义色用 success/warning/info token，不自配 green/yellow/blue。
- [ ] hover/选中态用 bg-accent，不用自配灰。
- [ ] 新增 CSS 变量时同步三套调色板 × 明暗全部组合。

## 10. 文案规范（AGENTS.md UI Copy Rules 摘要）

- 面向用户视角：能做什么、系统在帮什么、下一步是什么。
- 禁止面向开发者的过程叙述词：`现在/不再/已经/之前/原本/迁回/升级为`。
- 跳转其他模块时直接写正确入口（"从小说基础信息设置默认写法"），不写"xx 已迁回小说页"。

## 11. 验证

- UI 改动默认 `pnpm --filter @ai-novel/client typecheck` 即可；浏览器/截图/交互验收留给用户。
- 复用最近一次同范围 typecheck 结果前，确认之后没有相关文件改动。
