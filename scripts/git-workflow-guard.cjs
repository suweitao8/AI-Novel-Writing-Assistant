#!/usr/bin/env node

"use strict";

const { execFileSync } = require("node:child_process");

const PROTECTED_BRANCH = "main";
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

function isProtectedBranch(branch = currentBranch()) {
  return branch === PROTECTED_BRANCH;
}

function fail(message) {
  throw new Error(`[git-workflow-guard] ${message}`);
}

function assertCommitAllowed() {
  const branch = currentBranch();
  if (!isProtectedBranch(branch)) {
    return;
  }

  if (hasGitRef("MERGE_HEAD")) {
    return;
  }

  fail(
    "blocked direct commit on protected branch 'main'. Create or use a sibling codex/* worktree, commit there, and merge the verified branch from main.",
  );
}

function assertMergeCommitAllowed() {
  const branch = currentBranch();
  if (!isProtectedBranch(branch)) {
    return;
  }
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
  }
}

function assertPushAllowed(input) {
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
};
