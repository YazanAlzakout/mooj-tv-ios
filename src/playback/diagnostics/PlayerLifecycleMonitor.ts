import { useSyncExternalStore } from "react";

export interface PlayerLifecycleSnapshot {
  playerConstructions: number;
  playerReleases: number;
  sourceReplaceRequests: number;
  sourceReplaceCommits: number;
  firstFrameEvents: number;
  errors: number;
  bufferingTransitions: number;

  selectedChannelId: string | null;
  committedChannelId: string | null;
  selectedAtMs: number | null;
  committedAtMs: number | null;
  lastFirstFrameLatencyMs: number | null;
  isBuffering: boolean;
  lastErrorMessage: string | null;
}

const emptySnapshot: PlayerLifecycleSnapshot = {
  playerConstructions: 0,
  playerReleases: 0,
  sourceReplaceRequests: 0,
  sourceReplaceCommits: 0,
  firstFrameEvents: 0,
  errors: 0,
  bufferingTransitions: 0,
  selectedChannelId: null,
  committedChannelId: null,
  selectedAtMs: null,
  committedAtMs: null,
  lastFirstFrameLatencyMs: null,
  isBuffering: false,
  lastErrorMessage: null,
};

/**
 * Development-only counters proving the Milestone 1 hard rule: a normal
 * channel change must not reconstruct the native player. Every screen that
 * creates a player, replaces its source, or observes playback events should
 * report into this singleton so the PlayerSpike diagnostics panel reflects
 * the whole session, not just one component's view of it.
 */
class PlayerLifecycleMonitorImpl {
  private snapshot: PlayerLifecycleSnapshot = { ...emptySnapshot };
  private listeners = new Set<() => void>();
  private notifyScheduled = false;

  getSnapshot = (): PlayerLifecycleSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  reset(): void {
    this.snapshot = { ...emptySnapshot };
    this.emit();
  }

  playerConstructed(): void {
    this.patch({ playerConstructions: this.snapshot.playerConstructions + 1 });
  }

  playerReleased(): void {
    this.patch({ playerReleases: this.snapshot.playerReleases + 1 });
  }

  channelSelected(channelId: string): void {
    this.patch({ selectedChannelId: channelId, selectedAtMs: Date.now() });
  }

  sourceReplaceRequested(): void {
    this.patch({ sourceReplaceRequests: this.snapshot.sourceReplaceRequests + 1 });
  }

  sourceReplaceCommitted(channelId: string): void {
    this.patch({
      sourceReplaceCommits: this.snapshot.sourceReplaceCommits + 1,
      committedChannelId: channelId,
      committedAtMs: Date.now(),
    });
  }

  firstFrame(): void {
    const latency =
      this.snapshot.committedAtMs !== null ? Date.now() - this.snapshot.committedAtMs : null;
    this.patch({
      firstFrameEvents: this.snapshot.firstFrameEvents + 1,
      lastFirstFrameLatencyMs: latency,
    });
  }

  bufferingChanged(isBuffering: boolean): void {
    if (isBuffering === this.snapshot.isBuffering) return;
    this.patch({
      isBuffering,
      bufferingTransitions: this.snapshot.bufferingTransitions + 1,
    });
  }

  errorOccurred(message: string): void {
    this.patch({ errors: this.snapshot.errors + 1, lastErrorMessage: message });
  }

  private patch(partial: Partial<PlayerLifecycleSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.emit();
  }

  /**
   * The snapshot is replaced synchronously (so `getSnapshot()` is correct
   * the instant an event is reported), but subscribers are notified one
   * microtask later, coalesced.
   *
   * That deferral is not an optimisation — it is required. `useVideoPlayer`
   * runs its `setup` callback inside `useReleasingSharedObject`, i.e.
   * during the **render** phase, and that callback is where screens report
   * `playerConstructed()`. Notifying a `useSyncExternalStore` subscriber
   * from there means scheduling a React update while React is rendering a
   * different component, which React rejects outright — it crashed the
   * live player and the spike screen as soon as the diagnostics panel was
   * subscribed. Deferring past the synchronous render keeps this singleton
   * safe to call from anywhere, which is the only sane contract for a
   * fire-and-forget diagnostics sink.
   */
  private emit(): void {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      for (const listener of this.listeners) listener();
    });
  }
}

export const PlayerLifecycleMonitor = new PlayerLifecycleMonitorImpl();

export function usePlayerLifecycleSnapshot(): PlayerLifecycleSnapshot {
  return useSyncExternalStore(
    PlayerLifecycleMonitor.subscribe,
    PlayerLifecycleMonitor.getSnapshot,
    PlayerLifecycleMonitor.getSnapshot
  );
}
