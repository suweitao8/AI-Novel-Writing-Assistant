/**
 * 短剧配音合成队列：进程级合成闸门 + 分镜级去重。
 *
 * 配音有两个入口——单镜「生成配音」接口与整集批量任务；两者最终都落到
 * 本地 VoxCPM2 服务。该服务吞吐有限，因此规则是：
 * - 全局同时在途的合成请求数由闸门限制；不同分镜可以并行推进，但共享
 *   同一份配额，不会叠加压垮本地服务。
 * - 同一分镜的重复触发合并为一次执行：后触发者复用进行中的 Promise，
 *   既不中断也不覆盖前一次的结果。
 */

export const MIN_TTS_SYNTHESIS_CONCURRENCY = 1;
export const MAX_TTS_SYNTHESIS_CONCURRENCY = 8;
/** 默认与旧行为的单镜内部 3 路一致；多分镜共享这份配额而不是相乘。 */
export const DEFAULT_TTS_SYNTHESIS_CONCURRENCY = 3;

export function normalizeTtsSynthesisConcurrency(value: unknown): number {
  if (value === null || (typeof value === "string" && value.trim() === "")) {
    return DEFAULT_TTS_SYNTHESIS_CONCURRENCY;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_TTS_SYNTHESIS_CONCURRENCY;
  }
  return Math.min(
    MAX_TTS_SYNTHESIS_CONCURRENCY,
    Math.max(MIN_TTS_SYNTHESIS_CONCURRENCY, Math.floor(numeric)),
  );
}

function readConfiguredConcurrency(): number {
  const raw = process.env.DRAMA_TTS_SYNTHESIS_CONCURRENCY;
  return raw?.trim() ? normalizeTtsSynthesisConcurrency(raw) : DEFAULT_TTS_SYNTHESIS_CONCURRENCY;
}

/**
 * 有界合成闸门。上限以内直接放行；超出的任务按近似 FIFO 排队等待空位。
 * 约束不变量是「同时在途 <= limit」，唤醒顺序偶尔会被新任务抢先，可接受。
 */
export class TtsSynthesisGate {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number = readConfiguredConcurrency()) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

/**
 * 同键合并表：键已有在途执行时返回同一个 Promise（含同享失败），落定后移除，
 * 之后的新触发重新执行。用于避免同分镜的并发重复合成互相覆盖落库结果。
 */
export class SingleFlightMap<T> {
  private readonly entries = new Map<string, Promise<T>>();

  run(key: string, start: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing) {
      return existing;
    }
    const execution = start();
    const tracked = execution.finally(() => {
      if (this.entries.get(key) === tracked) {
        this.entries.delete(key);
      }
    });
    // finally 链自身的拒绝已由各调用方消费；这里只兜底避免未处理拒绝告警。
    tracked.catch(() => undefined);
    this.entries.set(key, tracked);
    return tracked;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }
}

export const ttsSynthesisGate = new TtsSynthesisGate();
