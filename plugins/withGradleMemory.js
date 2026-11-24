const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Raises the Gradle JVM heap so packaging a release APK does not run out of
 * memory.
 *
 * Expo's template ships `org.gradle.jvmargs=-Xmx2048m`, which is enough to
 * compile this project but not to package it. The release APK carries a
 * 3.5MB Hermes bundle and native libraries for four ABIs, and
 * `packageRelease` splits and signs all of it in memory:
 *
 *     Execution failed for task ':app:packageRelease'.
 *     > PackageAndroidArtifact$IncrementalSplitterRunnable
 *        > Java heap space
 *
 * Observed 2026-09-15. Note that full builds had been succeeding on the
 * same 2048m — it is the *incremental* splitter that needs the headroom, so
 * this failed only once a build reused an existing output directory, which
 * is the ordinary case after the first build of a day.
 *
 * A config plugin rather than an edit to `android/gradle.properties`, for
 * the same reason `withReleaseSigning` is one: that directory is generated
 * and `expo prebuild --clean` wipes it, so a value written there by hand
 * survives until the next prebuild and then silently reverts — and the
 * failure it causes looks like an out-of-memory bug rather than a missing
 * setting.
 *
 * ## On the size
 *
 * 4096m against 15.4GB of installed memory. The JVM reserves this as a
 * ceiling rather than committing it up front, so a build that does not need
 * it does not take it. `MaxMetaspaceSize` is left where the template put
 * it: metaspace holds loaded classes, which is not what ran out.
 */
const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=512m';

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const existing = cfg.modResults.find(
      (item) => item.type === 'property' && item.key === 'org.gradle.jvmargs'
    );

    if (existing) {
      existing.value = JVM_ARGS;
    } else {
      cfg.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    }

    return cfg;
  });
};
