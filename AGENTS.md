# Safety Rules

## Data Protection (Highest Priority)

- Never execute any destructive data operation without a verified backup first.
- Destructive operations include (but are not limited to): deleting database files, `prisma migrate reset`, `db reset`, truncation, dropping tables, or any command that can remove existing data.
- Before any such operation, require:
  - explicit user approval for the destructive step;
  - a completed backup with a concrete backup path;
  - a quick restore validation (or at minimum a backup file existence/size check).
- If backup is missing or unverified, stop and do not proceed.

## AI-First System Rules (Highest Priority)

- This project is an AI-native application. For intent recognition, task classification, planning, routing, tool selection, and similar decision-making paths, AI-based structured understanding must be the primary implementation.
- Do not implement product-facing core behavior with fixed keyword matching, hard-coded regex routing, manual branch tables, or any non-AI fallback path when the problem is intended to be handled by AI.
- If AI intent recognition fails, treat it as an AI capability/problem to be fixed. Do not add fallback matching to hide the miss.
- Fixed judgments are only allowed as:
  - input validation or safety guards;
  - deterministic post-processing of already-structured AI output.
- When adding a new capability, first extend the AI schema / structured output / tool contract. Do not patch behavior by stacking special-case string rules.

## Auto-Director Quality Gate Rules (Highest Priority)

- Chapter audit, acceptance, and quality-loop results must not automatically block the global auto-director or full-book execution chain.
- Non-global chapter quality problems, including `local_patch_plan`, `continue_with_warning`, `patchable_obligation_gap`, `draft_obligation_unmet`, recoverable repair failures, and `defer_and_continue` quality debt, must be recorded as chapter-level quality debt or local repair guidance and allow the remaining chapter range to continue.
- Only an explicit `stop_for_replan`, `replan_required`, `recommendedAction=replan`, unrecoverable generation failure with no usable chapter content, or a runtime safety/data integrity failure may stop the global chain.
- Do not route local audit issues into `replanAlertDetails`, `PIPELINE_REPLAN_REQUIRED`, or the `replan_required` checkpoint unless the structured AI/runtime decision explicitly says the neighboring chapter plan must stop for replan.
- If local repair has already been attempted and residual issues remain but the chapter has usable content, prefer degraded finalization plus quality debt over failing the whole auto-director task.
- UI, task projection, and recovery logic must preserve this distinction: local quality debt is a visible warning and follow-up item, not a failed auto-director workflow.
- Book-level auto-director projections with `failed`, `blocked`, or `waiting_recovery` status and a latest task must remain visible in AI cockpit, task drawer, and recovery entrypoints even when the URL does not include `directorTaskId`; `workspaceTaskId` is a manual workspace lane and must never be used as a substitute director task id.

## Product Context (Highest Priority)

- The primary target users of this project are complete writing beginners who do not understand fiction craft, structure, or novel production workflows.
- The product should help these users finish a full novel through AI guidance, AI-first decision support, or fully automated planning when appropriate.
- When making product, UX, planning, or agent behavior decisions, optimize for:
  - low cognitive load;
  - strong step-by-step guidance;
  - clear defaults and automatic recommendations;
  - end-to-end completion of a full-length novel, not just isolated writing assistance.
- Do not assume the primary user can manually repair structure, pacing, character arcs, or chapter planning without substantial AI support.
- If there is a tradeoff between expert-oriented flexibility and beginner completion rate, prefer the path that better helps a novice user successfully produce a complete novel.

## UI Copy Rules

- All user-facing UI copy must explain the function from the user's perspective: what the user can do, what the system is helping with, or what the next step is.
- Do not write UI copy as implementation commentary, migration commentary, refactor commentary, or change-history commentary.
- Avoid product-facing copy that uses process/meta wording such as `现在`, `不再`, `已经`, `之前`, `原本`, `迁回`, `升级为`, or similar "we changed this" narration when the text is visible to end users.
- Prefer direct task wording such as:
  - entry point guidance;
  - action guidance;
  - expected effect;
  - current selection or current result.
- If a workflow belongs in another module, explain the correct user entry point directly, for example "从小说基础信息设置书级默认写法", rather than "书级默认写法已经迁回小说页".
- Before finishing UI work, review newly added copy and rewrite any sentence that sounds like it is talking to the developer or describing the modification process.

## Architecture Rules

- If a single source file becomes too long, it must be split into functional modules.
- Preferred threshold: keep a single source file around 1,200 lines.
- Floating range: 1,000-1,300 lines is acceptable when module cohesion is still clear and the file is not becoming hard to maintain.
- Hard threshold: when a source file exceeds 1,300 lines, refactoring and modularization are mandatory before continuing feature expansion.
- Long-file splitting must improve module boundaries, not merely reduce line count.
- Before splitting a long file, list its responsibilities and separate business rules, application orchestration, persistence/external adapters, and HTTP/API mapping.
- Do not split an oversized file by adding loose same-level files such as generic `helper`, `utils`, `shared`, or `runtime` files without clear module ownership.
- Extracted files must move into an explicit responsibility folder such as `domain/`, `application/`, `infrastructure/`, or `http/`, or into an existing business-stage folder with the same clarity of ownership.
- If a directory contains more than 12 `.ts` files, create or use a lower-level module directory before adding more peer files.
- If more than 4 files share the same feature prefix, for example `novelDirector*`, converge them into a dedicated feature directory instead of continuing the prefix-based flat layout.
- A `utils`, `helpers`, or `shared` file that grows beyond 300 lines or is depended on by more than 3 modules must be promoted into an owned service, policy, adapter, or domain module.
- After a split, outside modules should consume the capability through the module facade or `index.ts`; avoid deep imports into another module's internal files.
- If a split affects workflows, prompt/runtime contracts, automatic director chains, chapter execution chains, or other major novel-production links, add or update the module README or boundary notes before continuing feature expansion.
- For server-side architecture convergence, keep the current `server/src` structure runnable while gradually moving toward clear top-level ownership: `app/` for startup and route mounting, `platform/` for db/llm/events/runtime/config infrastructure, and `modules/` for product capabilities.
- Server business modules should be organized around the novel completion workflow when applicable: `setup`, `planning`, `production`, `director`, `characters`, `state`, and `export`.
- High-density server directories should be reduced incrementally. `routes` should converge into module-owned `http/` entrypoints, `services/novel` should keep only facades and stable shared entrypoints at its root, and `services/novel/director` should converge into owned submodules such as `commands`, `runtime`, `state`, `automation`, `projections`, `recovery`, and `phases`.
- Each architecture cleanup phase should move only one coherent subsystem, preserve compatibility exports where needed, check dependency direction, and run targeted TypeScript or service-level verification before the phase is considered complete.

## Project Development Wiki Rules

This project must continuously maintain a development wiki for architecture decisions, workflow rules, module boundaries, runtime contracts, debugging lessons, and product design rationale.

The wiki is not a record of "what changed". It should help future developers and AI agents understand why the system is designed this way and how it should be maintained.

### What Should Be Documented

Document stable knowledge such as:

- Design boundaries for core modules such as auto-director, chapter production, Creative Hub, task center, RAG, and Prompt Registry.
- Important architecture decisions and their reasons.
- Runtime state contracts, stage transition rules, recovery rules, retry rules, and failure-handling rules.
- AI invocation conventions such as Prompt Schema, structured output, JSON repair, and context assembly.
- Module ownership, dependency direction, and boundaries that forbid cross-layer calls.
- Repeated failure modes, debugging conclusions, and recommended diagnosis paths.
- Product principles and UX decisions that help beginners complete a full novel.

### What Should Not Be Documented

Do not add wiki entries for:

- Tiny changes with no long-term value.
- Per-commit file modification lists.
- Temporary TODOs.
- Pure release-note content.
- Implementation details that are likely to be discarded soon.
- Narration that only says what changed in the current task.

### Wiki Writing Rules

- Use Chinese by default unless the surrounding document is clearly English-only.
- Write for future developers and future AI agents.
- Explain the reason behind a decision, not just the decision itself.
- Prefer sections such as `Background / Decision / Current Rule / Examples / Failure Modes / Related Modules / Source Documents`.
- Keep entries stable, clear, and actionable.
- Avoid vague wording such as "optimize later", "handle properly", or "improve this".
- If a rule affects auto-director, chapter production, Prompt, RAG, task state, or frontend projection, state the affected scope explicitly.

### Recommended Locations

- `docs/wiki/architecture/`: architecture design, module boundaries, dependency direction.
- `docs/wiki/workflows/`: auto-director, chapter production, recovery chain, task center, and other workflows.
- `docs/wiki/prompts/`: Prompt Registry, structured output, JSON repair, schema conventions.
- `docs/wiki/rag/`: embedding, vector retrieval, context assembly, knowledge-base rules.
- `docs/wiki/debugging/`: recurring failures, diagnosis paths, recovery methods.
- `docs/wiki/product/`: beginner-first decisions, full-novel completion, UX rationale.

### When To Update The Wiki

Before completing any of the following, check whether the work produced stable wiki-worthy knowledge:

- A development phase.
- A significant bug fix.
- An architecture adjustment.
- A core workflow change.
- A change to Prompt Schema, runtime state, task recovery, or the chapter production chain.
- A commit, push, or PR.

If stable knowledge was introduced or clarified, update the relevant wiki page before the phase is considered complete.

If no wiki update is needed, explicitly state that the change has no long-term wiki value and should remain only in code or release notes.

### Wiki And Release Notes Boundary

- Wiki records durable project knowledge.
- Release Notes record user-visible product changes.
- README latest update only shows the latest public-facing summary.
- Do not write the wiki as a changelog.
- Do not copy release notes into the wiki.
- If a change affects both user behavior and long-term architecture, update both release notes and the relevant wiki page.

### Novel Production Wiki Priority

These areas have the highest priority for wiki accumulation:

1. Auto-director runtime, recovery, checkpoints, and resume behavior.
2. Chapter production chain, including draft generation, review, repair, save, and retry rules.
3. Runtime state contracts between backend, task center, and frontend projections.
4. Prompt Registry rules, structured output schemas, and JSON repair boundaries.
5. Creative Hub boundaries: what it can create, when it should hand off to auto-director, and when it should avoid becoming general chat.
6. RAG and context assembly rules for worldbuilding, characters, chapters, style, and continuity.
7. Beginner-first product decisions that reduce cognitive load and help users complete a full novel.

## Agent Collaboration Rules

- The project allows subagents to assist with development, investigation, verification, and documentation work when the active tool environment and higher-priority instructions permit it.
- Use subagents for well-scoped parallel work such as independent codebase exploration, focused implementation slices, documentation audits, or non-blocking verification.
- When delegating implementation, assign clear ownership of files or modules. Subagents must not revert or overwrite changes made by others.
- Do not use subagents to bypass project safety rules, data protection rules, branch workflow, prompt governance, or release-note / wiki requirements.
- Do not delegate destructive operations, database resets, migrations with data-loss risk, public release uploads, or branch promotion decisions.
- Integrate subagent output through normal review: inspect the diff, confirm it matches the current product and architecture rules, run or reuse appropriate verification, and document residual risk.

## Autonomous Execution Rules

- Once a design document is committed and pushed, treat it as implementation authorization: proceed directly to implementation, verification, and wrap-up on the appropriate branch per the Development Workflow.
- Do not ask the user to review a design document, confirm whether implementation should start, or re-ask the same decision in different wording.
- Rules in this file take precedence over generic skills, external process templates, and model default behavior when they conflict. If an external workflow requires waiting for user design review after the design is committed, skip that step.
- After a design document is committed, the fixed next step is: create the implementation plan, execute it, verify, then commit and push.
- Only ask a blocking question when a necessary fact cannot be determined from code, configuration, documentation, or existing artifacts. Execution-method choices, whether to continue, and whether to adopt the current plan are not askable items.

## Verification Reuse Rules

- Prefer targeted verification that matches the actual change scope.
- For UI-facing project modifications, do not run browser, screenshot, Playwright, visual, or manual interaction verification by default; the user will perform UI acceptance testing. Use code-level checks such as typecheck or focused tests when they fit the change, and clearly state that UI verification is left to the user.
- If a recent build, typecheck, packaging check, or test run already covers the same code paths after the relevant files last changed, do not repeat the same expensive verification by default.
- Before reusing recent verification, confirm the evidence is recent, tied to the same branch or commit range, and not invalidated by subsequent changes.
- Build commands can take significant time. Avoid repeated `pnpm build`, `pnpm typecheck`, or full test-suite runs when the current diff is documentation-only or already covered by a recent successful run.
- If verification is reused instead of rerun, state exactly what prior check is being trusted and why it still applies.
- If no suitable recent verification exists, or the change touches runtime contracts, prompt schemas, task recovery, database behavior, packaging, or cross-module product flow, run the narrowest sufficient check and document any skipped broader checks.

## Development Workflow

This project is a pure web product: all development targets the website (`client/` + `server/`). Desktop application development, desktop packaging, and desktop release upload are out of scope — do not start desktop work or modify `desktop/` unless the user explicitly reopens desktop as an active development phase.

### Branching

- The main workspace always stays on `main`: never switch its branch and never create branches inside it. The only writes allowed in the main workspace are merging verified branches, pushing to the remote, and documentation/rule-file-only commits.
- Session development happens in an isolated worktree with its own dedicated branch: create the worktree as a sibling directory of the repo via `git worktree add` — never inside the repo, because workspace globs and tooling scans would pick it up — and do all implementation, verification, and commits inside that worktree.
- Once the work passes its focused verification, merge the branch back into `main`, push to the remote, then remove the worktree and delete its branch in the same step. Never delete a worktree or branch that still holds unmerged, unfinished changes.
- `beta` is an optional pre-release integration lane, not a mandatory step. Use it only when a release candidate needs combined integration or regression verification before release; the path is worktree branches -> `beta` -> verify -> merge into `main`, and keep `beta` aligned with `main` after promotion. Do not use `beta` for unfinished experiments.

### Remote And Multi-Session Discipline

- The remote only ever carries `main` (plus `beta` while a release candidate is being integrated). Never push a session/worktree branch to the remote: once such a branch is merged, it is spent and must be deleted locally, not published.
- Always push an explicit ref from the main workspace: `git push origin main`. Never run bare `git push`, `git push --all`, `--mirror`, or any form that pushes the current branch implicitly — in a shared workspace the current branch is not guaranteed to be `main`, and this is exactly how stray feature branches ended up on the remote.
- The main workspace is shared by multiple concurrent AI sessions. Never change global state that other sessions depend on: the checked-out branch, dev ports, running dev processes, or shared config files. If the working tree contains uncommitted changes from another session, leave them untouched and scope your own commits with explicit `git add <paths>`.
- If a feature branch appears on the remote by accident, verify it is fully merged (`git cherry main <branch>` prints no `+` lines) and delete it with `git push origin --delete <branch>`.
- Before any branch, worktree, merge, or push operation, re-read this workflow section: the rules may have been updated by another session since this conversation started.

### Commits

- Commit after each coherent, completed unit of work. Before committing, confirm the working tree contains only that unit's intended changes and that verification matching the change scope has passed, or document the remaining verification gap explicitly.
- Before committing, exclude secrets, credentials, local-only configuration, generated artifacts, and test output from the staged scope. If a credentials or secrets file is already tracked, switch it to local-only ignore and keep the local copy on this machine; never commit credential content or credential updates.
- For changes with user-visible impact, update release notes in the same step (see Release Notes Workflow); if the diff is purely internal, state explicitly that release notes were intentionally skipped.
- Before ending a session, check `git status --short` and `git worktree list --porcelain`; clean up isolated worktrees created in this session that are fully merged and run `git worktree prune` where needed. Never delete the active workspace or anyone's unmerged, unfinished changes.

### Development Ports

- Development ports are fixed: API server on `3100` (single source of truth: `server/.env` `PORT=3100`), web client on `5173` (`client/vite.config.ts` sets `port: 5173, strictPort: true`). The client dev proxy reads the server port from `server/.env` automatically; do not hardcode a different port anywhere else.
- Never switch to another port when a dev port is occupied, and never change `PORT` values as a conflict workaround — silent port drift is what breaks the client `/api` proxy and running sessions.
- If a port is occupied, stop the occupying process and restart on the same port. The server dev script already kills this repo's stale dev processes before starting (`server/scripts/stop-stale-dev-server.cjs`); for other occupants run `netstat -ano | findstr :3100` (or `:5173`), confirm it is a disposable stale dev process, then `taskkill /PID <pid> /F` and start again on the same port.
- If the port is held by an unrelated long-lived service rather than a stale dev process, report it to the user instead of killing blindly or switching ports.

## Prompt Governance

- `server/src/prompting/` is the only allowed entrypoint for adding new product-level prompts.
- Any new product-facing prompt must be implemented as a `PromptAsset` under `server/src/prompting/prompts/<family>/`.
- Any new product-facing prompt must be registered in `server/src/prompting/registry.ts` with explicit `id`, `version`, `taskType`, `mode`, `contextPolicy`, and `outputSchema` when structured.
- Do not add new business prompts by inlining `systemPrompt` / `userPrompt` inside service files and calling `invokeStructuredLlm`.
- Do not add new business prompts by calling raw `getLLM()` from service code unless the flow is an approved exception below.
- When touching an existing unregistered prompt path, default to migrating that prompt into `server/src/prompting/` instead of extending the old inline implementation.
- Approved exceptions are limited to:
  - JSON repair inside `server/src/llm/structuredInvoke.ts`
  - connectivity / probe prompts such as `server/src/llm/connectivity.ts`
  - phase-two flow adapters in `graphs/*`, `routes/chat.ts`, `services/novel/runtime/*`, and other stream bridge code explicitly kept outside the registry for now
- For naming and registration workflow, follow `server/src/prompting/README.md`.

## Release Notes Workflow

- Before a commit, push, or PR with user-visible impact, use the `readme-release-updater` skill from `${CODEX_HOME:-~/.codex}/skills/readme-release-updater` to inspect the Git scope and summarize the user-visible changes.
- Record user-visible updates in `docs/releases/release-notes.md`, the complete user-facing history: preserve older entries and merge multiple updates from the same date under one date heading, for example `### 2026-04-07`.
- `README.md` `## 最新更新` shows only the newest date block plus a link to `docs/releases/release-notes.md`; do not accumulate historical date blocks.
- Write both surfaces as user-facing product notes: describe capabilities, workflow improvements, and visible behavior, not file paths, internal prompt/schema ids, database/API details, test names, or "we changed this" process narration.
- Update records stay date-based; do not introduce semantic version numbers into release notes or README unless the user explicitly decides to switch.
- If the diff is purely internal with no user-visible impact, skip release-note updates and state that explicitly instead of forcing a noisy entry.

## Current Product Priorities

1. Stabilize auto-director recovery and chapter production chain.
2. Keep beginner-first full-novel completion as the main product goal.
3. Avoid introducing new workflow branches unless they simplify the main production path.
4. Prefer fixing runtime contracts, prompt schemas, and state projections before adding UI-only patches.
5. Do not expand Creative Hub into a general chat tool unless it directly supports novel completion.

### Future Versioning Transition

- When the user later decides the product is stable enough for formal versions, versioning can transition from `date-only` to `version number + date`.
- Until that explicit transition happens, do not add `v0.x.y`, tags, or release naming conventions into README, changelog, or other product-facing release notes by default.
