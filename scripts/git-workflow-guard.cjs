#!/usr/bin/env node

"use strict";

const { execFileSync } = require("node:child_process");
const { assertMainWorkspaceSharedIntegrity } = require("./workspace-integrity-guard.cjs");
const { assertWorktreeFilesystemIsolation } = require("./worktree-filesystem-safety.cjs");

const PROTECTED_BRANCH = "main";
const CODEX_BRANCH_PREFIX = "codex/";
const SHARED_CONTRACT_BRANCH = /^codex\/shared-[a-z0-9][a-z0-9-]*$/;
const ZERO_SHA = /^0{40}$/;

function currentBranch() {
  try {
    return execFileSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "HEAD";
  }
}

function hasGitRef(ref) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function gitOutput(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function isProtectedBranch(branch = currentBranch()) {
  return branch === PROTECTED_BRANCH;
}

function fail(message) {
  throw new Error(`[git-workflow-guard] ${message}`);
}

function stagedSharedChanges() {
  const output = gitOutput(["diff", "--cached", "--name-status", "--find-renames", "--", "shared"]);
  if (!output) {
    return [];
  }
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [status, ...paths] = line.split("\t");
    return { status, paths };
  });
}

function assertStagedSharedChangesAllowed() {
  const changes = stagedSharedChanges();
  if (changes.length === 0) {
    return;
  }

  const branch = currentBranch();
  if (!SHARED_CONTRACT_BRANCH.test(branch)) {
    fail(
      "shared changes require a dedicated codex/shared-<topic> worktree branch. Do not fold cross-client/server contracts into an ordinary feature branch.",
    );
  }

  if (changes.some((change) => change.status.includes("D"))) {
    fail(
      "deleting tracked files under shared is blocked. Perform a separately reviewed contract migration instead of removing shared files in a normal development commit.",
    );
  }
}

function localBranchesContaining(commit) {
  return gitOutput(["branch", "--format=%(refname:short)", "--contains", commit])
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function assertMergeSourceIsCodexBranch(commit) {
  const branches = localBranchesContaining(commit);
  if (branches.some((branch) => branch.startsWith(CODEX_BRANCH_PREFIX))) {
    return;
  }
  fail(
    "blocked main merge because its source is not a local codex/* branch. Complete feature work in a codex/* worktree before integrating it into main.",
  );
}

function assertCommitAllowed() {
  assertWorktreeFilesystemIsolation({ cwd: process.cwd(), phase: "git commit hook" });
  const branch = currentBranch();
  if (!isProtectedBranch(branch)) {
    assertStagedSharedChangesAllowed();
    return;
  }

  if (!hasGitRef("MERGE_HEAD")) {
    fail(
      "blocked direct commit on protected branch 'main'. Create or use a sibling codex/* worktree, commit there, and merge the verified branch from main.",
    );
  }

  assertMergeSourceIsCodexBranch(gitOutput(["rev-parse", "MERGE_HEAD"]));
}

function assertMergeCommitAllowed() {
  const branch = currentBranch();
  if (!isProtectedBranch(branch)) {
    return;
  }
  fail(
    "blocked automatic merge commit on protected branch 'main'. Use 'git merge --no-ff --no-commit codex/<task>', review the prepared merge, then run 'git commit' so the pre-commit hook can verify MERGE_HEAD.",
  );
}

function assertRebaseAllowed() {
  const branch = currentBranch();
  if (isProtectedBranch(branch)) {
    fail("blocked rebase from protected branch 'main'. Rebase the feature branch from its own worktree instead.");
  }
}

function assertMainHistoryOnlyContainsMerges(remoteSha, localSha) {
  if (ZERO_SHA.test(remoteSha) || remoteSha === localSha) {
    return;
  }

  let output;
  try {
    output = execFileSync("git", ["rev-list", "--first-parent", `${remoteSha}..${localSha}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    fail("could not inspect the new main history before push; push was stopped for safety.");
  }

  for (const commit of output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
    let parents;
    try {
      parents = execFileSync("git", ["rev-list", "--parents", "-n", "1", commit], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .trim()
        .split(/\s+/);
    } catch {
      fail("could not inspect a new main commit before push; push was stopped for safety.");
    }

    if (parents.length < 3) {
      fail(
        "blocked push because new main history contains a direct commit. Integrate changes with an explicit merge commit from a verified codex/* branch.",
      );
    }
    assertMergeSourceIsCodexBranch(parents[2]);
  }
}

function assertPushAllowed(input) {
  assertWorktreeFilesystemIsolation({ cwd: process.cwd(), phase: "git push hook" });
  const branch = currentBranch();
  const updates = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/));

  for (const [localRef, localSha, remoteRef, remoteSha] of updates) {
    if (!localRef || !localSha || !remoteRef || !remoteSha) {
      fail("received an invalid pre-push ref update; push was stopped before remote state could change.");
    }

    if (localRef !== "refs/heads/main" || remoteRef !== "refs/heads/main") {
      fail(
        "blocked push outside main. Feature branches stay local; integrate them into main and push only refs/heads/main.",
      );
    }

    if (branch !== PROTECTED_BRANCH) {
      fail("blocked push of main from a non-main worktree. Run the integration push from the main workspace.");
    }

    assertMainWorkspaceSharedIntegrity();

    if (ZERO_SHA.test(localSha)) {
      fail("blocked deletion of protected branch 'main'.");
    }

    if (!ZERO_SHA.test(remoteSha)) {
      try {
        execFileSync("git", ["merge-base", "--is-ancestor", remoteSha, localSha], {
          stdio: ["ignore", "ignore", "ignore"],
        });
      } catch {
        fail("blocked non-fast-forward push to protected branch 'main'. Pull and integrate before pushing.");
      }
    }

    assertMainHistoryOnlyContainsMerges(remoteSha, localSha);
  }
}

function main() {
  const action = process.argv[2];
  switch (action) {
    case "pre-commit":
    case "pre-applypatch":
      assertCommitAllowed();
      return;
    case "pre-merge-commit":
      assertMergeCommitAllowed();
      return;
    case "pre-rebase":
      assertRebaseAllowed();
      return;
    case "pre-push":
      assertPushAllowed(process.stdin.isTTY ? "" : require("node:fs").readFileSync(0, "utf8"));
      return;
    default:
      fail(`unknown hook action '${action ?? ""}'.`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

module.exports = {
  PROTECTED_BRANCH,
  assertCommitAllowed,
  assertMergeCommitAllowed,
  assertMainHistoryOnlyContainsMerges,
  assertPushAllowed,
  assertRebaseAllowed,
  assertStagedSharedChangesAllowed,
  assertMergeSourceIsCodexBranch,
  SHARED_CONTRACT_BRANCH,
};
