# 静态分镜画面交付实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将漫剧分镜从“首帧/图生视频”语义收敛为“静态分镜画面 + 旁白/对白 + 字幕”的成片链路，让用户在工作台中直接生成和使用静态画面，不再看到视频提示词、视频 provider 或逐镜图生视频入口。

**Architecture:** 采用兼容优先的渐进迁移。数据库字段 `DramaShot.keyframeData`、批量任务类型 `keyframes`、旧的 `/keyframe` 与视频提示词/provider API 保留，避免历史数据和后台任务失效；前端产品语义改为“分镜画面”，移除新的 I2V 操作入口；整集装配继续由已有的静态画面、配音、字幕 Remotion 管线完成；本地 ffmpeg 镜头素材只循环静态图片并混入音频，不再使用 Ken Burns 动效。

**Tech Stack:** React 19 + TypeScript + Vite，TanStack Query，现有 shadcn/ui 与项目 UI tokens，Express/TypeScript，Prisma SQLite，FFmpeg，Remotion，Node test runner。

---

## 1. 建立静态分镜产品契约测试

- [ ] 新增 `client/tests/dramaStaticShotImageContracts.test.js`，锁定工作台文案与入口契约：分镜列表/分镜板使用“分镜画面/画面”，批量与单镜头入口仍可生成静态画面；新的分镜 UI 不再暴露“视频提示词”、video provider 选择或 provider task 创建入口；整集合成入口和静态画面、配音、字幕产物仍存在。
- [ ] 在 `client/tests/storyboardLandscapeTtsContracts.test.js` 中补充或调整横屏静态画面与配音成片的源代码契约，明确横屏规格和音频驱动的整集合成仍保留，兼容性 API 名称不作为用户文案验收条件。
- [ ] 在 `server/tests/dramaLandscapeTtsContracts.test.js` 中增加本地 ffmpeg 静态画面契约断言：生成参数不再包含 `zoompan`/Ken Burns，仍保持横屏输出、音频输入和现有成片组装合同。

## 2. 收敛分镜列表和分镜板的用户语义

- [ ] 修改 `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`：将“首帧”相关可见文案、alt、title、toast、统计和批量按钮改为“分镜画面/画面”；保留现有静态图片生成请求和状态轮询，保持逐镜配音、重配和整集合成入口不变。
- [ ] 修改 `client/src/pages/drama/components/DramaStoryboardBoard.tsx`：保留静态画面生成、预览和历史图能力，统一显示“分镜画面”；移除 `onVideoPrompt` 及其按钮、预览弹窗中的视频提示词操作和不再需要的 provider 相关 props/imports。
- [ ] 修改 `client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx`：将结果统计与警告中的“首帧图兜底”改为“分镜画面兜底”，使用户理解 Remotion 在缺图时使用静态占位画面；不改变已有合成按钮、轮询、下载和字幕输出行为。

## 3. 移除视觉工作台中的 I2V/provider 入口

- [ ] 修改 `client/src/pages/drama/components/DramaVisualPanel.tsx`：保留静态画面生成确认、批量任务、费用估算和任务状态；删除视频 provider 选择/当前通道展示及视频提示词卡片；更新空态、按钮、标题和统计文案；继续复用现有 UI 组件和 `AiButton`，补齐生成中、失败和无素材状态。
- [ ] 修改 `client/src/pages/drama/DramaProjectPage.tsx`：从视觉工作台和下一步面板移除视频提示词/provider task 的新入口、轮询和传参，保留静态画面与配音相关刷新；清理仅因这些入口存在的查询、回调和死代码，同时保留 legacy API import only if another compatibility path still consumes it.
- [ ] 修改 `client/src/pages/drama/components/DramaNextStepPanel.tsx`：删除或改写“生成视频提示词/提交 provider 任务”的下一步卡片，使下一步直接指向分镜画面、配音或整集合成；不得在终端用户文案中解释内部迁移过程。
- [ ] 修改 `client/src/pages/drama/components/DramaCharactersPanel.tsx` 中会把角色资产描述为进入“视频提示词”的用户文案，改为进入分镜画面与成片所需的画面/声音链路，避免工作台残留 I2V 术语。

## 4. 将工作室“视频”阶段改为静态成片阶段

- [ ] 修改 `client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx`：将章级子 tab 与阶段标签从“视频”改为“成片”；`VideoSection` 移除 provider 列表、默认通道和视频提示词统计，改为复用 `DramaEpisodeAssemblyPanel` 的整集合成入口/结果状态，并传入当前项目与当前章节所需的明确标识。
- [ ] 修改 `client/src/pages/drama/comicDrama/ComicDramaListPage.tsx`：将卡片中的“首帧”与“视频”统计改为“画面”与“成片”，保持数量来源和项目阶段统计接口兼容。
- [ ] 修改 `docs/wiki/workflows/comic-drama-workflow.md`：更新稳定工作流知识，明确分镜产物是静态横屏画面，成片由画面、旁白/对白、字幕装配而成；保留数据库/API 兼容字段说明，删除会误导未来开发者继续扩展 I2V 的当前规则描述。

## 5. 固化静态镜头渲染实现

- [ ] 修改 `server/src/services/drama/video/LocalFfmpegVideoProvider.ts`：移除 `zoompan` filter 与 Ken Burns 描述，改用静态图片循环、横屏缩放/裁切和音频时长封装；无图片时继续输出可恢复的占位底板；同步注释、provider description 与临时文件清理说明。
- [ ] 修改 `server/src/services/drama/video/DramaEpisodeAssemblyService.ts`、`server/src/services/drama/video/VideoProviderPort.ts` 及必要的服务消息：将用户可见的“首帧”提示改为“分镜画面”，但不改动历史 JSON 字段、API 路径和旧视频提示词服务的兼容导出。
- [ ] 检查 `server/src/services/drama/video/DramaRemotionRenderer.ts`、`video/src/DramaEpisodeVideo.tsx` 和相关导出类型；只在仍存在运动画面或误导性用户文案时修改，确保 Remotion 按镜头时长保持静态图并同步字幕/音频。

## 6. 验证、提交和交付

- [ ] 在隔离 worktree 中运行静态契约测试：`node --experimental-strip-types --test client/tests/comicDramaStoryboardFlow.test.js client/tests/storyboardLandscapeTtsContracts.test.js`、`node --test server/tests/dramaLandscapeTtsContracts.test.js`、`pnpm --dir video test`。
- [ ] 运行类型与构建检查：`pnpm --dir client typecheck`、`pnpm --dir server typecheck`、`pnpm --dir video typecheck`；若 server 类型检查要求生成 Prisma client，只运行项目既有 `typecheck` 流程，不执行任何数据库重置或迁移。
- [ ] 运行与本次 diff 直接相关的整集合成/Remotion 测试，并记录无法运行的环境前置条件；UI 浏览器验收留给用户，代码级检查必须先通过。
- [ ] 根据 `readme-release-updater` 规则审查 Git 范围：本次有用户可见语义和工作流变化，更新 `docs/releases/release-notes.md` 与 `README.md` 的最新更新；不改动历史条目。
- [ ] 在 worktree 中检查只包含本需求的改动后，使用 `git commit -s` 提交；回到主工作区确认主分支没有未授权改动，合并已验证分支，执行 `git push origin main`，确认本地 `main` 与 `origin/main` 指向同一提交。
- [ ] 删除本次创建且已合并的 worktree 与本地分支，运行 `git worktree prune`，最后报告提交、远程同步、验证命令和任何剩余风险。
