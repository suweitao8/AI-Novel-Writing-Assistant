# 客户端 UI 设计体系与 novel-ui skill

## 背景

客户端（`client/`）基于 shadcn/ui（slate 基色）+ Tailwind CSS v3 CSS 变量 token 构建，并在标准 token 之上扩展了三维主题系统（mode × palette × density）。历史上 UI 开发缺少单一权威规范，新页面/新组件容易出现硬编码颜色、重复造轮子（自写下拉、自配 toast）、暗色与 paper/night 调色板下视觉破损等不一致问题。

## 决策

UI 设计规范与可复用组件目录以项目本地 skill 为唯一权威载体：`.agents/skills/novel-ui/`（含 `SKILL.md` 与 `references/design-tokens.md`、`references/components.md`、`references/patterns.md`）。选择 skill 而非普通文档，是因为规范需要在每次 UI 开发任务中被动加载执行，而不是等人主动翻阅。

核心设计决策：

- 颜色一律走语义 token（`bg-primary`、`text-muted-foreground` 等），因为 ink/paper/night 三调色板 × 明暗 × 紧凑密度共六种以上组合只有语义 token 能全覆盖；固定色值是主题破损的根源。
- 语义色扩展 success/warning/info 三个 token，用于状态语义，不自配 green/yellow/blue。
- 通用组件集中在 `components/common/`（SelectControl、AiButton、LLMSelector、SearchableSelect、SelectField、MarkdownViewer、StreamOutput、FullscreenView 等），复用 ≥3 次才沉淀进来；成体系模块用独立目录 + `index.ts` 桶导出 + README（taskQueue、visualAssets 范式）。
- 触发 AI 生成的按钮统一走 AiButton（首创引导守卫 + AI 徽标），错误通知统一走 `toast.error()`（常驻 + 关闭按钮）。
- 基础组件仅安装 shadcn 子集（9 个），新增基础组件通过仓库内 shadcn-ui skill 安装到 `components/ui/`，禁止引入第二套组件库。

## 当前规则

- 在本项目中新增或修改任何前端界面（页面、组件、样式、弹窗、表单、通知、布局、移动端适配），先读 `.agents/skills/novel-ui/SKILL.md` 并按其执行。
- 修改设计 token 必须改 `client/src/index.css` / `client/tailwind.config.ts` 源文件，并同步 skill 的 `references/design-tokens.md` 快照。
- 新增/修改高复用组件（`components/common/`、ui 基础件）时，同步更新 skill 的 `references/components.md`，保持组件目录与代码一致。
- 影响范围：仅前端 `client/src`，不涉及服务端与运行时契约。

## 示例

- 推荐：表单下拉用 `SelectField` 或 `SelectControl`；AI 生成反馈用 `AiButton` + `StreamOutput`/`WorkflowProgressBar` + `toast.error(msg, { description })`。
- 禁止：`bg-slate-500`、`text-black` 等固定色；自绘 toast/alert；绕过 AiButton 直接用 Button 触发 AI 生成；为移动端复制平行组件树。

## 失败模式

- 症状：新 UI 在暗色或 paper/night 调色板下出现黑底黑字、边框不可见 → 排查是否使用了固定色类；短期给暗色打补丁是掩盖问题，应改回语义 token。
- 症状：同一页面出现多种下拉/通知样式 → 排查是否绕过了 components/common 与 ui/toast；不要靠事后统一风格，应在开发时强制走 skill 组件速查表。

## 相关模块

- `client/src/components/`（ui / common / layout / theme / 领域组件目录）
- `client/src/index.css`、`client/tailwind.config.ts`、`client/components.json`
- `.agents/skills/novel-ui/`（权威规范载体）
- `.agents/skills/shadcn-ui/`（新增基础组件的安装流程）

## 来源文档

- novel-ui skill：`../../../.agents/skills/novel-ui/SKILL.md`
