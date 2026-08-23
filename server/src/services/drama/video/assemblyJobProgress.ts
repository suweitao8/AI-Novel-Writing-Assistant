export type DramaAssemblyPhase = "prepare" | "audio" | "render" | "mux" | "done";

export interface DramaAssemblyPhaseTimings {
  prepareMs?: number;
  audioMs?: number;
  renderMs?: number;
  muxMs?: number;
  totalMs?: number;
}

export interface DramaAssemblyProgressState {
  done: number;
  phase: DramaAssemblyPhase;
  timings?: DramaAssemblyPhaseTimings;
}

/**
 * Serializes progress persistence while independent preparation workers finish
 * out of order. Phase timing is diagnostic-only and never influences media time.
 */
export class DramaAssemblyProgressTracker<Progress extends DramaAssemblyProgressState> {
  private readonly startedAt: number;
  private activePhase: DramaAssemblyPhase;
  private phaseStartedAt: number;
  private writeChain = Promise.resolve();

  constructor(
    readonly progress: Progress,
    private readonly persist: (snapshot: Progress) => Promise<void>,
    private readonly now: () => number = Date.now,
  ) {
    this.startedAt = this.now();
    this.activePhase = progress.phase;
    this.phaseStartedAt = this.startedAt;
  }

  incrementDone(): void {
    this.progress.done += 1;
    void this.enqueue();
  }

  async transition(phase: DramaAssemblyPhase): Promise<void> {
    if (phase === this.activePhase) {
      return;
    }
    this.completeActivePhase();
    this.activePhase = phase;
    this.phaseStartedAt = this.now();
    this.progress.phase = phase;
    await this.enqueue();
  }

  finish(): void {
    this.completeActivePhase();
    this.progress.timings ??= {};
    this.progress.timings.totalMs = Math.max(0, this.now() - this.startedAt);
  }

  enqueue(): Promise<void> {
    const snapshot = cloneProgress(this.progress);
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(() => this.persist(snapshot))
      .catch(() => undefined);
    return this.writeChain;
  }

  async flush(): Promise<void> {
    await this.writeChain;
  }

  private completeActivePhase(): void {
    if (this.activePhase === "done") {
      return;
    }
    const elapsedMs = Math.max(0, this.now() - this.phaseStartedAt);
    this.progress.timings ??= {};
    if (this.activePhase === "prepare") this.progress.timings.prepareMs = elapsedMs;
    if (this.activePhase === "audio") this.progress.timings.audioMs = elapsedMs;
    if (this.activePhase === "render") this.progress.timings.renderMs = elapsedMs;
    if (this.activePhase === "mux") this.progress.timings.muxMs = elapsedMs;
  }
}

function cloneProgress<Progress extends DramaAssemblyProgressState>(progress: Progress): Progress {
  return JSON.parse(JSON.stringify(progress)) as Progress;
}
