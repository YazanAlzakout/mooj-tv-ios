const isTV = process.env.EXPO_TV === "1";

/*
 * Every value that makes this build Mooj TV rather than some other brand.
 * One object, one file, shared with the runtime through
 * `src/core/brand/index.ts` — see the note at the top of brand.config.js
 * for why it is not spread over the places it is used.
 */
const BRAND = require("./brand.config.js");

/**
 * **A build that installs beside the published app instead of replacing it.**
 *
 * Google Play re-signs every upload with its own app-signing key, while a
 * build made here is signed with the upload key. Android treats a different
 * signature as a different app and refuses to update across it — so a
 * sideloaded test build on a phone that has the store copy fails with
 * `INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match`, silently
 * leaving the old app in place. Measured on the owner's own phone,
 * 2026-10-05, while trying to test a fix.
 *
 * The only ways out are to uninstall the store copy — which erases the saved
 * provider, the library and the watch history with it — or to let the test
 * build be a different app. This is the second. Set `MOOJ_DEV_ID=1` and
 * the build takes its own id, its own launcher label and its own URL scheme,
 * so both copies live on one phone and the real one is never touched.
 *
 * **It must never reach Play.** A build carrying this id is not the app:
 * it has no listing, no reviews and no users. `npm run prebuild` without the
 * variable puts everything back — and because the id also decides the Kotlin
 * package on disk (see the note on the build command below), that is not
 * optional bookkeeping, it is how the production build is produced at all.
 *
 * Two things do not follow the id, and both are accepted rather than fixed:
 * the dev-client scheme `exp+mooj-tv` comes from `slug`, which is
 * tied to the EAS project, so "open in development build" may offer a choice
 * when both copies are installed; and the 1.x provider import
 * (`legacyProviderImport.ts`) reads the *old published app's* SecureStore,
 * which only exists under the production id — that one migration path can
 * only be tested on a build carrying it.
 */
const isDevId = process.env[BRAND.devEnvVar] === "1";

/*
 * The live app id, and the one value here that can never be taken back: a
 * changed package id after publication is a different app to Play, with its
 * own listing, its own install base and its own reviews. Chosen 2026-11-07,
 * while nothing was published and it was still free to choose.
 *
 * The value lives in brand.config.js because it is brand identity rather
 * than build configuration.
 */
const ANDROID_PACKAGE = isDevId ? BRAND.packageId + ".dev" : BRAND.packageId;

/*
 * Play orders releases by this number and refuses an upload carrying one it
 * has already seen — on any track, not only production.
 *
 * This app has never been published, so it starts at 1 with the whole range
 * ahead of it. Nothing increments it automatically: the project builds
 * natively rather than through EAS, so it is raised here by hand for every
 * upload.
 *
 * One rule is carried over from the project this was cloned from, because
 * it was learned the expensive way: **a free versionCode is read from App
 * bundle explorer in Play Console, never inferred from the repository.**
 * There, a number looked unused because no commit mentioned it, and Play
 * refused the upload — a build had reached a test track and left no trace
 * in git.
 */
const VERSION_CODE_BASE = 7;

/*
 * Phone and TV are one app on Play — same listing, same package id, with
 * Android TV as a form factor rather than a separate product — but they
 * are two different artifacts, and Play refuses two artifacts sharing a
 * versionCode in one release. So the TV build takes the next number up.
 *
 * Keep the step at 1 and move `VERSION_CODE_BASE` by 2 each release, so
 * the pair never collides with the next release's pair.
 */
const ANDROID_VERSION_CODE = isTV ? VERSION_CODE_BASE + 1 : VERSION_CODE_BASE;

module.exports = {
  expo: {
    /*
     * The launcher label. Both halves come from brand.config.js, so a
     * further brand needs no edit in this file at all.
     */
    /* A sideload copy says so on the home screen, or the tester cannot tell the two apart. */
    name: isDevId
      ? (isTV ? BRAND.displayNameTv : BRAND.displayName) + " (dev)"
      : isTV
        ? BRAND.displayNameTv
        : BRAND.displayName,
    slug: BRAND.slug,
    /*
     * The version the store shows. It moves with every upload and it is for
     * people to read — `versionCode` below is the number Play actually
     * orders releases by.
     *
     * Nothing is published yet, so this is the first one.
     */
    version: "1.1",
    orientation: isTV ? "landscape" : "default",
    icon: "./assets/images/icon.png",
    /*
     * Branched with the id: two installed copies claiming one scheme make
     * Android stop resolving `moojtv://` to either of them — it
     * offers a chooser, or picks whichever it likes, so a deep link tested
     * on the sideload build opens the store copy half the time.
     */
    scheme: isDevId ? BRAND.scheme + "dev" : BRAND.scheme,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    android: {
      package: ANDROID_PACKAGE,
      versionCode: ANDROID_VERSION_CODE,
      /*
       * The colour of the window itself, before React draws anything into
       * it.
       *
       * Nothing set this, so `AppTheme` inherited AppCompat DayNight's own
       * default — white on a device whose system is in light mode, which is
       * most of them. That white is what is on screen for the whole gap
       * between the native splash coming down and the first JS frame:
       * src/app/_layout.tsx hides the splash the moment the fonts resolve,
       * and `ThemeProvider` then renders nothing until `getAppState()` comes
       * back, which on a first install means opening the database and
       * running every pending migration. So a dark-first app opened on a
       * white page — longest on the very first launch, which is exactly
       * what a Play reviewer and every new installer sees.
       *
       * #0A0A0F is `darkColors.background` (src/core/theme/palettes.ts):
       * the colour of every themed page in the app's default theme, the
       * colour of the native splash configured below, and the colour the
       * brand intro plays over (BrandSplash's root is `C.background`). With
       * it set, every frame from launch to the first list is the same
       * near-black and there is no handoff left to see.
       *
       * It is **not** `Colors.background` in src/core/theme/tokens.ts,
       * which is #050A14 — that object is the palette for the surfaces that
       * stay dark in *both* themes (the controls over a running video),
       * not the page.
       *
       * expo-system-ui turns this into an `activityBackground` colour and
       * an `android:windowBackground` item on AppTheme. Its plugin runs
       * automatically as one of prebuild's versioned SDK plugins, so it
       * needs no entry in `plugins` below — but android/ is checked in, so
       * it does need an `npm run prebuild` before it is in the manifest.
       */
      backgroundColor: "#0A0A0F",
      /*
       * SYSTEM_ALERT_WINDOW — "Display over other apps" — was in the merged
       * manifest and nothing in this app has ever asked for it. It arrives
       * from a library's own manifest and merges in silently.
       *
       * It is not an ordinary permission. Play lists it under special app
       * access, Android shows it on its own settings page, and an IPTV
       * player that can draw over other apps is exactly the shape of thing
       * a reviewer looks twice at. Nothing here draws a bubble or an
       * overlay outside its own window.
       *
       * `blockedPermissions` is what removes one. `permissions: []` does
       * not subtract — it only adds — so the list has to be blocked by
       * name, which @expo/config-plugins turns into a
       * `tools:node="remove"` entry that survives the merge.
       */
      blockedPermissions: ["android.permission.SYSTEM_ALERT_WINDOW"],
      adaptiveIcon: {
        // Matches the published app exactly, icon assets included: this
        // release replaces it on Play, and an updating user should find the
        // same icon in the same place on their home screen.
        /*
         * A colour, and no background image.
         *
         * `backgroundImage` wins over `backgroundColor` when both are
         * given, so the navy plate was being drawn from a 2048px file and
         * the colour beside it did nothing. Dropping the file lets the
         * colour decide, which is what makes this one line in
         * brand.config.js the whole answer for a rebrand.
         */
        backgroundColor: BRAND.adaptiveIconBackground,
        foregroundImage: "./assets/images/android-icon-foreground.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      intentFilters: isTV
        ? [{ action: "MAIN", category: ["LEANBACK_LAUNCHER"] }]
        : undefined,
      /*
       * No `usesFeatures` here: it is not an Expo config key and prebuild
       * ignores it. The manifest's <uses-feature> entries come from
       * @react-native-tvos/config-tv below, and the block that used to sit
       * here claimed leanback was optional — the opposite of what the TV
       * build actually needs.
       */
    },

    /*
     * iOS. Nothing here has ever been built — there is no `ios/` directory and
     * no Podfile anywhere in this repository's history. This block exists so
     * that `expo prebuild -p ios` can resolve at all: without
     * `bundleIdentifier` it dies at config resolution, before CocoaPods is
     * ever reached.
     *
     * Added 2026-11-18 as the first step of an iOS port whose decisive
     * question is not configuration but playback — see docs/IOS_READINESS.md.
     */
    ios: {
      bundleIdentifier: isDevId ? BRAND.bundleIdentifier + ".dev" : BRAND.bundleIdentifier,

      /*
       * Apple's counterpart to Android's versionCode. A string on purpose —
       * Apple compares build numbers as dotted sequences, not integers — and
       * kept in step with ANDROID_VERSION_CODE so that one release carries one
       * number on both stores.
       *
       * This line is why `eas.json` sets `appVersionSource: "local"`. The
       * default, `"remote"`, has EAS keep its own counter on its servers and
       * ignore this value — which would be fine for a project built entirely
       * on EAS, and is wrong for this one: the Android releases are built here
       * with Gradle and take their versionCode from ANDROID_VERSION_CODE a few
       * lines up. With a remote counter the two stores would drift apart, and
       * the number in this file would quietly stop meaning anything. EAS
       * warned about the conflict on the first iOS build (2026-11-18); this is
       * the half of the fix that keeps one number for one release.
       */
      buildNumber: String(ANDROID_VERSION_CODE),

      /*
       * A real 1024 icon, rather than the 512 at the top of this config
       * stretched to twice its size.
       *
       * Apple takes the App Store icon from the uploaded build — there is no
       * icon field on the version page — so whatever is here is what appears
       * on the store and on the home screen, and 1024x1024 is the size it is
       * asked to produce. The project icon is 512x512, which Expo would
       * upscale.
       *
       * This file is not a different icon. It was composed from
       * `splash-icon.png`, which is a genuine 1024 source, onto the same
       * `#001651` ground at the same geometry as the icon published on Google
       * Play, and checked by scaling it back down to 512 and comparing:
       * 91.9% of bytes within 8/255, sphere bounding box within four pixels.
       * The remainder is resampling noise. The app looks the same in both
       * stores, which is the point.
       *
       * It is RGB with no alpha. Apple rejects an icon with transparency, and
       * rounds the corners itself — so this must not be pre-rounded either.
       */
      icon: "./assets/images/ios-icon-1024.png",

      /*
       * `ScreenOrientation.lockAsync` is ignored on an iPad that advertises
       * multitasking, and the player locks to landscape when it goes
       * fullscreen. Without this the lock silently does nothing on every iPad.
       */
      requireFullScreen: true,

      infoPlist: {
        /*
         * Plain HTTP, and there is no narrower way to say it.
         *
         * Xtream panels commonly serve over `http://`, and the panel the
         * review account lives on is one. iOS blocks cleartext by default, so
         * without this key every login and every stream fails with a network
         * error that reads as a bug in the app.
         *
         * (This used to cite the shortcode table in
         * `src/providers/serverShortcodes.ts` as the second example. That
         * table is empty since 2026-11-18 — see its own comment for why it
         * had to be, before the App Store submission — so the sentence was
         * pointing an auditor at an entry point that had been deliberately
         * removed. The justification never depended on it.)
         *
         * A per-domain exception is impossible by construction: the viewer
         * types the server address at runtime, and it is not knowable at build
         * time. Apple accepts that case — the first justification its own
         * documentation lists for `NSAllowsArbitraryLoads` is "the app must
         * connect to a server managed by another entity that doesn't support
         * secure connections", which is this app exactly. That paragraph goes
         * into App Review Notes at submission.
         *
         * Nothing else belongs under this dictionary. Adding
         * `NSAllowsArbitraryLoadsForMedia` makes iOS 10 and later ignore the
         * global key entirely, which would leave media playing while the
         * plain-HTTP `player_api.php` login broke — a network-policy failure
         * wearing the costume of a login bug.
         */
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,

          /*
           * And NOTHING else in this dictionary. That is not an oversight; it
           * was tried the other way on 2026-11-18 and it broke the app.
           *
           * The reasoning that looked right: films would not play in the app
           * while the login and the catalogue worked, so AVFoundation must be
           * governed separately from URLSession, so state every sub-key
           * explicitly — `NSAllowsArbitraryLoadsInMedia` and
           * `NSAllowsArbitraryLoadsInWebContent` — and cover both.
           *
           * What actually happened: the very next build could not log in at
           * all. "fetch failed: The resource could not be loaded because the
           * App Transport Security policy requires the use of a secure
           * connection", straight out of ExpoModulesCore/Promise.swift, on the
           * first call to `player_api.php`.
           *
           * The rule that explains it: once ANY sub-key appears here, iOS 10
           * and later ignore `NSAllowsArbitraryLoads` and consult only the
           * sub-keys. And the sub-keys cover AVFoundation, WKWebView and local
           * addresses — there is NO sub-key for an ordinary URLSession
           * request. So naming them did not add media coverage on top of the
           * global permission; it replaced the global permission with three
           * narrower ones, none of which covers the app's own networking.
           *
           * Alone, `NSAllowsArbitraryLoads` covers everything, AVFoundation
           * included. Whatever stops a film playing, it is not this key.
           */
        },

        /*
         * The export-compliance declaration, answered here rather than by hand.
         *
         * Apple asks every build whether it uses encryption that is not exempt
         * under US export rules. The app's own code uses none: it speaks HTTP
         * and HTTPS to a server the viewer chooses, and HTTPS is explicitly
         * exempt, as is the platform keychain that holds the credentials.
         *
         * The sentence that used to follow — "nothing here implements or
         * bundles a cipher of its own" — stopped being true on 2026-11-18, and
         * it is recorded here rather than quietly deleted. MobileVLCKit (and
         * TVVLCKit), linked statically through `@lunarr/vlc-player` on Apple
         * platforms, carries its own TLS stack — gnutls and libgcrypt — for
         * `https` and `rtsps` input. The build therefore does bundle ciphers,
         * even though no line of this app calls them and the only transport it
         * uses for media is plain HTTP.
         *
         * `false` is kept, because the basis for it survives on the ordinary
         * reading: publicly available open-source code implementing standard
         * algorithms, used for nothing but standard transport. But this is a
         * declaration to a government, made by whoever uploads the build under
         * their own developer account — not by this file. Whoever submits has
         * to confirm it themselves and change it here if their answer differs.
         * It is called out in the iOS handover notes for that reason.
         *
         * Without this key App Store Connect stops and asks the question
         * interactively on every single upload, which is both a delay and an
         * invitation to answer it differently one day by accident. EAS warned
         * about exactly this on the first iOS build, 2026-11-18.
         */
        ITSAppUsesNonExemptEncryption: false,
      },
    },

    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },

    plugins: [
      "expo-router",
      "expo-image",
      [
        /*
         * Credentials live in the keystore, and nothing in this app ever asks
         * the viewer to prove who they are before reading them.
         *
         * expo-secure-store supports putting a keychain entry behind Face ID,
         * and its config plugin writes `NSFaceIDUsageDescription` into
         * Info.plist by default on the assumption that an app installing it
         * wants that. This one does not: there is no biometric prompt anywhere
         * in the product, and the string alone would put "Face ID" on the App
         * Store privacy label of a video player. Same argument as the
         * microphone below, same answer.
         */
        "expo-secure-store",
        { faceIDPermission: false },
      ],
      "expo-sqlite",
      "expo-localization",
      [
        /*
         * The tab bar plays a short click. Nothing else in this app records
         * or plays audio outside the video players, which carry their own.
         *
         * `enableBackgroundPlayback` is switched off, and that is the whole
         * reason this is configured by hand rather than left as the bare
         * string the installer suggests: the default is **true**, which adds
         * a media foreground service and its notification to the manifest.
         * A player that holds a foreground service it never uses is asking
         * Play to explain why, and asking the viewer to look at a
         * notification for a sound that lasts 70 milliseconds.
         */
        "expo-audio",
        {
          enableBackgroundPlayback: false,
          /*
           * And no microphone. The plugin adds RECORD_AUDIO unless this is
           * explicitly false — it supports recording as well as playback,
           * and assumes an app installing it wants both. This one plays a
           * 70ms click. A player asking for the microphone puts
           * "Microphone" on its Play listing and invites a question from
           * review that has no good answer.
           */
          recordAudioAndroid: false,
          /*
           * The same refusal on Apple's side, and it has to be said
           * separately: `recordAudioAndroid` covers only the Android
           * permission. On iOS the plugin writes
           * `NSMicrophoneUsageDescription` into Info.plist unless this is
           * explicitly `false`, and any usage description string in Info.plist
           * becomes a line on the App Store privacy label. A video player with
           * "Microphone" on its listing invites the same question from Apple
           * that the line above was written to avoid from Google.
           */
          microphonePermission: false,
        },
      ],
      [
        "expo-splash-screen",
        {
          /*
           * Deliberately blank — a 1x1 transparent file.
           *
           * Android draws a splash screen of its own from the moment the
           * process starts until React Native renders its first frame, and
           * since Android 12 it cannot be skipped: the only choice is what
           * it shows. It used to show the brand mark at 200dp, fully
           * formed and perfectly still, for the second or so the bundle
           * takes to load. Then it vanished and the intro clip began on a
           * near-black frame with the sphere not yet formed — so the app
           * opened with a logo, threw it away, and drew it again.
           *
           * With nothing in it, the system splash is the background colour
           * and nothing else, which is what the clip's own first frame is
           * (#040916 against this #0A0A0F — six units apart, invisible).
           * The hand-off has nothing to see, so the opening is the clip.
           *
           * It has to be a real transparent file rather than no file at
           * all. With the animated-icon attribute unset, Android falls
           * back to the launcher icon — the one image that carries its own
           * background, and worse than what was there.
           */
          image: "./assets/images/splash-blank.png",
          imageWidth: 200,
          resizeMode: "contain",
          /*
           * Must exactly match the app's own page colour — this is the
           * native splash screen's background, and any mismatch with the JS
           * screen that appears right after it (the startup gate,
           * src/app/index.tsx) reads as a visible flash at handoff.
           *
           * That colour is `darkColors.background` in
           * src/core/theme/palettes.ts, which is what the startup gate's
           * `C.background` resolves to in the default theme. The note that
           * used to sit here pointed at `Colors.background` in
           * src/core/theme/tokens.ts: that object was split into the two
           * palettes and now holds #050A14 for the surfaces that stay dark
           * in both themes, so the instruction had quietly stopped
           * describing the value under it. Corrected 2026-11-17, while the
           * window background in the `android` block above was being set to
           * the same near-black.
           */
          backgroundColor: "#0A0A0F",
        },
      ],
      [
        "expo-video",
        {
          // Both need manifest entries, so they are enabled here rather than
          // at runtime. Background playback is still opt-in per user in
          // Settings (it keeps the provider connection held), and
          // picture-in-picture only ever starts from the player screen.
          supportsBackgroundPlayback: true,
          supportsPictureInPicture: true,
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            // Real IPTV panels are frequently plain HTTP. This is a
            // deliberate, documented choice — see docs/DECISIONS.md.
            usesCleartextTraffic: true,
            minSdkVersion: 26,
            packagingOptions: {
              pickFirst: ["**/libc++_shared.so"],
            },
          },
        },
      ],
      // Wires modules/decoder-ffmpeg-mp2 (vendored from androidx/media, Apache
      // 2.0, LGPL-safe FFmpeg build with only the MP2 decoder enabled) into
      // Media3 as a fallback audio renderer, so MP2 live channels — confirmed
      // present on the real test provider, see docs/CODEC_MATRIX.md — decode
      // instead of playing silently. See patches/expo-video+*.patch for the
      // two lines this depends on inside expo-video itself.
      "./plugins/withDecoderFfmpegMp2",
      "./plugins/withReleaseSigning",
      "./plugins/withGradleMemory",
      "./plugins/withAbiFilters",
      /*
       * Declares android.hardware.wifi as not required. Play rejected the
       * 2026-11-20 submission because expo-network's ACCESS_WIFI_STATE makes
       * Android infer the Wi-Fi radio as a *required* feature, which blocks
       * installation on Ethernet-only TV boxes — this product's second
       * audience. The plugin header carries the full reasoning, including why
       * touchscreen is deliberately not declared alongside it: doing so would
       * un-separate the phone and TV device sets and get the phone build
       * rejected as shadowed, for the reason written beside `androidTVRequired`
       * further down this file.
       */
      "./plugins/withUsesFeature",
      /*
       * `enforceContrast: false` is load-bearing, not a preference.
       *
       * Android's default under edge-to-edge is to paint a translucent
       * scrim behind the navigation bar so its icons stay legible whatever
       * is underneath. That scrim also makes the app's own `style` request
       * a no-op — expo-navigation-bar documents the button style as having
       * an effect only when this is off. With it on, a light theme kept
       * white icons over a grey band at the bottom of every screen; with it
       * off the bar is genuinely transparent and the app owns the icon
       * colour, which is what src/app/_layout.tsx sets from the theme.
       */
      ["expo-navigation-bar", { enforceContrast: false }],

      /*
       * `androidTVRequired: true` is load-bearing for the Play release, not
       * a preference. Without it the plugin declares leanback as *not*
       * required, so the TV build accepts every device the phone build
       * does — and since it also carries the higher versionCode, Play
       * treats the phone build as fully shadowed and rejects it. With it,
       * the two device sets are disjoint and both artifacts can ship in
       * one release.
       */
      ...(isTV
        ? [
            [
              "@react-native-tvos/config-tv",
              {
                androidTVRequired: true,
                /*
                 * Required for the Leanback launcher, and Play's Android TV
                 * form-factor review rejects an app without one. 320x180 at
                 * xhdpi, built from the brand lockup on white.
                 */
                androidTVBanner: "./assets/images/tv-banner.png",
              },
            ],
          ]
        : []),
    ],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      /*
       * The EAS project this repository builds as.
       *
       * Written by hand on 2026-11-18 because `eas init` cannot edit a dynamic
       * app.config.js — it creates the project on the Expo account, prints the
       * id, and stops. The Android releases are built locally with Gradle and
       * have never needed this; it is here for iOS, which cannot be built on
       * this machine at all and has to go through EAS.
       */
      eas: {
        projectId: "c5e2edeb-6be9-49c8-b7e2-dd8265f2c7ac",
      },

      /*
       * Whether this binary is the Android TV one. Read through
       * src/core/platform/isTvBuild.ts.
       *
       * This exists because `Platform.isTV` cannot be trusted. It resolves
       * to `uiMode === UI_MODE_TYPE_TELEVISION`, and a great many Android
       * TV boxes — including the one this app is actually tested on —
       * report `normal` instead. Gating TV behaviour on it silently
       * disabled every TV feature on exactly the hardware they were written
       * for: twice, now, and the second time the category rail simply never
       * appeared and the screen looked like the phone build.
       *
       * The phone and the TV are separate artifacts built from separate
       * prebuilds (`EXPO_TV=1`), so which one is running is settled at build
       * time and does not need sniffing at runtime at all. This is that
       * answer, baked into the manifest.
       */
      isTvBuild: isTV,
      /*
       * The runtime half of brand.config.js, baked into the manifest at
       * build time.
       *
       * Read it through src/core/brand/index.ts and never from here
       * directly: `Constants.expoConfig` can come back null, and a brand
       * value arriving as `undefined` would be worse than wrong — an
       * undefined database name opens a different database, and the
       * viewer's whole library appears to have vanished. That module
       * carries literal fallbacks for exactly that case, and
       * tools/verify-brand.js proves the two still agree.
       */
      brand: {
        key: BRAND.key,
        displayName: BRAND.displayName,
        wordmark: BRAND.wordmark,
        databaseName: BRAND.databaseName,
      },
    },
  },
};
