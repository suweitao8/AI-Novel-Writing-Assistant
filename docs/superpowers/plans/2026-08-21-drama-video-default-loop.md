# 漫剧视频真实默认通道与任务闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 让漫剧视频阶段默认使用可执行的本地 FFmpeg 通道，并让单镜视频任务在页面内自动刷新、失败重试和直接播放结果。

**Architecture:** 服务端在 VideoProviderRegistry 统一解析默认 provider，并把默认标记随 provider 列表返回；提示词服务、HTTP 路由和批量编排只使用这个解析入口，显式 provider 仍然优先。前端根据服务端默认标记初始化选择器，在 DramaVisualPanel 内只轮询当前活动版本的 queued/running 任务，终态停止轮询；失败操作复用现有创建任务接口，成功结果由卡片内的原生 video 元素展示。

**Tech Stack:** TypeScript, Node.js test runner, Prisma service layer, React 19, TanStack Query, Vite, Tailwind semantic tokens, pnpm.

---

## 文件责任地图

- server/src/services/drama/video/VideoProviderPort.ts：provider 注册、能力列表和默认 provider 解析。
- server/src/services/drama/DramaVideoPromptService.ts：提示词记录、provider 任务创建、状态刷新和重试时的状态清理。
- server/src/modules/drama/http/dramaRoutes.ts：视频 provider 列表和任务创建 HTTP 缺省值。
- server/src/services/drama/production/DramaBatchOrchestrator.ts：批量视频任务的默认 provider。
- server/src/services/drama/studio/ComicDramaStudioService.ts：漫剧工作台概览中的 provider 投影。
- server/tests/dramaForge.test.js：provider registry 的默认解析与列表契约。
- server/tests/dramaPipelineContract.test.js：视频提示词、显式 mock 和重试状态的管线回归。
- client/src/api/media/drama.ts：provider 列表、任务创建函数和类型契约。
- client/src/pages/drama/DramaProjectPage.tsx：选择器的服务端默认 provider 投影。
- client/src/pages/drama/components/DramaVisualPanel.tsx：视频任务轮询、按钮状态、失败重试和结果播放。
- docs/wiki/workflows/short-drama-workspace.md：漫剧视频 provider 与任务闭环的长期运行规则。
- docs/wiki/architecture/drama-forge-module-boundary.md：Drama Forge provider 边界与默认值说明。
- docs/releases/release-notes.md、README.md：用户可见的最新能力说明。

### Task 1: 先锁定 provider 默认解析契约

**Files:**
- Modify: server/tests/dramaForge.test.js
- Test: server/tests/dramaForge.test.js

- [ ] **Step 1: 写失败测试**

在现有 video provider registry 测试旁增加三个断言组：

    test("drama video provider registry resolves local ffmpeg as the safe default", async () => {
      const port = require("../dist/services/drama/video/VideoProviderPort.js");
      const previous = process.env.DRAMA_VIDEO_DEFAULT_PROVIDER;
      try {
        delete process.env.DRAMA_VIDEO_DEFAULT_PROVIDER;
        assert.equal(port.resolveDefaultVideoProvider(), "local_ffmpeg");
        const providers = port.videoProviderRegistry.listProviders();
        assert.equal(providers.filter((item) => item.isDefault).length, 1);
        assert.equal(providers.find((item) => item.provider === "local_ffmpeg")?.isDefault, true);
      } finally {
        if (previous === undefined) delete process.env.DRAMA_VIDEO_DEFAULT_PROVIDER;
        else process.env.DRAMA_VIDEO_DEFAULT_PROVIDER = previous;
      }
    });

    test("drama video provider registry honors a registered override and ignores an unknown override", async () => {
      const port = require("../dist/services/drama/video/VideoProviderPort.js");
      const previous = process.env.DRAMA_VIDEO_DEFAULT_PROVIDER;
      try {
        process.env.DRAMA_VIDEO_DEFAULT_PROVIDER = "mock";
        assert.equal(port.resolveDefaultVideoProvider(), "mock");
        process.env.DRAMA_VIDEO_DEFAULT_PROVIDER = "missing-provider";
        assert.equal(port.resolveDefaultVideoProvider(), "local_ffmpeg");
      } finally {
        if (previous === undefined) delete process.env.DRAMA_VIDEO_DEFAULT_PROVIDER;
        else process.env.DRAMA_VIDEO_DEFAULT_PROVIDER = previous;
      }
    });

- [ ] **Step 2: 运行测试确认确实失败**

运行：pnpm --filter @ai-novel/server build; node --test server/tests/dramaForge.test.js

预期：测试因 resolveDefaultVideoProvider 未导出、列表没有 isDefault 而失败；已有 mock、HTTP 和 TTS 测试保持通过。

- [ ] **Step 3: 提交测试基线**

运行：

    git add server/tests/dramaForge.test.js
    git commit -m "test: define drama video provider defaults"

### Task 2: 实现服务端 provider registry 默认解析

**Files:**
- Modify: server/src/services/drama/video/VideoProviderPort.ts
- Test: server/tests/dramaForge.test.js

- [ ] **Step 1: 增加 registry 能力和默认解析函数**

给 registry 增加 has(provider: string): boolean，给 listProviders() 的元素增加 isDefault: boolean，并导出以下解析函数。函数每次读取环境变量，避免测试或运行时修改配置后使用过期缓存：

    export function resolveDefaultVideoProvider(): string {
      const configured = process.env.DRAMA_VIDEO_DEFAULT_PROVIDER?.trim();
      if (configured && videoProviderRegistry.has(configured)) {
        return configured;
      }
      if (videoProviderRegistry.has("local_ffmpeg")) {
        return "local_ffmpeg";
      }
      return "mock";
    }

listProviders() 在 map 中使用 provider.provider === resolveDefaultVideoProvider() 计算 isDefault，不修改注册顺序，不删除 mock 或 HTTP provider。

- [ ] **Step 2: 运行 provider 测试确认通过**

运行：pnpm --filter @ai-novel/server build; node --test server/tests/dramaForge.test.js

预期：provider 默认、显式 mock、未知配置回退、HTTP 映射和 TTS 测试全部通过。

- [ ] **Step 3: 提交 registry 实现**

运行：

    git add server/src/services/drama/video/VideoProviderPort.ts
    git commit -m "feat: resolve drama video provider defaults"

### Task 3: 统一服务端单镜、路由和批量任务，并覆盖失败重试

**Files:**
- Modify: server/src/services/drama/DramaVideoPromptService.ts
- Modify: server/src/modules/drama/http/dramaRoutes.ts
- Modify: server/src/services/drama/production/DramaBatchOrchestrator.ts
- Modify: server/src/services/drama/studio/ComicDramaStudioService.ts
- Modify: server/tests/dramaPipelineContract.test.js

- [ ] **Step 1: 扩展管线测试覆盖默认和显式 provider**

在现有 video prompt 管线测试中，把不带 provider 的生成断言改为 local_ffmpeg，并保留显式 createProviderTask(prompt.id, "mock") 的 mock 联调断言。增加一个可重复的失败重试场景：用现有测试状态中的 mock provider 先创建任务，再把对应提示词状态改为 failed、写入旧 resultUrl 和 failureReason，再次调用 createProviderTask(prompt.id, "mock")，断言新 providerTaskId 以 mock_ 开头、resultUrl 与 failureReason 被清空、状态来自新 provider 结果；对 superseded prompt 继续断言拒绝。

- [ ] **Step 2: 运行管线测试确认新断言先失败**

运行：pnpm --filter @ai-novel/server build; node --test server/tests/dramaPipelineContract.test.js

预期：默认 provider 断言失败，既有音频、导出、显式 mock 和 superseded 保护仍能执行；失败重试断言用于固定现有清理契约，若当前实现已满足则保持通过。

- [ ] **Step 3: 接入统一默认 provider**

在三个服务端入口统一导入 resolveDefaultVideoProvider：

    // DramaVideoPromptService
    async createProviderTask(videoPromptId: string, provider?: string) {
      const resolvedProvider = provider?.trim() || resolveDefaultVideoProvider();
      // resolve/create/update 全部使用 resolvedProvider
    }

提示词创建时将 provider 写成 resolveDefaultVideoProvider()；路由把 body 中的 provider 作为可选值传给 service，不再写 "mock"；批量编排删除 "mock" 常量，缺省时传入 resolver 的结果。现有显式 provider 调用不改变。

- [ ] **Step 4: 清理重试状态并投影默认标记**

任务创建成功更新记录时明确写入 resultUrl: result.resultUrl ?? null 和 failureReason: result.failureReason ?? null，因此失败 prompt 重试会清除旧结果和旧错误。ComicDramaStudioService.toVideoProviders() 保留现有 id/label/kind 字段并增加 isDefault，让工作台概览与主页面使用同一服务端默认信息。

- [ ] **Step 5: 运行服务端回归确认通过**

运行：pnpm --filter @ai-novel/server build; node --test server/tests/dramaForge.test.js server/tests/dramaPipelineContract.test.js

预期：默认解析、显式 mock、失败重试、HTTP provider、本地 provider 状态、音频、导出和 superseded 保护全部通过。

- [ ] **Step 6: 提交服务端闭环**

运行：

    git add server/src/services/drama/video/VideoProviderPort.ts server/src/services/drama/DramaVideoPromptService.ts server/src/modules/drama/http/dramaRoutes.ts server/src/services/drama/production/DramaBatchOrchestrator.ts server/src/services/drama/studio/ComicDramaStudioService.ts server/tests/dramaForge.test.js server/tests/dramaPipelineContract.test.js
    git commit -m "feat: close drama video provider task loop"

### Task 4: 让客户端选择器消费服务端默认 provider

**Files:**
- Modify: client/src/api/media/drama.ts
- Modify: client/src/pages/drama/DramaProjectPage.tsx

- [ ] **Step 1: 更新客户端 API 类型和请求函数**

给 DramaVideoProvider 增加 isDefault: boolean；将 createDramaVideoProviderTask(videoPromptId, provider?) 改为可选 provider，只有调用方显式传值时才在请求体中发送 provider，避免 API 层重新写死 mock。

- [ ] **Step 2: 选择器使用服务端默认值**

将 DramaProjectPage 的 selectedVideoProvider 初始值改为空字符串，并在 provider 查询返回后用 provider.isDefault 选中默认项。activeVideoProvider 的兜底顺序固定为：服务端标记默认项、local_ffmpeg、列表首项、mock。保留用户显式选择 mock 的行为，不能因为查询刷新而覆盖非空的用户选择。

- [ ] **Step 3: 运行客户端类型检查**

运行：pnpm --filter @ai-novel/client typecheck

预期：API 类型、页面选择器和现有 batch/单镜调用全部通过 TypeScript 检查。

- [ ] **Step 4: 提交客户端默认选择**

运行：

    git add client/src/api/media/drama.ts client/src/pages/drama/DramaProjectPage.tsx
    git commit -m "feat: select drama video default provider"

### Task 5: 实现视频任务自动刷新、失败重试和内嵌播放

**Files:**
- Modify: client/src/pages/drama/components/DramaVisualPanel.tsx
- Test: pnpm --filter @ai-novel/client typecheck

- [ ] **Step 1: 增加自动刷新所需状态机投影**

在 DramaVisualPanel 中只从 activeVideoPrompts 派生有 providerTaskId 且状态为 queued 或 running 的列表。使用 useEffect 和 useRef 建立约 2500ms 的定时器：每轮通过现有 refreshDramaVideoProviderTask(prompt.id) 并发刷新当前列表，上一轮未完成时跳过下一轮；请求完成后只失效当前项目查询缓存。组件卸载、项目切换或没有活动任务时清理定时器。自动刷新不触发成功 Toast。

- [ ] **Step 2: 修改卡片操作状态**

按以下条件渲染现有 Button：

    prompt.status === "failed"          // “重试视频任务”，调用现有 onProviderTask
    !prompt.providerTaskId              // “创建任务”
    prompt.status === "queued/running"  // “刷新状态”，调用现有 refresh API

刷新按钮和重试按钮都要在对应 mutation pending 时 disabled，并显示“刷新中...”或“重试中...”。失败原因继续使用 failureReason 或 providerResult 中的错误字段展示，不能用轮询覆盖为成功。

- [ ] **Step 3: 在成功卡片内播放结果**

VideoPromptDetails 保留现有结果链接，并在 resultUrl 存在时增加：

    <video
      className="w-full rounded-md border border-border bg-muted/30"
      controls
      preload="metadata"
      src={resultUrl}
      aria-label={"镜头 " + (prompt.shot?.order ?? "") + " 的生成视频"}
    />

只使用语义 token；不要添加新的颜色、组件库或视频依赖。

- [ ] **Step 4: 运行客户端类型检查和生产构建**

运行：pnpm --filter @ai-novel/client typecheck; pnpm --filter @ai-novel/client build

预期：轮询 effect 的依赖、Promise 返回值、按钮状态和原生 video JSX 均通过检查，生产构建成功。

- [ ] **Step 5: 提交客户端任务闭环**

运行：

    git add client/src/pages/drama/components/DramaVisualPanel.tsx
    git commit -m "feat: add drama video polling and playback"

### Task 6: 更新长期规则与用户可见说明

**Files:**
- Modify: docs/wiki/workflows/short-drama-workspace.md
- Modify: docs/wiki/architecture/drama-forge-module-boundary.md
- Modify: docs/releases/release-notes.md
- Modify: README.md

- [ ] **Step 1: 更新 wiki 的稳定规则**

在漫剧工作流文档记录：视频默认解析顺序为 DRAMA_VIDEO_DEFAULT_PROVIDER（仅限已注册 provider）→ local_ffmpeg → mock；mock 仅作为显式联调通道；当前活动版本的 queued/running provider 任务由前端轮询，失败原因保留在提示词记录，重试不重新生成 Prompt。同步修正 Drama Forge 边界文档中仍称 mock 为默认的描述。

- [ ] **Step 2: 更新 release notes 和 README 最新更新**

以用户视角记录：视频阶段默认使用本地合成通道，任务会自动显示最终状态，失败任务可在镜头卡片重试，成功结果可直接播放。保留既有历史日期内容，不写内部文件路径、schema 名称或实现过程。

- [ ] **Step 3: 检查文档差异并提交**

运行：

    git diff --check
    git add docs/wiki/workflows/short-drama-workspace.md docs/wiki/architecture/drama-forge-module-boundary.md docs/releases/release-notes.md README.md
    git commit -m "docs: document drama video task loop"

### Task 7: 全量验证并交付到 main

**Files:**
- Verify: 当前 worktree 全部改动、main 工作区、运行中的 API 和浏览器页面

- [ ] **Step 1: 执行服务端和客户端验证**

运行：

    pnpm --filter @ai-novel/shared build
    pnpm --filter @ai-novel/server build
    node --test server/tests/dramaForge.test.js server/tests/dramaPipelineContract.test.js
    pnpm --filter @ai-novel/client typecheck
    pnpm --filter @ai-novel/client build
    git diff --check

预期：命令全部以退出码 0 完成，server tests 全部通过，工作区无 whitespace error。

- [ ] **Step 2: 检查隔离分支和运行态 API**

确认 worktree 只包含本需求的提交，执行 git status --short 和 git worktree list --porcelain。合并到 main 后请求 GET http://localhost:3100/api/drama/video-providers，确认响应包含 local_ffmpeg 且 isDefault: true，并确认 isDefault: true 只有一项。

- [ ] **Step 3: 做当前页面的轻量浏览器回归**

在现有漫剧页面检查 provider 选择器显示本地合成通道，视频卡片在无任务、运行中、失败和有结果时分别具备对应操作/状态；检查浏览器控制台无新增错误。只做查询和页面状态验证，不自动创建真实视频任务。

- [ ] **Step 4: 快进合并、推送并清理隔离工作区**

在合并前重新检查项目分支与远端规则，确认 main 没有用户未提交改动；执行：

    git -C D:/Github/AI-Novel-Writing-Assistant merge --ff-only codex/drama-video-default-loop
    git -C D:/Github/AI-Novel-Writing-Assistant push origin main
    git -C D:/Github/AI-Novel-Writing-Assistant worktree remove D:/Github/AI-Novel-Writing-Assistant-drama-video-default-loop
    git -C D:/Github/AI-Novel-Writing-Assistant branch -d codex/drama-video-default-loop
    git -C D:/Github/AI-Novel-Writing-Assistant worktree prune

如果 worktree 只剩安装依赖等可再生成内容，先确认目标是本次创建的精确 sibling 路径，再移除该目录；不得删除 main 或其他 worktree。最终再次执行 git status --short、git worktree list --porcelain 和 git log -1 --oneline，并在交付说明中列出实际验证结果与未执行的付费/真实生成验收。
