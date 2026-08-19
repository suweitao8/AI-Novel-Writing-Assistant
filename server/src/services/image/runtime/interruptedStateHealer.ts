/**
 * 启动自愈：图像生成 runner 的状态存在各业务表的 JSON 字段里。
 * 生成过程中进程退出（重启/崩溃）时 catch 不会执行，status 会永远停在
 * "generating"，而前端在 generating 态没有重试入口，用户会被永久卡住。
 *
 * 服务启动时扫描所有已知存储位，把残留的 generating 状态改写为 error，
 * 让界面恢复"重新生成"入口。启动时刻不可能存在真实运行中的生成任务，
 * 因此所有 generating 状态都视为被中断。
 */
import { prisma } from "../../../db/prisma";

const INTERRUPTED_ERROR_MESSAGE = "上一次生成被服务重启中断，请重新生成。";
const GENERATING_MARKER = '"status":"generating"';

interface HealTarget {
  name: string;
  findInterrupted: () => Promise<Array<{ id: string; raw: string | null }>>;
  saveHealed: (id: string, raw: string) => Promise<unknown>;
}

function healValue(value: unknown): { changed: boolean; healed: unknown } {
  if (Array.isArray(value)) {
    let changed = false;
    const healed = value.map((item) => {
      const result = healValue(item);
      changed = changed || result.changed;
      return result.healed;
    });
    return { changed, healed: changed ? healed : value };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.status === "generating") {
      return {
        changed: true,
        healed: { ...record, status: "error", error: INTERRUPTED_ERROR_MESSAGE },
      };
    }
    let changed = false;
    const healed: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) {
      const result = healValue(item);
      changed = changed || result.changed;
      healed[key] = result.healed;
    }
    return { changed, healed: changed ? healed : value };
  }
  return { changed: false, healed: value };
}

function healJsonString(raw: string): string | null {
  try {
    const { changed, healed } = healValue(JSON.parse(raw) as unknown);
    return changed ? JSON.stringify(healed) : null;
  } catch {
    return null;
  }
}

const HEAL_TARGETS: HealTarget[] = [
  {
    name: "comicCharacter",
    findInterrupted: () => prisma.comicCharacter
      .findMany({ where: { sheetData: { contains: GENERATING_MARKER } }, select: { id: true, sheetData: true } })
      .then((rows) => rows.map((row) => ({ id: row.id, raw: row.sheetData }))),
    saveHealed: (id, raw) => prisma.comicCharacter.update({ where: { id }, data: { sheetData: raw } }),
  },
  {
    name: "comicScene",
    findInterrupted: () => prisma.comicScene
      .findMany({ where: { sheetData: { contains: GENERATING_MARKER } }, select: { id: true, sheetData: true } })
      .then((rows) => rows.map((row) => ({ id: row.id, raw: row.sheetData }))),
    saveHealed: (id, raw) => prisma.comicScene.update({ where: { id }, data: { sheetData: raw } }),
  },
  {
    name: "comicPanel",
    findInterrupted: () => prisma.comicPanel
      .findMany({ where: { imageData: { contains: GENERATING_MARKER } }, select: { id: true, imageData: true } })
      .then((rows) => rows.map((row) => ({ id: row.id, raw: row.imageData }))),
    saveHealed: (id, raw) => prisma.comicPanel.update({ where: { id }, data: { imageData: raw } }),
  },
  {
    name: "comicCharacterAsset",
    findInterrupted: () => prisma.comicCharacterAsset
      .findMany({ where: { imageData: { contains: GENERATING_MARKER } }, select: { id: true, imageData: true } })
      .then((rows) => rows.map((row) => ({ id: row.id, raw: row.imageData }))),
    saveHealed: (id, raw) => prisma.comicCharacterAsset.update({ where: { id }, data: { imageData: raw } }),
  },
  {
    name: "dramaCharacter",
    findInterrupted: () => prisma.dramaCharacter
      .findMany({ where: { portraitData: { contains: GENERATING_MARKER } }, select: { id: true, portraitData: true } })
      .then((rows) => rows.map((row) => ({ id: row.id, raw: row.portraitData }))),
    saveHealed: (id, raw) => prisma.dramaCharacter.update({ where: { id }, data: { portraitData: raw } }),
  },
  {
    name: "dramaShot",
    findInterrupted: () => prisma.dramaShot
      .findMany({ where: { keyframeData: { contains: GENERATING_MARKER } }, select: { id: true, keyframeData: true } })
      .then((rows) => rows.map((row) => ({ id: row.id, raw: row.keyframeData }))),
    saveHealed: (id, raw) => prisma.dramaShot.update({ where: { id }, data: { keyframeData: raw } }),
  },
];

export async function healInterruptedImageGenerationStates(): Promise<void> {
  for (const target of HEAL_TARGETS) {
    const rows = await target.findInterrupted();
    for (const row of rows) {
      if (!row.raw) continue;
      const healed = healJsonString(row.raw);
      if (!healed || healed === row.raw) continue;
      await target.saveHealed(row.id, healed);
      console.log(`[image.runtime] healed interrupted generating state ${target.name}:${row.id}`);
    }
  }
}
