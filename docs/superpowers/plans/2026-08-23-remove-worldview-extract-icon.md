# Remove Worldview Extract Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the decorative globe icon from worldview cards on the current/extract tab while keeping all image-capable asset previews and interactions unchanged.

**Architecture:** Keep `ReferenceExtractTab` as the card renderer. Remove the `GROUP_ICONS`/worldview icon branch, but leave `StoryAssetPreview` for characters/scenes/props. Strengthen the existing source-contract test to assert that worldview cards are text-only while preserving the shared preview and click/content contracts for image-capable assets.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Node `node:test`, existing storyAssets components.

---

## Task 1: Make the contract test fail for the current icon branch

**Files:**
- Modify: `client/tests/referenceExtractPreviewContracts.test.js`

- [ ] Rename the test so it describes shared previews plus text-only worldview cards.
- [ ] Keep the existing assertions that protect shared previews, asset presentation, source lookup, click behavior, content, and the absence of the old placeholder path.
- [ ] Add negative assertions for `GROUP_ICONS`, the worldview icon branch, and the decorative `aria-hidden` text icon span.
- [ ] Run from `client/`:
  `node --experimental-strip-types --test tests/referenceExtractPreviewContracts.test.js`
- [ ] Confirm the test fails because the current component still contains the icon constant and worldview icon branch.

## Task 2: Render worldview cards without a decorative icon or image placeholder

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/ReferenceExtractTab.tsx`

- [ ] Delete the `GROUP_ICONS` constant.
- [ ] Replace the icon-versus-preview branch with a conditional `StoryAssetPreview` rendered only when `group !== "worldview"`.
- [ ] Ensure the worldview card has no preview placeholder, no icon, and begins with its existing text content at the left edge.
- [ ] Keep the existing card button, click target, asset lookup, labels, and body content unchanged.

## Task 3: Run focused regression checks

- [ ] Run from `client/`:
  `node --experimental-strip-types --test tests/referenceExtractPreviewContracts.test.js tests/storyAssetPreviewContracts.test.js tests/storyAssetPresentation.test.mjs tests/scriptAssetPreviewContracts.test.js`
- [ ] Run `pnpm typecheck` from `client/`.
- [ ] Run `git diff --check` from the worktree root.
- [ ] If a broader client check exposes unrelated baseline failures, record the exact failure and keep the focused contract, typecheck, and build evidence separate.

## Task 4: Record the user-visible change and commit the implementation

**Files:**
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] Add a concise user-facing release-note entry under the existing `2026-08-23` date block: the worldview card in the extract view is text-only, while character, scene, and prop previews remain available.
- [ ] Refresh the README `## 最新更新` block to point to the same latest user-facing update, following the repository release-note workflow.
- [ ] Run `pnpm --filter @ai-novel/client build` from the worktree root.
- [ ] Review `git diff` and `git status --short`; stage only the component, focused test, release notes, and README changes.
- [ ] Commit with `git commit -s -m "fix: remove worldview extract icon"`.
- [ ] After integration into the main runtime, visual browser acceptance remains available for the user on the existing `5174` session; do not stop another worktree's listener just to run this check.
