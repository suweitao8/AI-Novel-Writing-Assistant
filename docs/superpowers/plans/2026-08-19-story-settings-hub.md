# 设定中心（角色/场景/道具/世界观）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 短篇与简易模式两条通道获得共享「设定中心」（角色/场景/道具/世界观 tab），AI 自动生成设定并在写作前确认，设定注入写作上下文解决"硬写漂浮"。

**Architecture:** 新增 NovelScene/NovelProp 增量模型与 story-settings 模块（Prompt Registry 资产 + CRUD 服务 + REST 路由）；短篇生产服务增加设定阶段与 settings_ready 确认门槛；上下文注入挂 shortStoryPromptContext 与 GenerationContextAssembler 两个既有组装点；前端共享 storySettings 组件接入两个页面。

**Tech Stack:** Prisma(SQLite)、Express、Zod、Prompt Registry（结构化输出）、React + TanStack Query + shadcn ui。

**执行方式:** 内联执行（任务间强依赖，schema→服务→路由→UI 顺序推进）。

设计文档：`docs/superpowers/specs/2026-08-19-story-settings-hub-design.md`

---

### Task 1: 数据模型与迁移

**Files:**
- Modify: `server/src/prisma/schema.prisma`（新增 NovelScene、NovelProp；ShortStoryPlan 状态扩展）
- 运行: `pnpm prisma migrate dev --name story_settings_models`（纯增量）

要点：字段见设计文档；确认 ShortStoryPlan.status 的现有类型（String 或 enum）后追加 `settings_ready` 语义值。

### Task 2: Prompt Registry 资产 novel.story_settings.bundle

**Files:**
- Create: `server/src/prompting/prompts/novel/storySettings.ts`
- Modify: `server/src/prompting/registry.ts`（注册）

要点：结构化输出 schema（zod）：characters[]/scenes[]/props[]/world{premise,era,toneRules[],keySettings[],mapLocations[]}；contextPolicy 引用小说基础信息与创作意图；参照同目录既有 novel 资产的写法。

### Task 3: story-settings 服务与路由

**Files:**
- Create: `server/src/modules/novel/story-settings/application/StorySettingsService.ts`
- Create: `server/src/modules/novel/story-settings/http/storySettingsRoutes.ts`
- Modify: `server/src/modules/novel/http/novelRouteRegistration.ts`（挂载）

端点：overview / scenes CRUD / props CRUD / characters 只读+基础编辑 / world 读+编辑 / ensure / regenerate / confirm。ensure 幂等只补缺失类别；生成本体走 Task 2 资产。

### Task 4: 短篇设定阶段与确认门槛

**Files:**
- Modify: `server/src/modules/novel/short-story/application/ShortStoryProductionService.ts`（run 前置设定阶段；settings_ready 停止；不越权续写）
- Modify: `server/src/modules/novel/short-story/http/shortStoryRoutes.ts`（confirm 端点转调 settings 模块或直接实现）

### Task 5: 写作上下文注入

**Files:**
- Modify: `server/src/modules/novel/short-story/application/shortStoryPromptContext.ts`（新增设定块）
- Modify: `server/src/services/novel/runtime/GenerationContextAssembler.ts`（场景/道具数据源进 package）
- Modify: `server/src/prompting/prompts/novel/chapterLayeredContext.ts`（渲染紧凑块）

### Task 6: 前端 API 与设定中心组件

**Files:**
- Create: `client/src/api/storySettings.ts`
- Create: `client/src/pages/novels/components/storySettings/`（StorySettingsTabs + Characters/Scenes/Props/World 四 tab + ConfirmCard）

遵循 novel-ui 规范与既有 ui/ 组件。

### Task 7: 页面接入

**Files:**
- Modify: `client/src/pages/shortStory/ShortStoryStudioPage.tsx`（五 tab + 设定就绪卡）
- Modify: `client/src/pages/novels/simpleCreation/SimpleNovelShelfPage.tsx`（创作/设定二级 tab + 继续前 ensureSettings）

### Task 8: 验证与文档

- `pnpm --filter @ai-novel/server typecheck`、`pnpm --filter @ai-novel/client typecheck`
- 定向测试：story-settings 协议/服务测试（参照 server/tests/*.test.js 模式）
- release notes + wiki（产品决策 + 模块边界）
- 合并 main、推送、清理 worktree
