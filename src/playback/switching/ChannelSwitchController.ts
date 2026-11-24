export interface ChannelSwitchTarget {
  id: string;
  /** Ordered URL shapes to try for this channel, best first — see `buildLiveStreamCandidates`. */
  streamUrlCandidates: string[];
}

type CommitFn = (
  target: ChannelSwitchTarget,
  generation: number,
  /** True once a newer select() has superseded this generation. */
  isStale: () => boolean
) => void;

const DEFAULT_DEBOUNCE_MS = 180;

/**
 * Owns all live-channel switching. UI code must never call
 * player.replaceAsync directly — it goes through here so that:
 *  - rapid/repeated selections coalesce into one commit (trailing debounce)
 *  - a slow commit for an old selection can never clobber a newer one
 *    (generation token, checked again after any async work completes)
 *  - there is no unbounded queue: only the latest target survives
 */
export class ChannelSwitchController {
  private readonly debounceMs: number;
  private readonly onCommit: CommitFn;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private latestTarget: ChannelSwitchTarget | null = null;

  constructor(onCommit: CommitFn, debounceMs: number = DEFAULT_DEBOUNCE_MS) {
    this.onCommit = onCommit;
    this.debounceMs = debounceMs;
  }

  /** Returns the generation token for this selection (for immediate UI feedback). */
  select(target: ChannelSwitchTarget): number {
    this.latestTarget = target;
    this.generation += 1;
    const generation = this.generation;

    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.latestTarget && generation === this.generation) {
        this.onCommit(this.latestTarget, generation, () => this.isStale(generation));
      }
    }, this.debounceMs);

    return generation;
  }

  /** A generation is stale once a newer select() has happened. */
  isStale(generation: number): boolean {
    return generation !== this.generation;
  }

  currentGeneration(): number {
    return this.generation;
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
