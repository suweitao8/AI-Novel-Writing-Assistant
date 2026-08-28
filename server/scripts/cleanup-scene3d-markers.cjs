#!/usr/bin/env node

/**
 * 一次性清理：空间标记功能关闭后，把场景状态 JSON 里的 scene3dMarkers 字段删掉。
 *
 * 安全规则：
 * - 默认 dry-run，只统计将被清理的场景与状态数量，不写库；
 * - --apply 必须同时提供 --backup <文件路径>，且备份文件必须存在、非空；
 * - 幂等：没有可清理数据时写 0 行。
 *
 * 用法：
 *   node scripts/cleanup-scene3d-markers.cjs                       # dry-run
 *   node scripts/cleanup-scene3d-markers.cjs --apply --backup <db备份文件>
 */

const fs = require("node:fs");
const path = require("node:path");

const { prisma } = require("../dist/db/prisma.js");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const backupIndex = args.indexOf("--backup");
const backupPath = backupIndex >= 0 ? args[backupIndex + 1] : null;

function parseStatesJson(raw) {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}

function stripMarkers(states) {
  let touched = 0;
  const next = states.map((state) => {
    if (!state || typeof state !== "object" || !("scene3dMarkers" in state)) return state;
    const { scene3dMarkers: _removed, ...rest } = state;
    touched += 1;
    return rest;
  });
  return { next, touched };
}

async function main() {
  if (apply) {
    if (!backupPath) {
      console.error("缺少 --backup <文件路径>：清理写库前必须提供已验证的备份文件。");
      process.exit(1);
    }
    const resolvedBackup = path.resolve(backupPath);
    const stat = fs.existsSync(resolvedBackup) ? fs.statSync(resolvedBackup) : null;
    if (!stat || !stat.isFile() || stat.size <= 0) {
      console.error(`备份文件不存在或为空：${resolvedBackup}`);
      process.exit(1);
    }
    console.log(`已验证备份：${resolvedBackup}（${stat.size} bytes）`);
  }

  const rows = await prisma.novelScene.findMany({
    where: { statesJson: { contains: "scene3dMarkers" } },
    select: { id: true, novelId: true, name: true, statesJson: true },
  });

  let sceneCount = 0;
  let stateCount = 0;
  let skippedUnparsable = 0;

  for (const row of rows) {
    const states = parseStatesJson(row.statesJson);
    if (states === null) {
      skippedUnparsable += 1;
      console.warn(`[跳过] statesJson 无法解析，scene=${row.id} (${row.name})`);
      continue;
    }
    const { next, touched } = stripMarkers(states);
    if (touched === 0) continue;
    sceneCount += 1;
    stateCount += touched;
    console.log(`[将清理] scene=${row.id} 小说=${row.novelId} 名称=${row.name} 状态数=${touched}`);
    if (apply) {
      await prisma.novelScene.update({
        where: { id: row.id },
        data: { statesJson: JSON.stringify(next) },
      });
    }
  }

  console.log(
    apply
      ? `清理完成：场景 ${sceneCount} 个，状态 ${stateCount} 个。`
      : `dry-run 完成：将清理场景 ${sceneCount} 个，状态 ${stateCount} 个；加 --apply --backup <文件> 执行写库。`,
  );
  if (skippedUnparsable > 0) {
    console.log(`跳过无法解析的场景 ${skippedUnparsable} 个，请人工检查。`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
