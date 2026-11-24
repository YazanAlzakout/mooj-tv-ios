# iPhone parity and release acceptance

Status recorded 2026-11-25. UI/data implementation is retained from the source
baseline. Every device check below is **pending**; none is claimed passed by
TypeScript or JavaScript export. Test both Arabic/RTL and English/LTR, dark and
light themes, and a notched iPhone in portrait and landscape.

| Feature | Source in new project | Device acceptance |
| --- | --- | --- |
| Startup, logo, onboarding, session restore | `src/app/index.tsx`, `onboarding.tsx`, `_layout.tsx` | Cold launch, denied/corrupt stored session, no stuck splash |
| Provider management and secure login | `providers.tsx`, `add-provider.tsx`, `src/providers` | Add/switch/remove provider; credentials only in SecureStore |
| Home and category browsing | `src/app/(tabs)` | Same cards, tabs, category selection and scrolling |
| Search | `src/app/search.tsx` | Movies, series and channels; empty and error states |
| Movie and series details | `src/app/movies/details`, `src/app/series/details` | Artwork, metadata, seasons, episode list, actions |
| Favorites, watch later and history | `src/app/library`, `history.tsx` | Add/remove, reopen, persist across cold start |
| Live television and guide | `src/app/live/player`, `src/playback/engine` | TS/HLS supported by provider; switch 30 channels; recover interruption |
| Movie/episode playback | `src/app/movies/player`, `src/app/series/player` | MP4/HLS and provider formats; no unsupported-format promises |
| Seeking and speed | `src/playback/usePlaybackSeek.ts`, `usePlaybackSpeed.ts` | Seek forward/back 30 times at 0.5x/1x/1.25x/1.5x/2x; replay recording scenario |
| Track selection | `src/playback/TrackSelectorModal.tsx` | Alternate audio, subtitles on/off, unsupported track fallback |
| Resume | `src/playback/useWatchProgress.ts` | Fast network/slow disk and slow network/fast disk; position restored once |
| Next/previous and autoplay | `src/app/series/player` | Double taps, season boundaries, countdown cancel, no overlapping streams |
| Rotation and safe areas | `useFullscreenOrientation.ts`, controls | Controls reachable around notch; return to browsing; repeat 20 times |
| Background preference | `useVodSession.ts`, `useBackgroundPlayback.ts` | Preference on/off; lock, home, Control Center, fast foreground return |
| PiP | Existing VOD VideoView capability | Physical device test; VLC live adapter has no PiP implementation |
| Settings and language | `settings.tsx`, `src/core/i18n` | All retained preferences, category visibility, themes |
| Downloads | `src/domain/downloads/eligibility.ts` | Remains disabled on iOS, matching upstream iOS behavior |
| Legal/privacy/licences | `privacy.tsx`, `legal.tsx`, `licences.tsx` | Links and readable pages |

## Exit criteria

Record device model, iOS version, app build number, source commit and pass/fail
for every row. Use authorized test streams; do not commit URLs containing
credentials. Exercise offline/reconnect and expired-login cases without
request bursts. Run a 30-minute playback/seek/speed soak and record memory and
native crash reports. A simulator compilation proves only that the native
project compiles. A signed IPA proves only that it is signed. Neither closes
these checks.

## Recorded regression evidence

The supplied video shows an iOS process crash around 70 seconds after scrubbing
and changing playback speed. Causality is unconfirmed without the crash report.
The new queue protects async lifecycle ordering; it is not evidence that the
native crash is fixed. Capture any `.ips` report and symbolicate it with the
matching build's dSYM before changing native codecs based on speculation.
