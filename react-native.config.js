/**
 * React Native's own autolinking, for the one dependency that must not be
 * linked everywhere.
 *
 * `@lunarr/vlc-player` exists in this project for iOS and nothing else. Android
 * plays everything this app needs through `expo-video` (Media3/ExoPlayer) plus
 * the vendored FFmpeg MP2 decoder in `modules/decoder-ffmpeg-mp2`, and that
 * combination is what ships on Google Play today. iOS cannot do the same job:
 * AVFoundation refuses the bare progressive MPEG-TS that every one of this
 * provider's 11,294 channels is served as — confirmed on a real iPhone, where
 * Safari showed a white page for a channel and played an mp4 film from the same
 * account — while libVLC plays those same channels, also confirmed on a real
 * iPhone with the VLC app (2026-11-18).
 *
 * ## Why the exclusion is not optional
 *
 * Autolinking is cross-platform by default, so installing this package would
 * otherwise pull `org.videolan.android:libvlc-all` into the Android build. That
 * is not merely wasted bytes:
 *
 * `app.config.js` already sets `packagingOptions.pickFirst` for every
 * `libc++_shared.so` on the packaging path (the glob is written there, not
 * here: a `**` followed by a slash and a star closes a JSDoc block, and this
 * file was committed broken once for exactly that reason), because the FFmpeg
 * decoder module and the React Native runtime each ship one and the build
 * fails on the duplicate. libVLC ships its
 * own `libc++_shared.so` too, and the VLC ecosystem's own guidance is that its
 * copy must win — which `pickFirst` cannot guarantee, since it takes whichever
 * it meets first. Linking both on Android therefore risks a runtime mismatch in
 * the native audio path that this project spent real effort getting right:
 * MP2 audio on channels like `KU: NRT 3 HD` is silent without that decoder, and
 * a silent channel is the kind of fault that gets noticed in the field rather
 * than in a build log.
 *
 * Excluding it here keeps the Android artifact byte-for-byte the same shape it
 * has today. The iOS build is unaffected — `platforms.android: null` removes
 * only the Android link, and CocoaPods still picks up the podspec.
 *
 * If Android ever needs libVLC — a provider whose streams Media3 cannot
 * decode — deleting this file is not the fix. The fix is to decide which
 * `libc++_shared.so` wins, deliberately, and to re-test MP2 audio on a real
 * television afterwards.
 */
module.exports = {
  dependencies: {
    "@lunarr/vlc-player": {
      platforms: {
        android: null,
      },
    },
  },
};
