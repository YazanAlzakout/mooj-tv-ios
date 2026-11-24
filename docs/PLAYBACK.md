# Playback architecture — Milestone 1 (PlayerSpike)

## The hard rule this milestone exists to prove

> A normal live channel change must NOT destroy and reconstruct the native VideoPlayer object.

`src/app/player-spike.tsx` creates exactly one player for the screen's lifetime:

```ts
const player = useVideoPlayer(null, () => PlayerLifecycleMonitor.playerConstructed());
```

`source` is never passed to `useVideoPlayer` again after this call. Every later channel change
goes through `player.replaceAsync(...)` on this same instance. `PlayerLifecycleMonitor.playerConstructions`
should read `1` for the entire session, no matter how many channels get selected — that counter
is the falsifiable claim, not a comment asserting it.

## Why imperative replaceAsync only (never state-driven source)

Two different ways of changing a video's source can both look correct in isolation and crash
when combined: driving the source through `useVideoPlayer(source, ...)`'s first argument (which
recreates/releases the underlying native object when `source` changes) and *also* calling
`replaceAsync` imperatively. Mixing them risks a callback firing against an already-released
`SharedObject` ("Cannot use shared object that was already released"). This project's rule:
**exactly one owner of source changes — `replaceAsync` on the persisted player, full stop.**
`useVideoPlayer`'s source argument is fixed at `null` forever.

## The switching pipeline

```
UI tap → selectChannel()
           → PlayerLifecycleMonitor.channelSelected(id)   [immediate UI feedback]
           → controller.select({ id, streamUrl })
                → generation += 1
                → (re)start a 180ms debounce timer
                → [180ms of silence later] onCommit(target, generation, isStale)
                     → PlayerLifecycleMonitor.sourceReplaceRequested()
                     → player.replaceAsync({ uri })
                          → on success: if isStale() return; else sourceReplaceCommitted() + player.play()
                          → on failure: if isStale() return; else errorOccurred(message)
```

`ChannelSwitchController` (src/playback/switching/ChannelSwitchController.ts) owns all of this.
No other code calls `player.replaceAsync` directly. Its two defenses:

1. **Trailing debounce (180ms).** Only the last selection within any 180ms burst reaches
   `replaceAsync` at all — this is what keeps 20 rapid taps from becoming 20 replace calls.
2. **Generation token.** Every `select()` call bumps a counter. The debounce timer only fires
   the commit if its captured generation still matches the controller's current generation when
   the timer elapses, and the `isStale()` closure handed to the commit callback lets it re-check
   *after* the `await`, so a slow `replaceAsync` for an old selection can't overwrite diagnostics
   for a channel the user has since moved away from.

## Known gap: no cancellation of an in-flight replaceAsync

`VideoPlayer.replaceAsync` returns a `Promise<void>` with no cancellation handle. If a user
selects channel A, the debounce fires and `replaceAsync(A)` starts, and — before it resolves —
selects channel B outside the 180ms window (so B gets its own debounce + `replaceAsync(B)` call
while A's is still in flight), there are now two concurrent native replace calls. The generation
check stops the *stale* one from corrupting `committedChannelId`/diagnostics, but it cannot force
the native layer to apply B after A if A's promise happens to resolve later. This is a real gap,
not a hypothetical — it needs a dedicated spam-test scenario on a physical device (see the
Milestone 1 real-device test procedure) rather than being assumed away.

## First-frame latency

Measured via `VideoView`'s `onFirstFrameRender` callback (confirmed in the installed expo-video
57.0.3 type definitions — not a native `firstFrame` player event, which doesn't exist) relative
to `PlayerLifecycleMonitor`'s `committedAtMs` for the most recent commit. This is a proxy, not a
GPU-verified timestamp; treat it as directionally useful for comparing channels/runs, not as a
lab-grade measurement.

## Buffering

Approximated from `statusChange`'s `status === 'loading'` vs. not. expo-video doesn't expose a
dedicated boolean buffering property; this proxy is good enough to prove the "no listener churn"
requirement but should be revisited once real playback error samples exist (Milestone 4).

## Error categorization

`core/errors/PlaybackError.ts` does keyword-heuristic categorization (timeout, 401/403, 404,
"decod", "parse") against whatever `PlayerError.message` / fetch failure text is available. This
is explicitly a placeholder — the master prompt is clear that "do not label every error MP2 (or
anything else) is not acceptable, and the real taxonomy needs real error samples from the
Milestone 4 codec probe against the user's actual provider.
