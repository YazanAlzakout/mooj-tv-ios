# Dependencies — Milestone 0 compatibility matrix

Verified 2026-08-31 against the npm registry and https://docs.expo.dev/versions/v57.0.0/
(not assumed — see docs/DECISIONS.md for how each version was confirmed).

## Core

| Package | Version | Why |
|---|---|---|
| expo | ~57.0.18 | Current stable Expo SDK (SDK 57) at bootstrap time. |
| react | 19.2.3 | Pinned by the SDK 57 template. |
| react-native | `npm:react-native-tvos@0.86-stable` (resolves to 0.86.2-0) | TV-capable RN fork. One patch behind Expo's bundled stock `react-native@0.86.3` — this is the documented/expected pairing, not a mismatch (see below). |
| expo-router | ~57.0.17 | Navigation shell (file-based), required by the product spec. |
| expo-video | ~57.0.3 | Native Android playback (Media3/ExoPlayer). Confirmed to expose `replaceAsync` for source replacement without recreating the player, and a `VideoView.onFirstFrameRender` callback used for latency measurement. |
| @lunarr/vlc-player | ^2.1.1 (locked to 2.1.1) — added 2026-11-18, outside the 2026-08-31 verification above | libVLC-backed live playback on **Apple platforms only**; excluded from Android autolinking. AVFoundation refuses this provider's bare progressive MPEG-TS, so iOS needs a second engine. Never compiled — see below. |
| expo-build-properties | ~57.0.15 | Sets `usesCleartextTraffic`, `minSdkVersion=26`, and a `pickFirst` rule for `libc++_shared.so` (multiple native modules can bundle their own copy). |
| @react-native-tvos/config-tv | ^0.1.6 (dev) | Applies TV manifest changes (leanback launcher, banner) during prebuild when `EXPO_TV=1`. |
| expo-dev-client | ~57.0.16 | Required by EAS's `developmentClient: true` build profile — added after the first EAS build attempt failed with a clear error demanding it. |
| react-native-safe-area-context | template-pinned, now used directly | `SafeAreaView` — RN core's own version is deprecated and doesn't handle this Android version's mandatory edge-to-edge layout correctly (header was overlapping the status bar until switched). |
| patch-package | ^8.0.1 (dev) | Applies `patches/expo-video+57.0.3.patch` on every `npm install` (via `postinstall`) — see below and docs/DECISIONS.md. |

`package.json`'s `expo.autolinking.buildFromSource: ["expo-video"]` is equally load-bearing:
expo-video ships a precompiled AAR by default, which Gradle links against instead of ever
reading `node_modules/expo-video/android/build.gradle` — including the patch above. Without
this flag the patch is silently inert. See docs/DECISIONS.md.
| react-native-reanimated / react-native-worklets / react-native-gesture-handler / react-native-screens | template-pinned | Peer requirements of expo-router itself, not used directly yet. |

## Vendored native module: `modules/decoder-ffmpeg-mp2`

Not an npm package — a local Gradle module (wired in via `plugins/withDecoderFfmpegMp2.js`),
ported from `albasera-replit`. Provides Media3's FFmpeg-based MP2 audio decoder as a fallback
renderer, fixing silent audio on real channels that use MP2 (confirmed via direct MPEG-TS
inspection, not assumed — see docs/CODEC_MATRIX.md). Requires `patches/expo-video+57.0.3.patch`
(regenerated for this project's expo-video version, not the old project's literal patch file) to
actually wire the extension into expo-video's renderer construction. Full rationale and licensing
in docs/DECISIONS.md and docs/THIRD_PARTY_LICENSES.md.

## Apple-only native dependency: `@lunarr/vlc-player`

Added 2026-11-18 as a second live-playback engine. `expo-video` (Media3/ExoPlayer on Android,
AVPlayer on Apple) stays the only engine on Android and remains the VOD engine on both platforms;
on iOS, live channels go through libVLC instead, because AVFoundation refuses this provider's
bare progressive MPEG-TS. Measured on a real iPhone, not assumed: Safari — the same AVFoundation
stack — showed a white page for a channel while playing an mp4 film from the same account, and
the free VLC app played that same channel. Metro picks the engine by platform extension across
`src/playback/engine/livePlaybackEngine.tsx` and `…ios.tsx`.

**Which binary links where.** The package is Fabric (New Architecture) only. Its podspec declares
`{ :ios => '15.1', :tvos => '15.1' }`, adds `MobileVLCKit ~> 3.7.3` on iOS and
`TVVLCKit ~> 3.7.3` on tvOS, and sets `s.static_framework = true`. On Android it links nothing:
`react-native.config.js` sets `platforms: { android: null }`, and that is what keeps the Google
Play artifact unchanged — RN autolinking never pulls `org.videolan.android:libvlc-all` into
Gradle, so libVLC's own `libc++_shared.so` never meets the FFmpeg decoder module's. Verified
rather than assumed: a full `npx expo export --platform android` bundle contains zero libVLC
strings, with working positive controls in the same check. The licensing side — LGPL 2.1+, the
static link and the relinking obligation it raises, and the gnutls/libgcrypt stack MobileVLCKit
bundles — is in docs/THIRD_PARTY_LICENSES.md, recorded there as open.

**What this engine does not do.** The libVLC path has no picture-in-picture, no AirPlay and no
Now Playing beyond what the library registers for itself. That gap is accepted for iOS v1 on the
live path; the decision and its reasoning are in docs/DECISIONS.md, "Accepted: no
picture-in-picture, AirPlay or Now Playing on the libVLC path". It is scoped to live and
expressly not to VOD, which has no libVLC path at all yet.

**Still open, and none of it is paperwork:**

- **The pod has never compiled.** There is no `ios/` directory and no iOS build has ever been
  made with this dependency, so everything above is read off `package.json`,
  `react-native.config.js` and the podspec rather than off a link step.
- `eas.json`'s only iOS profile is `ios-simulator`, and this project's own record says the
  simulator cannot answer a playback question — network playback through AVPlayer fails there
  while a bundled local video plays. The build that could test this does not exist yet.
- libVLC has never been proven to play this provider's streams through *this app* — only through
  the standalone VLC app on an iPhone.
- **tvOS/Apple TV is undecided.** A tvOS build resolves platform `ios`, so it would take the same
  engine file and link TVVLCKit. There is no tvOS profile in `eas.json` and no decision recorded
  anywhere.
- **No VOD adapter exists.** `src/app/movies/player/[movieId].tsx` and
  `src/app/series/player/[episodeId].tsx` still use expo-video/AVPlayer. 13,018 of this account's
  20,124 films are `.mp4` and play there; the remaining ~7,100 are the `.mkv`/x265 share
  AVFoundation refuses.

## Why the react-native-tvos version looks "behind"

`react-native-tvos` ships shortly after each upstream `react-native` release, versioned as
`<rn-version>-<tvos-patch>` (e.g. `0.86.2-0`). Expo's own "Building for TV" guide recommends
pinning via the `<minor>-stable` dist-tag (e.g. `react-native-tvos@0.86-stable`) rather than an
exact version, specifically so this lag resolves itself as new tvOS patches ship. At the time of
writing, SDK 57 bundles stock `react-native@0.86.3`; the tvOS fork's latest 0.86 release is
`0.86.2-0`. A one-patch gap between stock RN and its TV fork is normal, not a bug.

## Known npm resolution quirk

`.npmrc` sets `legacy-peer-deps=true`. Without it, `npm install` fails with an ERESOLVE
conflict: `react-native-reanimated`'s peer range (`"0.83 - 0.86"`) is evaluated against the
*literal* installed version string `0.86.2-0`, and plain semver range matching excludes
prerelease-tagged versions like `-0` unless the range itself names that prerelease. This is a
known interaction between npm's alias resolution and react-native-tvos's versioning scheme — not
specific to this project. The old `albasera-replit` project hit and fixed the same issue the same
way; confirmed independently against a fresh install here rather than copied blind.

## Deliberately not installed yet

Per the master prompt's gated milestones, these are out of scope until their milestone:

- `expo-secure-store` / `expo-sqlite` — real onboarding + persistence milestone, not the spike.
- `expo-image` — image caching milestone; the spike has no artwork to cache.
- `react-tv-space-navigation` — TV hardening milestone; the spike uses plain `Pressable`
  focus (`onFocus`/`onBlur`), which is enough to prove playback behavior on a TV remote.
- `hls.js` / `mpegts.js` — web playback milestone.
- Any i18n library — settings/i18n milestone.
- `react-native-reanimated`-driven UI animation — present as a transitive peer dependency of
  expo-router only; not used by any app code yet.

## Verification run (Milestone 0)

- `npx tsc --noEmit` — clean, 0 errors (strict mode).
- `npx expo-doctor` — 21/21 checks passed.
- `npx expo prebuild --platform android` — succeeds, no warnings, for both the phone config
  and the `EXPO_TV=1` TV config. Confirmed in the generated manifest/gradle files:
  `android.minSdkVersion=26`, `android:usesCleartextTraffic="true"`,
  `applicationId 'com.albasera.player2.dev'` (the placeholder in force when this was checked;
  the live id `com.albasera.player` replaced it on 2026-09-04), and (TV build only) the
  `LEANBACK_LAUNCHER` category plus `android.software.leanback` / `android.hardware.touchscreen`
  as non-required `<uses-feature>` entries.
- Native Gradle compilation was **not** run — this environment has no Android SDK
  (`ANDROID_HOME` unset). See docs/DECISIONS.md for the build-verification boundary this
  implies for every milestone that needs a real APK.
