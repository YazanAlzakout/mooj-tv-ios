const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Builds only the two ABIs this app can actually play MP2 audio on.
 *
 * ## The defect this closes
 *
 * `modules/decoder-ffmpeg-mp2` ships prebuilt FFmpeg for `armeabi-v7a` and
 * `arm64-v8a` only — those are the two directories that hold `libavcodec.a`,
 * `libavutil.a`, `libswresample.a` and the `libffmpegJNI.so` built from them,
 * and the module's own `build.gradle` scopes its native build to match.
 *
 * Expo's template, meanwhile, sets `reactNativeArchitectures` to all four. So
 * the x86 and x86_64 splits of the AAB were going out with **no**
 * `libffmpegJNI.so` in them. `FfmpegLibrary.isAvailable()` then returns false,
 * Media3's `EXTENSION_RENDERER_MODE_ON` skips the renderer without an error,
 * and an MP2 live channel — the exact case this module exists to fix, see
 * docs/CODEC_MATRIX.md — plays as video with no audio and nothing on screen to
 * say why.
 *
 * Which is worse than not installing at all, because it is silent and it
 * reaches the people most likely to report it as "the app is broken": x86
 * Google TV boxes, Chromebooks, and the emulators Play's own pre-launch report
 * runs the submission on.
 *
 * Found 2026-11-14 in the pre-release audit and confirmed by reading both
 * files. Two ways to close it — build the missing ABIs, or stop shipping them.
 * Building them needs an FFmpeg source checkout that is not in this repository
 * and a toolchain run per ABI; dropping them is one line and makes the failure
 * honest: an unsupported device refuses to install instead of installing
 * something half-working.
 *
 * ## If the two ABIs are ever built
 *
 * Add them back here *and* to `abiFilters` in
 * `modules/decoder-ffmpeg-mp2/android/build.gradle`. The two lists have to
 * agree; that they did not is the whole of this bug.
 *
 * A config plugin rather than an edit to `android/gradle.properties`, for the
 * same reason `withGradleMemory` is one: that directory is generated, and
 * `expo prebuild --clean` wipes it — so a value written there by hand survives
 * until the next prebuild and then silently reverts.
 */
const ARCHITECTURES = 'armeabi-v7a,arm64-v8a';

module.exports = function withAbiFilters(config) {
  return withGradleProperties(config, (cfg) => {
    const existing = cfg.modResults.find(
      (item) => item.type === 'property' && item.key === 'reactNativeArchitectures'
    );

    if (existing) {
      existing.value = ARCHITECTURES;
    } else {
      cfg.modResults.push({
        type: 'property',
        key: 'reactNativeArchitectures',
        value: ARCHITECTURES,
      });
    }

    return cfg;
  });
};
