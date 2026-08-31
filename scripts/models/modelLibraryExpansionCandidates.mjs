import path from "node:path";

function packageBasename(packagePath) {
  return path.posix.basename(String(packagePath ?? "").replaceAll("\\", "/"));
}

export function parseJsonlManifest(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid Cine57 manifest JSON on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
}

function hasRejectedPattern(meshName, policy) {
  return (policy?.rejectedMeshNamePatterns ?? []).some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(meshName);
    } catch (error) {
      throw new Error(`Invalid rejected mesh-name pattern: ${pattern}`);
    }
  });
}

export function classifyExpansionCandidate({ meshName, packagePath, policy = {} }) {
  const normalizedMeshName = String(meshName ?? "");
  const normalizedPackagePath = String(packagePath ?? "").replaceAll("\\", "/");
  if (!/^\/Game(?:\/|$)/.test(normalizedPackagePath)) {
    return { accepted: false, reason: "unknown-source" };
  }
  if (/(?:^|_)NN(?:_|$)/i.test(normalizedMeshName) || /\/NN\//i.test(normalizedPackagePath)) {
    return { accepted: false, reason: "technical-variant" };
  }
  if (hasRejectedPattern(normalizedMeshName, policy)) {
    return { accepted: false, reason: "component" };
  }
  return { accepted: true, reason: null };
}

export function selectExpansionCandidates({ rows = [], selectedMeshNames = new Set(), policy = {} }) {
  const candidates = [];
  const rejected = [];
  for (const row of rows) {
    const meshName = packageBasename(row?.package);
    if (!selectedMeshNames.has(meshName)) continue;
    const classification = classifyExpansionCandidate({
      meshName,
      packagePath: row?.package,
      policy,
    });
    if (classification.accepted) {
      candidates.push(row);
    } else {
      rejected.push({ row, meshName, reason: classification.reason });
    }
  }
  return { candidates, rejected };
}
