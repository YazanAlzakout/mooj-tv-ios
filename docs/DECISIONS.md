# Decisions log

## This project vs. the old app (`albasera-replit`)

This is a from-scratch codebase in its own folder/repo. `albasera-replit` (sibling folder) is
consulted **read-only** as reference for known features, bugs, API behavior, and lessons learned
— never copied for architecture or code. Two facts were carried forward as verified compatibility
knowledge, not architecture:

1. **expo-video SharedObject lifecycle rule.** The old project's `.agents/memory/expo-video-shared-objects.md`
   documents a real crash class: mixing state-driven source replacement with imperative retries on
   the same player leaves callbacks pointing at a released native object
   ("Cannot use shared object that was already released"). This project's rule (see
   docs/PLAYBACK.md) — exactly one owner of source changes, always `replaceAsync` on the persisted
   player — is a direct response to that, independently re-derived against the actual
   Milestone 1 hard rule rather than copied as-is.
2. **No local Android SDK in this environment.** `.agents/memory/native-android-build-verification.md`
   records that this workspace has Java/Gradle but no `ANDROID_HOME`, so local Gradle stops at SDK
   discovery. Confirmed still true here. Verification boundary for every native-facing milestone:
   `expo prebuild` (config plugins, manifest, gradle.properties) runs and is checked locally;
   actual APK/AAB compilation needs EAS Build or a machine with the Android SDK installed.

`.npmrc`'s `legacy-peer-deps=true` mirrors the old project's own fix for the same npm ERESOLVE
issue — verified independently against a fresh `npm install` here (see docs/DEPENDENCIES.md), not
copied blind.

## Package id — replaces the existing listing (decided 2026-08-31)

> **SUPERSEDED for this project — do not act on this section.** It was written
> for the player Mooj TV was cloned from, and it survived the clone. Mooj TV is
> a **new listing** under **`com.moojtv.player`**, signed with **its own key**
> (`MOOJ_UPLOAD_*`, `CN=Mooj TV`), and it replaces nothing. `brand.config.js`
> and `app.config.js` are the authority; `docs/RELEASE.md` is the runbook.
>
> Following the text below points `MOOJ_UPLOAD_STORE_FILE` at the other app's
> keystore. Every check still passes — `tools/verify-brand.js` compares
> property *names*, not which key signed the artifact — and the first upload
> then locks the wrong upload key to `com.moojtv.player`, permanently. Kept
> here only because the reasoning about ids and signing identity is sound in
> general, and because deleting it would lose why the rule exists.
> (Marked 2026-11-14, from the pre-release audit.)

This app will eventually replace the live Google Play listing, keeping `com.albasera.player` and
its existing signing identity at release time (master prompt §36).

**Resolved 2026-09-04.** The dev placeholder `com.albasera.player2.dev` is gone;
`app.config.js` now ships the live id `com.albasera.player`. This release replaces the existing
Play listing rather than going out as a new one, and a package id is the app's identity on Play —
it cannot be changed after publication, so it has to match.

Two consequences of that decision:

- **The signing identity must match too.** An update signed with a different key is rejected by
  Play outright, and there is no recovery except a new listing. Either the original keystore or,
  if the listing is enrolled in Play App Signing, an upload key Google already accepts.
- **`versionCode` is now explicit in `app.config.js`.** The published app left it to EAS
  (`appVersionSource: "remote"` with `autoIncrement`), so the real number lives on EAS's servers,
  not in either repository — the `1` the old repo generates locally means nothing. This project
  builds natively, so nothing increments it any more; it is read from Play Console and bumped by
  hand. Phone and TV take adjacent numbers (`VERSION_CODE_BASE` and `+1`) because they are two
  artifacts under one package id, and Play refuses two artifacts sharing a versionCode.

Note that a side-by-side install with the old app is no longer possible — same package id means
an install replaces it. The old app remains available as source at its own path for reference.

What does *not* collide on update: the published app stores everything in AsyncStorage and
SecureStore under `xtream_credentials`, and has no SQLite database at all, while this app uses
SQLite plus per-provider SecureStore keys (`provider-credentials-<id>`). Nothing is read back
under a name the other side wrote, so an updating user gets a clean install rather than a
half-migrated one — at the cost of re-entering their provider once.

## No VLC

> **Still true of Android. No longer true of the project.** Media3/expo-video is the only
> Android playback engine, and `react-native.config.js` now keeps it that way deliberately by
> excluding the libVLC package from Android autolinking entirely — the Android build and the
> Android artifact are untouched. But the project does carry a libVLC dependency as of
> 2026-11-18: `@lunarr/vlc-player`, on Apple platforms only, because AVFoundation refuses this
> provider's channels. The second sentence below is the one that stopped being true. Read "A
> second live-playback engine on Apple platforms" at the end of this log before acting on it.
> (Marked 2026-11-18.)

Per explicit instruction and the master prompt's own rule: Media3/expo-video is the only Android
playback engine. No libVLC dependency exists in this project.

## FFmpeg MP2 decoder extension, ported from `albasera-replit` (resolved 2026-09-01)

The MP2 audio codec question (deferred above) got answered earlier than planned: real-device
Milestone 1 testing showed picture with no sound on the test provider. Investigated with a
custom MPEG-TS/PMT parser (no `ffprobe` in this dev environment) — confirmed the channel is
H.265 video + MPEG-1 Layer II (MP2) audio (see docs/CODEC_MATRIX.md). Stock Media3 has no MP2
decoder on Android, so video renders and audio silently doesn't.

`albasera-replit` had already solved exactly this (`modules/decoder-ffmpeg-mp2`,
`plugins/withDecoderFfmpegMp2.js`, `patches/expo-video+3.0.16.patch` — see its own commits
"Vendor built FFmpeg MP2 decoder libraries" and "Remove VLC entirely — Media3 + FFmpeg MP2
decoder is the only Android engine"), including prebuilt native libs, so this was **ported as a
proven working asset** per this project's own rule of engagement, not re-derived from scratch:

- `modules/decoder-ffmpeg-mp2/` copied as-is (the vendored androidx/media `decoder_ffmpeg`
  module, Apache 2.0 wrapper + prebuilt FFmpeg static libs for `arm64-v8a`/`armeabi-v7a`; see
  docs/THIRD_PARTY_LICENSES.md). Its `build.gradle` bumped from Media3 `1.8.0` to `1.9.0` to
  match this project's `expo-video` version — the old project's pin was for its own older
  `expo-video@3.0.16`.
- `plugins/withDecoderFfmpegMp2.js` copied as-is and registered in `app.config.js` — it just
  points generated Gradle at the module's stable repo path, doesn't copy files.
- The **conceptual** fix from `patches/expo-video+3.0.16.patch` was re-applied by hand (not the
  literal patch file — expo-video's versioning scheme changed between the old project's SDK and
  this one's SDK 57, so line numbers don't line up) against the current `expo-video@57.0.3`
  source, then regenerated as `patches/expo-video+57.0.3.patch` via `patch-package`:
  `implementation project(':decoder-ffmpeg-mp2')` in expo-video's `android/build.gradle`, and
  `.setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)` on
  `VideoPlayer.kt`'s `DefaultRenderersFactory` — `ON`, not `PREFER`, so hardware MediaCodec stays
  primary for every format it already handles (video included) and the FFmpeg renderer is only a
  fallback. The old patch's third file (an `isSupported` field added to the JS-visible
  `AudioTrack` type) was **not** ported — a diagnostic nicety, not required for the fix, left for
  later if wanted.
- `package.json` gained `"postinstall": "patch-package"` so the patch reapplies after any future
  `npm install` (matches the old project's own convention for this exact problem).

**Not yet verified on a physical device** — this needs a native rebuild (this environment can't
run Gradle itself; see the "No local Android SDK" / Windows Gradle-daemon notes above) and a
real-device retest of the same channel that was silent before.

## react-native-tvos pinned via dist-tag, not an exact version

`"react-native": "npm:react-native-tvos@0.86-stable"` rather than a pinned exact version. This
matches Expo's own documented "Building for TV" guidance and lets the dependency pick up new
tvOS patch releases for SDK 57's react-native line automatically. See docs/DEPENDENCIES.md for
why the resolved version (0.86.2-0) is one patch behind Expo's bundled stock react-native
(0.86.3), and why that's expected rather than a bug.

## FFmpeg MP2 module dependency declared on `:app`, not just inside expo-video (resolved 2026-09-01)

The first two on-device rebuilds after porting `modules/decoder-ffmpeg-mp2` (see above) still had
silent audio — verified directly, not assumed: extracted both the first "successful" build's APK
and a genuinely from-scratch clean rebuild (`rmdir android` + fresh `expo run:android`, zero
project-local Gradle cache), and `lib/arm64-v8a/libffmpegJNI.so` was absent from both, with no
`.cxx` build directory ever created for the module and zero mentions of "ffmpeg" or
"decoder-ffmpeg-mp2" anywhere in either build's full log.

Root cause, found by inspecting `@expo/cli`'s own gradle-invocation source
(`node_modules/@expo/cli/build/src/start/platforms/android/gradle.js`): `expo run:android`
hardcodes the Gradle `--configure-on-demand` flag on every invocation. Configuration-on-demand
configures a project only if it can statically detect that the requested build target depends on
it — and it failed to detect the dependency edge declared *inside `expo-video`'s own
`build.gradle`* (added via `patches/expo-video+*.patch`, since expo-video itself is pulled in
through Expo's autolinking settings plugin, not a plain static `include`). This matches Gradle's
own documented caveat that configuration-on-demand can miss dependencies that aren't declared
directly on statically-included projects.

Fix: `plugins/withDecoderFfmpegMp2.js` now *also* injects
`implementation project(':decoder-ffmpeg-mp2')` directly into `android/app/build.gradle`'s own
`dependencies {}` block (via `withAppBuildGradle`), not only into expo-video's. `:app` is always
the requested build target, so configure-on-demand always configures it fully and reliably picks
up the dependency from there. This works regardless of which module declares it because Media3's
extension-renderer discovery (`DefaultRenderersFactory` + `EXTENSION_RENDERER_MODE_ON`) resolves
`FfmpegAudioRenderer` via reflection over whatever ends up on `:app`'s final runtime classpath —
it doesn't care which Gradle module contributed it. The expo-video patch's own dependency line
was left in place (harmless, belt-and-suspenders).

This got the `.so` bundled into the APK (verified) and the module's Java classes into the dex
(verified) — but a real-device retest still had silent audio, with **zero** trace of
`libffmpegJNI.so` ever being loaded (`/proc/<pid>/maps` had no entry for it) and no
`FfmpegLibrary`/`DefaultRenderersFactory` log activity at all. See the next entry — there was a
second, more fundamental problem underneath this one.

## The real root cause: expo-video ships a precompiled AAR, so the patch was never read (resolved 2026-09-01)

Same investigation, one layer deeper — and this time not re-derived from scratch. The user
pointed out that `albasera-replit` had already hit and solved this *exact* problem, so its git
history was read directly instead of re-diagnosing blind (`git log --oneline --all | grep -i
ffmpeg`, then `git show` on the matching commits). It had:

- `ef6bc5e Found the real cause of the Gradle mystery: expo-video ships a precompiled AAR`
- `8f8a642 Fix androidx.annotation version conflict now that expo-video builds from source`
- `d146e90 Fix FFmpeg decoder name: build "mp3" not "mp2" for MP2 audio support`
- `edbc79c Restrict decoder-ffmpeg-mp2's native build to arm64-v8a + armeabi-v7a`

`ef6bc5e`'s finding: `expo-modules-autolinking` only points Gradle at
`node_modules/<pkg>/android` as a real source subproject when the module has no `publication`
entry. expo-video *does* have one (a prebuilt AAR published under `host.exp.exponent`) — so by
default Gradle links against that prebuilt AAR and **never evaluates
`node_modules/expo-video/android/build.gradle` at all**, patched or not. This is exactly why the
`:app`-level dependency fix above got the `.so` bundled (that's a separate, always-from-source
module) while `VideoPlayer.kt`'s patched `setExtensionRendererMode` call still never ran — the
class Media3 actually loaded was the AAR's original *unpatched* compiled version.

Fix: `expo.autolinking.buildFromSource: ["expo-video"]` in `package.json`, the documented escape
hatch `SettingsManager.configurePublication()` checks to force `shouldUsePublication = false`.
Verified directly, not assumed: `npx expo-modules-autolinking resolve --platform android --json`
shows `"configuration": {"buildFromSource": ["expo-video"]}` before it's applied to anything else.

The other three commits above were pre-emptively checked against this project rather than
re-discovered the hard way:
- androidx.annotation pinned without an explicit version in
  `modules/decoder-ffmpeg-mp2/android/build.gradle` — already correct (ported from the fixed
  state, not the broken one).
- ABI filters already scoped to `armeabi-v7a`/`arm64-v8a` — already correct, same reason.
- FFmpeg decoder name — verified directly by extracting printable strings from the vendored
  `libavcodec.a` itself (no `strings` binary in this environment, so read as a buffer in Node and
  regex-matched instead): the embedded configure invocation shows `--enable-decoder=mp3`, and the
  `ff_mp3_decoder` symbol is present. The vendored binary already reflects the fix.

**Verified on-device 2026-09-01.** Clean rebuild (`rmdir android` + fresh `expo run:android`),
fresh install, real playback of `264311` (`KU: NRT 3 HD`, the channel confirmed MP2-only in
docs/CODEC_MATRIX.md). Logcat showed exactly the two lines that matter, in order:

```
I DefaultRenderersFactory: Loaded FfmpegAudioRenderer.
D nativeloader: Load .../lib/arm64-v8a/libffmpegJNI.so using class loader ... ok
```

And confirmed by ear on the physical device: audio audible, in sync with video. Milestone 1's
silent-audio problem is closed.

## Live-stream container: `.ts` only, not `.m3u8` (revised 2026-09-01)

Reverses the earlier "prefer `.m3u8`" decision above — with evidence, not a second guess. While
debugging the silent-audio issue, `.m3u8` playback on the real test provider logged recurring
`PesReader: Unexpected start code prefix` warnings from Media3's own MPEG-TS extractor,
recurring at almost exactly each ~10s HLS segment boundary — a demuxing problem, confirmed to
happen *before* any decoder/renderer selection, unrelated to the MP2/AAR issues above. Switching
`resolveContainerExtension` to always return `"ts"` and reloading showed no such warnings on the
same channels. `allowed_output_formats` is kept as a function parameter (prefixed `_`, unused)
rather than removed, in case a future provider makes `.m3u8` the only option and this needs
revisiting per-server instead of globally.

## Live-stream container: prefer `.m3u8`, fall back to `.ts` (resolved 2026-08-31)

`xtreamAdapter.resolveContainerExtension` picks `.m3u8` when the authenticated session's
`allowed_output_formats` includes it, otherwise `.ts`. Verified against the real test provider
(`albasera-tv.net`) rather than assumed: `allowed_output_formats` returned
`["m3u8", "ts", "rtmp"]`, and both `.../264311.ts` (200, `video/mp2t`) and `.../264311.m3u8`
(200, `application/x-mpegurl`, a real HLS playlist body) resolved correctly through the
`lb1.albasera-tv.net` load balancer. This satisfies the master prompt's "prefer HLS where
available" guidance with evidence instead of a guess.

## Provider persistence scope (Milestone 5/6, 2026-09-01)

Replaces the Milestone 1 throwaway `spikeSessionStore` (in-memory only, lost on app close) with
real persistence: a `providers` SQLite table (`src/db`) for provider metadata, SecureStore for
credentials (`src/core/storage/secureCredentials.ts`, never stored alongside metadata), and
`activeSessionStore` as the in-memory runtime cache of the currently-active provider's resolved
config + channel list. Deliberately scoped narrow for this round, matching what the master prompt
actually needs right now rather than building the full provider-management surface early:

- **Xtream Codes only.** Remote/local M3U provider support is deferred — `Provider.kind` is
  typed `"xtream"` only for now; widening it is a type change plus a new adapter, not a rewrite.
- **No legal/terms acceptance gate yet.** Deferred to whichever milestone the master prompt
  actually specifies it for; not blocking provider storage.
- **Add / switch / delete only — no edit.** Changing a saved provider's URL or credentials means
  deleting and re-adding it this round. An edit flow is a small additive change later, not a
  blocker now.
- **Startup gate always resolves.** `src/app/index.tsx` either restores a session and lands on
  `/home`, or falls through to `/providers` — silent-restore failure (revoked credentials,
  provider offline) is caught and routed to the provider list rather than left stuck on a spinner,
  so a saved-but-unreachable provider can never hard-lock the app.
- **Exactly one active provider.** `providerRepository.setActiveProvider` deactivates every other
  row inside the same transaction before activating the target — enforced in code, not by a
  unique constraint, since SQLite has no partial-unique-index shorthand worth the complexity here.

This milestone adds two new native modules (`expo-secure-store`, `expo-sqlite`) and needs a fresh
native rebuild before on-device verification: silent session restore across app restarts,
multi-provider add/switch, and delete-with-confirmation.

**Verified on-device 2026-09-01.** Fresh native rebuild, fresh install (empty `providers` table).
Confirmed on the real test provider (`albasera-tv.net:80`, 11,356 live channels):

- Cold start with no saved provider → startup gate falls through to `/providers` empty state,
  no hang.
- Add Provider → real Xtream auth + full channel fetch → saved to SQLite + SecureStore →
  landed on Home.
- Full process kill (`am force-stop`) + relaunch → startup gate silently re-authenticated and
  re-fetched all 11,356 channels with zero credential re-entry, landed directly on Home.
- Providers list shows the correct `Active` badge and a live-updating relative
  last-connected time.
- Delete confirmation dialog interpolates the provider name correctly; Cancel leaves the row
  untouched.
- Add Provider with an unroutable test address (`192.0.2.1`, TEST-NET-1) correctly surfaces
  the 10s `fetchJson` timeout as an inline error message without crashing or partially
  persisting a broken provider row.

## Live TV browsing scope (master prompt §19, 2026-09-01)

Replaces the Milestone-1 `player-spike` diagnostics list as the real entry point for Live TV
(Home's Live TV card now routes to `/live/index` instead of `/player-spike`, which stays on disk
as a dev/verification tool for future milestones). New screens: `src/app/live/index.tsx`
(categories), `src/app/live/[categoryId].tsx` (channel list), `src/app/live/player/[channelId].tsx`
(playback). The player screen reuses the exact stable-player + `ChannelSwitchController` engine
proven in Milestone 1 — no second implementation of source-replacement logic.

Categories and channel counts are derived from the already-in-memory `activeSessionStore.channels`
rather than a second network round-trip per category, per the performance rules in master prompt
§12. Categories with zero matching channels are hidden rather than shown as dead-end rows.

A new SQLite migration (`live_tv_state`, schema version 2) persists the last-opened category and
last-played channel id, satisfying the "remember" requirement structurally — but no resume-to-here
UI reads it back yet. That's deferred, along with:

- **Grid view.** List view only this round; a view-mode toggle is a small additive change later.
- **EPG title / next program.** No EPG data source exists yet (master prompt §20 is its own
  milestone); showing placeholder/fake programme data would violate the project's verify-don't-guess
  rule, so the channel row simply omits it for now.
- **Favorite state / toggle.** No Favorites system exists yet.
- **Hidden categories (per-user setting).** No Settings screen exists yet; every category with at
  least one channel is shown.

This mirrors the same narrow-and-honest scoping used for provider persistence — each deferred item
gets its own milestone rather than being faked or half-built here.

**Routing pitfall found and fixed.** The categories screen was originally `src/app/live/index.tsx`,
a sibling of the dynamic `src/app/live/[categoryId].tsx`. On the real device, navigating to
`/live/index` did not resolve to the index screen — it was consumed by `[categoryId]` with a
literal `categoryId` of `"index"`, landing on an empty channel list. Fixed by moving the categories
screen out to a flat `src/app/live-categories.tsx`, matching this app's existing flat top-level
route convention and removing the ambiguity entirely (the `live/` folder now holds only dynamic
routes). Worth remembering for any future folder that mixes an `index.tsx` with a `[param].tsx`
sibling.

**Verified on-device 2026-09-01.** Real test provider, no native rebuild needed (pure JS/TS
change). Confirmed: categories screen shows real category names and correct per-category counts
(e.g. "NILE SAT | منوعات" → 497); channel list shows real logos, names, LIVE badges, and search
box; tapping a channel plays real video within the existing single-player-instance engine; Prev/Next
zapping switches channels correctly; the known intermittent HTTP 403 (see below) surfaced as a
clean on-screen error and recovered on the next channel selection without a crash or player
reconstruction; back-navigation through categories → channel list → Home all work.

## EPG (master prompt §20) — built defensively, unverified against real data (2026-09-01)

Before writing any EPG code, checked all three standard Xtream EPG mechanisms against the real
test provider (`albasera-tv.net`):

- `get_live_streams` — every one of 11,356 channels has `epg_channel_id: null`.
- `get_short_epg?stream_id=264311&limit=4` — `{"epg_listings":[]}`.
- `xmltv.php` — returns valid XML, but only 42 `<channel>` entries (out of 11,356), every one with
  `id=""`, and zero `<programme>` elements anywhere in the document.

This provider has no usable EPG data through any of them. The old app (`albasera-replit`) never
implemented EPG either (`git log --grep=epg` and a full source grep both came back empty), so
there was no prior implementation or lesson to check against. Asked the user how to proceed;
chosen path: build the short-EPG layer defensively per the widely-documented Xtream API
convention, accept that it cannot be verified against a real populated response on this provider,
and lean on the "No EPG data" state (itself a master-prompt requirement) as the expected outcome
for now. XMLTV (the second, fuller layer) is not attempted — no evidence any available provider
actually populates it, and parsing it blind would be pure guesswork.

Implementation:
- [`src/providers/xtream/epgAdapter.ts`](../src/providers/xtream/epgAdapter.ts) — `getShortEpg()`,
  clearly commented as unverified. Timestamps are read from `start_timestamp`/`stop_timestamp`
  (unix epoch seconds, per convention) rather than the human-readable `start`/`end` strings, so
  provider/server timezone never has to be reasoned about — epoch is unambiguous by construction,
  satisfying the "correct timezone handling" requirement without needing real data to test it.
  Title/description are decoded via a hand-rolled base64 decoder
  ([`src/core/utils/base64.ts`](../src/core/utils/base64.ts)) rather than `Buffer`/`atob` — Hermes
  doesn't guarantee either global, and this project doesn't carry a `buffer` polyfill dependency.
  Any listing with a missing/nonsensical time range is dropped rather than shown broken.
- [`src/state/epgCache.ts`](../src/state/epgCache.ts) — per-channel cache with a 5-minute TTL (a
  starting value, not tuned against real traffic) and in-flight de-duplication, so a channel row
  and the player screen asking about the same channel never fire two requests. Exposes a shared
  `useNowTick()` clock (`useSyncExternalStore`, ticking every 60s) so every now/next computation
  and the player's progress bar read "the current time" without calling `Date.now()` during
  render — this project's ESLint config (React Compiler's purity rule) rejects that outright.
- Row-level "Now" title in the live channel list, and current-program title/time/progress bar in
  the player — both wired through `useEpgNowNext`, both gracefully render nothing when there's no
  data (which is what actually happens on our test provider, verified on-device: no layout jank,
  no crash, no broken UI element, list rows and player identical to before this change).
- EPG fetches are naturally scoped by relying on the channel list's existing `FlatList`
  virtualization (`windowSize`/`getItemLayout`) rather than a separate viewability tracker — only
  mounted rows call `useEpgNowNext`, so a 497-channel category never fires 497 requests at once.

**Re-verify the first time this runs against a provider that actually returns EPG listings** —
field names, the base64-encoding assumption, and the epoch-seconds assumption are all from public
Xtream API documentation/community convention, not confirmed against a live payload.

## Movies browsing (master prompt §21, 2026-09-01)

Verified the real Xtream VOD API against the test provider before writing any code (same
discipline as EPG, this time with real usable data):

- `get_vod_categories` — real, populated (dozens of categories, e.g. "ARABIC VOD", "NETFLIX VOD").
- `get_vod_streams` — 20,123 movies total across the catalog (~6MB, ~2s to fetch in one request),
  each with a real TMDB poster (`stream_icon`), and a real `rating` on 527/1085 sampled movies
  (the rest report `0`, i.e. genuinely unrated).
- `get_vod_info?vod_id=X` — real `plot`/`cast`/`director`/`duration` on many movies, but **no
  `genre` and no release date/year field on any of the ~6 movies sampled**. `MovieDetails`
  therefore has no genre/year fields at all — adding them and leaving them permanently empty would
  violate "do not fabricate metadata" in spirit even without inventing values.
- `movie/{username}/{password}/{stream_id}.{container_extension}` — confirmed 200 OK.

Scope for this pass, narrowed the same way as previous milestones:

- **Lazy-fetched VOD catalog, not prefetched at login.** Unlike live channels (already fetched at
  session-restore for the Home channel count), the VOD catalog is a second ~6MB payload — fetching
  both eagerly on every app start would roughly double startup cost for a section the user may
  never open. `src/state/vodStore.ts` fetches once on first visit to Movies and caches for the
  session; `activeSessionStore.setActiveSession`/`clearActiveSession` clear it automatically so a
  provider switch can never leak one provider's movies into another's.
- **Poster grid, not list** — this is the first real "grid" surface in the app (`FlatList`
  `numColumns={3}`), matching §21's explicit requirement (unlike Live TV, which stayed list-based
  per its own section).
- **Loading skeletons** are per-poster (a placeholder box shown until that image's own `onLoad`
  fires), not a full-screen skeleton — matches how much of the list is actually still loading.
- **VOD player uses native controls** (`nativeControls` on `VideoView`), not custom seek/scrub UI.
  Full custom Player UX (resume position, next-up, subtitles/audio-track pickers) is master prompt
  §24, its own milestone; building a one-off custom VOD control set now would be thrown away when
  that milestone lands. The player still goes through the same `toPlaybackError` categorization
  and shows a real error banner rather than a silent black screen.
  - Also architecturally different from the live player on purpose: VOD is one-shot (construct
    once, play once, screen unmounts when done), so `useVideoPlayer(source, ...)` is initialized
    directly with the real source rather than the `null` + `replaceAsync` pattern the live player
    uses. Verified in `expo-video`'s own source
    (`node_modules/expo-video/src/VideoPlayer.tsx`) that `useVideoPlayer` memoizes the player
    instance on the *stringified* source, so a stable URL across re-renders never triggers a
    reconstruction — the Milestone 1 "never reconstruct the player" hard rule is specifically
    about live channel switching, not about a VOD screen's one-time initial source, so this
    doesn't violate it.
- **Favorites / Watch Later omitted from the details screen entirely** rather than shown disabled
  — neither system exists yet anywhere in the app (Home's own Quick Actions still say "Coming
  soon" for both), so a button that does nothing would be worse than no button.
- Home's Movies card is wired to `/movies-categories` and shows a real count once the catalog has
  been fetched at least once this session (refreshed via `useFocusEffect` on every Home visit);
  shows "—" (not "Coming soon" — the feature isn't pending, just not counted yet) before that.

## Series browsing (master prompt §22, 2026-09-01)

Verified the real Xtream Series API before writing code (same discipline as Movies/EPG) —
notably richer than the VOD movie data on this same provider:

- `get_series_categories` / `get_series` — real, populated: 6,168 series total (~7MB, ~2s), and
  unlike movies, series list items **do** carry real `genre` and `releaseDate` on many entries
  (4/7 sampled), so `SeriesSummary` includes year/genre where movies' equivalent doesn't.
- `get_series_info?series_id=X` returns `{ seasons, info, episodes }` in **one call** — episodes
  for every season come back together, which is what satisfies "do not load details for 500
  episodes with hundreds of unnecessary network calls" structurally, not by extra engineering.
- Two real quirks found and handled defensively rather than assumed away:
  1. **`seasons[]` metadata can be empty while `episodes` still has real content** for that season
     number (series_id 6403: `seasons: []`, `episodes: {"1": [...10 episodes...]}`). The season
     list `src/providers/xtream/seriesAdapter.ts` builds is therefore always derived from the
     union of `episodes`' own keys and any `seasons[]` entries, never from `seasons[]` alone —
     `seasons[]` only supplies extra display metadata (name/overview/cover) when present.
  2. **Season `cover`/`cover_big` is sometimes just the TMDB base path with no image id**
     (`".../w600_and_h900_bestv2"`, no filename) — would 404 as an image. `validImageUrl()` drops
     anything not matching a real image-filename pattern rather than rendering a broken image.
- `series/{username}/{password}/{episode_id}.{container_extension}` — confirmed 200 OK (a
  different URL prefix than movies' `movie/...`, verified separately, not assumed to match).

Scope, narrowed the same way as Movies:

- **Lazy-fetched catalog** (`src/state/seriesStore.ts`), not prefetched at login — same reasoning
  as `vodStore.ts`. Both are cleared together by `activeSessionStore` on any session change.
- **Episode player passes `containerExtension` via route params from the details screen** instead
  of re-fetching `get_series_info` just to learn one field — Xtream has no "get one episode"
  endpoint, only the whole series, so refetching would mean pulling every episode of every season
  again just to play one. Same one-shot `useVideoPlayer(source, ...)` + native-controls pattern as
  the movie player, for the same reasons (documented there).
- **"Series Play" predictable rule, documented in code** (`firstPlayableEpisode()` in
  `src/app/series/details/[seriesId].tsx`): always the first episode of the first season. Master
  prompt §22 asks for "resume most relevant unfinished episode when appropriate, otherwise first
  playable episode" — there is no watched/progress tracking anywhere in this app yet (Home's
  Continue Watching is still an empty placeholder), so "resume" has no data to act on. This isn't
  a shortcut around the resume rule; it's the *entire* rule collapsing to its only defined branch
  until a watch-history feature exists.
- **Season pills + virtualized episode list** — episodes for the selected season only are rendered
  in a `FlatList` (virtualized), matching §22's explicit requirement; switching seasons swaps the
  list's data, not a fresh network call (the whole catalog for the series is already in memory
  from the single `get_series_info` fetch).
- Genre/year ARE shown here (details screen + poster grid) since, unlike Movies on this same
  provider, the real data actually has them — the difference between the two features is driven
  by what each verification pass found, not an inconsistency to "fix".
- Home's Series card follows the identical pattern as Movies: wired to `/series-categories`, shows
  a real count once fetched this session, "—" before that.

**Verified on-device 2026-09-01.** A real ~30-minute provider outage happened mid-verification —
`player_api.php` started returning HTTP 404 on the login call. Confirmed independently via `curl`
from the terminal (no device/app involved) before concluding it was provider-side, not a bug;
watched it recover on its own back to a normal `200` with a real auth payload, then resumed. Once
back: categories screen showed real names/counts ("All" = 6,168); poster grid showed real posters,
ratings, and years matching the verified `get_series` data exactly; the details screen for "ليل"
rendered the real backdrop, rating (10.0), year (2025), genre (دراما), plot, cast, a "Season 1"
pill, and an episode list with real titles/durations; tapping the first episode played real video
with native controls showing the correct `41:16` total duration — matching `get_series_info`
exactly. No crashes at any step.

## Global Search (master prompt §18, 2026-09-01)

The master prompt is explicit here: *"For very large local datasets, use SQLite/indexed querying
rather than filtering 20,000 JS objects on every keystroke."* At this project's real scale that's
not a hypothetical — live channels (11,356) + movies (20,123) + series (6,168) is ~38k objects on
our test provider, well past the point where a per-keystroke JS `.filter()` across all three (the
pattern used everywhere else in this app, but always scoped to a single category, never the whole
catalog) would visibly janky the UI thread. This is the first screen in the app that actually
needs the SQLite path the master prompt calls out, so it's built differently from every other list
here on purpose:

- **New `search_index` table** (migration v3): `content_type`, `provider_item_id`, `name`,
  `subtitle`, `image_url`, `category_id`, indexed on `name COLLATE NOCASE`. One row per live
  channel/movie/series item.
- **Index build is a one-time per-session cost, search itself is not.** `ensureSearchIndexReady()`
  (`src/state/searchIndexStore.ts`) rebuilds the whole table once when the Search screen is first
  opened (shown behind a loading state), and does nothing on subsequent opens this session.
  `searchContent()` — the thing that actually runs per keystroke (debounced 250ms) — is a plain
  `SELECT ... WHERE name LIKE '%'||?||'%' ... LIMIT 50` against that table, which runs in SQLite's
  native code off the JS thread, not a Hermes array scan.
- **Batched inserts, not one `executeAsync` per row.** ~38k individual awaited native calls was a
  real, foreseeable performance risk (JSI bridge overhead compounds per call even when each query
  itself is fast) — not a maybe. Rows are inserted in batches of 300 via one parameterized
  multi-row `INSERT ... VALUES (?,?,?,?,?,?), (?,?,?,?,?,?), ...` per batch, cutting ~38k round
  trips down to ~130.
- **Search always covers all three content types, even before the user has visited Movies or
  Series this session.** Movies/Series are lazy-loaded (same as `/movies-categories` and
  `/series-categories` already do) the first time Search needs them, specifically so opening
  Search and typing a movie title works even if Movies was never opened — the alternative (only
  searching whatever happens to already be cached) would silently under-search in a way a user
  has no way to notice.
- **Index invalidation piggybacks on the existing session-change hook.** `resetSearchIndex()` is
  called from `activeSessionStore.setActiveSession`/`clearActiveSession`, alongside the existing
  `clearVodMovies`/`clearSeriesList` calls — same reasoning: never let one provider's content
  survive into another's session. (`searchIndexStore.ts` deliberately does NOT import
  `activeSessionStore` itself — channels are passed in as a parameter instead — to avoid a
  circular import between the two modules.)
- **Phone only for this pass — TV's "dedicated full-screen search with predictable focus" is
  deferred.** No screen in this app has any TV-specific focus-engine code yet (the whole session's
  on-device testing has been phone-only); building TV-specific search UX now, before any other TV
  focus work exists to be consistent with, would be built in isolation and likely need rework once
  real TV focus patterns are established elsewhere. `src/app/search.tsx` is a normal inline/phone
  screen per §18's "Phone: inline or dedicated search screen" branch.
- Tapping a live result plays it immediately (`categoryId: "all"` scope for prev/next zapping,
  since search results aren't scoped to one category); movie/series results go to their details
  screens — matching how each content type is already entered from its own browse flow.
- Added the Home "search entry point" that master prompt §17 already asked for but this app never
  had (a `Search` button in the header, next to `Disconnect`).

**Verified on-device 2026-09-01.** First open (movies/series not yet visited this session): index
build took ~10s total ("Preparing search…" shown throughout — lazy-loading both catalogs plus the
batched-insert build), no crash. Searching "mbc" correctly returned only live results with real
logos and LIVE badges, including the provider's own real duplicate channel entries (same name,
different stream ids/categories) — shown as-is rather than deduplicated, since that's what the
provider's data actually contains. Searching "layl" (Latin, no transliteration attempted) matched
across all three content types in one query: two movies ("Hazihi Laylati 2019", "The Ultimate
Playlist of Noise") and one series ("The Playlist", 2022) — confirming plain substring `LIKE`
matching works correctly across mixed scripts/languages without needing every result to share a
script with the query. Tapping the series result navigated correctly to its details screen,
rendering real data (rating 6.0, 2022, Drama, full cast, director, Season 1, an episode with a
real `00:50:18` duration). One UX note, not a bug: the first tap after typing (with the keyboard
still open) dismissed the keyboard without also registering as a row press — standard Android
behavior when tapping outside a focused field with something underneath; a second tap on the same
spot worked normally.

## Resume (master prompt §24.6) + Continue Watching (§17) + Series Play rule (§22), 2026-09-01

Scoped this pass to exactly §24.6 (Resume) rather than all of §24 — the rest of Player UX (custom
scrub bar, playback speed, next-episode prompt, audio/subtitle track pickers, orientation,
screen-wake) is real, separate work that doesn't share a data model with Resume the way this three-
part scope does. Chose Resume specifically because it's the one piece with concrete, checkable
acceptance criteria in the master prompt AND because building it closes two things already flagged
as deferred earlier in this project (Home's static "No watch history yet" placeholder from §17;
the "always S1E1" Series Play rule from §22, explicitly documented at the time as "the rule
collapsing to its only defined branch until a watch-history feature exists").

Verified the real `expo-video` player API before writing anything (`node_modules/expo-video/build/
VideoPlayer.types.d.ts` and `VideoPlayerEvents.types.d.ts`): `currentTime` is a settable property
that seeks on write, `duration` is readonly, `timeUpdateEventInterval` controls how often
`timeUpdate` fires (default 0 = off), and `playToEnd`/`playingChange`/`statusChange` are real
events with the payload shapes used here — none of this was guessed.

- **New `watch_progress` table** (migration v4): one row per movie or episode
  (`content_type`+`provider_item_id` primary key), storing position/duration, `updated_at`, and
  enough denormalized display data (title, subtitle, image, **and `container_extension`**) that
  Home's Continue Watching and both player screens never need the movies/series catalog to be
  loaded to resume something — which matters because the single most common path (open app →
  land on Home via silent restore → tap Continue Watching) happens *before* Movies or Series has
  ever been visited this session. Storing `container_extension` here specifically closes that gap;
  without it, a fresh Continue Watching tap would 404 until the user separately opened Movies/Series.
- **`src/playback/useWatchProgress.ts`** — one hook, used identically by both
  `movies/player/[movieId].tsx` and `series/player/[episodeId].tsx`: resumes once (guarded by a
  ref, only on the first `readyToPlay`) only when saved position is 5–95% of duration (`§24.6`'s
  own thresholds), saves via the player's own `timeUpdateEventInterval` (set to 15s — throttling
  happens at the native layer, not a JS `setInterval` hammering SQLite, which is exactly what
  §24.6 says to avoid), and saves again on pause / app background/inactive / unmount so nothing
  between 15s ticks is lost. Clears the row on `playToEnd` or once position crosses 95%, so a
  finished item doesn't linger in Continue Watching.
- **This project's stricter-than-default lint config treats `player.currentTime = x` and
  `player.timeUpdateEventInterval = x` as forbidden mutations** (`react-hooks/immutability`) the
  same way it would flag mutating a React prop. `player` is a native `SharedObject` wrapper, not
  React state — writing those two properties is the actual, intended, only way to do either thing
  (`seekBy` exists but is explicitly documented as imprecise, wrong for exact resume; there's no
  method form of setting the update interval at all). Scoped `eslint-disable` comments cover
  exactly those two lines, with the reasoning written inline, not blanket-disabled for the file.
- **Series Play** (`resolveSeriesPlayEpisode` in `series/details/[seriesId].tsx`) now actually
  implements the rule it could only describe before: query
  `getMostRecentIncompleteEpisodeForSeries`, resume that episode if found, else the first episode
  of the first season. Per-episode `playEpisode` rows still play the tapped episode directly,
  unaffected by this rule (which only governs the series-level Play button).
- **Home's Continue Watching** is a horizontal card list (poster/fallback, title, subtitle —
  `S{n} E{n}` for episodes, a thin progress bar, relative "last watched" time), tap-to-resume, and
  a "Clear" action with confirmation (`Alert.alert`, same pattern as provider deletion) — the
  "clear watch history action with confirmation" §17 already asked for.
- **Explicitly not built in that pass** (all of §24 beyond §24.6): next-episode prompt, playback
  speed, audio/subtitle tracks, screen-wake, orientation. All five were picked up in the very next
  batch below.

## Second batch: Favorites/Watch Later, Settings, Legal, and the rest of §24, 2026-09-01

The user explicitly asked to stop verifying on-device after every single change and instead build
a batch of unrelated, independently-scoped pieces together, testing once at the end. Ten items,
each still held to the same verify-before-build discipline as everything earlier in this log —
skipping on-device testing between them didn't mean skipping API verification before writing code.

**1–3: Favorites + Watch Later + live-channel favorite toggle.** One shared `library_items` table
(migration v5: `list_type` 'favorite'|'watch_later', `content_type` 'live'|'movie'|'series',
`provider_item_id`, denormalized display fields including `container_extension` for the same
reason `watch_progress` needed it — direct-play from the library screen without the catalog
loaded) rather than two near-identical tables. `src/state/useLibraryToggle.ts` is one hook used by
the movie details screen, the series details screen, and each live channel row — closing the
"Favorite state" gap on Live TV rows that master prompt §19 asked for and this project's own
DECISIONS.md flagged as deferred back when Live TV was first built. `src/app/library/[listType].tsx`
is one screen serving both `/library/favorite` and `/library/watch_later`, styled like Search's
mixed-content-type rows (LIVE/MOVIE/SERIES badges) since either list can hold any content type.

**4: Settings (§28).** Scoped to sections with something real to show: Account/Provider (live
session info + manage/disconnect), Legal (link to the Terms screen), Diagnostics (link to the
existing `player-spike.tsx` dev tool), About (real app version/package via `expo-constants`'
`Constants.expoConfig`, not hardcoded). Appearance, Content, Playback, and Storage are *not* built
as empty/fake sections — there's no theming system, content-filter settings, saved playback
preferences, or storage-usage measurement anywhere in this app yet, and a settings section with
nothing real to control is worse than no section.

**5: Legal/acceptance gate (§29).** New `app_state` table (migration v6, single row, same shape as
`live_tv_state`) storing `legal_accepted_at`. `src/app/index.tsx`'s startup gate now checks this
*before* the provider check — unaccepted routes to `/legal?mode=gate` (Accept button, no back/skip)
before anything else ever runs; accepted routes normally. The same screen is reachable from
Settings without `mode=gate` as a read-only "already accepted" view. The terms text itself is
explicitly marked in-code as placeholder copy, not reviewed legal language — real wording is a
release blocker to track separately, not something to fabricate convincingly here.

**6: Next Episode prompt (§24.7).** Verified real trigger data first: `player.duration` and the
`timeUpdate` payload's `currentTime` are both real, already-used properties. When remaining time
drops under 20s, fetches `get_series_info` once (Xtream has no lighter "just the next episode"
endpoint) to resolve the actual next episode, then shows a card with a 10s countdown that
auto-advances (`router.replace`, not `push`, so episode screens don't stack) unless dismissed.

**7–8: Playback speed + audio/subtitle tracks (§24.2/§24.4/§24.5).** Two shared hooks
(`usePlaybackSpeed`, `usePlaybackTracks`) plus one shared `TrackSelectorModal` component — the
first shared UI *component* in this codebase (not just shared hooks/state), justified because the
modal's JSX is substantial and used identically by both the movie and episode players, unlike the
Favorite buttons (small enough to duplicate inline per this project's existing style). Verified
`player.playbackRate`, `player.audioTrack`/`subtitleTrack`, and the `available*TracksChange` /
`*TrackChange` events directly against `expo-video`'s type definitions before writing anything —
`availableAudioTracks`/`availableSubtitleTracks` are read-only and only populate asynchronously
once the source loads, so the hook listens for the change events rather than reading them once at
mount (which would almost always see an empty array). §24.4's "don't apply an old track index to
an unrelated channel" concern is about a single player instance being reused across live channel
switches — doesn't apply to these two hooks since both callers are one-shot VOD players.

**9–10: Screen-wake + orientation (§24.8/§24.9) — two new native dependencies.** Added
`expo-keep-awake` (`useKeepAwake()` — screen stays on for as long as the owning player screen is
mounted, automatic cleanup) and `expo-screen-orientation` (`lockAsync(OrientationLock.LANDSCAPE)`
on mount / `unlockAsync()` on unmount) via `npx expo install`, both official Expo SDK packages.
`src/playback/useFullscreenOrientation.ts` gates on `Platform.isTV` (a real react-native-tvos API)
before locking orientation — §24.8 explicitly says phone-only, "do not fight tablet/TV
orientation," and a TV app has no portrait state to enter or restore in the first place. Both
hooks are wired into all three player screens (movie, episode, **and** live — §24.8/§24.9 aren't
scoped to VOD only in the master prompt the way §24.2 is). Neither package needed an app.config.js
plugin entry (checked both packages' own `package.json` — no `expo.plugin` field, confirming
autolinking is sufficient) but **both are new native modules, so a fresh native rebuild is required
before any of this can run on-device** — same as when `expo-sqlite`/`expo-secure-store` were first
added.

All ten items are `tsc`/lint clean. None have been run on-device yet — batched per the user's
explicit request, to be verified together in one pass once the native rebuild is done.

## Bug: `router.replace()` called synchronously in render body (found during on-device batch test, 2026-09-02)

The consolidated on-device test pass for the batch above (Favorites/Watch Later/Settings/Legal/
Next Episode/speed/tracks/wake/orientation) surfaced a real, previously-unnoticed crash: tapping
into Live TV from Home threw `Cannot update a component (ForwardRef(NavigationContainerInner))
while rendering a different component (LiveCategoriesScreen)`. Root cause: `live-categories.tsx`
and 11 other screens guarded a missing provider session with

```tsx
if (!session) {
  router.replace("/providers"); // or "/" for home.tsx
  return null;
}
```

placed directly in the component's render body. `router.replace()` dispatches a navigation state
update, so calling it synchronously during render (rather than as a result of an event or effect)
violates React's render-purity rules — React tolerated it inconsistently until this particular
navigation path made it fatal.

Fixed by moving the redirect into a dedicated `useEffect`, keeping the render-body `return null`
purely to bail out of that render pass:

```tsx
useEffect(() => {
  if (!session) router.replace("/providers");
}, [session]);

if (!session) {
  return null;
}
```

Applied to 11 files: `live-categories.tsx`, `movies-categories.tsx`, `series-categories.tsx`,
`home.tsx` (target `/`, all others target `/providers`), `live/[categoryId].tsx`,
`movies/player/[movieId].tsx`, `search.tsx`, `movies/details/[movieId].tsx`,
`series/player/[episodeId].tsx`, `series/details/[seriesId].tsx`,
`live/player/[channelId].tsx`. `player-spike.tsx` was checked and did **not** need the fix — its
no-session state already renders an inline "Connect a provider first" screen with a manual Back
button whose `onPress` calls `router.replace`, not an automatic render-body redirect.

`tsc --noEmit` and `npx expo lint` both clean after the fix across all 11 files. This is a pure
JS/TS change — no native rebuild required, just a JS reload on-device to pick it up.

## Bug: `persist()` reading a released native player on unmount (found continuing the same on-device pass, 2026-09-02)

While re-testing (Movies → play a movie → immediately back out — exactly the interaction the
router-replace fix above needed re-verifying), a second, unrelated crash appeared: a Metro red-box
`Render Error` — *"The 1st argument cannot be cast to type class
expo.modules.video.player.VideoPlayer (received class java.lang.Integer) → Caused by: Cannot use
shared object that was already released"* — pointing at `player.duration` inside `persist()` in
`src/playback/useWatchProgress.ts`.

Root cause: `useWatchProgress`'s `AppState` effect (`src/playback/useWatchProgress.ts:129`) calls
`persist()` from its own cleanup function on unmount, to flush any progress made since the last
throttled `timeUpdate` tick. But `player` comes from `useVideoPlayer` in the parent screen
(`movies/player/[movieId].tsx` etc.), whose own cleanup releases the native `SharedObject` — and
React gives no ordering guarantee between two independent effects' cleanups in the same component.
When the parent's cleanup released the player before this hook's cleanup ran, `persist()` read
`player.duration`/`player.currentTime` on an already-released native object, which throws instead
of returning a value.

Fixed by wrapping just those two property reads in `try/catch` and bailing out silently on
failure — there is nothing to persist once the player is gone, and this is a genuine native-module
boundary race (observed live on-device), not a hypothetical worth guarding against speculatively:

```ts
let duration: number;
let position: number;
try {
  duration = player.duration;
  position = player.currentTime;
} catch {
  return;
}
```

Verified fixed on-device: reloaded the JS bundle, replayed the exact repro (Movies → ARABIC VOD →
a movie → Play → Back immediately while still buffering) three times, no red-box, clean return to
the details screen each time. `tsc --noEmit` and `npx expo lint` both clean.

Also worth recording: mid-testing, Movies briefly failed with `HTTP 404` and then a `Could not
parse JSON` error from `get_vod_streams` — initially misdiagnosed as a provider outage (even
confirmed, wrongly, via `curl` against several `player_api.php` actions). The user correctly
pushed back — the same account was working on another IPTV app at the time. Re-checking: the app's
own request construction (`playerApiUrl()` in both `xtreamAdapter.ts` and `vodAdapter.ts`) is
identical between the working `get_live_categories` call and the failing `get_vod_streams` call —
no code difference. The `curl` "confirmation" was itself misleading: the server sits behind
Cloudflare, and curl's default User-Agent got a 404 even on `get_live_categories`, which the app
had just fetched successfully seconds earlier with real data. Likely explanation: repeated rapid
`curl` requests from the dev machine (sharing the phone's network/public IP) tripped a transient
Cloudflare rate-limit or bot check that briefly affected the phone's own requests too. Retrying
from the app a few minutes later (no more curl noise) loaded Movies normally (20,123 titles).
Lesson: `curl` from a dev machine is not a reliable way to confirm "provider is down" when the
server is behind a WAF/CDN with its own bot heuristics — prefer retrying from the app itself, and
don't treat a curl-only reproduction as independent confirmation of a server-side issue.

## Mobile-scope completion pass (2026-09-02)

User instruction: finish everything the master prompt lists for mobile (phone/tablet) — including
full i18n/RTL — before resuming on-device testing. This is the largest single batch of the project
so far. Summary of what was built, in the master prompt's own milestone order (§0.1 items 14–15),
plus the gaps found while doing it.

### i18n + RTL (§15)

Real gap found: zero i18n existed before this pass — every screen was hardcoded English despite
the master prompt's "Arabic-first" mandate. Built a small hand-rolled i18n system (no i18next —
matches §2's "a small i18n solution" guidance and the project's dependency discipline):

- `src/core/i18n/locales.ts` — the 6 required locales (`en`, `ar`, `fr`, `tr`, `ckb`, `ku`) with
  per-locale RTL flags (`ar`/`ckb` RTL, matching §15 exactly — Kurmanji `ku` is LTR).
- `src/core/i18n/translations/*.ts` — one file per locale, each typed as `TranslationShape`
  (`typeof en`, with `en.ts` deliberately NOT `as const` so the type widens to `string` — a missing
  or mistyped key in any non-English locale is a **compile error**, not a silent English fallback).
- `src/core/i18n/I18nContext.tsx` — `I18nProvider`/`useI18n()`. Auto-detects device locale via
  `expo-localization`'s `getLocales()` on first run (persisted to `app_state.language` after), or
  restores the saved preference. `t(namespace, key, params?)` does `{param}`-style interpolation —
  deliberately no ICU plural rules (Arabic's 6 plural forms etc.) — a real simplification, not an
  oversight; every interpolated count string was written to read acceptably across all 6 languages
  with simple substitution rather than pretending to support full CLDR pluralization.
- RTL layout: relies on React Native's own default behavior (native `I18nManager.isRTL` already
  follows the OS locale before any JS runs, so a fresh install on an Arabic-locale device renders
  RTL from frame one with no app-side action needed). The app's own in-app language switch is the
  one case that needs explicit handling: changing to/from an RTL language calls
  `I18nManager.allowRTL()`/`forceRTL()` (which persists natively) and then prompts a restart
  (`BackHandler.exitApp()`) — RN cannot re-mirror an already-mounted native tree without one.
- Every existing screen was retrofitted in one pass each (not two): string extraction to `t()`
  calls AND an RTL styling audit (converting `left`/`right` positioning to logical `start`/`end`
  where the two sides aren't already symmetric) were done together per file. `player-spike.tsx`
  (the dev-only diagnostics screen from the Milestone 1 player spike) was deliberately left in
  English — it's a debug tool, not user-facing surface.
- Arabic, French, and Turkish translations are professional-quality first-pass work. **Sorani
  Kurdish (`ckb.ts`) and Kurmanji Kurdish (`ku.ts`) are best-effort machine/non-native translations
  and are flagged here for native-speaker review before release** — same policy already applied to
  the placeholder legal text; not fabricating confidence that doesn't exist.
- Theme (dark/light) was explicitly **not** built as a second full pass — see the Settings section
  below for why, and why that's spec-compliant rather than a cut corner.

### Downloads / offline playback (§27) — entirely new subsystem

Verified the real `expo-file-system` API before writing anything (SDK 57 ships the newer
class-based `File`/`Directory`/`DownloadTask` API, not the older `FileSystem.downloadAsync` — read
`node_modules/expo-file-system/build/*.d.ts` directly rather than assuming). Built:

- Migration v9 (`download_tasks` table, including a `resume_state` column for persisted
  `DownloadPauseState`) + `src/db/repositories/downloadRepository.ts`.
- `src/domain/downloads/eligibility.ts` — only non-`.m3u8` direct-file VOD is downloadable, per
  §27; live channels never get a download affordance in the UI at all (simplest, safest way to
  satisfy "disallow live streams").
- `src/domain/downloads/downloadManager.ts` — start/pause/resume/cancel/delete backed by
  `File.createDownloadTask()`. Pause captures `task.savable()` (real `DownloadPauseState`) into
  SQLite; resume rebuilds via `DownloadTask.fromSavable()` when that data exists. **Honest limit**:
  resume data only exists after a *graceful* pause (explicit user action, or the new
  `registerDownloadBackgroundHandling()` AppState listener that pauses active transfers when the
  app backgrounds). A hard process kill mid-download loses the native resume token — on next boot,
  `recoverDownloadsOnBoot()` (wired into `_layout.tsx`) flips any stuck `"downloading"` row to
  `"paused"`, and resuming it restarts the transfer from scratch rather than pretending to resume
  data that was never captured.
- `src/domain/downloads/downloadProgressStore.ts` — a `useSyncExternalStore` in-memory pub/sub for
  live per-tick progress (same pattern as `epgCache.ts`'s `useNowTick`), separate from the SQLite
  row (written throttled, ≤1/sec/task) so the Downloads screen's progress bars are smooth without
  hammering SQLite on every native progress event.
- `src/app/downloads.tsx` — list screen with pause/resume/cancel/delete and status-appropriate
  actions; `src/domain/downloads/useDownloadState.ts` — a Movie/Episode-details hook mirroring
  `useLibraryToggle`'s pattern. Wired onto movie details (one button) and every episode row in
  series details (download is per-episode, not per-series).
- `movies/player/[movieId].tsx` and `series/player/[episodeId].tsx` both accept an optional
  `localUri` route param and prefer it over building a network stream URL — this is how a completed
  download plays back. **Scope boundary, documented rather than silently assumed**: reaching these
  screens still requires an active provider session (the whole app's navigation is gated on
  `activeSessionStore`), so this is "play a downloaded file without re-streaming it," not "use the
  app in airplane mode from a cold start" — true fully-offline-after-restart playback would need
  session restoration to tolerate no connectivity too, which is a separate, larger change.
- Home's Downloads shortcut and Settings' Storage section both show a real count/size
  (`getDownloadsSummary()`), not a placeholder.

### Settings (§28) — full section build-out

Previous pass deliberately built only Account/Provider + Legal + Diagnostics + About, on the
stated grounds that Appearance/Content/Playback/Storage would be fake placeholders with nothing
real to control. All of those now have something real:

- **Appearance**: working language picker (wired to the i18n system above). Theme row shows "Dark"
  only — deliberately did **not** build a full light-mode palette + theme-context refactor. Master
  prompt §14 explicitly says *"Optional light mode may be included, but dark mode is the primary
  media experience"* — light mode is spec-optional, and building it properly would mean converting
  every screen's `StyleSheet.create()` (currently static module-scope objects reading the one dark
  `Colors` constant) to a theme-aware hook — a second full mechanical pass across every screen, on
  top of the i18n one. Given it's explicitly optional, that effort went to features that aren't.
- **Content**: three section-visibility toggles (Live/Movies/Series — `app_state` columns, wired
  into Home so a hidden section's browse card disappears) + a category-visibility screen per
  content type (`settings/categories/[contentType].tsx`, a new `hidden_categories` table via
  migration v8) wired into all three category-listing screens so a hidden category is actually
  filtered out of the list, not just recorded and ignored. Master prompt §41 explicitly forbids
  "expose settings the player cannot actually implement" — every toggle added here changes real
  browsing behavior, verified by tracing the read path, not just the write path.
- **Playback**: resume-enabled and autoplay-next-episode toggles are fully wired, not just stored —
  `useWatchProgress` now checks `appState.resumeEnabled` before setting a pending resume position,
  and the episode player's next-episode countdown effect checks `autoplayEnabled` before
  auto-advancing (the card still appears and offers a manual "Play Now" when autoplay is off, it
  just stops auto-advancing at 0). Preferred audio/subtitle language are free-text fields (arbitrary
  provider track languages aren't limited to the 6 UI locales) — persisted, but **not yet consumed**
  by `usePlaybackTracks`' track auto-selection; a real, smaller remaining gap, not silently implied
  as done.
- **Storage**: real downloaded-content count/size from `getDownloadsSummary()`, links to Downloads.
- **Data**: added `clearLibraryList()` to `libraryRepository.ts` so "Clear favorites" / "Clear
  watch later" are real bulk deletes, not just history (which already existed).

### Onboarding + provider management (§16)

- `src/app/onboarding.tsx` — 3-slide swipeable intro (Skip / Next / Get Started), gates before the
  legal screen on first run (`app_state.onboarding_seen_at`), wired into `index.tsx`'s startup
  routing ahead of the legal-acceptance check.
- Legal acceptance is now **versioned** (`CURRENT_LEGAL_VERSION` in
  `src/core/legal/legalVersion.ts`, `app_state.legal_accepted_version`) instead of a bare boolean —
  bumping the constant re-prompts existing users, per §29.
- Provider **edit** (previously only add/delete/switch existed): `add-provider.tsx` now accepts an
  optional `providerId` param, pre-fills from `getProviderById()` + `getProviderCredentials()`
  (the user's own already-entered password, shown back to them the same way the add flow does —
  not a new exposure), and updates in place (`updateProvider()`, new repo function) instead of
  inserting a duplicate row.
- **M3U/M3U8 (§7)**: built a real, spec-compliant parser (`src/providers/m3u/m3uParser.ts`) —
  handles CRLF/LF, missing/duplicate `#EXTM3U` headers, unknown `#EXTINF` attributes (preserved in
  `extraAttributes` rather than dropped), a chunked `parseM3UChunked()` that yields to the event
  loop every 2000 lines so a large playlist can't freeze the JS thread. **Deliberately not wired
  into the add-provider UI or session/provider-kind type system in this pass.** `Provider.kind`,
  `XtreamProviderConfig`, and `ActiveSession.config` are hard-typed to `"xtream"` and threaded
  through 15+ call sites across nearly every screen built this session (`session.config` passed to
  every Xtream adapter call). Turning that into a real `"xtream" | "m3u"` discriminated union safely
  is a separate, larger architectural change — attempting it in the same pass as everything else
  above risked destabilizing the working, tested Xtream flow for a feature the master prompt itself
  calls "secondary" (§0: *"M3U/M3U8 URL playlists... are secondary provider types"*). The parser is
  real and ready; the UI/session wiring is the next dedicated milestone for it, not a silent gap.

### Retry/fallback policy (§25) + app lifecycle (§31)

- Live player: bounded automatic retry (`MAX_LIVE_RETRIES = 2`, 1s delay) on a transient
  `replaceAsync` rejection, added to `live/player/[channelId].tsx`'s `commitChannel`. A fresh
  channel selection always resets the counter; a retry of that same failed attempt doesn't — so
  it's bounded per-selection, never infinite. Every retry and every commit re-checks the switch
  controller's `isStale()` generation token first, so a newer user selection always wins and
  cancels the old retry path, exactly as §25 requires.
- VOD players (movie + episode): one quiet retry (`player.replaceAsync(source)` again) on the
  first playback error before showing the error card, per §25's "one quiet transient retry can be
  acceptable" for VOD.
- **Real bug found and fixed while adding the above**: the live player's retry uses a `setTimeout`
  that could fire after the screen unmounts (navigate away mid-retry-wait), calling
  `player.replaceAsync()` on an already-released native player — the same class of "shared object
  already released" crash fixed earlier this session in `useWatchProgress`. Fixed with an
  `unmountedRef` guard + clearing the pending timeout on unmount. Applied the same defensive guard
  to the VOD retry paths too (smaller race window there since there's no `setTimeout` delay, but
  the same category of bug is possible between the retry's `replaceAsync` call and its promise
  settling).
- Network reconnect (§31 "temporary network loss / Wi-Fi → cellular changes"): added `expo-network`
  and `src/core/network/useNetworkReconnect.ts` (wraps the package's real `useNetworkState()` hook
  to fire once specifically on a lost→restored transition). Wired into the live player only — when
  connectivity returns, it re-selects the current channel through the normal switch controller path
  even if the bounded retries above had already been exhausted and given up. Not swept across every
  screen (VOD players, category lists) — scoped to where a dropped connection is most acutely felt
  and most spec-relevant (live streaming), not because the others don't matter.
- Also fixed in passing: `library/[listType].tsx` had the exact same render-body `router.replace()`
  anti-pattern documented and fixed everywhere else earlier this session — missed originally because
  the earlier grep matched `if (!session)` specifically and this file guards on `!listType` instead.
  Same fix (move into `useEffect`).

### New native dependencies (native rebuild required before this can run on-device)

`expo-localization`, `expo-file-system`, `expo-document-picker` (installed for the M3U local-file
picker path, ready even though M3U isn't wired into the UI yet), `expo-network`. All four are
official Expo SDK packages (`npx expo install`-resolved, matched to SDK 57). Only
`expo-localization` needed an explicit `app.config.js` plugins entry (autolinking is sufficient for
the other three — confirmed by checking each package for an `app.plugin.js` before deciding, not
assumed). Same pattern as every previous native addition this session: `tsc`/lint clean, but
untestable until a fresh `npx expo run:android`.

### Status

Every file touched in this pass is `tsc --noEmit` and `npx expo lint` clean, checked incrementally
after each unit of work rather than once at the end. None of it has been run on-device yet — a
native rebuild is required first (four new native modules), and the user's own instruction was to
finish this whole pass before resuming testing.

## Mobile-scope completion, part 2 (2026-09-02, same day)

User: skip M3U/M3U8 integration (confirmed — matches the previous entry's own reasoning for
deferring it), finish everything else remaining for mobile, then rebuild and test. Closed out the
remaining gaps found by re-auditing every "mobile" master-prompt section against what actually
exists:

- **Real Xtream account/subscription info (§17/§28)** — previously only `allowed_output_formats`
  was read from the login response; everything else in `user_info`/`server_info` was discarded.
  Verified the exact real field names with one direct `curl` against the test provider's login
  endpoint (`status`, `exp_date`, `is_trial`, `active_cons`, `max_connections` under `user_info`;
  `server_protocol`, `timezone` under `server_info` — confirmed real, not assumed from generic
  Xtream docs) before typing anything against them, matching this project's "never guess an API"
  rule. `authenticate()` now returns a typed `XtreamAccountInfo`, threaded through
  `ActiveSession.accountInfo` (both `restoreSession()` and `add-provider.tsx`'s connect/edit paths).
  Displayed in Settings' Account/Provider card (status, expiry, active/max connections, output
  formats, server timezone) and as a small status line under the provider name on Home. Dates use a
  plain numeric formatter (`core/utils/formatDate.ts`), deliberately not `Intl.DateTimeFormat` —
  Hermes's ICU data for this app's Kurdish locales isn't guaranteed on-device, and an unsupported
  locale tag passed to `toLocaleDateString()` can throw. `user_info` also echoes back the plaintext
  username/password; the raw object is never passed downstream, only the specific fields needed.
- **Home "Featured" shelf (§17)** — was the one required (non-optional) Home element never built.
  Draws only from Movies/Series catalogs already cached in memory this session
  (`getVodMovies()`/`getSeriesList()`) — deliberately does not trigger its own fetch just to
  populate a decorative shelf, so on a fresh session before Movies/Series have been opened once,
  Featured is honestly empty rather than faked or eagerly fetched at Home's cost. Shuffled once per
  screen focus (`useFocusEffect`), never in render.
- **Preferred audio/subtitle language settings are now actually consumed** — previously stored by
  Settings' Playback section but read by nothing (a real §41 violation: "expose settings the player
  cannot actually implement"). `usePlaybackTracks` now accepts the two preferences and auto-selects
  a matching track the first time each track list populates, then never overrides a manual choice
  again for that screen instance.

  > **No longer true — the two settings are gone, the consumer is not.** Both rows were removed
  > from Settings on the owner's instruction of 2026-11-17, so nothing writes the columns any more
  > and the auto-selection they fed can never fire. §41 is satisfied in the letter — no setting is
  > exposed that the player cannot implement — by the opposite arrangement to the one described
  > above. (Marked 2026-11-18, from the verification pass; see "Preferred audio/subtitle language
  > settings removed" at the end of this log.)

- **Watch History screen (§26)** — §26 separately calls for a bounded (50–100) History list, distinct
  from Home's ~10-item Continue Watching preview shelf. Added `src/app/history.tsx` (capped at 100,
  per-item remove + clear-all, reusing `watchProgressRepository`'s existing functions), reachable
  from a new "See All" link on Home's Continue Watching header and from Settings' Data section.

All of the above verified `tsc --noEmit` and `npx expo lint` clean, same as every prior increment.
This closes out the concretely actionable mobile-scope gaps found by re-checking §16–§31 against
the current code, short of: M3U (explicitly skipped, see previous entry), a full light theme
(explicitly optional per §14, previous entry), a player "lock controls" affordance (§24.1 lists it
as "where useful" — skipped because the movie/episode players use `expo-video`'s native controls,
which already have their own tap-to-reveal/auto-hide protection against accidental touches; adding
a custom lock button would mean abandoning native controls for a full custom control surface, a
disproportionate change for an explicitly-optional item), and separate EULA/DMCA/Privacy documents
(kept as one combined Terms screen since the text is still placeholder pending real legal review —
splitting one honest placeholder into four fabricated-sounding separate documents would be worse,
not better). Automated unit tests / CI quality gates (§33/§37) were not built in this pass — the
user's own repeated instruction this session has been about the on-device manual verification pass
specifically, not an automated test suite; treating that as a separate, not-yet-requested scope.

## Preferred audio/subtitle language settings removed (2026-11-18)

Settings' Playback section had two free-text rows, preferred audio language and preferred subtitle
language, each taking a language code typed by hand. The owner asked for both to go, 2026-11-17:
"لغة الصوت المفضل الغيها / لغة الترجمة الغيها". He gave no reason and none is needed, but the rows
were a poor use of the one screen a remote reaches awkwardly, and the player's own track selector
already does the useful version of the same thing — per source, with the real track names the
provider sent, instead of a code the viewer has to know.

Removed 2026-11-17: both rows and the `LanguageCodeRow` component from `src/app/settings.tsx`, and
the `preferredAudio`/`preferredSubtitle` strings from all six locale files.

Removed 2026-11-18, the half the verification pass found still standing: `setPreferredAudioLang`
and `setPreferredSubtitleLang` in `appStateRepository.ts`. Both had already lost their only
callers with the rows — confirmed by a repo-wide grep, not assumed — so deleting them changes no
behaviour. A setter with no caller is worse than no setter: read from the repository alone, it
says the feature is still wired up.

**Still standing, deliberately.** `AppState.preferredAudioLang`/`preferredSubtitleLang`, the
`preferred_audio_lang`/`preferred_subtitle_lang` columns added by migration 7, the three players'
reads of them, and `usePlaybackTracks`' two auto-selection arms. The end state this wants is the
one migration 22 gave the three "Show X section" switches — DROP COLUMN, fields deleted, consumer
deleted — and it cannot be reached from one side. The players pass the two preferences
positionally, ahead of `sourceKey`, so dropping the parameters without editing the players would
slide a channel id into `preferredAudioLang`. The player screens were excluded from this pass
because the owner tested the player himself.

So, one later pass, these files together:

- `src/app/live/player/[channelId].tsx` and `src/app/series/player/[episodeId].tsx` — drop
  `preferredTracks` and the two arguments. Their `getAppState()` effects stay: the live one also
  reads `playerFitMode` and `splitChannelView`, the series one `autoplayNextEpisode`.
- `src/app/movies/player/[movieId].tsx` — the same, and there the whole effect goes, plus the
  `getAppState` import, which that file uses for nothing else.
- `src/playback/usePlaybackTracks.ts` — the two parameters, the two `if` arms, and
  `findPreferredTrack` with its two-pass language matching. The `*Applied` flags stay; the
  selector sets them too.
- `src/db/migrations/index.ts` — a new migration at the next free version, DROP COLUMN for both.
- `src/db/repositories/appStateRepository.ts` — the two fields off `AppState` and `AppStateRow`.

Until that pass the arms are inert rather than wrong, and the comments at both ends now say so.
Nothing has been released from this tree, so on every install but one the columns are null and
neither `if` is entered. The exception is a test device that set a preference before 2026-11-17:
there the old value is frozen, and no control anywhere in the app changes or clears it. That is a
defect of the record more than of playback, which is why it is written down here rather than
half-fixed from one side.

## A second live-playback engine on Apple platforms (2026-11-18)

Android is unchanged, and stays unchanged: `expo-video` → Media3 → the vendored FFmpeg MP2
decoder, the exact combination the entries above got working on a real device, and what
ships on Google Play today. Apple platforms get a second engine — libVLC, through
`@lunarr/vlc-player@2.1.1`. This is the entry for why a project whose third section is headed
"No VLC" now carries a libVLC dependency.

**Measured, not argued.** `expo-video` on iOS is AVPlayer, and AVFoundation refuses the bare
progressive MPEG-TS that every one of this account's 11,294 channels is served as. On a real
iPhone, Safari — the same AVFoundation stack — showed a white page for a channel while playing
an mp4 film from the same account, and the free VLC app played that same channel. Two
observations, one device, one account: the stack that fails and the engine that succeeds, on the
content that matters. Apple's documented path for `.ts` is as a segment inside an HLS playlist,
never as a progressive stream, and this panel's `allowed_output_formats` is `["ts","rtmp"]`, so
`buildLiveStreamCandidates` has no `.m3u8` to offer regardless of how the two container entries
above were decided.

**An adapter behind the existing screen, not a second screen.**
`src/app/live/player/[channelId].tsx` is about 2,500 lines and nearly all of it is behaviour
measured on hardware: channel switching that must not reconstruct the player, connection-slot
behaviour on a three-connection line, audio-focus workarounds, bounded retries, a split layout
that hands one player object to two render trees across rotation. There is no iPhone on this
project. A second screen written against a second engine could not be verified against any of
that, and would quietly fork it. So the libVLC engine presents the surface the screen already
calls — `useLivePlayer`, `LiveVideoView`, `releaseLiveSource` — and the screen's own change is
its import line plus the two differences it genuinely has to know about. The cost of that
choice, paid deliberately: the engine interface is `expo-video`'s own `VideoPlayer` type rather
than a neutral one, because four shared hooks (`useBackgroundPlayback`, `usePlayerMute`,
`usePlayerGestures`, `usePlaybackTracks`) are typed against it and one of them is shared with
the film and episode screens, which stay on AVPlayer. Widening four hooks to a union would
ripple into screens that have nothing to do with iOS. The one cast that makes the adapter legal
lives in `src/playback/engine/vlc/VlcLivePlayer.ts`, next to the list of members it actually
implements.

**Android is kept out of it twice, and the exclusion is not a tidiness measure.**
`react-native.config.js` sets `platforms: { android: null }` for the package, so autolinking
cannot pull `org.videolan.android:libvlc-all` into the Android build; and the engine is selected
by Metro platform extension rather than a `Platform.OS` branch, so the libVLC import is not in
the Android graph at all. The reason is `libc++_shared.so`. `app.config.js` already sets
`packagingOptions.pickFirst` for it because the FFmpeg decoder module and the React Native
runtime each ship one; libVLC ships a third, the VLC ecosystem's own guidance is that its copy
must win, and `pickFirst` takes whichever it meets first rather than the one you meant. The
failure mode is a runtime mismatch in the native audio path this project spent real effort
getting right — silent MP2 channels, the kind of fault that surfaces in the field and not in a
build log. Verified rather than assumed: a full `npx expo export --platform android` bundle
contains zero libVLC strings, with working positive controls in the same grep, so the Android
artifact is the shape it was. If Android ever does need libVLC, deleting that config file is not
the fix — deciding which `libc++_shared.so` wins is, followed by re-testing MP2 audio on a real
television.

**A bug worth the space, because review did not catch it.** The platform split is three of the
engine's six files: `livePlaybackEngine.tsx` (the `expo-video` pass-through, for every non-Apple
platform), `livePlaybackEngine.ios.tsx` (libVLC), and `index.ts` to re-export. The fallback was first
committed as `livePlaybackEngine.ts`, and that made the `.ios.tsx` file **unreachable on every
platform**. Metro's `resolveSourceFile` (`metro-resolver/src/resolve.js:511-540`) loops over
`sourceExts` in the *outer* loop and, for each extension, tries `.{platform}{ext}`, then
`.native{ext}`, then `{ext}`. Expo's `sourceExts` put `ts` before `tsx`, so on iOS the `ts` pass
reached `livePlaybackEngine.ts` and returned before `tsx` was ever considered. A platform
extension only wins when it shares the `sourceExt` of its fallback. The symptom was silence:
nothing read the engine's own name, so iOS used AVPlayer and failed exactly as it had before any
of this work started, with nothing to distinguish "libVLC is not loaded" from "libVLC cannot
play this either". It was found by building both bundles and grepping the Hermes string tables —
not by review, which had already passed. Both files are now `.tsx` for that reason and no other
(the Android one contains no JSX), and `index.ts` carries a `__DEV__` assertion comparing
`LIVE_PLAYBACK_ENGINE` against `Platform.OS`. An assertion is not a branch: it adds no libVLC
import to any graph, and it is the only thing in the project that can prove which engine
actually loaded.

**What this entry does not claim.** No iOS build of any kind has been made with this dependency.
See "Still open on the Apple path" at the end of this log before reading any statement anywhere
in this repository about iOS building.

## `@lunarr/vlc-player` over the alternatives, and the rule that produced it (2026-11-18)

Four candidates were read. Not read *about* — read. The rule this entry exists to record is that
a player library's README is marketing and its source is the specification, and it is written
down because taking a README at its word is what went wrong first.

- **`XJ_Player` — rejected.** It advertises itself as an open-source IPTV player for iOS and
  Android built with React Native and Expo, and on the strength of that description it was
  recommended on this project before anyone opened it. Its player is 61 lines wrapping
  `expo-av`, and its VLC dependency sits in `package.json` imported by nothing — checked across
  every `.ts`/`.tsx` file in that repository. It is not an IPTV player; it is a description of
  one.
- **`expo-libvlc-player` — rejected on maintenance, not on code.** Real VLCKit code, a real
  config plugin, a maintainer shipping almost daily: on code it passes. But its `57.x` line is
  dead — `57.0.59` and `58.0.0` shipped the same day and nothing has come out on 57.x since,
  against eighteen releases on 58.x — and it pins VLCKit `4.0.0a25`, fetched from a URL path
  named `unstable`. Its open issue #24 is a black-screen-with-audio report on IPTV HTTP `.ts`,
  which is the only content the iOS live path exists to play. A pre-release decoder with a
  standing bug against our exact stream shape, on a version line its maintainer has moved off,
  is a worse bet than a stable one whose gaps can be enumerated.
- **BlueIPTV — not what it says it is.** Its "patched libVLC" is a `patch-package` patch of a JS
  wrapper's Android Java: a released-player crash on background/PiP, and a missing audio-focus
  request. No libVLC fork, no iOS path at all. Its value here is diagnostic — those two bugs are
  what anyone putting libVLC behind React Native should expect to meet.
- **`@lunarr/vlc-player@2.1.1` — chosen.** MobileVLCKit 3.7.3 for iOS and TVVLCKit 3.7.3 for
  tvOS, both stable rather than pre-release, picked by its own podspec
  (`react-native-vlc-player.podspec`) by regex-matching `platform :tvos` in the Podfile. 950
  lines of Swift and 982 of Kotlin that genuinely construct `VLCMediaPlayer`/`LibVLC`. Its
  example app depends on `react-native: npm:react-native-tvos@0.86.2-0` with `expo ~57.0.13`
  and builds with `EXPO_TV=1` — this project's stack, not a near neighbour of it.

**Its gaps were priced before it was chosen, not discovered afterwards.** No HTTP headers on the
source, no synchronous readers, no reason of any kind on `onError`, Fabric/New-Architecture only,
and `s.static_framework = true` in the podspec. The first two the adapter works around; the third
is the whole of the next entry; the fourth is already true of this project; the fifth is a
licensing question, left open below. Two more were found only by reading the Swift: libVLC's own
`.esAdded` state falls into `default: break`, so `onTracks` never fires by itself on iOS despite
the package's doc comment — the adapter polls the player's own track arrays instead, which costs
no provider request; and the `AVAudioSession` `.playback` category is set only inside
`setupNowPlayingControls`, so `showNowPlaying` has to stay true or the ring/silent switch would
silence the channel and background playback would not work at all. Both are written down at the
point in `vlc/VlcLivePlayer.ts` and `livePlaybackEngine.ios.tsx` where each one costs something,
rather than collected as a list here.

## `OPAQUE_OPEN_FAILURE_CATEGORY` — 403 is assumed, and what that costs (2026-11-18)

This is the entry someone will come back to. It records a deliberately wrong answer, chosen
because the right one costs more than it is worth on this provider's line.

**Why an answer has to be invented at all.** `toPlaybackError` categorises a failure by
substring-matching its message, which works on Android only because ExoPlayer writes the HTTP
status into it ("Response code: 403"). libVLC's error event carries no status and no message at
all: the payload is `{type, currentTime, duration}` and nothing else, and there is no log channel
anywhere in the package to recover a status from. 403 and 404 also fail at exactly the same point
in libVLC's state machine — `Opening` → `Error`, nothing demuxed. The two are genuinely
indistinguishable without a second HTTP request, and this app will not make one on a failure
path: this panel answers request **bursts** with empty-bodied 404s — a rate block, not a
connection-count block — so a probe per failure adds requests precisely where the app is already
retrying. Left uncategorised, every iOS failure would arrive as `unknown`, and that is not a
wording problem but control flow: the live screen branches its whole retry machine on
`category !== "http_unauthorized"`.

**The choice.** `OPAQUE_OPEN_FAILURE_CATEGORY` in `src/playback/engine/vlc/VlcLivePlayer.ts` is
`http_unauthorized`. A failure before any byte is demuxed is therefore reported as a busy
connection slot: the app keeps the URL shape and retries the *timing*, six attempts at 2.5s. On a
three-connection line that is the right-shaped guess, because a busy slot frees itself when the
previous stream lets go, and the viewer is told the stream is busy for a moment and to wait or
try another channel — the one actionable sentence in the set. The alternative,
`stream_unavailable`, sends the screen back through all four candidate URL shapes on every
failure, which is exactly the regression the two longest comments in that screen (measured
2026-09-16, found again by audit 2026-11-14) say must never return: twelve stream opens in a few
seconds against an edge that answers bursts with empty 404s.

**What it costs, stated plainly.** A channel that is genuinely off the air spends 15 seconds
being patient and is then described as "busy" rather than "off the air". And the candidate-shape
walk no longer runs for an immediate failure, so a panel that served a URL shape other than the
first candidate would never play on iOS at all. That is safe for *this* provider and not in
general: `buildLiveStreamCandidates` (`src/providers/xtream/xtreamAdapter.ts:141`) puts
`/live/user/pass/id.ts` first, and this panel's `allowed_output_formats` is `["ts","rtmp"]`. It
is a named constant for that reason — a different panel, or an operator who would rather pay one
extra request per failure for a true 403/404 answer, changes one line and gets the shape walk
back at the price of the busy handling. Having both needs a status probe fired *after* `onError`,
when the native player is already released so the connection slot is free, routed outside
`core/network/requestQueue.ts` so that a 404 cannot call `noteProviderRefusal` and open the
catalogue backoff window. Nobody has asked for that yet.

The 15 seconds is itself a decision in the same file. libVLC has no open timeout of its own that
reaches JS, and without one a channel that never answers leaves the screen spinning for ever
with no message and no retry — worse than any wrong message. ExoPlayer's own connect and read
timeouts are 8s apiece, so 15s sits comfortably past a slow but working open on a `.ts` stream
while staying inside a viewer's patience. A watchdog expiry reports `network_timeout`, which is
the one remaining route by which the candidate-shape walk still runs on iOS.

## Accepted: no picture-in-picture, AirPlay or Now Playing on the libVLC path (2026-11-18)

**Decided here, and here first.** iOS live television ships without picture-in-picture, without
AirPlay, and with no lock-screen Now Playing integration beyond whatever `@lunarr/vlc-player`
registers for itself. `allowsPictureInPicture` is accepted and ignored by the libVLC surface,
because there is no counterpart to wire it to.

The trade is the one the entries above establish: without libVLC there is no live television on
iOS at all, because AVFoundation will not open these streams. Rebuilding three AVPlayer
conveniences on top of libVLC is real native work, on a project with no iPhone to verify it
against, for a feature set no viewer of this app has ever had. The film and episode screens keep
all three, because they stay on `expo-video`/AVPlayer — 13,018 of this account's 20,124 films are
`.mp4` and play there natively. So the gap is scoped to live, which is the surface where a viewer
is least likely to reach for AirPlay mid-zap, and it is a v1 gap rather than a permanent one.

**Why this is worded as a decision rather than a reference.** Two code comments
(`src/playback/engine/types.ts:64` and `livePlaybackEngine.ios.tsx:101`) call this "the recorded
feature gap" and cite `docs/IOS_READINESS.md:315-316`. That document does not record it. It
*asks* it: section 5, "Do you accept a second player on iOS?", is a question put to the owner,
and the closing paragraph of section 6 lists the gap among the things still to be decided. No
answer existed anywhere until this entry. Whoever next edits those two files should point them
here instead — they are owned elsewhere and were not touched from this pass.

## Downloads are off on iOS, for guideline 5.2.3 (2026-11-18)

`downloadsSupported()` in `src/domain/downloads/eligibility.ts` returns false on iOS, so no
download affordance appears anywhere in an iOS build and `isDownloadEligible` short-circuits
ahead of its container check. App Store Review Guideline 5.2.3 is the reason, and in the
judgement recorded in `docs/IOS_READINESS.md` it is a larger threat to this submission than any
codec question. Dropping the feature materially lowers the chance of a rejection and removes a
whole category of work: the native download task, its persisted `DownloadPauseState`, and the
boot-time recovery path all stay Android-only rather than being ported and then defended in
review notes.

Decided before the iOS port began, deliberately, so that nothing downstream was ever written
assuming the feature was there. Android is untouched — the gate sits beside the existing
`isTvBuild` one in the same function. The feature can come back in a v2 if review experience
turns out to allow it.

## Keychain accessibility: `AFTER_FIRST_UNLOCK`, and not the device-only variant (2026-11-18)

`src/core/storage/secureCredentials.ts` passes `SecureStore.AFTER_FIRST_UNLOCK` rather than
taking the iOS default. The default is `WHEN_UNLOCKED`, which refuses to decrypt the entry while
the screen is locked — the right default for a banking app and the wrong one here, because this
app plays audio in the background and the moment a stream needs re-authenticating (a token
expiring, a reconnect after a dropped connection) is very often the moment the phone is in a
pocket with the screen off. The read would fail, and the viewer would hear playback stop for no
reason they could see. `AFTER_FIRST_UNLOCK` keeps the entry encrypted at rest and unreadable
until the phone has been unlocked at least once since boot, which is the standard setting for a
credential a background task needs. Deliberately not the `_THIS_DEVICE_ONLY` variant: these are
the viewer's own provider logins, and restoring them onto a new phone from a backup is a feature,
not a leak. Ignored on Android, which has no equivalent concept.

## Still open on the Apple path (2026-11-18)

Its own entry, because several of the decisions above read like finished work and are not, and
because this repository contains earlier statements that iOS builds — all of them true before
the dependency existed and none of them about it.

- **The pod has never compiled.** There is no `ios/` directory, and no iOS build of any kind has
  been made since `@lunarr/vlc-player` entered `package.json`. Every "the iOS project builds",
  "`pod install` runs, and it passes" and "four EAS builds, six minutes each" statement in
  `docs/IOS_READINESS.md` predates it. The package sets `s.static_framework = true` and declares
  platforms `{ :ios => '15.1', :tvos => '15.1' }`; whether MobileVLCKit resolves and links
  alongside the react-native-tvos fork, Reanimated, Worklets and the Expo module set is unknown,
  and it is the first thing to find out. Nothing downstream of it should be believed until it
  has been.
- **The only iOS profile in `eas.json` is `ios-simulator`, and it cannot answer a playback
  question.** This project's own record is explicit about why: a film that demonstrably plays in
  Safari on real hardware fails in the simulator, while a bundled local video plays there —
  local decode works, network playback through AVPlayer does not. A green simulator build would
  prove the pod compiles. It would prove nothing about libVLC and these streams, in either
  direction.
- **libVLC has never been proven to play this provider's streams through *this app*.** It was
  proven through the standalone VLC app on an iPhone, which embeds the same libVLC. That is
  strong evidence about the engine and none at all about the adapter, the source dictionary it
  hands over, the surface's re-mount-per-source behaviour, or the watchdog.
- **tvOS is unexamined.** A tvOS build resolves platform `ios`, so it would take
  `livePlaybackEngine.ios.tsx` and link TVVLCKit. Whether that is wanted has never been decided,
  there is no tvOS profile in `eas.json`, and libVLC on tvOS is less proven than on iOS.
- **VOD on iOS is unaddressed.** `src/app/movies/player/[movieId].tsx` and
  `src/app/series/player/[episodeId].tsx` are still `expo-video`/AVPlayer, which is right for the
  13,018 `.mp4` titles among this account's 20,124 films — and leaves the remaining ~7,100, the
  `.mkv`/x265 share AVFoundation refuses, with no path at all. No VOD adapter exists. The engine
  built in this pass is live-only by construction.
- **The licence question is recorded but not answered.** libVLC/VLCKit is LGPL 2.1 or later, and
  MobileVLCKit brings its own TLS and crypto stack (gnutls, libgcrypt) for `https` and `rtsps`,
  each a separate upstream project with its own terms. `docs/THIRD_PARTY_LICENSES.md` has the
  inventory as of this pass and states the hard part plainly: the podspec sets
  `s.static_framework = true`, so MobileVLCKit/TVVLCKit would link *statically* into the app
  binary, and the standard argument for shipping VLCKit in a proprietary app — the one
  `docs/IOS_READINESS.md` reasons from — is about *dynamic* linking. What a static link obliges
  us to publish has not been answered by anyone. It is a blocker on distributing an iOS binary,
  not on writing more code, and it is not a question to answer from this file.
