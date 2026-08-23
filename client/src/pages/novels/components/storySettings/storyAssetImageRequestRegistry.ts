export type StoryAssetImageRequestState = "queued" | "running";

interface RequestEntry<T> {
  state: StoryAssetImageRequestState;
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createEntry<T>(): RequestEntry<T> {
  let resolve!: RequestEntry<T>["resolve"];
  let reject!: RequestEntry<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { state: "queued", promise, resolve, reject };
}

/**
 * 进程内的状态图请求登记器：自动队列和详情弹窗共享同一条 promise，
 * 既能提前显示排队状态，也不会让手动入口重复发起同一状态的请求。
 */
export class StoryAssetImageRequestRegistry<T> {
  private readonly entries = new Map<string, RequestEntry<T>>();

  reserve(key: string): void {
    if (!this.entries.has(key)) {
      this.entries.set(key, createEntry<T>());
    }
  }

  getState(key: string): StoryAssetImageRequestState | null {
    return this.entries.get(key)?.state ?? null;
  }

  request(key: string, executor: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing) return existing.promise;
    return this.start(key, executor);
  }

  start(key: string, executor: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(key) ?? createEntry<T>();
    if (!this.entries.has(key)) {
      this.entries.set(key, entry);
    }
    if (entry.state === "running") return entry.promise;

    entry.state = "running";
    void executor().then(
      (value) => {
        if (this.entries.get(key) === entry) {
          this.entries.delete(key);
        }
        entry.resolve(value);
      },
      (error: unknown) => {
        if (this.entries.get(key) === entry) {
          this.entries.delete(key);
        }
        entry.reject(error);
      },
    );
    return entry.promise;
  }
}
