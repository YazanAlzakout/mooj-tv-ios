const { withSettingsGradle, withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Wires the vendored modules/decoder-ffmpeg-mp2/android module into the
 * generated Android project.
 *
 * The module lives outside android/ (which `expo prebuild --clean` wipes),
 * at the stable repo path modules/decoder-ffmpeg-mp2/android.
 *
 * Two things are needed for its native code to actually end up in the APK:
 *
 * 1. Register it as a Gradle subproject (settings.gradle).
 * 2. Declare `implementation project(':decoder-ffmpeg-mp2')` somewhere Gradle
 *    is guaranteed to actually read.
 *
 * (2) is *not* done via patches/expo-video+*.patch alone. expo-video is
 * pulled in through Expo's autolinking settings plugin, and `expo run:android`
 * always passes Gradle `--configure-on-demand` (hardcoded in @expo/cli's
 * gradle.js) — verified by inspecting two consecutive real device builds:
 * the dependency edge declared inside the autolinked expo-video project was
 * never detected (no .cxx dir, no libffmpegJNI.so in the APK, even on a
 * from-scratch clean build with zero cache reuse). Declaring the same
 * dependency directly on :app instead sidesteps that — :app is always the
 * requested build target, so config-on-demand always configures it fully.
 * Media3's extension-renderer discovery (DefaultRenderersFactory,
 * EXTENSION_RENDERER_MODE_ON in VideoPlayer.kt) works by reflection over
 * whatever ends up on the app's runtime classpath, so it doesn't matter
 * which Gradle module declared the dependency — only that :app ends up
 * depending on it. The expo-video patch's own dependency line is harmless
 * and left in place as belt-and-suspenders.
 */
const withDecoderFfmpegMp2 = (config) => {
  config = withSettingsGradle(config, (config) => {
    if (config.modResults.contents.includes(':decoder-ffmpeg-mp2')) {
      return config;
    }

    config.modResults.contents += `
include ':decoder-ffmpeg-mp2'
project(':decoder-ffmpeg-mp2').projectDir = new File(rootDir, '../modules/decoder-ffmpeg-mp2/android')
`;

    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes(":decoder-ffmpeg-mp2'")) {
      return config;
    }

    config.modResults.contents = config.modResults.contents.replace(
      /dependencies\s*\{/,
      `dependencies {\n    // See plugins/withDecoderFfmpegMp2.js for why this is declared here\n    // and not only inside expo-video's own build.gradle.\n    implementation project(':decoder-ffmpeg-mp2')\n`
    );

    return config;
  });

  return config;
};

module.exports = withDecoderFfmpegMp2;
