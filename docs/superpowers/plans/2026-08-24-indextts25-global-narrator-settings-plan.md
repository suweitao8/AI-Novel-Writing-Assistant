# IndexTTS 2.5 全局旁白音色入口调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让系统设置中的全局旁白音色成为 IndexTTS 2.5 的唯一用户配置入口，并从分镜页移除重复的音色设置区域。

**Architecture:** 保留现有 `GlobalNarratorVoiceSettingsService`、IndexTTS 目录/上传 API 和全局旁白合成读取链路；前端只把配置入口收敛到 `NarratorVoiceSettingsPage`，删除分镜页对 `VoiceStagePanel` 的挂载。角色音色数据和兼容 API 不做删除，避免影响历史资产。

**Tech Stack:** React 19、React Query、Tailwind semantic tokens、Node test runner、TypeScript、Vite。

---

### Task 1: 固化入口归属回归检查

**Files:**
- Modify: `client/tests/globalNarratorVoiceSettingsContracts.test.js`
- Test: `client/tests/globalNarratorVoiceSettingsContracts.test.js`

- [x] **Step 1: Write the failing test**

  断言系统旁白设置页包含 `IndexTTS25VoiceControls` 和全局作用域文案，分镜面板不包含 IndexTTS 标题、`VoiceStagePanel` 导入或旁白/角色音色卡。

- [x] **Step 2: Run test to verify it fails**

  Run: `node --test client/tests/globalNarratorVoiceSettingsContracts.test.js`
  Expected: 第 3 个测试因 `ShotVoiceListPanel.tsx` 仍包含 `IndexTTS 2.5 音色设置` 而失败。

### Task 2: 移除分镜页音色设置挂载

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`
- Delete: `client/src/pages/drama/comicDrama/VoiceStagePanel.tsx`

- [ ] **Step 1: 删除分镜页的 VoiceStagePanel 导入**

  移除 `CharacterVoiceCard`、`NarratorVoiceCard` 的导入，不改变分镜查询、分镜生成、配音生成和状态刷新逻辑。

- [ ] **Step 2: 删除分镜页 IndexTTS 设置区域**

  移除 `IndexTTS 2.5 音色设置` section 及其旁白/角色卡列表，使分镜页只保留分镜查看和配音执行操作。

- [ ] **Step 3: 删除无挂载消费者的展示组件**

  删除 `VoiceStagePanel.tsx`，保留 `client/src/api/media/comicDrama.ts` 的项目级兼容 API 和服务端接口，避免删除历史数据能力。

- [ ] **Step 4: Run the contract test**

  Run: `node --test client/tests/globalNarratorVoiceSettingsContracts.test.js`
  Expected: 3/3 tests pass。

### Task 3: 明确系统设置的全局作用域

**Files:**
- Modify: `client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx`
- Modify: `client/src/pages/settings/views/SettingsOverviewPage.tsx` (only if summary copy needs alignment)
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md` (only the latest update block, if updater requires it)

- [ ] **Step 1: Keep IndexTTS controls in the system narrator page**

  确认模型音色、参考音频上传/选择/清除和试听操作都通过 `NarratorVoiceSettingsPage` 的全局 API 保存，不新增项目级状态。

- [ ] **Step 2: Align user-facing copy**

  使用“整个应用统一使用的旁白音色”“所有漫剧项目的旁白台词”等用户视角文案，不描述内部迁移过程。

- [ ] **Step 3: Run focused checks**

  Run: `node --test client/tests/globalNarratorVoiceSettingsContracts.test.js client/tests/settingsNavigationContracts.test.js`
  Expected: all tests pass。

### Task 4: Full verification and delivery

**Files:**
- Test: existing client and server tests relevant to narrator/IndexTTS routing

- [ ] **Step 1: Run client typecheck**

  Run: `pnpm --filter @ai-novel/client typecheck`
  Expected: exit code 0。

- [ ] **Step 2: Run IndexTTS/narrator server regression tests**

  Run: `node --test server/tests/audioSpeech.test.js server/tests/dramaVoiceRouting.test.js server/tests/globalNarratorVoiceSettings.test.js`
  Expected: all tests pass。

- [ ] **Step 3: Run production build**

  Run: `pnpm build`
  Expected: shared、server、client 构建成功。

- [ ] **Step 4: Verify live UI**

  在系统设置 → 旁白音色确认 IndexTTS 2.5 控件可见；打开分镜页确认不再出现 IndexTTS 设置标题或上传区域，并检查浏览器控制台无新增错误。

- [ ] **Step 5: Commit, integrate, push, and clean up**

  使用 `git commit -s` 提交隔离分支，再从干净 `main` 执行 `pnpm workflow:integrate codex/indextts25-global-narrator-settings --push --verify "pnpm build"`，最后核对 `HEAD == origin/main`、工作区干净并删除已合并工作树。
