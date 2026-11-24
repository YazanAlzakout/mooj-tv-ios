# Mooj TV on iOS — what it takes, what it costs, and what could stop it

## 1. Can this ship on iOS at all?

Yes — but not as a port. Nothing in Apple's rules or in the codebase makes it impossible, and IPTV players that take a user-supplied Xtream panel are on the App Store today ([Streamly](https://apps.apple.com/app/id6769753335) and others). The react-native-tvos fork is not the obstacle people assume: it is a full fork of React Native 0.86 that keeps iPhone as a first-class target, and with `EXPO_TV` unset an iOS prebuild is an ordinary iPhone prebuild. The real problem is narrower and harder than configuration. On Android the app plays through Media3/ExoPlayer, and a month of this project's work went into making *this provider's* streams play — a vendored FFmpeg MP2 decoder, a renderer-mode patch, a shared OkHttp client. On iOS `expo-video` is AVPlayer/AVFoundation (`node_modules/expo-video/ios/VideoPlayer.swift:7`), which has no pluggable-decoder mechanism at all, and the content this provider actually serves — H.265 video and MPEG-1 Layer II audio inside MPEG-TS, recorded in `D:/Projects/mooj-tv/docs/CODEC_MATRIX.md` — is three separate things AVPlayer does not take (Apple's HLS Authoring Specification rule 1.5: HEVC *must* be fMP4, not TS; MP2 appears on no Apple audio list; raw progressive `.ts` is not a documented AVPlayer input). So the honest headline is: **iOS needs a second video player (libVLC), and that is the project, not a footnote.** Expect four to eight weeks, not a weekend — and there is a one-day test, described in Phase 0, that proves or kills the whole thing before a single dollar is spent.

## 2. What it costs

**Money, per year.** Apple Developer Program: **$99/year**, same price for an individual or a company, non-refundable, auto-renewing (region-priced in local currency; I did not confirm this on Apple's own billing page, only in secondary sources). That is the only mandatory recurring cost.

**Money, one-off and optional.** No Mac is required — every iOS build goes through EAS. EAS Free gives up to 15 iOS builds a month on the low-priority queue; third-party reporting says free-tier builds are cancelled at 45 minutes, and this project's iOS builds will compile React Native from source (the fork does not publish the dependency artifacts Expo looks for), so the free tier may not be enough. Budget **EAS Starter at $19/month** for the active build months — call it **$60–$120 total** — with iOS builds billed $2 (medium worker) or $4 (large worker) each above the included credit. Optional: a Mac mini (~$600) would turn a 30-minute EAS round trip into a 3-minute local one and is worth considering if Phase 2 runs long; a cloud Mac rental (~$30–80/month) is the cheaper version of the same thing. **Non-optional and easy to forget: at least one real iPhone to test on.** There is no iOS release without a device.

**Calendar — work we do.** Phase 0: 1 day. Phase 1 (config + first build): 2–4 days. Phase 2 (the player): 1–2 weeks, and this is where the range lives. Phase 3 (the rest of the iOS surface): 1–2 weeks. Phase 4 (signing, TestFlight, submission prep): 3–7 days. **Total 4–8 weeks of actual work.** The low end assumes the off-the-shelf libVLC binding works against this fork; the high end assumes we write a thin native Swift wrapper ourselves.

**Calendar — waiting on Apple.** Individual enrolment: 24–48 hours typically. App Review: 24–48 hours for a first decision. Each rejection-and-resubmit cycle: 1–3 days. An appeal to the App Review Board, if guideline 5.2.3 is cited: **1–3 weeks**. So **1–2 weeks of Apple time if it goes well, 4–6 weeks if review fights us.** Enrolment should start during Phase 2 so it never sits on the critical path.

## 3. The blockers, in the order they block each other

**B0 — Does any iOS player handle this provider's streams?** Everything else is downstream of this. If libVLC on an iPhone cannot play the real panel, there is no iOS product and we stop. Options: test it (one hour, free), or build for weeks and find out. **Recommendation: test it.** Details in Phase 0.

**B1 — There is no Apple Developer account.** Nothing is submitted, and TestFlight is unavailable, without one. But an EAS `ios.simulator` build is unsigned and needs no account, so the entire native build including `pod install` can be proven from this Windows machine before paying anything. **Recommendation: enrol as an *Individual* once Phase 1 passes — $99, 24–48 hours, no D-U-N-S number, no company paperwork.** The organisation route needs a D-U-N-S and takes weeks.

**B2 — The video player. This is the work.** `expo-video` on iOS is AVPlayer, and AVPlayer refuses raw `.ts`, HEVC-in-TS and MP2 audio — three independent refusals, any one of which is fatal for this provider. The options: *(a)* ship AVPlayer and accept that most channels fail — not a product; *(b)* **add a libVLC-backed player on iOS behind a thin interface, with `expo-video` staying as-is on Android — recommended**, because libVLC decodes all three natively and because it is demonstrably what shipping App Store IPTV players do; *(c)* write our own Swift module around VLCKit or KSPlayer if the community binding will not cooperate — same outcome, more days; *(d)* ask the panel operator to transcode to H.264/AAC — free for us, entirely outside the owner's control, and it would also fix Android. The architectural cost of (b) is real but bounded: `expo-video` is referenced 42 times across 17 files in `src/`, and the whole `src/playback/*` hook layer is typed against its `VideoPlayer`. The candidate binding is `expo-libvlc-player` (MobileVLCKit on iOS, iOS 15.1+); it is a small community package with inconsistent version numbering across registries and it has never been tried against react-native-tvos 0.86 — that is the single biggest estimate risk in this document.

**B3 — App Review guideline 5.2.3, and the Downloads feature.** 5.2.3 reads: *"Apps should not facilitate illegal file sharing or include the ability to save, convert, or download media from third-party sources ... without explicit authorization from those sources."* This app has a user-facing Downloads screen (`src/app/downloads.tsx`, `src/domain/downloads/`). On Google Play that was fine. On iOS it is the most quotable line in the app pointed straight at the most commonly cited guideline for this category, and developers report 5.2.3 rejections even for players that download nothing. **Recommendation: ship iOS v1 with Downloads off.** The switch already exists in the right shape — `downloadsSupported()` in `src/domain/downloads/eligibility.ts` is keyed to the build, not the platform, and every button, entry point and recovery path keys off it, so an iOS arm is close to one line. Turning it on later, once the app has a review history, is a far easier conversation than defending it on submission one.

**B4 — Plain-HTTP panels and App Transport Security.** The survey called this a hard blocker; the verification pass refuted that and I agree with the verification. `expo-build-properties` has no ATS key and never did — arbitrary Info.plist keys go through Expo's own `ios.infoPlist` field. The fix is `ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads = true` and *nothing else under that dictionary*: adding `NSAllowsArbitraryLoadsForMedia` makes iOS 10+ ignore the global key entirely and silently breaks the plain-HTTP `player_api.php` login, which would present as a login bug, not a network-policy bug. Apple does require a written justification, but it requires one for narrow per-domain exceptions too, so being unable to narrow costs us nothing — and Apple's own first listed acceptable justification is *"the app must connect to a server managed by another entity that doesn't support secure connections,"* which is literally this app. **Recommendation: write that paragraph into App Review Notes up front.** Cost: thirty minutes, not schedule risk. (Side note: `app.config.js:302` points at `docs/DECISIONS.md` as the record of the cleartext choice; that record is actually in `docs/DEPENDENCIES.md`, and neither version contains prose usable for review. Worth writing properly.)

**B5 — `app.config.js` has no `ios:` block at all.** A case-insensitive grep for "ios" across the whole file returns zero hits. Without `ios.bundleIdentifier`, `expo prebuild -p ios` dies at config resolution before CocoaPods is ever reached. The bundle identifier is permanent after publication, exactly like `packageId` in `brand.config.js`. **Recommendation: choose it once, deliberately, in the same sitting as the ATS block.** ~1 hour.

**B6 — Config hygiene that must land before the first prebuild.** Four small things that are cheap now and awkward later: `expo-audio` adds `NSMicrophoneUsageDescription` by default, which would put a Microphone entry on the App Store privacy label of a video player — the exact outcome the Android config went out of its way to avoid; `expo-secure-store` likewise adds `NSFaceIDUsageDescription`. Both are switched off by passing `microphonePermission: false` and `faceIDPermission: false`. SecureStore's iOS default is `WHEN_UNLOCKED`, meaning credentials are unreadable while the screen is locked — which is precisely when background playback runs; pass `AFTER_FIRST_UNLOCK` at the two call sites in `src/core/storage/secureCredentials.ts`. And `expo-navigation-bar` is Android-only: its three call sites (including both player screens) become silent no-ops on iOS, so hiding the home indicator needs `react-native-screens`' `homeIndicatorHidden` instead. Total: under a day, and privacy labels are hard to change once published.

**B7 — Fullscreen orientation is weaker on iOS.** `ScreenOrientation.lockAsync` needs `ios.requireFullScreen: true` to work on iPad, and on iOS 27+ Expo's own documentation says a lock is a preference, not a guarantee. The existing 400ms hand-off tuning in `src/playback/useFullscreenOrientation.ts` was measured against Android's hard lock and should not be ported on faith. Not a blocker; a design item.

**B8 — Do *not* switch to upstream React Native for iOS.** The two packages cannot coexist, and `src/playback/useTVRemote.ts` imports `useTVEventHandler`, which upstream 0.86 does not export — so the swap would break the JS bundle on *every* platform and break the Android TV build that is being submitted right now. The fork is correct and stays. Its only cost on iOS is slow from-source builds; `RCT_USE_PREBUILT_RNCORE=1` is the lever to try later, after one clean build has succeeded.

**Dropped after verification:** the MP2 decoder as a standalone blocker (it disappears inside the libVLC decision), the VOD `container_extension` issue as a hard blocker (it is a degradation, also solved by libVLC, and the frequency has never been measured), and ATS as a hard blocker.

**One concrete item, cheap and urgent:** `docs/REVIEW_ACCOUNT_CHANNELS.md:45` recommends putting Sintel 1080p **.mkv** in the review account's Movies category. On Android, harmless. If that account is reused for Apple on an AVPlayer build, the reviewer taps the one film and gets an instant failure. Swap it for the `.mp4` trailer listed one row below.

## 4. What would be done, in order

**Phase 0 — the kill test. One day. $0. No Mac, no Apple account, no code.** On any iPhone, install the free VLC for iOS and open the real provider's channel URL for stream `264311` (the confirmed H.265 + MP2 channel) plus two or three VOD URLs. Then open the same URLs in **Safari**, which uses the same AVFoundation stack AVPlayer does. Three possible answers: Safari plays it → iOS might be cheap after all and we re-plan; Safari fails and VLC plays it → the libVLC plan is confirmed and the estimates below hold; VLC also fails → **stop, there is no iOS path**, and we have learned it for the price of an hour. In the same sitting, one API call to `get_vod_streams` on the real panel, counting `container_extension` values — nobody on this project has ever measured that, and it is the number that decides how much of the movie catalogue is at risk.

**Phase 1 — prove the build. Two to four days. $0.** Add the `ios:` block (bundle identifier, ATS, `requireFullScreen`), the config-hygiene fixes from B6, and an EAS `ios.simulator` profile. Run the first iOS build this project has ever had. It needs no Apple account because a simulator build is unsigned. Delivers: proof that the fork plus Reanimated plus the Expo module set actually pod-install and compile for Apple, and the first real number for build duration and cost. Start Apple enrolment at the end of this phase so it runs in parallel.

**Phase 2 — the player. One to two weeks.** Put a thin interface in front of the player, wire `expo-video` behind it on Android unchanged, wire libVLC behind it on iOS. Delivers: one real channel from the real panel, playing with sound on a real iPhone. This is the phase that can slip; if the community binding fights us, the fallback is a small native Swift module around VLCKit, which is more certain and slower.

**Phase 3 — the rest of the surface. One to two weeks.** Fullscreen and orientation, home indicator, keychain accessibility, the downloads decision, the VOD container allow-list, iOS error messages, and the connection-count behaviour on a 3-connection line — which was hard-won on Android against OkHttp and is completely unmeasured on Apple's URL-loading stack.

**Phase 4 — submission. Three to seven days of ours, plus Apple's.** Signing, TestFlight, review account cleanup, screenshots, the ATS justification and the 5.2.3 positioning in review notes, submit.

## 5. The decisions only you can make

**Whose Apple account?** Your own, as an Individual, costs $99/year and 24–48 hours, and your legal name appears as the seller on the listing. Using the developer you hired for Google Play is faster and anonymous, but the app then lives permanently on someone else's account — you cannot update it without them, and moving it later requires their cooperation in an app transfer. *Recommendation: your own.* It is the asset.

**Do you accept a second player on iOS?** libVLC solves the codecs, but it hands back things `expo-video` gives for free on Apple: background audio, picture-in-picture, AirPlay and the lock-screen Now Playing controls. iOS v1 would likely ship without some of those. Accept the gap, or pay more weeks to rebuild them?

**Do you accept shipping iOS without Downloads?** It materially lowers the chance of a 5.2.3 rejection and removes a whole category of work. The feature can come back in v2.

**Is there an iPhone to test on?** If not, that is a purchase before Phase 0, not after.

**EAS Starter at $19/month, or fight the free tier's build cap?** $19/month during the build phase is almost certainly cheaper than the hours lost to cancelled 45-minute builds.

**Apple TV later — yes or no?** It changes nothing today, but it changes the player choice: libVLC on tvOS is less proven than on iOS, and the fork requires iPhone and Apple TV to be two separate prebuilds (exactly as Android phone and Android TV already are). Worth saying now rather than discovering in Phase 2.

**Are you willing to absorb one rejection-and-appeal cycle?** Best case review is 24–48 hours. If 5.2.3 is cited and we appeal, it is weeks. If the answer is "no, I want certainty," the honest reply is that nobody can give you certainty in this category — only better odds, which is what dropping Downloads and writing the review notes carefully buys.

## 6. What we still do not know

Whether libVLC on an iPhone actually plays *this* provider's streams — Phase 0 answers it in an hour, and until then every estimate here rests on it. How much of the channel lineup is H.265 or MP2: the entire codec picture rests on **one** channel, and `docs/CODEC_MATRIX.md` says so itself. The VOD `container_extension` distribution: never measured, so "a meaningful share of the catalogue will fail" is folklore, not data. Whether `expo-libvlc-player` installs and runs against react-native-tvos 0.86 and Expo 57: untested anywhere, by anyone, as far as I can find. Whether VLCKit's LGPL licensing is comfortable for App Store distribution: dynamic linking is the standard argument and many apps ship this way, but VLC's own history with Apple is a cautionary tale and this needs a real answer *before* integration, not after. Whether App Review accepts this category from a brand-new unknown account: the existing IPTV apps prove it is possible, not that it is easy, and I found no official Apple statement either way. Whether the fork's pods install cleanly at all — no `pod install` has ever been run in this project, there is no `ios/` directory and no Podfile in the repository or in its git history. And whether the EAS free tier's build cap survives a from-source React Native build.

**Where the findings disagreed, and what I believe.** The survey asserted the real provider is `.ts`-only with no HLS fallback; the code says otherwise, and I believe the code — `src/providers/xtream/xtreamAdapter.ts:114-125` records the 2026-09-03 revert, where hard-coding `.ts` made *every* channel 404 on the owner's real provider while HLS played fine. But that does not rescue iOS, because the HLS output is HEVC inside TS segments with MP2 audio, and AVPlayer refuses both — and the documented review account returns `allowed_output_formats: ["ts","rtmp"]`, meaning the account an Apple reviewer would use is the worst case. I also side with the verification pass against the survey on three points: MP2 is not a separate blocker (it vanishes with libVLC), the VOD container issue is a degradation rather than a blocker, and ATS is configuration rather than schedule risk. The one thing I would add that no surveyor covered: guideline 5.2.3 and the Downloads feature is, in my judgement, a larger threat to this submission than any codec.

**Files worth reading before the next step:** `D:/Projects/mooj-tv/src/providers/xtream/xtreamAdapter.ts` (lines 110-160), `D:/Projects/mooj-tv/docs/CODEC_MATRIX.md`, `D:/Projects/mooj-tv/app.config.js` (lines 220-315), `D:/Projects/mooj-tv/docs/REVIEW_ACCOUNT_CHANNELS.md`, and `D:/Projects/mooj-tv/src/domain/downloads/eligibility.ts`.

Sources: [Apple Developer Program fee](https://ambsandigital.com/?p=11104) · [Apple enrolment guide](https://www.webtonative.com/blog/apple-developer-program-enrollment) · [Expo pricing](https://expo.dev/pricing) · [Expo billing plans](https://docs.expo.dev/billing/plans) · [App Store Review Guidelines (5.2.2, 5.2.3, 4.2)](https://developer.apple.com/app-store/review/guidelines/) · [NSAllowsArbitraryLoads](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowsarbitraryloads) · [HLS Authoring Specification](https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices) · [Apple forum: AVPlayer and raw MPEG-TS](https://developer.apple.com/forums/thread/710481) · [Apple forum: 5.2.3 rejections for player apps](https://developer.apple.com/forums/thread/845230) · [expo-libvlc-player README](https://app.unpkg.com/expo-libvlc-player@2.3.1/files/README.md) · [Streamly: IPTV Player on the App Store](https://apps.apple.com/app/id6769753335)

---

## Settled since this document was written — 2026-11-18

Three of the unknowns listed above are no longer unknown. Read this section
before the parts it corrects.

**The iOS project builds.** EAS build `819a7469` finished in six minutes from
this Windows machine, against commit `827a972`, SDK 57, profile
`ios-simulator`. The react-native-tvos fork, Reanimated, Worklets and the whole
Expo module set pod-install and compile for Apple with no change beyond the
`ios:` block added the same day. The question "has `pod install` ever run here"
is answered: it runs, and it passes.

**The player architecture is not an open question.** iOS IPTV players solve this
one way, and have for years: VLCKit/libVLC, usually *alongside* AVPlayer rather
than instead of it. [msplayer](https://github.com/latinsundon24/msplayer) routes
HLS and MP4 to AVPlayer and RTMP/RTSP/UDP/FLV to VLC, falling back between them
when playback fails. [Kanal](https://github.com/magnusbomann/kanal) ships
VLCKit 3.7.3 inside a proprietary app and states the LGPL permits it. So B2 is a
wiring job with a known shape, not a research project.

**And a React Native binding exists for exactly this stack.**
`expo-libvlc-player` publishes a `57.x` line tracking Expo SDK 57 — `57.0.59`
at the time of writing, out of 325 releases — and its TV fork documents Expo
SDK 57+, React Native 0.86+, Android TV and Apple TV, driven by the same
`EXPO_TV` flag this project already uses. `@lunarr/vlc-player@2.1.1` is the
New-Architecture-only alternative, carrying MobileVLCKit 3.7.3 and
TVVLCKit 3.7.3 on Apple platforms. The claim above that this was "untested
anywhere, by anyone" was written before these were found, and is wrong.

**One number worth having, measured by someone else.** Kanal reports that
31,027 of 31,176 films in their provider's catalogue were `.mkv` — 99.5%.
AVPlayer opens none of them. This project has never measured its own
distribution, and the VOD container question was downgraded to "a degradation"
above partly for want of data. On that evidence it is not a degradation; it is
the entire film catalogue.

**What is still genuinely unknown**, and both are cheap:

1. Whether libVLC plays *this* provider's streams. Ten minutes on any borrowed
   iPhone with the free VLC app — no purchase, no Apple account, no code.
2. What share of this catalogue is `.mkv`. One `get_vod_streams` call against
   the real panel, counting `container_extension`.

**What also changed in the repository that day:** `brand.config.js` gained
`bundleIdentifier`, `app.config.js` gained the whole `ios:` block (identifier,
build number, `requireFullScreen`, ATS) plus `microphonePermission: false` and
`faceIDPermission: false`, `secureCredentials.ts` moved to
`AFTER_FIRST_UNLOCK`, `eligibility.ts` turns Downloads off on iOS for
guideline 5.2.3, `eas.json` gained the `ios-simulator` profile, and
`docs/REVIEW_ACCOUNT_CHANNELS.md` lost its `.mkv` recommendation. The Android
release build was rebuilt afterwards and is unchanged: same 13 permissions, no
microphone, `verify-brand` passing.

---

# What a day of running the app on iOS actually established — 2026-11-18

Everything above this line was written before any iOS binary existed. This
section is written after one, and several of its confident claims did not
survive contact. Read this first; where it disagrees with the plan above, this
is the one that was measured.

## The app runs on iOS

EAS build `819a7469`, six minutes, from Windows, no Mac. Then three more builds
the same afternoon. The react-native-tvos fork, Reanimated, Worklets and the
whole Expo module set pod-install and compile for Apple with nothing beyond the
`ios:` block added that morning.

Driven on an iPhone 15 Pro simulator through Appetize, with a real account
(11,294 channels, 20,124 films, 6,179 series), the app:

- completed onboarding, the terms gate and provider setup
- **authenticated and downloaded the entire 37,000-item catalogue over plain
  HTTP** — ATS works, and `NSAllowsArbitraryLoads` is verifiable in the shipped
  `Info.plist` as bytes, not as config
- rendered every screen correctly, including the flush tab bar, which came out
  right first time
- showed no Download button on the film detail screen, which is the
  guideline 5.2.3 change working

Six unknowns from the plan above are closed by that list.

## Playback: what is settled, and how

| Tested | Result |
|---|---|
| mp4 film, Safari on a real iPhone | **plays** |
| bare `.ts` channel, Safari on a real iPhone | white screen, no player |
| the app's own bundled splash video, in the simulator | plays |
| mp4 film, in the app, in the simulator | fails, `playbackUnknown` |
| 37k-item catalogue over HTTP, in the app | loads completely |

Safari uses the same AVFoundation stack the player does. So:

**Films play on AVFoundation.** The film that failed inside the app was probed
byte by byte: `ftyp` brand `isom`, `moov` at offset 36 (faststart), video
`avc1` (H.264), audio `mp4a` (AAC), served at 2 MB/s over a 302 redirect to
`lb1.albasera-tv.net` with a one-time token. That is the single best-supported
combination Apple has. 13,018 of this account's 20,124 films are `.mp4`.

**Bare MPEG-TS does not play on AVFoundation.** Safari produced a white page
rather than a player — the shape of a response iOS cannot render at all, as
distinct from the film, where Safari built a player and then buffered. Apple's
documented path for `.ts` is as a segment inside an HLS playlist, never as a
progressive stream. All 11,294 channels on this account are bare `.ts`:
`allowed_output_formats` is `["ts","rtmp"]`, so `buildLiveStreamCandidates`
never even offers an `.m3u8`.

**So the architecture is hybrid, and now for a measured reason:** AVPlayer for
the two thirds of films it plays natively — keeping picture-in-picture,
AirPlay, background audio and Now Playing, all four of which this app already
asks for — and libVLC for the channels and the `.mkv` third.

## The simulator cannot answer a playback question

A film that demonstrably plays in Safari on real hardware fails in the
simulator, while a bundled local video plays there. Local decode works; network
playback through AVPlayer does not. Every playback result from Appetize is
therefore uninformative, in either direction.

This cost most of an afternoon, and the sequence of wrong conclusions is worth
keeping because each one looked reasonable:

1. *"The simulator is weak at video"* — plausible, and it stopped the
   investigation. Wrong: the owner saw the splash play.
2. *"Then it must be ATS for AVFoundation"* — this one is documented in this
   repo's own config comment, which is exactly why it was convincing. Adding
   `NSAllowsArbitraryLoadsInMedia` and `NSAllowsArbitraryLoadsInWebContent`
   broke the login outright: `fetch failed: ... App Transport Security policy
   requires the use of a secure connection`. The rule, written in that same
   comment ten minutes earlier: once any sub-key appears, iOS ignores
   `NSAllowsArbitraryLoads` — and there is no sub-key for ordinary URLSession
   traffic. The original single key was right. Reverted.
3. *"The panel is refusing the stream (HTTP 406)"* — wrong. Channel `264311`,
   taken from `docs/CODEC_MATRIX.md`, does not exist on this account. Real ids
   return `HTTP 200`, `video/mp2t`, megabytes streaming. That file's ids are
   from an older account and should not be reused without checking.

## The player library: read the code, not the README

`XJ_Player` advertises itself as "an open source IPTV player for iOS and
Android built with React Native (Expo)". Its player is 61 lines wrapping
`expo-av`, and `react-native-vlc-media-player` sits in its package.json
imported by nothing — verified across every `.ts`/`.tsx` file in the repo.
Recommending it on the strength of its description was a mistake.

The same test applied to the rest:

- **`@lunarr/vlc-player` 2.1.1 — passes.** MobileVLCKit 3.7.3 / TVVLCKit 3.7.3
  (stable, not pre-release), Fabric-only, 950 lines of Swift and 982 of Kotlin
  that genuinely construct `VLCMediaPlayer` / `LibVLC`. Its example app depends
  on `react-native: npm:react-native-tvos@0.86.2-0` with `expo ~57.0.13` and
  builds with `EXPO_TV=1` — our stack exactly. Gaps that matter to us: no HTTP
  headers on the source, no synchronous readers, and `onError` carries no
  reason at all.
- **`expo-libvlc-player` — passes on code, fails on maintenance.** Real VLCKit,
  real config plugin, a maintainer shipping almost daily. But the `57.x` line
  is dead — 57.0.59 and 58.0.0 shipped the same day and there have been no
  57.x releases since against eighteen 58.x. It pins VLCKit `4.0.0a25`, fetched
  from a URL path named `unstable`. Its `EXPO_TV` support is a README claim
  with zero code behind it. Open issue #24 is a black-screen-with-audio report
  on IPTV HTTP `.ts` — our exact content. The `tct123` fork is a stale mirror:
  zero commits of its own.
- **BlueIPTV — "patched libVLC" is false.** The patch is a patch-package patch
  of a JS wrapper's Android Java: a released-player crash on background/PiP and
  a missing audio-focus request. No libVLC fork, no iOS path at all. Its value
  is diagnostic — those two bugs are what anyone putting libVLC behind React
  Native hits.

## What swapping the player would actually cost, measured here

**14 files in `src/` import from `expo-video`** — not the 42-across-17 guessed
above, which counted comments. Eleven are a mechanical swap. Three are hard,
and nearly all the risk is in roughly 400 lines of one of them.

The three structural facts that decide hybrid-versus-libVLC-everywhere, all
from this codebase:

- The live player constructs **one** `VideoPlayer` and hands the same object to
  two render trees — `<VideoView>` when fullscreen, `SplitChannelView`'s when
  upright. Rotation must not reconstruct the native player.
- All **17** event subscriptions go through `useEventListener` from `expo`,
  which requires the player to be an Expo SharedObject. A non-Expo native
  module means rewriting all 17 across 7 files.
- `usePlaybackTracks` assigns whole track **objects** back to the player and
  uses object identity as the selection. libVLC addresses tracks by integer id.
  That is a data-model change, not a rename.

Movies and series are ~90 and ~140 lines of playback each, against content that
is 64.7% `.mp4`. The live player is the expensive one. That asymmetry is the
argument for hybrid.

## The one thing still unknown, and it is cheap

**Does libVLC play this provider's streams on real Apple hardware?** Everything
above assumes it. The test needs no Apple account, no Mac and no money: install
the free VLC app on any iPhone and open

    http://albasera-tv.net/live/<user>/<pass>/283572.ts

VLC for iOS is the same libVLC we would embed. If it plays, the plan holds. If
it does not, there is no live TV on iOS and we have learned it for nothing.

Installing *this app* on a physical iPhone still requires the $99 Apple
Developer Program — free provisioning needs Xcode, which needs a Mac.

## Answered, the same evening

**libVLC plays this provider's channels on real Apple hardware.** The owner
installed the free VLC app on an iPhone and opened
`http://albasera-tv.net/live/<user>/<pass>/283572.ts` — a bare progressive
MPEG-TS stream, the same shape as all 11,294 channels on this account, and the
same one Safari had refused with a white page an hour earlier. It played.

VLC for iOS embeds the same libVLC that `@lunarr/vlc-player` and
`expo-libvlc-player` wrap, so this is not an analogy: it is the engine we would
ship, decoding the content we would ship it for, on the hardware it would ship
to.

With that, every technical assumption behind the iOS port has been tested
rather than argued:

| Claim | How it was settled |
|---|---|
| The project builds for Apple | four EAS builds from Windows, six minutes each |
| Plain-HTTP panels work under ATS | 37,000-item catalogue downloaded in-app |
| mp4 films play on AVFoundation | Safari, real iPhone, same URL |
| bare `.ts` does not | Safari, real iPhone, white page |
| **libVLC plays the `.ts`** | **VLC for iOS, real iPhone** |
| A second player costs 14 files | counted in `src/`, 11 mechanical |

Nothing technical is left open. What remains is money and ownership — the $99
enrolment, whose Apple account the app lives on, and whether to accept the
feature gap libVLC brings (no picture-in-picture, AirPlay or Now Playing on the
VLC path), which is the reason the plan is hybrid rather than libVLC for
everything.

---

# The engine is in the repository; nothing Apple-side has compiled it — 2026-11-18

Everything above was written when the second player was still a plan. It is
now code: `src/playback/engine/` holds `index.ts`, `types.ts`,
`livePlaybackEngine.tsx`, `livePlaybackEngine.ios.tsx`,
`enginePlaybackError.ts` and `vlc/VlcLivePlayer.ts`, `@lunarr/vlc-player@2.1.1`
is in `package.json`, and `react-native.config.js` keeps it out of the Android
link. Writing it falsified one of the load-bearing sentences above, turned one
open question into a decision that two code comments already cite, and exposed
a whole class of mistake that no amount of reading could have caught. It also
left the single biggest claim above — that the project builds for Apple —
describing a tree that no longer exists.

## The `useEventListener` / SharedObject claim is false

Line 263-265 above says all 17 event subscriptions go through
`useEventListener` from `expo`, "which requires the player to be an Expo
SharedObject," and concludes that a non-Expo native module means rewriting all
17 across 7 files. That was asserted, not read, and it is the one sentence in
this document most likely to make someone abandon the hybrid approach as
impossible. It is wrong.

`node_modules/expo/src/hooks/useEvent.ts:92-111` is the whole contract. The
hook calls `eventEmitter.addListener(eventName, callback)`, keeps the returned
value, and on cleanup calls `subscription.remove()`. Nothing else. No
SharedObject, no native handle, no identity check, no `EventEmitter` subclass
— the parameter is typed as an `EventEmitter`, and TypeScript structural
typing is satisfied by anything carrying that one method.

A plain Map of callbacks satisfies it, and that is what the adapter does:
`VlcLivePlayer` keeps `private readonly listeners = new Map<string,
Set<EngineListener>>()` (`src/playback/engine/vlc/VlcLivePlayer.ts:290`) and
implements `addListener(name, listener): { remove: () => void }` at :344. All
17 subscriptions in the live screen keep working against a pure-JavaScript
object. The cost quoted above as a rewrite across 7 files was roughly fifteen
lines in one file.

The lesson is the one the player-library section above already learned from
`XJ_Player`: read the code, not the README — and that applies to this
document's own confident paragraphs, not only to other people's.

## The feature gap on the libVLC path: answered, in the decision log

Lines 313-317 above end this document on an open question — "whether to accept
the feature gap libVLC brings (no picture-in-picture, AirPlay or Now Playing on
the VLC path)". Two code comments
(`src/playback/engine/livePlaybackEngine.ios.tsx:101` and
`src/playback/engine/types.ts:64`) cite those lines as a *recorded decision*.
They were citing a question — nothing in this document ever answered it.

It is answered now, and not here. `docs/DECISIONS.md` carries the entry
*"Accepted: no picture-in-picture, AirPlay or Now Playing on the libVLC path
(2026-11-18)"*, which is where a decision of this project belongs and which
states the trade in full: the gap is accepted for iOS v1 on the live path,
because those three features belong to AVPlayer, the hybrid plan keeps AVPlayer
for the films that play on it, and rebuilding them around a VLC media session
is work counted in weeks and verifiable only on hardware this project does not
have. Reversible, and scoped to live.

Two consequences for this file. Section 5's question is no longer open, and the
two code comments cite the wrong document — they should point at
`docs/DECISIONS.md`; both files are owned elsewhere and were not touched from
this pass. What is *not* decided is anything about the VOD path, because that
path does not exist yet (below): if films ever move to libVLC too, the decision
has to be made a second time, and with less comfort — losing PiP and AirPlay on
a two-hour film is not the same trade as losing it on a channel.

## The platform extension Metro never loaded

The iOS engine was committed in a state where it could not run. The fallback
was written as `livePlaybackEngine.ts` and the iOS implementation as
`livePlaybackEngine.ios.tsx`, which looks correct and is not. Expo's
`sourceExts` are `ts, tsx, mjs, js, jsx, json` in that order
(`@expo/config`'s `getBareExtensions`, with TypeScript and React enabled), and
`metro-resolver/src/resolve.js:511-540` loops over those extensions in the
*outer* loop: for each extension it tries `.ios.<ext>`, then `.native.<ext>`,
then `.<ext>`, and returns the first hit. So the resolver finished with `ts` —
finding plain `livePlaybackEngine.ts` — before it ever considered `tsx`, where
the `.ios` candidate lived. On iOS, `import "./livePlaybackEngine"` resolved
to the `expo-video` file. The iOS engine was unreachable and every line of it
dead.

**A platform extension only wins when it shares the `sourceExt` of its
fallback.** `foo.ios.tsx` loses to `foo.ts`; `foo.ios.tsx` beside `foo.tsx`
wins. The fallback has been renamed to `livePlaybackEngine.tsx`, which puts
both candidates at the same extension and gives the platform suffix its
priority back.

How it was caught matters more than the bug. Not by review — the file names
read as correct to anyone who has used platform extensions for years, and the
TypeScript compiler, the linter and the test suite are all equally blind to
which of two files Metro picks. It was caught by building both bundles
(`npx expo export`, once per platform) and grepping the Hermes string tables,
with positive controls to prove the grep could find what it was looking for:
the iOS bundle contained no libVLC strings at all. The same two-bundle check
confirms the other half of the design — a full
`npx expo export --platform android` contains zero libVLC strings, so the
Android artifact that ships on Google Play today is untouched by any of this.

The reusable rule: **a bundle is the only thing that proves which file
loaded.** For any platform-split module, export both bundles and grep for a
string that exists in exactly one branch. It costs two builds and it is the
only evidence here that is not an assumption.

The cheap half of that rule is now permanent: `src/playback/engine/index.ts`
carries a `__DEV__` assertion comparing the engine's own name against
`Platform.OS`, so a development build says out loud which file Metro picked. An
assertion is not a branch — it adds no libVLC import to the Android graph.

## "The project builds for Apple" predates the dependency

Every Apple-side claim above — the six-minute EAS build `819a7469` against
commit `827a972`, the three more builds that afternoon, the table row *"The
project builds for Apple | four EAS builds from Windows, six minutes each"* —
was measured **before `@lunarr/vlc-player` existed in this project.** Those
builds are still true about what they tested, and they are no longer evidence
about the tree as it stands today. Read every one of them as dated.

**The pod has never been resolved and has never compiled.** There is no `ios/`
directory in this repository, so no `Podfile` exists, so `pod install` has
never seen this dependency, and no iOS binary has ever been produced that
contains libVLC. What is known about the pod is only what its podspec says
(`node_modules/@lunarr/vlc-player/react-native-vlc-player.podspec`): platforms
`{ :ios => '15.1', :tvos => '15.1' }`, `s.static_framework = true`, and a
dependency on `MobileVLCKit ~> 3.7.3` or `TVVLCKit ~> 3.7.3` chosen by
regex-matching `platform :tvos` in the Podfile text — a deliberate trick, with
its reasoning written in the podspec itself, because autolinkers pick one
podspec per package with no platform awareness. Reading it is not compiling
it. A static framework carrying libVLC, pulled into a Fabric-only pod with
Swift/C++ interop settings, is the kind of thing that fails at link time
rather than at install time.

Nor can the next build answer the playback question. The only iOS profile in
`eas.json` is `ios-simulator`, and this document's own section *"The simulator
cannot answer a playback question"* settled that network playback through
AVPlayer fails there while a bundled local video plays. For libVLC the
simulator result is unknown in both directions, and an unknown-in-both-
directions result is worth nothing. **libVLC has never been proven to play
this provider's streams through *this app*** — only through the standalone VLC
app on an iPhone, which is the right evidence about the engine and no evidence
at all about the integration.

So the honest state is: the Apple-side work is written, checked against the
library's own source, and entirely unexecuted. The next real milestone is not
a feature; it is the first `pod install` plus a link of MobileVLCKit, on a
profile that can be installed on a physical iPhone — which needs the $99
enrolment, because free provisioning needs Xcode and Xcode needs a Mac.

## tvOS would link a second LGPL binary, and nobody has decided to

tvOS is not mentioned anywhere above, and it should have been the moment this
dependency landed. A tvOS build resolves React Native's platform as `ios`: it
would take `livePlaybackEngine.ios.tsx` unchanged, and its Podfile would say
`platform :tvos`, so the podspec's regex would select **TVVLCKit 3.7.3**.
Apple TV therefore inherits the entire libVLC path by default, without anyone
choosing it, the first time a tvOS prebuild is run.

Two things follow. First, there is no tvOS profile in `eas.json` and no
decision recorded anywhere about Apple TV — so this is a door left open, not a
plan. Second, the licence question doubles. libVLC/VLCKit is **LGPL 2.1 or
later**, and `MobileVLCKit` additionally bundles its own TLS and crypto stack
(gnutls, libgcrypt) to serve `https` and `rtsps`. This project already ships
one LGPL 2.1+ binary — the vendored FFmpeg MP2 decoder — and
`docs/THIRD_PARTY_LICENSES.md` records, in its own words, that the LGPL
relinking obligation there is configured intent rather than completed legal
clearance, and still open. Adding MobileVLCKit on iOS makes that two, as a
statically-linked framework; adding TVVLCKit on tvOS makes it three binaries
across two Apple targets. The relinking question is the same one in all three
cases and it has still not been answered by anyone. It needs answering before
submission, not after, and `docs/THIRD_PARTY_LICENSES.md` is where the answer
belongs.

## The error that carries no reason, and what was assumed in its place

One cost of libVLC is written into the code rather than into a plan, and it
belongs in this record because it is a deliberate, reversible trade and not an
oversight. The library's error event carries no HTTP status and no message —
the payload is `type`, `currentTime`, `duration`. A 403 (all three connection
slots in use) and a 404 (the panel's empty-bodied answer to a request burst,
which is a rate block rather than a connection-count block) are therefore
indistinguishable, and this app will not fire a second HTTP request on a
failure path to find out.

`OPAQUE_OPEN_FAILURE_CATEGORY` in `src/playback/engine/vlc/VlcLivePlayer.ts`
resolves that by assuming `http_unauthorized` for any failure that happens
before a single byte is demuxed: it keeps the URL shape and retries the timing
— 6 attempts at 2.5s — instead of walking four candidate URL shapes in a
burst, which on a three-connection line is how a rate block gets earned. The
cost, stated plainly: a channel genuinely off the air waits 15 seconds and is
then reported to the user as "busy" rather than "off the air", and a panel
that serves a URL shape other than the first candidate would never play on
iOS at all. That is safe for *this* provider and only for this provider,
because `buildLiveStreamCandidates`
(`src/providers/xtream/xtreamAdapter.ts:141`) puts `/live/user/pass/id.ts`
first and this panel's `allowed_output_formats` is `["ts","rtmp"]`. A
different panel invalidates the assumption, not the code.

It is recorded as a decision of its own in `docs/DECISIONS.md`, with the
one-line escape hatch and what a true 403/404 answer would cost. It is
repeated here because it is the first thing on this path that a reader of a
readiness document would otherwise mistake for a bug.

## The VOD half of the hybrid plan does not exist

The architecture above is hybrid for a measured reason — AVPlayer for the
films it plays natively, libVLC for the channels and the `.mkv` share. Only
the first half of that sentence is true in code, and only because it is the
half that was already there.

`src/app/movies/player/[movieId].tsx` and
`src/app/series/player/[episodeId].tsx` both still
`import { useVideoPlayer, VideoView } from "expo-video"` — unchanged, AVPlayer
on iOS. There is no VOD engine, no VOD adapter, and no platform-split file for
either screen. 13,018 of this account's 20,124 films are `.mp4`, the format
AVFoundation handles best — measured where it could be measured, in Safari on a
real iPhone, and never yet inside this app on real hardware. The other 7,106
are the `.mkv`/x265 share AVFoundation refuses, and on iOS today they would
fail exactly as they fail without any of this work. Nothing above should be
read as saying otherwise.

That is a defensible shape for a first submission — two thirds of the film
catalogue, all of live TV — but it is a gap, not a completed plan, and the
remaining third is a counted number rather than a vague risk.

## What is unknown now

The list above has shrunk and shifted; this is what is actually open.

1. **Whether the pod links.** `pod install` plus a compile of MobileVLCKit
   3.7.3 as a static framework inside a Fabric-only pod, against
   react-native-tvos 0.86. Never attempted.
2. **Whether libVLC plays these streams through this app**, as opposed to
   through the VLC app. Needs a build on a physical iPhone, which needs the
   $99 enrolment.
3. **The LGPL relinking obligation**, for the FFmpeg decoder on Android and
   for MobileVLCKit/TVVLCKit on Apple. Open in
   `docs/THIRD_PARTY_LICENSES.md` since before any of this.
4. **Apple TV: in or out.** It inherits the libVLC path by default and links a
   second LGPL binary. No profile, no decision.
5. **The VOD path for the 7,106 non-`.mp4` films.** No code, and the
   feature-gap decision in `docs/DECISIONS.md` does not cover it.
