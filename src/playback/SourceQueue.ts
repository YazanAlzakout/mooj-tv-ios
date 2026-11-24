/**
 * 2026-11-25: source changes used to race background timers, retries and
 * navigation. Only one native replacement may run at a time. A newer intent
 * suppresses queued stale work and prevents late completions from playing.
 * No URL or native error is logged here: sources may contain credentials.
 */
export class SourceQueue<Source> {
  private tail: Promise<void> = Promise.resolve();
  private revision = 0;
  private active = true;
  private replace: (source: Source) => Promise<void>;

  constructor(replace: (source: Source) => Promise<void>) {
    this.replace = replace;
  }

  activate(): void { this.active = true; }
  dispose(): void { this.active = false; this.revision += 1; }

  async change(source: Source, onReady?: () => void): Promise<boolean> {
    const revision = ++this.revision;
    const current = () => this.active && revision === this.revision;
    const operation = this.tail.then(async () => {
      if (!current()) return false;
      try {
        await this.replace(source);
      } catch (error) {
        if (current()) throw error;
        return false;
      }
      if (!current()) return false;
      onReady?.();
      return true;
    });
    // Rejection belongs to this caller, never poisons the next command.
    this.tail = operation.then(() => {}, () => {});
    return operation;
  }
}
