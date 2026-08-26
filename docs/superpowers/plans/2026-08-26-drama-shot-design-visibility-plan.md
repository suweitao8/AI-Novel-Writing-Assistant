# 漫剧分镜卡片显示镜头设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让工作室「分镜」页的每个镜头同时显示可拍摄的画面设计与对应台词/配音，使用户能直接判断镜头是否合理。

**Architecture:** 复用接口已经返回的 `DramaShot` 字段，在 `ShotVoiceListPanel.tsx` 内增加一个职责单一的 `ShotDesignSummary` 展示组件。设计摘要始终渲染；配音段只负责台词和音频状态，不再控制动作、景别、机位、场景或角色状态是否出现。无 API、数据库和生成链路改动。

**Tech Stack:** React 19, TypeScript, Tailwind semantic tokens, existing `Badge`/`AiButton`, Node test runner source contracts.

---

### Task 1: Add a failing contract test for the missing shot design

**Files:**
- Create: `client/tests/dramaShotDesignVisibility.test.js`
- Reference: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`

- [ ] **Step 1: Write the failing test**

Create a source contract test that asserts the design summary is rendered before the audio conditional and that all persisted design fields have visible presentation paths:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/pages/drama/comicDrama/ShotVoiceListPanel.tsx", import.meta.url),
  "utf8",
);

test("每一镜始终显示分镜设计，不受配音段存在与否影响", () => {
  const infoStart = source.indexOf("/* 分镜信息 + 配音段 */");
  const designCall = source.indexOf("<ShotDesignSummary shot={shot} />", infoStart);
  const audioBranch = source.indexOf("{segments.length > 0 ?", infoStart);

  assert.ok(infoStart >= 0, "找不到镜头信息区域");
  assert.ok(designCall > infoStart, "镜头信息区域应渲染分镜摘要");
  assert.ok(audioBranch > designCall, "配音条件不能包住分镜摘要");
  assert.match(source, /function ShotDesignSummary/);
  assert.match(source, /shot\.action/);
});

test("分镜摘要覆盖镜头语言、场景、角色状态和画面提示词", () => {
  assert.match(source, /shot\.shotSize/);
  assert.match(source, /shot\.cameraMove/);
  assert.match(source, /shot\.location/);
  assert.match(source, /shot\.characterRefs/);
  assert.match(source, /shot\.characterStates/);
  assert.match(source, /shot\.visualPrompt/);
  assert.match(source, /<details/);
  assert.match(source, /画面提示词/);
});

test("没有配音段时只用 dialogue 显示台词，不把 action 当台词兜底", () => {
  assert.doesNotMatch(source, /shot\.dialogue \? `「\$\{shot\.dialogue\}` : shot\.action/);
  assert.match(source, /台词\/旁白/);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/dramaShotDesignVisibility.test.js
```

Expected: FAIL because `ShotDesignSummary` and its field presentation do not exist yet.

### Task 2: Implement the persistent design summary in the compact storyboard row

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx` near the existing JSON helpers and `ShotVoiceRow`

- [ ] **Step 1: Add safe parsers for character references and states**

Use the existing `safeJson` helper and discard malformed entries without throwing:

```tsx
type ShotCharacterState = { name: string; state: string };

function parseCharacterRefs(raw: string | null | undefined): string[] {
  const value = safeJson<unknown>(raw, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCharacterStates(raw: string | null | undefined): ShotCharacterState[] {
  const value = safeJson<unknown>(raw, []);
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const state = typeof entry.state === "string" ? entry.state.trim() : "";
    return name && state ? [{ name, state }] : [];
  });
}
```

- [ ] **Step 2: Add `ShotDesignSummary` with a stable, compact layout**

The component must always render the `action` text first, then optional camera/location metadata, character/state badges, and a keyboard-operable `details` disclosure for `visualPrompt`. Use `Badge variant="secondary"`, `border-border`, `bg-muted`, and `text-muted-foreground`; do not introduce literal colors or explanatory paragraphs. Use a short empty state when a legacy shot has no action.

The character label list should use the union of `characterRefs` and state names so legacy snapshots with only state JSON still expose the state:

```tsx
function ShotDesignSummary({ shot }: { shot: DramaShot }) {
  const characterRefs = parseCharacterRefs(shot.characterRefs);
  const characterStates = parseCharacterStates(shot.characterStates);
  const stateByName = new Map(characterStates.map((entry) => [entry.name, entry.state]));
  const characterNames = Array.from(new Set([
    ...characterRefs,
    ...characterStates.map((entry) => entry.name),
  ]));
  const action = shot.action?.trim();
  const cameraMove = shot.cameraMove?.trim();
  const location = shot.location?.trim();
  const visualPrompt = shot.visualPrompt?.trim();

  return (
    <section
      aria-label={`第 ${shot.order} 镜分镜设计`}
      className="space-y-1.5 rounded-lg border border-border/60 bg-muted/10 p-2.5"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-foreground">分镜设计</span>
        {cameraMove ? <Badge variant="secondary" className="text-[10px]">运镜 {cameraMove}</Badge> : null}
        {location ? <span className="text-[11px] text-muted-foreground">场景：{location}</span> : null}
      </div>
      {action ? (
        <p className="text-sm leading-6 text-foreground">{action}</p>
      ) : (
        <p className="text-xs text-muted-foreground">暂无分镜设计</p>
      )}
      {characterNames.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="出场角色">
          <span className="text-[11px] text-muted-foreground">出场角色</span>
          {characterNames.map((name) => (
            <Badge key={name} variant="secondary" className="text-[10px]">
              {stateByName.get(name) ? `${name} · ${stateByName.get(name)}` : name}
            </Badge>
          ))}
        </div>
      ) : null}
      {visualPrompt ? (
        <details className="rounded-md border border-border/50 bg-background/50 px-2 py-1">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            画面提示词
          </summary>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{visualPrompt}</p>
        </details>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 3: Place the summary outside the audio conditional and separate dialogue fallback**

Inside `ShotVoiceRow`, keep the existing shot number and preview controls, then render:

```tsx
<ShotDesignSummary shot={shot} />

{segments.length > 0 ? (
  <div className="space-y-0.5" aria-label={`第 ${shot.order} 镜台词与旁白`}>
    {segments.map((segment) => (
      <p key={`${segment.shotId}-${segment.lineIndex}`} className="line-clamp-2 text-sm leading-6 text-foreground">
        <span className="font-medium text-muted-foreground">{audioSegmentLabel(segment)}：</span>
        {segment.text}
      </p>
    ))}
  </div>
) : shot.dialogue?.trim() ? (
  <div aria-label={`第 ${shot.order} 镜台词与旁白`}>
    <span className="text-[11px] font-medium text-muted-foreground">台词/旁白</span>
    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{shot.dialogue}</p>
  </div>
) : null}
```

Leave the existing audio player and per-shot generate/regenerate action below this block. Do not add a “未生成” label, and do not put `shot.action` in the dialogue fallback.

- [ ] **Step 4: Run the focused contract test**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/dramaShotDesignVisibility.test.js tests/shotVoiceBlockingSketchEntry.test.js tests/comicDramaStoryboardFlow.test.js
```

Expected: all tests in the command pass.

### Task 3: Type-check the changed UI and review the resulting diff

**Files:**
- Review: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`
- Review: `client/tests/dramaShotDesignVisibility.test.js`

- [ ] **Step 1: Build shared types and run client typecheck**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/client typecheck
```

Expected: both commands exit 0. If unrelated baseline errors remain, record their exact paths and do not alter unrelated files.

- [ ] **Step 2: Check the diff for scope and formatting**

Run:

```powershell
git diff --check
git status --short
git diff -- client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx client/tests/dramaShotDesignVisibility.test.js
```

Confirm only the compact storyboard presentation and its focused contract test changed; no API, prompt, database, audio generation, or port changes are present.

### Task 4: Record the user-visible change and commit the implementation

**Files:**
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md` latest update block
- Commit: the implementation, test, and release-note changes

- [ ] **Step 1: Update release surfaces**

Add a concise date-based user-facing entry for 2026-08-26 describing that each storyboard shot now shows its visual design, camera/location/character-state context, and dialogue/audio together. Keep the README latest-update block limited to the newest date and link the full release notes. Do not mention source files, schema names, tests, or implementation history.

- [ ] **Step 2: Run the final focused checks**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/dramaShotDesignVisibility.test.js tests/shotVoiceBlockingSketchEntry.test.js tests/comicDramaStoryboardFlow.test.js
pnpm --filter @ai-novel/client typecheck
git diff --check
```

Expected: focused tests and typecheck pass; `git diff --check` prints no errors.

- [ ] **Step 3: Commit the completed unit**

Run:

```powershell
git add client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx client/tests/dramaShotDesignVisibility.test.js docs/releases/release-notes.md README.md
git commit -s -m "feat: show storyboard design beside voice lines"
```

The commit must contain only this presentation fix, its focused verification, and the user-facing release record.
