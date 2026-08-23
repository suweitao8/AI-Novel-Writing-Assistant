# 系统级旁白音色与分镜工具栏简化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将旁白音色收敛为系统级唯一配置并复用旧项目参考样本，同时把漫剧分镜工具栏简化为章节上下文下的生成分镜、生成配音、合成三个批量入口。

**Architecture:** 复用 `AppSetting` 保存全局旁白 JSON，由一个可注入的设置服务负责解析、迁移、保存和生成；旧的 `DramaProject.narratorVoiceData` 只作为兼容回退。旁白合成和过期投影都读取同一份全局状态，并将参考音频和描述共同纳入音色指纹。分镜列表从父级章节工作区接收 `chapterOrder`，系统设置页面独立承载旁白试听与重新生成。

**Tech Stack:** Express 5、Prisma 7 + SQLite `AppSetting`、VoxCPM2 OpenAI speech bridge、React 19、React Query、React Router、Tailwind 设计 token、Node test runner、TypeScript。

---

## 文件边界

### 新建

- `server/src/services/settings/GlobalNarratorVoiceSettingsService.ts`：系统旁白状态 JSON、旧项目兼容迁移、生成和保存。
- `server/scripts/import-drama-narrator-voice.cjs`：一次性从旧项目音频文件和元数据导入当前 SQLite `AppSetting`，不写死旧项目路径。
- `client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx`：系统级旁白音色页面。
- `server/tests/globalNarratorVoiceSettings.test.js`：设置服务的解析、迁移、生成和持久化合同。
- `server/tests/globalNarratorVoiceAudioContract.test.js`：旁白参考音频与 voice key 合同。
- `client/tests/globalNarratorVoiceSettingsContracts.test.js`：设置入口和旁白页面合同。

### 修改

- `server/src/modules/settings/http/settingsRoutes.ts`：注册全局旁白 GET/PATCH/POST 路由和请求校验。
- `server/src/services/drama/audio/DramaVoiceDesignService.ts`：角色音色继续保留；旁白方法委托系统级设置服务，兼容旧项目路由。
- `server/src/services/drama/audio/DramaDialogueAudioService.ts`：旁白读取全局状态、传递参考音频、更新旁白 voice key。
- `server/src/services/drama/audio/DramaAudioSegmentsService.ts`：列表投影读取同一全局状态，和合成服务保持 stale 判断一致。
- `server/src/services/drama/audio/TTSProviderPort.ts`：保留并明确 narration 请求可携带参考音频的类型合同。
- `client/src/api/settings.ts`：增加全局旁白类型和 API 函数。
- `client/src/api/queryKeys.ts`：增加全局旁白 query key。
- `client/src/pages/settings/components/SettingsShell.tsx`：增加旁白音色导航入口。
- `client/src/pages/settings/views/SettingsOverviewPage.tsx`：增加旁白音色总览卡片。
- `client/src/router/index.tsx`：注册 `/settings/narrator-voice`。
- `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`：移除内部章节选择和项目音色折叠面板，改用父级章节并合并批量按钮。
- `client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx`：传入 `chapterOrder`。
- `client/tests/storyboardLandscapeTtsContracts.test.js`：覆盖简化工具栏和父级章节来源。
- `docs/wiki/workflows/comic-drama-voice-overdub.md`：记录系统级旁白与参考音频合同。
- `docs/wiki/workflows/comic-drama-workflow.md`：修正分镜工具栏和章节归属说明。
- `docs/releases/release-notes.md`、`README.md`：记录用户可见的旁白设置和分镜工具栏变化。

## Task 1: 建立全局旁白设置服务（TDD）

**Files:**
- Create: `server/tests/globalNarratorVoiceSettings.test.js`
- Create: `server/src/services/settings/GlobalNarratorVoiceSettingsService.ts`

- [ ] **Step 1: 先写纯函数与依赖注入接口的失败测试**

测试通过注入内存 `appSettingStore`、旧项目 `legacyProjectStore` 和 `synthesize` 函数，覆盖四个行为：

```js
test("系统设置优先于旧项目旁白字段", async () => {
  const store = createStore({
    "drama.globalNarratorVoice": JSON.stringify({ description: "系统男声", sampleAudioUrl: "data:audio/mp3;base64,global" }),
  });
  const legacy = { narratorVoiceData: JSON.stringify({ description: "项目旧声", sampleAudioUrl: "data:audio/mp3;base64:legacy" }) };
  const service = createService({ appSettingStore: store, legacyProject: legacy });
  assert.deepEqual(await service.get(), {
    description: "系统男声",
    sampleAudioUrl: "data:audio/mp3;base64,global",
  });
  assert.equal(store.upserts.length, 0);
});

test("没有系统设置时迁移第一个有效旧项目并保留其字段", async () => {
  const store = createStore();
  const legacy = { narratorVoiceData: JSON.stringify({ description: "旧项目男声", sampleAudioUrl: "data:audio/mp3;base64:old" }) };
  const service = createService({ appSettingStore: store, legacyProject: legacy });
  const result = await service.get();
  assert.equal(result.description, "旧项目男声");
  assert.equal(result.sampleAudioUrl, "data:audio/mp3;base64:old");
  assert.match(store.upserts[0].create.value, /旧项目男声/);
});

test("保存描述会更新时间但不会丢失已有参考音频", async () => {
  const store = createStore({
    "drama.globalNarratorVoice": JSON.stringify({ description: "旧描述", sampleAudioUrl: "data:audio/mp3;base64:sample" }),
  });
  const service = createService({ appSettingStore: store, now: () => "2026-08-23T00:00:00.000Z" });
  const result = await service.updateDescription("新描述");
  assert.equal(result.sampleAudioUrl, "data:audio/mp3;base64:sample");
  assert.equal(result.updatedAt, "2026-08-23T00:00:00.000Z");
});

test("生成试听会以旁白样句和描述调用语音服务并替换全局样本", async () => {
  const calls = [];
  const store = createStore();
  const service = createService({
    appSettingStore: store,
    synthesize: async (input) => { calls.push(input); return { dataUrl: "data:audio/mp3;base64:new" }; },
    now: () => "2026-08-23T00:00:00.000Z",
  });
  const result = await service.design("成年男声，平直叙述");
  assert.equal(calls[0].audioType, "narration");
  assert.equal(calls[0].emotion, "成年男声，平直叙述");
  assert.match(calls[0].text, /音色/);
  assert.equal(result.sampleAudioUrl, "data:audio/mp3;base64:new");
});
```

运行：`node --test tests/globalNarratorVoiceSettings.test.js`。

预期：FAIL，提示待创建模块或导出不存在。

- [ ] **Step 2: 写最小服务实现**

在 `GlobalNarratorVoiceSettingsService.ts` 中实现并导出：

```ts
export const GLOBAL_NARRATOR_VOICE_SETTING_KEY = "drama.globalNarratorVoice";
export const GLOBAL_NARRATOR_VOICE_SAMPLE_TEXT = "这是当前音色的试听效果，一句话就能听出年龄、语气和节奏。";
export interface GlobalNarratorVoiceState { /* 按设计文档数据合同实现 */ }
export class GlobalNarratorVoiceSettingsService { /* 注入 AppSettingStore、legacyProjectStore、synthesize、now */ }
export const globalNarratorVoiceSettingsService = new GlobalNarratorVoiceSettingsService({
  appSettingStore: prisma.appSetting,
  legacyProjectStore: prisma.dramaProject,
  synthesize: synthesizeAudioSpeech,
});
```

`get()` 先读取全局 key，再读取 `DramaProject.narratorVoiceData` 的第一个有效记录并 upsert 全局 key；`updateDescription()` 合并当前样本；`design()` 使用固定旁白样句、`audioType: "narration"` 和描述调用 `synthesizeAudioSpeech`。所有输入在保存前 trim，描述少于 4 个字符抛出 `AppError`。

- [ ] **Step 3: 运行设置服务测试并修复到通过**

运行：`node --test tests/globalNarratorVoiceSettings.test.js`。

预期：4 个子测试 PASS。

- [ ] **Step 4: 提交设置服务单元**

运行 `git diff --check` 后提交：

```powershell
git add server/src/services/settings/GlobalNarratorVoiceSettingsService.ts server/tests/globalNarratorVoiceSettings.test.js
git commit -s -m "feat: add global narrator voice settings"
```

## Task 2: 接入系统设置 API 与旁白页面（TDD）

**Files:**
- Create: `server/tests/globalNarratorVoiceSettingsRoutes.test.js`
- Create: `client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx`
- Modify: `server/src/modules/settings/http/settingsRoutes.ts`, `client/src/api/settings.ts`, `client/src/api/queryKeys.ts`, `client/src/pages/settings/components/SettingsShell.tsx`, `client/src/pages/settings/views/SettingsOverviewPage.tsx`, `client/src/router/index.tsx`, `client/tests/globalNarratorVoiceSettingsContracts.test.js`

- [ ] **Step 1: 先写失败的路由和前端合同测试**

服务端静态合同测试断言 `settingsRoutes.ts` 注册：

```js
assert.match(routes, /router\.get\("\/narrator-voice"/);
assert.match(routes, /router\.patch\(\s*"\/narrator-voice"/);
assert.match(routes, /router\.post\(\s*"\/narrator-voice\/design"/);
```

客户端合同测试断言：

```js
assert.match(settingsPage, /系统旁白音色/);
assert.match(settingsPage, /重新生成并试听/);
assert.match(shell, /\/settings\/narrator-voice/);
assert.match(router, /path: "settings\/narrator-voice"/);
```

运行：`node --test server/tests/globalNarratorVoiceSettingsRoutes.test.js client/tests/globalNarratorVoiceSettingsContracts.test.js`。

预期：FAIL。

- [ ] **Step 2: 增加服务端路由**

在 `settingsRoutes.ts` 引入全局设置服务和 `AppError` 校验，增加：

```ts
router.get("/narrator-voice", async (_req, res, next) => {
  const data = await globalNarratorVoiceSettingsService.get();
  res.status(200).json({ success: true, data, message: "系统旁白音色读取成功。" });
});

router.patch("/narrator-voice", validate({ body: narratorVoiceUpdateSchema }), async (req, res, next) => {
  const data = await globalNarratorVoiceSettingsService.updateDescription(req.body.description);
  res.status(200).json({ success: true, data, message: "系统旁白音色描述已保存。" });
});

router.post("/narrator-voice/design", validate({ body: narratorVoiceUpdateSchema }), async (req, res, next) => {
  const data = await globalNarratorVoiceSettingsService.design(req.body.description);
  res.status(200).json({ success: true, data, message: "系统旁白音色试听已生成。" });
});
```

每个处理器都交给现有 `next(error)` 错误管线，描述校验为 trim 后 4–1000 个字符。

- [ ] **Step 3: 增加客户端 API、缓存键和页面路由**

在 `client/src/api/settings.ts` 增加 `GlobalNarratorVoiceState` 与三个函数，路径分别为 `/settings/narrator-voice`、PATCH 同路径、POST `/settings/narrator-voice/design`；在 `queryKeys.settings` 增加 `narratorVoice`。

在 `router/index.tsx` 懒加载 `NarratorVoiceSettingsPage` 并注册 `settings/narrator-voice`。在 `SettingsShell` 加入「旁白音色」导航项，在总览 `entries` 加入卡片，摘要使用已配置/未配置状态，不增加实现说明型长文案。

- [ ] **Step 4: 实现页面的完整交互状态**

页面使用 `SettingsShell`、`Card`、`CardHeader`、`CardContent`、`Textarea`、`Button` 和现有 `AiButton`/toast 组件：

- query 加载时显示现有设置页一致的 loading 状态；
- 服务端已有描述同步到本地 draft，用户编辑期间不被轮询覆盖；
- 描述保存 mutation 调用 PATCH，成功 invalidate `queryKeys.settings.narratorVoice`；
- 生成 mutation 调用 design，按钮在 pending 时禁用并显示 spinner；
- 有 `sampleAudioUrl` 时渲染原生 audio 播放器，按钮文案为「重新生成并试听」，否则为「生成并试听」；
- 错误统一 toast 展示 API 错误。

- [ ] **Step 5: 运行前端和服务端合同测试**

运行：`node --test server/tests/globalNarratorVoiceSettingsRoutes.test.js client/tests/globalNarratorVoiceSettingsContracts.test.js`。

预期：所有新增子测试 PASS。

- [ ] **Step 6: 提交系统设置单元**

```powershell
git add server/src/modules/settings/http/settingsRoutes.ts server/tests/globalNarratorVoiceSettingsRoutes.test.js client/src/api/settings.ts client/src/api/queryKeys.ts client/src/pages/settings/components/SettingsShell.tsx client/src/pages/settings/views/SettingsOverviewPage.tsx client/src/pages/settings/views/NarratorVoiceSettingsPage.tsx client/src/router/index.tsx client/tests/globalNarratorVoiceSettingsContracts.test.js
git commit -s -m "feat: add narrator voice settings page"
```

## Task 3: 让所有旁白合成使用全局参考音频（TDD）

**Files:**
- Create: `server/tests/globalNarratorVoiceAudioContract.test.js`
- Modify: `server/src/services/drama/audio/DramaDialogueAudioService.ts`, `server/src/services/drama/audio/DramaAudioSegmentsService.ts`, `server/src/services/drama/audio/DramaVoiceDesignService.ts`, `server/src/services/drama/audio/TTSProviderPort.ts`

- [ ] **Step 1: 先写失败的音频合同测试**

合同测试断言真实实现包含以下行为，并用服务层导出的纯函数验证 key 差异：

```js
assert.match(dialogueService, /globalNarratorVoiceSettingsService\.get\(\)/);
assert.match(dialogueService, /referenceAudioUrl:\s*isNarrationLine\s*\?\s*narratorVoice\.sampleAudioUrl/);
assert.notEqual(
  buildDialogueVoiceKey({ type: "narration", narratorDescription: "平直", narratorSampleAudioUrl: "data:a" }),
  buildDialogueVoiceKey({ type: "narration", narratorDescription: "平直", narratorSampleAudioUrl: "data:b" }),
);
assert.equal(
  buildDialogueVoiceKey({ type: "dialogue", voice: { name: "叶晨", voiceId: "v1" }, narratorSampleAudioUrl: "data:a" }),
  buildDialogueVoiceKey({ type: "dialogue", voice: { name: "叶晨", voiceId: "v1" }, narratorSampleAudioUrl: "data:b" }),
);
```

运行：`pnpm --filter @ai-novel/server prisma:generate; pnpm --filter @ai-novel/server build; node --test server/tests/globalNarratorVoiceAudioContract.test.js`。

预期：FAIL，因为现有旁白请求仍把 `referenceAudioUrl` 写成 `undefined`，且 key 只包含 description。

- [ ] **Step 2: 修改配音服务的全局状态读取和 voice key**

在 `DramaDialogueAudioService` 中删除合成路径对 `project.narratorVoiceData` 的权威读取，改为 `await globalNarratorVoiceSettingsService.get()`；保留 `readNarratorVoiceData` 纯解析函数给兼容测试或迁移使用。扩展 `buildDialogueVoiceKey` 的旁白输入为：

```ts
type: "narration";
narratorDescription?: string;
narratorSampleAudioUrl?: string;
```

旁白请求设置为：

```ts
referenceAudioUrl: isNarrationLine ? narratorVoice.sampleAudioUrl : voice?.referenceAudioUrl,
```

在 `DramaAudioSegmentsService` 使用同一全局服务结果计算 key，避免列表显示 ready 而实际重配或反过来的不一致。

- [ ] **Step 3: 保持旧项目 narrator API 兼容但改为委托全局设置**

`DramaVoiceDesignService` 的 `getNarratorVoice(projectId)`、`updateNarratorVoiceDescription(projectId, description)`、`designNarratorVoice(projectId, description)` 保留方法签名，先验证项目存在，再分别委托 `globalNarratorVoiceSettingsService`；不得再更新 `DramaProject.narratorVoiceData`。新 settings 路由直接调用全局服务，不需要项目 id。

- [ ] **Step 4: 运行音频合同测试并修复到通过**

运行：`pnpm --filter @ai-novel/server prisma:generate; pnpm --filter @ai-novel/server build; node --test server/tests/globalNarratorVoiceAudioContract.test.js server/tests/audioSpeech.test.js`。

预期：新增合同和原有音频测试全部 PASS。

- [ ] **Step 5: 提交音频链路单元**

```powershell
git add server/src/services/drama/audio/DramaDialogueAudioService.ts server/src/services/drama/audio/DramaAudioSegmentsService.ts server/src/services/drama/audio/DramaVoiceDesignService.ts server/src/services/drama/audio/TTSProviderPort.ts server/tests/globalNarratorVoiceAudioContract.test.js
git commit -s -m "feat: use global narrator reference audio"
```

## Task 4: 简化分镜工具栏并绑定父级章节（TDD）

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`, `client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx`, `client/tests/storyboardLandscapeTtsContracts.test.js`

- [ ] **Step 1: 先更新失败的分镜合同测试**

新增断言：

```js
assert.match(panel, /chapterOrder/);
assert.doesNotMatch(panel, /SelectControl|selectedOrder|音色设置/);
assert.match(panel, /生成分镜/);
assert.match(panel, /生成配音/);
assert.match(panel, /重新配音/);
assert.match(panel, /DramaEpisodeAssemblyButton/);
assert.match(page, /<ShotVoiceListPanel[\s\S]*chapterOrder=/);
```

运行：`node --test client/tests/storyboardLandscapeTtsContracts.test.js`。

预期：FAIL，因为现有组件仍然维护自己的章节选择和音色设置。

- [ ] **Step 2: 用父级章节替换组件内部选择**

将 props 改为：

```ts
interface ShotVoiceListPanelProps {
  novelId: string;
  projectId: string;
  chapterOrder: number | null;
}
```

删除 `selectedOrder`、`SelectControl`、`voiceSettingsOpen`、`Settings2`、角色/旁白音色折叠面板和相关导入；`activeOrder` 直接等于 `chapterOrder`。没有章节时保持空态，不能静默切到第一集。

- [ ] **Step 3: 合并三个批量动作**

将首帧批量按钮固定为「生成分镜」，调用现有 `keyframeBatchMutation`，缺失数量为 0 或正在生成时禁用。将配音按钮改为动态动作：

```ts
const shouldForceTts = summary.total > 0 && summary.pending === 0;
const ttsActionLabel = shouldForceTts ? "重新配音" : "生成配音";
```

点击传 `shouldForceTts`，不再同时渲染「生成缺失配音」和「全部重新配音」。合成按钮继续使用现有 `DramaEpisodeAssemblyButton`，三个按钮统一放在列表工具行右侧。

空分镜状态的按钮文案也改为「生成分镜」，仍调用 `storyboardMutation` 生成结构；这与已有分镜时的首帧批量动作共享用户可见名称但不会重复生成结构。

- [ ] **Step 4: 从工作室传入当前章节**

修改 `ComicDramaStudioPage.tsx` 的分镜分支：

```tsx
<ShotVoiceListPanel
  novelId={novelId}
  projectId={overview.drama.projectId}
  chapterOrder={chapterWorkspace.currentChapter?.order ?? null}
/>
```

- [ ] **Step 5: 运行分镜合同测试**

运行：`node --test client/tests/storyboardLandscapeTtsContracts.test.js`。

预期：原有 5 条加新增断言全部 PASS。

- [ ] **Step 6: 提交分镜界面单元**

```powershell
git add client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx client/tests/storyboardLandscapeTtsContracts.test.js
git commit -s -m "feat: simplify drama storyboard toolbar"
```

## Task 5: 增加旧项目样本导入工具并执行当前环境初始化

**Files:**
- Create: `server/scripts/import-drama-narrator-voice.cjs`
- Modify: `server/package.json`（增加 `settings:import-narrator-voice` 脚本）

- [ ] **Step 1: 先写导入工具的失败静态合同测试**

在 `server/tests/globalNarratorVoiceImportContract.test.js` 断言脚本接收 `--source`、读取二进制、生成 `data:audio/...;base64`、计算 SHA-256，并使用 `AppSetting` upsert，不包含 `D:\Github\storybook` 字面量。

运行：`node --test server/tests/globalNarratorVoiceImportContract.test.js`。

预期：FAIL，脚本尚不存在。

- [ ] **Step 2: 实现仅显式路径导入的 CJS 工具**

脚本参数：`--source <audioPath>`，可选 `--metadata <jsonPath>`、`--description <text>`、`--sample-text <text>`。使用 `dotenv` 读取 `server/.env`，解析当前 SQLite `DATABASE_URL`（默认 `file:./dev.db`），仅对 `AppSetting` 的 `drama.globalNarratorVoice` 执行 upsert；如果源文件不存在、扩展名不是 mp3/wav/m4a/aac/ogg 或文件为空，退出码为 1，不删除或覆盖旧音频文件。

- [ ] **Step 3: 运行工具合同测试并提交工具**

运行：`node --test server/tests/globalNarratorVoiceImportContract.test.js`，预期 PASS，然后提交：

```powershell
git add server/scripts/import-drama-narrator-voice.cjs server/tests/globalNarratorVoiceImportContract.test.js server/package.json
git commit -s -m "chore: add narrator voice import tool"
```

- [ ] **Step 4: 用旧项目已确认样本初始化当前开发数据库**

在当前 worktree 的 `server` 目录执行：

```powershell
pnpm settings:import-narrator-voice --source "D:\Github\storybook\.working_dir\projects\黑暗文明\assets\voices\narration\voice_sample.mp3" --metadata "D:\Github\storybook\.working_dir\projects\黑暗文明\assets\voices\narration\voice_sample.meta.json"
```

随后使用只读查询确认 `AppSetting.key = drama.globalNarratorVoice`、`source = legacy`、`sampleAudioUrl` 非空、描述与旧元数据一致。该步骤只做 upsert，不执行数据库删除、重置或清空。

## Task 6: 更新稳定文档与发布记录

**Files:**
- Modify: `docs/wiki/workflows/comic-drama-voice-overdub.md`
- Modify: `docs/wiki/workflows/comic-drama-workflow.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 更新 wiki 的长期规则**

把 `DramaProject.narratorVoiceData` 的权威描述改为 `AppSetting` 系统旁白；写明合成和 stale 投影必须共享 description + sample audio 指纹；写明章节选择属于工作室父级，分镜列表只消费 `chapterOrder`。保留旧项目参考路径作为知识来源，不写成运行时依赖。

- [ ] **Step 2: 按 release updater 规则检查 Git 范围并更新用户可见记录**

先运行 `git status --short`、`git diff --stat` 和 `git diff --cached --stat`，确认本次 diff 的用户可见范围；在 `docs/releases/release-notes.md` 的 `2026-08-23` 日期块合并记录：系统统一旁白音色、旧音色初始化、系统级试听/重新生成、分镜工具栏简化和章节入口去重。刷新 `README.md` 的「最新更新」只保留最新日期块与 release notes 链接。

- [ ] **Step 3: 提交文档单元**

```powershell
git add docs/wiki/workflows/comic-drama-voice-overdub.md docs/wiki/workflows/comic-drama-workflow.md docs/releases/release-notes.md README.md
git commit -s -m "docs: document global narrator voice workflow"
```

## Task 7: 全量针对性验证、代码审查与交付

- [ ] **Step 1: 更新计划状态并运行服务端针对性验证**

运行：

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server prisma:generate
pnpm --filter @ai-novel/server build
node --test server/tests/globalNarratorVoiceSettings.test.js server/tests/globalNarratorVoiceSettingsRoutes.test.js server/tests/globalNarratorVoiceAudioContract.test.js server/tests/globalNarratorVoiceImportContract.test.js server/tests/audioSpeech.test.js server/tests/comicDramaStoryboardBridge.test.js
```

预期：服务端构建退出码 0，列出的测试全部 PASS；测试数据库缺表 warning 若仍出现，只记录为现有隔离测试环境 warning，不把它当成失败。

- [ ] **Step 2: 运行客户端测试、类型检查和构建**

运行：

```powershell
node --test client/tests/storyboardLandscapeTtsContracts.test.js client/tests/globalNarratorVoiceSettingsContracts.test.js
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
```

预期：两个合同测试、类型检查和构建退出码均为 0。

- [ ] **Step 3: 做一次静态需求核对**

逐项核对：

1. 系统设置有独立旁白音色入口和试听/重新生成。
2. 旧样本已写入本地 AppSetting，且不是项目字段。
3. 旁白合成传递全局 sample URL；旧旁白按 sample/description 变化标 stale。
4. 对白仍读取角色/角色状态音色。
5. 分镜列表无内部章节选择、无项目级音色设置、只有三个批量按钮。
6. 工作室右上角仍是唯一章节选择入口。
7. 主工作区的既有未提交改动和其他 worktree 未被修改。

- [ ] **Step 4: 请求代码审查并修复重要问题**

使用 `requesting-code-review` 技能，以设计文档、计划和本分支 diff 为上下文，请审查数据迁移安全、全局/项目边界、TTS 参考音频传递、React loading/错误状态和章节绑定。Critical/Important 问题修复后重新跑受影响测试。

- [ ] **Step 5: 按 finishing-a-development-branch 完成合并前流程**

在声称完成前重新运行最终验证，确认 `git status --short`、`git worktree list --porcelain`，然后按项目工作流把本分支合并回 `main`，在合并结果上复跑客户端类型检查/构建和服务端针对性测试，清理本次创建的 worktree 和分支；不触碰其他未合并 worktree。

