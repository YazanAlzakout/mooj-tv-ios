# Architecture — as of Milestone 1

This reflects only what exists right now (bootstrap + player spike). Most of the module tree
described in the master build prompt does not exist yet and will grow milestone by milestone —
this file gets updated as that happens, not written speculatively in advance.

```text
src/
  app/                          expo-router routes
    _layout.tsx                 root Stack, splash handling
    index.tsx                   Milestone-1-only provider config screen (in-memory, no persistence)
    player-spike.tsx            the PlayerSpike screen (Milestone 1 deliverable)

  domain/
    provider/types.ts           XtreamProviderConfig, LiveChannel — normalized, provider-agnostic

  providers/
    xtream/xtreamAdapter.ts     the only code that knows Xtream's player_api.php JSON shapes

  playback/
    switching/ChannelSwitchController.ts   debounce + generation-token channel switching
    diagnostics/PlayerLifecycleMonitor.ts  dev-only lifecycle counters (see docs/PLAYBACK.md)

  core/
    network/fetchJson.ts        timeout/abort-aware fetch + credential-redacting URL logging
    errors/PlaybackError.ts     error categorization (heuristic for now — see docs/PLAYBACK.md)

  state/
    spikeSessionStore.ts        Milestone-1-only handoff between the two screens
```

## Boundaries that matter

- **No screen constructs a raw Xtream URL.** `xtreamAdapter.ts` is the only file that knows
  `player_api.php`, `get_live_streams`, etc. Screens only see `LiveChannel` / `XtreamProviderConfig`
  from `domain/provider/types.ts`.
- **No screen calls `player.replaceAsync` directly.** All channel switching goes through
  `ChannelSwitchController`, which owns the debounce and generation-token logic that the master
  prompt's Milestone 1 hard rule requires. See docs/PLAYBACK.md.
- **`PlayerLifecycleMonitor` is a singleton, not per-screen state.** It exists to make the "the
  player was never reconstructed" claim independently verifiable (it counts constructions,
  releases, replace requests/commits, first-frame events, buffering transitions, and errors)
  rather than asserted.

## Explicitly not yet built

Onboarding, multi-provider management, SQLite/SecureStore persistence, the design system, EPG,
VOD/series, downloads, settings, and TV space-navigation are all out of scope until their
respective milestones. `src/app/index.tsx` is a throwaway credential form, not the real
onboarding flow.
