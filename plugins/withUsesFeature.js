const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Declares `android.hardware.wifi` as not required, so Play stops treating
 * Wi-Fi hardware as a condition of installing.
 *
 * ## The defect this closes
 *
 * Google rejected the first Play submission on 2026-11-20: the listing
 * declared Wi-Fi as a *required* device feature, so Play would refuse to
 * install the app on any device without Wi-Fi hardware.
 *
 * Nothing in this repository asks for that. `android/app/src/main/
 * AndroidManifest.xml` does not name a Wi-Fi permission at all. It arrives by
 * manifest merge from `expo-network`, whose own manifest declares
 * `ACCESS_WIFI_STATE` — and Android's build tools then add
 * `android.hardware.wifi` as an *implicitly required* feature, because a
 * permission that reads Wi-Fi state is assumed to be useless without the
 * radio. That inference is the whole bug: it is made from the permission, not
 * from anything the app states, and the only way to contradict it is to
 * declare the feature explicitly with `required="false"`.
 *
 * Removing the dependency is not an option and would be the wrong fix anyway.
 * `expo-network` is load-bearing here: `src/core/network/useIsOffline.ts` and
 * `useNetworkReconnect.ts` both read `useNetworkState`, and
 * `src/state/sessionRestore.ts` calls `getNetworkStateAsync` before deciding
 * whether a restored session can be trusted. The app needs to know it is
 * offline; it does not need a Wi-Fi radio to be told so, because an Ethernet
 * TV box reports its state through the same API.
 *
 * ## Why this is not cosmetic for this app in particular
 *
 * The blocked device set is exactly this product's second audience. An IPTV
 * player's natural home is a set-top box on a wired connection, and a good
 * share of those boxes ship with Ethernet and no Wi-Fi at all. The phone
 * build loses little — every phone has Wi-Fi — but the same manifest feeds
 * the TV build, and there it would have cut out the devices the TV build
 * exists for.
 *
 * ## Why touchscreen is deliberately left alone
 *
 * The obvious neighbouring fix — declaring `android.hardware.touchscreen` not
 * required, which Android also marks required by default — is wrong *here*,
 * and the reason is written down in `app.config.js` beside
 * `androidTVRequired`. The phone build and the TV build have to claim
 * **disjoint** device sets. The TV build carries the higher versionCode, so
 * the moment the phone build also accepts televisions, Play reads the phone
 * build as fully shadowed by the TV one and rejects it. Touchscreen stays
 * required on the phone build for that reason; the TV build gets its own
 * `required="false"` from `@react-native-tvos/config-tv`, which is where that
 * declaration belongs.
 *
 * So this plugin touches one feature and no others, and it is safe on both
 * builds because neither `config-tv` nor anything else declares Wi-Fi.
 *
 * ## Why a config plugin and not an edit to the manifest
 *
 * Same reason as `withGradleMemory` and `withAbiFilters`: `android/` is
 * generated and `expo prebuild --clean` wipes it, so a line written there by
 * hand survives until the next prebuild and then silently reverts — and this
 * one reverting means a second rejection from Play rather than a visible
 * build error.
 */
const FEATURES = [
  // [name, required]
  ["android.hardware.wifi", "false"],
];

module.exports = function withUsesFeature(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    if (!Array.isArray(manifest["uses-feature"])) {
      manifest["uses-feature"] = [];
    }

    for (const [name, required] of FEATURES) {
      const existing = manifest["uses-feature"].find(
        (entry) => entry?.$?.["android:name"] === name,
      );

      // Overwrite rather than skip: another plugin declaring this feature as
      // required is the exact state being corrected, so losing the race must
      // not mean losing the fix.
      if (existing) {
        existing.$["android:required"] = required;
        continue;
      }

      manifest["uses-feature"].push({
        $: { "android:name": name, "android:required": required },
      });
    }

    return cfg;
  });
};
