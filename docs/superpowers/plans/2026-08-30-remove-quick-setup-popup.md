# 移除快捷配置弹窗与全局创作门禁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 删除会误判状态并全局弹出的快捷配置流程，让模型类别设置成为唯一配置入口，同时保留首书进度的只读引导。

**Architecture:** 前端不再请求快捷配置状态、挂载 Provider 或拦截 AI 按钮。服务端删除快捷配置的探测/写入 API，把首书投影所需的环境判断收敛为只读文本槽配置检查；任务路由继续由现有 \`modelRouter\` 在运行时统一解析到文本槽。

**Tech Stack:** React 19 + Vite + TanStack Query；Express + TypeScript + Prisma；Node \`node:test\` 静态契约测试；pnpm workspace。

---

## Task 1: 固化“旧快捷配置链路不存在”的失败契约

**Files:**
- Create: \`client/tests/quickSetupRemovalContracts.test.js\`
- Create: \`server/tests/quickSetupRemovalContracts.test.js\`

- [ ] **Step 1: Write the failing client contract test**

Create \`client/tests/quickSetupRemovalContracts.test.js\`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(CLIENT_ROOT, relativePath), "utf8");
}

test("quick setup has no client mount, trigger, or API contract", () => {
  const appLayout = read("src/components/layout/AppLayout.tsx");
  const aiButton = read("src/components/common/AiButton.tsx");
  const home = read("src/pages/Home.tsx");
  const onboardingApi = read("src/api/onboarding.ts");
  const queryKeys = read("src/api/queryKeys.ts");

  assert.doesNotMatch(appLayout, /CreationSetupProvider|QuickSetupDialog/);
  assert.doesNotMatch(aiButton, /useCreationSetup|requireCreationSetup/);
  assert.doesNotMatch(home, /CreationSetupNotice/);
  assert.doesNotMatch(onboardingApi, /getQuickSetupStatus|completeQuickSetup|quick-setup/);
  assert.doesNotMatch(queryKeys, /quickSetup|quick-setup/);
  assert.match(aiButton, /onClick\(event\)/);

  for (const relativePath of [
    "src/components/onboarding/CreationSetupContext.tsx",
    "src/components/onboarding/CreationSetupNotice.tsx",
    "src/components/onboarding/QuickSetupDialog.tsx",
    "src/components/onboarding/creationSetupState.ts",
    "src/components/onboarding/creationSetupState.test.mjs",
  ]) {
    assert.equal(existsSync(join(CLIENT_ROOT, relativePath)), false, relativePath);
  }
});
```

- [ ] **Step 2: Run the client contract and verify it fails before implementation**

Run from \`client/\`:

```text
node --test tests/quickSetupRemovalContracts.test.js
```

Expected: FAIL because the current layout still mounts \`CreationSetupProvider\`, \`AiButton\` still imports \`useCreationSetup\`, and the deprecated files still exist.

- [ ] **Step 3: Write the failing server contract test**

Create \`server/tests/quickSetupRemovalContracts.test.js\`:

```js
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const SERVER_ROOT = path.resolve(__dirname, "..");
const SHARED_ROOT = path.resolve(SERVER_ROOT, "../shared");

function readFrom(root, relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("quick setup has no server route, service, or shared type contract", () => {
  const routes = readFrom(SERVER_ROOT, "src/modules/setup/onboarding/http/onboardingRoutes.ts");
  const firstNovel = readFrom(SERVER_ROOT, "src/modules/setup/onboarding/application/FirstNovelOnboardingService.ts");
  const sharedTypes = readFrom(SHARED_ROOT, "types/onboarding.ts");

  assert.doesNotMatch(routes, /settings\/quick-setup|QuickSetupService|CompleteQuickSetup/);
  assert.doesNotMatch(firstNovel, /QuickSetupService|getQuickSetupStatus|open_quick_setup/);
  assert.doesNotMatch(sharedTypes, /QuickSetup|open_quick_setup/);
  assert.equal(
    existsSync(path.join(SERVER_ROOT, "src/modules/setup/onboarding/application/QuickSetupService.ts")),
    false,
  );
});
```

- [ ] **Step 4: Run the server contract and verify it fails before implementation**

Run from \`server/\`:

```text
node --test tests/quickSetupRemovalContracts.test.js
```

Expected: FAIL because the quick setup routes, service, shared types, and FirstNovel import still exist.

## Task 2: Remove the client trigger chain

**Files:**
- Delete: \`client/src/components/onboarding/CreationSetupContext.tsx\`
- Delete: \`client/src/components/onboarding/CreationSetupNotice.tsx\`
- Delete: \`client/src/components/onboarding/QuickSetupDialog.tsx\`
- Delete: \`client/src/components/onboarding/creationSetupState.ts\`
- Delete: \`client/src/components/onboarding/creationSetupState.test.mjs\`
- Modify: \`client/src/components/layout/AppLayout.tsx\`
- Modify: \`client/src/components/common/AiButton.tsx\`
- Modify: \`client/src/pages/Home.tsx\`
- Modify: \`client/src/api/onboarding.ts\`
- Modify: \`client/src/api/queryKeys.ts\`
- Modify: \`client/src/components/onboarding/FirstNovelJourneyStrip.tsx\`

- [ ] **Step 1: Remove the provider wrappers from \`AppLayout\`**

Delete the \`CreationSetupProvider\` import and unwrap all four layout branches so each branch returns its existing layout directly. Preserve all existing preview/mobile/site/normal layout content and providers unrelated to setup.

- [ ] **Step 2: Restore direct AI button execution**

Delete the \`useCreationSetup\` import and change \`AiButton\` to call the supplied handler directly:

```tsx
export default function AiButton({ onClick, ...props }: AiButtonProps) {
  return (
    <Button
      {...props}
      onClick={(event) => {
        onClick?.(event);
      }}
    >
      <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
      {props.children}
    </Button>
  );
}
```

Keep the current \`AiButtonProps\` typing, class names, AI badge/icon behavior, disabled behavior, and \`type\` forwarding. Adapt only the exact local implementation shape as needed to preserve existing props.

- [ ] **Step 3: Remove the home notice and quick API functions**

Remove \`CreationSetupNotice\` import/render from \`Home\`. In \`client/src/api/onboarding.ts\`, retain only \`getFirstNovelOnboarding\` and its \`FirstNovelOnboardingProjection\` import. Remove \`queryKeys.settings.quickSetup\`; retain all other settings keys unchanged.

- [ ] **Step 4: Make the first-novel card follow the server-provided next action**

Change \`FirstNovelJourneyStrip\` from \`to="/help"\` to \`to={journey.primaryAction.route}\`. Do not add a new modal, local readiness state, or explanatory copy. The service will provide \`/settings/models\` when the text model is missing and the relevant task route otherwise.

- [ ] **Step 5: Delete obsolete client files**

Delete the five files listed above. No compatibility stub should render a hidden dialog or keep the old local-storage dismissal key.

- [ ] **Step 6: Run the client contract and focused typecheck**

Run:

```text
cd client
node --test tests/quickSetupRemovalContracts.test.js
pnpm typecheck
```

Expected: the contract passes; typecheck exits 0. If unrelated baseline failures appear, record their exact output separately and keep the focused contract result distinct.

## Task 3: Replace server quick setup with read-only environment readiness

**Files:**
- Create: \`server/src/modules/setup/onboarding/application/CreationEnvironmentService.ts\`
- Delete: \`server/src/modules/setup/onboarding/application/QuickSetupService.ts\`
- Modify: \`server/src/modules/setup/onboarding/application/FirstNovelOnboardingService.ts\`
- Modify: \`server/src/modules/setup/onboarding/http/onboardingRoutes.ts\`
- Modify: \`shared/types/onboarding.ts\`
- Modify: \`server/tests/onboardingServices.test.js\`

- [ ] **Step 1: Add the read-only environment service**

Create \`CreationEnvironmentService.ts\` with this behavior:

```ts
import type { BuiltinLLMProvider } from "@ai-novel/shared/types/llm";
import { getTextModelProvider } from "../../../../llm/modelCategories";
import {
  getProviderEnvApiKey,
  getProviderEnvBaseUrl,
  getProviderEnvModel,
  providerRequiresApiKey,
  PROVIDERS,
} from "../../../../llm/providers";
import { secretStore } from "../../../../services/settings/secretStore";

export interface CreationEnvironmentReadiness {
  ready: boolean;
  provider: BuiltinLLMProvider;
  model: string | null;
}

function normalize(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export async function getCreationEnvironmentReadiness(): Promise<CreationEnvironmentReadiness> {
  const provider = getTextModelProvider();
  const config = PROVIDERS[provider];
  const record = await secretStore.getProvider(provider);
  const model = normalize(record?.model) ?? getProviderEnvModel(provider) ?? config.defaultModel;
  const baseURL = normalize(record?.baseURL) ?? getProviderEnvBaseUrl(provider) ?? config.baseURL;
  const apiKey = normalize(record?.key) ?? getProviderEnvApiKey(provider);
  const hasRequiredCredential = !providerRequiresApiKey(provider) || Boolean(apiKey);

  return {
    ready: (record?.isActive ?? true) && Boolean(model && baseURL) && hasRequiredCredential,
    provider,
    model: model ?? null,
  };
}
```

This is intentionally a configuration read, not a connectivity probe. The existing model settings page remains responsible for explicit connection testing.

- [ ] **Step 2: Remove quick setup routes and schema**

In \`onboardingRoutes.ts\`, remove the \`z\` import, \`CompleteQuickSetupRequest\` import, \`completeQuickSetup\` / \`getQuickSetupStatus\` imports, the \`completeQuickSetupSchema\`, and both \`/settings/quick-setup/status\` and \`/settings/quick-setup/complete\` handlers. Keep \`authMiddleware\` and \`/onboarding/first-novel\` unchanged apart from its service import.

- [ ] **Step 3: Update first-novel projection to use the new readiness result**

Replace the \`QuickSetupService\` import and call with \`getCreationEnvironmentReadiness()\`. Rename the local \`setup\` value to \`environment\`, use \`environment.ready\` for the existing branches, and use \`environment.model\` in the environment summary. Change the initial projection to:

```ts
let headline = "配置文本模型后开始创作";
let description = "在模型设置中配置一个文本模型，系统会自动将它用于全部文字任务。";
let reason = "全部文字任务都使用模型设置中的文本模型。";
let primaryAction: FirstNovelOnboardingProjection["primaryAction"] = {
  label: "配置文本模型",
  route: "/settings/models",
  kind: "navigate",
};
```

All later task/novel projection branches remain behaviorally unchanged, but they use \`environment.ready\`. The first-novel projection must never emit \`open_quick_setup\` or \`/help\` as its environment action.

- [ ] **Step 4: Remove obsolete shared quick setup types**

In \`shared/types/onboarding.ts\`, remove the \`LLMProvider\` and \`ModelRouteTaskType\` imports used only by quick setup and delete \`QuickSetupProviderOption\`, \`QuickSetupRouteCoverage\`, \`QuickSetupStatus\`, \`CompleteQuickSetupRequest\`, and \`CompleteQuickSetupResult\`. Change \`primaryAction.kind\` to \`"navigate" | "resume"\`.

- [ ] **Step 5: Update server onboarding tests**

Remove the quick setup mutation test and replace each \`quickSetup.getQuickSetupStatus\` stub with \`creationEnvironment.getCreationEnvironmentReadiness\` returning:

```js
{
  ready: true,
  provider: "codex",
  model: "gpt-5.6-luna",
}
```

Restore the original readiness function in each \`finally\` block. Keep the readable-chapter graduation and production-handoff assertions intact.

- [ ] **Step 6: Delete the obsolete server service and run server contract/build checks**

Delete \`QuickSetupService.ts\`, then run:

```text
cd server
node --test tests/quickSetupRemovalContracts.test.js
pnpm --filter @ai-novel/shared build
pnpm build
```

Expected: the server contract passes and the TypeScript build exits 0.

## Task 4: Update durable module and user documentation

**Files:**
- Modify: \`server/src/modules/setup/onboarding/README.md\`
- Modify: \`docs/wiki/architecture/model-categories.md\`
- Modify: \`docs/public/modules/onboarding.md\`

- [ ] **Step 1: Document the module boundary**

Describe the onboarding module as a read-only first-novel projection. State that \`/settings/models\` is the model configuration entry, the text slot automatically serves all text tasks through runtime route resolution, and onboarding does not probe models, write route rows, or open a global dialog.

- [ ] **Step 2: Update the model category architecture rule**

Replace the QuickSetup bullet and related module reference with the durable rule that the text slot is configured in the model settings page and all text routes resolve to it. Keep the existing structured fallback and legacy-data compatibility rules.

- [ ] **Step 3: Update the public onboarding guide**

Remove the “首次快捷配置” modal workflow and explain that users configure one text model at \`/settings/models\`; after that, the existing runtime automatically uses it for planning, writing, review, repair, and replanning. Keep the five first-novel milestones and optional enhancements, changing the environment action description to the settings page.

- [ ] **Step 4: Run documentation consistency checks**

Run:

```text
rg -n -S "QuickSetup|quick-setup|CreationSetup|open_quick_setup|/help" client server shared docs/public docs/wiki README.md -g '!node_modules' -g '!dist'
pnpm check:docs-manifest
```

Expected: no production or durable documentation references to the removed quick setup flow; any remaining historical archive references must be reviewed and either left as history or updated only if they describe current behavior.

## Task 5: Release notes, self-test, and self-acceptance

**Files:**
- Modify: \`docs/releases/release-notes.md\`
- Modify: \`README.md\`

- [ ] **Step 1: Run the readme-release-updater workflow**

Before the user-visible commit, inspect \`git status --short\`, \`git diff\`, and \`git diff --cached\`. Add one entry under the existing \`2026-08-30\` heading describing from the user perspective that model setup is now managed in the model settings page and the unexpected global popup/gate is gone. Refresh \`README.md\` so \`## 最新更新\` contains only the newest date block and links to the full release notes.

- [ ] **Step 2: Run focused self-tests**

Run from the worktree root:

```text
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server typecheck
pnpm --filter @ai-novel/client typecheck
node --test client/tests/quickSetupRemovalContracts.test.js
node --test server/tests/quickSetupRemovalContracts.test.js
```

Expected: every listed command exits 0. The previously observed full client baseline failures (missing shared dist/runtime configuration and unrelated stale contracts) are not substituted for these focused checks; report them separately if a full suite is rerun.

- [ ] **Step 3: Run the browser smoke self-test or record the environmental blocker**

Use an isolated browser tab against \`http://127.0.0.1:5174\` and the API at \`http://127.0.0.1:3100\`. Visit the home page and a page with an \`AiButton\`, confirm the quick setup dialog title is absent, click the AI button, check that it is not intercepted by a setup modal, and inspect console/network failures. Do not stop or replace processes owned by another worktree. If either fixed port is held by another worktree or fixture, record the owning PID/command and mark this smoke check blocked rather than changing ports.

- [ ] **Step 4: Self-accept the diff against the requirement**

Review the final diff and verify: no modal mount, no automatic prompt effect, no route gate, no AI button gate, no quick setup endpoint/type/service, canonical settings link for missing text model, unchanged text-slot runtime routing, no database destructive operation, and documentation/release notes accurately describe user-visible behavior.

- [ ] **Step 5: Commit each coherent unit with a signed commit**

Use \`git status --short\` and explicit paths. Commit the design/plan documentation first, then implementation/tests/docs/release changes after the self-test gate:

```text
git add docs/superpowers/specs/2026-08-30-remove-quick-setup-popup-design.md docs/superpowers/plans/2026-08-30-remove-quick-setup-popup.md
git commit -s -m "docs(onboarding): design quick setup removal"

git add client server shared docs README.md
git commit -s -m "fix(onboarding): remove global quick setup gate"
```

Do not commit generated \`dist\`, logs, databases, secrets, or unrelated worktree changes.

## Task 6: Integrate, push, and clean up

- [ ] **Step 1: Re-read the repository Development Workflow section and verify the source worktree is clean**

From the main worktree, run \`pnpm check:workspace-integrity\`, verify \`git status --short --branch\`, and verify the source branch is clean.

- [ ] **Step 2: Integrate and push through the repository entrypoint**

From \`D:\\Github\\AI-Novel-Writing-Assistant\`, run:

```text
pnpm workflow:integrate codex/remove-quick-setup-popup --push --verify "pnpm --filter @ai-novel/shared build && pnpm --filter @ai-novel/server typecheck && pnpm --filter @ai-novel/client typecheck && node --test client/tests/quickSetupRemovalContracts.test.js && node --test server/tests/quickSetupRemovalContracts.test.js"
```

Expected: the entrypoint prepares a no-fast-forward merge, reruns the focused checks, creates the signed main merge commit, and pushes only \`origin/main\`.

- [ ] **Step 3: Verify final refs and clean only this worktree**

Run \`git status --short --branch\`, \`git rev-parse HEAD\`, \`git rev-parse origin/main\`, and \`git worktree list --porcelain\`. Confirm \`HEAD\` equals \`origin/main\`, remove only \`D:\\Github\\AI-Novel-Writing-Assistant-remove-quick-setup-popup\` after successful integration, delete only \`codex/remove-quick-setup-popup\`, and run \`git worktree prune\`. Preserve every other worktree and process.
