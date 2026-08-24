# 旁白音色样本单一入口整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除系统旁白设置中重复的 IndexTTS 音频播放器，并让分镜页继续只承担镜头与配音执行。

**Architecture:** 保留现有全局旁白 API 与 IndexTTS 合成数据边界；由 `IndexTTS25VoiceControls` 统一管理唯一音频预览，页面只传入生成的试听样本并负责保存操作。参考音频仍是可选来源，不再由页面把生成样本回填成参考音频。分镜页不增加新的设置入口。

**Tech Stack:** React 19、React Query、Tailwind semantic tokens、Node test runner、TypeScript、Vite。

---

### Task 1: 固化重复样本的失败契约

**Files:**
- Modify: `client/tests/globalNarratorVoiceSettingsContracts.test.js`
- Test: `client/tests/globalNarratorVoiceSettingsContracts.test.js`

- [ ] **Step 1: Write the failing assertions**

  断言旁白页面不再直接渲染 `<audio>`，不再使用 `sampleAudioUrl` 作为 `referenceAudio` 的回退值，并把 `sampleAudioUrl` 传给 IndexTTS 控件；断言控件拥有唯一的音频播放器责任，分镜面板不包含 IndexTTS 控件或设置标题。

- [ ] **Step 2: Run the contract test and verify RED**

  Run: `node --test client/tests/globalNarratorVoiceSettingsContracts.test.js`

  Expected: 现有旁白页面测试因页面仍直接渲染试听播放器、且 `referenceAudio` 仍回退到 `sampleAudioUrl` 而失败。

### Task 2: 统一旁白设置卡片的音频预览

**Files:**
- Modify: `client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx`
- Modify: `client/src/components/audio/IndexTTS25VoiceControls.tsx`

- [ ] **Step 1: Remove the page-level duplicate player**

  删除页面的“当前试听样本”区块，将 `referenceAudio` 限定为明确保存的 `referenceAudioUrl`，并把 `displayedVoice?.sampleAudioUrl` 传入控件。

- [ ] **Step 2: Make the control the single preview owner**

  控件新增 `sampleAudioUrl` 属性；参考音频存在可播放预览时优先展示刚上传的参考音频，否则展示生成的旁白试听样本。整个控件最多渲染一个 `<audio>`，清除参考音频时不影响旁白试听样本。

- [ ] **Step 3: Flatten the local-model presentation**

  将 IndexTTS 控件调整为系统旁白卡片内的“语音合成 / IndexTTS 2.5”字段分区，移除看起来像独立模型页面的嵌套卡片语义，继续复用现有 SelectControl、Button、toast 和语义颜色 token。

- [ ] **Step 4: Run the contract test and verify GREEN**

  Run: `node --test client/tests/globalNarratorVoiceSettingsContracts.test.js`

  Expected: 所有客户端入口与单播放器契约通过。

### Task 3: 文档和用户可见说明同步

**Files:**
- Modify: `README.md`（最新更新区块）
- Modify: `docs/releases/release-notes.md`（当前日期区块）
- Modify: `docs/wiki/architecture/indextts25-audio-provider.md`
- Modify: `docs/wiki/architecture/mydrama-asset-index.md`（仅在入口描述需要同步时）

- [ ] **Step 1: Update durable architecture guidance**

  记录系统旁白页是唯一配置入口、生成样本和参考来源的语义边界，以及分镜不承载全局音色设置。

- [ ] **Step 2: Update user-visible release surfaces**

  用用户视角说明旁白音色设置集中、重复试听入口消除；不写内部迁移或实现过程。

### Task 4: Verification and delivery

**Files:**
- Test: client narrator contracts and existing IndexTTS/narrator server tests

- [ ] **Step 1: Run client typecheck**

  Run: `pnpm --filter @ai-novel/client typecheck`

- [ ] **Step 2: Run focused client and server tests**

  Run: `node --test client/tests/globalNarratorVoiceSettingsContracts.test.js client/tests/dramaAiButtonIconContract.test.js`

  Run: `node --test server/tests/audioSpeech.test.js server/tests/dramaVoiceRouting.test.js server/tests/globalNarratorVoiceSettings.test.js`

- [ ] **Step 3: Run production build**

  Run: `pnpm build`

- [ ] **Step 4: Run browser acceptance on fixed ports**

  Start the development services without changing the repository ports. Verify system settings has one audio player, one narrator page, and the IndexTTS controls are an inline section; verify the storyboard has no IndexTTS title, reference upload area, or global voice card. Check console errors.

- [ ] **Step 5: Review, commit, integrate, push, and clean up**

  Use signed commits and the repository integration command from a clean `main`, then verify `HEAD == origin/main`, clean status, and remove only this merged worktree.
