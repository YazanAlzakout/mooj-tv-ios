#!/usr/bin/env node
/**
 * Proves this build is actually this brand, and not half of another one.
 *
 * The project was cloned from a working app with a different name, and the
 * dangerous part of that is not the obvious strings — it is the ones that
 * fail silently. Every check below exists because of a specific way this
 * could go wrong without anybody noticing until far too late.
 *
 * Run it before any release build:  node tools/verify-brand.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const BRAND = require(path.join(root, "brand.config.js"));

let failed = 0;
function check(why, ok, detail) {
  if (ok) {
    console.log("  PASS  " + why);
  } else {
    failed++;
    console.log("  FAIL  " + why + (detail ? "\n          " + detail : ""));
  }
}

console.log("\n== the brand reaches the running app ==");

/*
 * src/core/brand/index.ts carries literal fallbacks for the case where
 * Constants.expoConfig comes back null. A fallback that has drifted from
 * brand.config.js is the worst kind of bug here: everything looks right
 * until the one device where the manifest is missing, and that device then
 * opens a different database and shows an empty library.
 */
const runtime = read("src/core/brand/index.ts");
for (const key of ["key", "displayName", "wordmark", "databaseName"]) {
  check(
    "the " + key + " fallback still matches brand.config.js",
    runtime.includes(`${key}: "${BRAND[key]}"`),
    "expected " + key + ': "' + BRAND[key] + '" in the FALLBACK block'
  );
}

console.log("\n== nothing is signed with another brand's key ==");

/*
 * This machine holds more than one app's upload properties in the same
 * ~/.gradle/gradle.properties. The signing plugin activates on the mere
 * presence of a property name, so a leftover prefix would sign this app
 * with the other one's key, silently and with no error at all.
 */
const signing = read("plugins/withReleaseSigning.js");
const prefix = BRAND.key.toUpperCase() + "_UPLOAD_";
check(
  "the gradle signing properties carry this brand's prefix",
  signing.includes(prefix + "STORE_FILE") && signing.includes(prefix + "KEY_ALIAS"),
  "expected " + prefix + "* in plugins/withReleaseSigning.js"
);
check(
  "no other brand's upload property survives in the signing plugin",
  !/ALBASERA_UPLOAD_/.test(signing)
);

console.log("\n== the build identity is this brand's ==");

const expo = require(path.join(root, "app.config.js")).expo;
check("the package id is the one in brand.config.js", expo.android.package === BRAND.packageId,
      "got " + expo.android.package);
check("the slug is the one in brand.config.js", expo.slug === BRAND.slug, "got " + expo.slug);
check("the deep-link scheme is the one in brand.config.js", expo.scheme === BRAND.scheme,
      "got " + expo.scheme);
check("the launcher label is the one in brand.config.js", expo.name === BRAND.displayName,
      "got " + expo.name);
check("the runtime half is embedded in the manifest",
      expo.extra && expo.extra.brand && expo.extra.brand.databaseName === BRAND.databaseName);

console.log("\n== no visible trace of the project this was cloned from ==");

/*
 * Comments may still describe findings made against the original test
 * provider — that knowledge is worth keeping. What must not survive is the
 * old brand's name anywhere a viewer could read it.
 */
function walk(dir, out) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir + "/" + entry.name;
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}
/*
 * One file is allowed to contain the string, and only one: the shortcode
 * table holds the content server's real address, which is a functional
 * value rather than a brand name — the operator chose to keep the same
 * server. It never reaches the interface, because add-provider.tsx shows a
 * neutral label instead; a server address printed as a provider's name
 * would undo the masking done everywhere else.
 *
 * The exemption is the exact literal, not the file, so anything else that
 * drifts into that file is still caught.
 */
const ALLOWED = ['"33": "http://albasera-tv.net:80"'];
const offenders = walk("src", []).filter((f) => {
  let text = read(f);
  for (const literal of ALLOWED) text = text.split(literal).join("");
  return /albasera|البصيرة/i.test(text);
});
check(
  "no source file names the previous brand",
  offenders.length === 0,
  offenders.join("\n          ")
);

/*
 * Called out on its own because it is the line an eye slides over: a legal
 * contact address is read by exactly the people it has to be right for —
 * someone filing a copyright complaint — and pointing them at another
 * company's inbox is worse than having no address at all.
 */
const legal = walk("src/core/i18n", []).filter((f) => /support@albasera.app/.test(read(f)));
check(
  "the legal contact address belongs to this brand",
  legal.length === 0,
  legal.length + " translation file(s) still carry the previous support address"
);

/*
 * Every permission the app will actually ship with, by name.
 *
 * A permission is not something anybody adds on purpose. Libraries carry
 * their own manifests and the merger folds them in without a word, which
 * is how SYSTEM_ALERT_WINDOW — "Display over other apps", a special access
 * Play lists separately and reviewers look twice at — ended up in a
 * release build of this app that never asked for it. It was found by
 * reading the merged manifest, which is the only place it was ever
 * visible.
 *
 * So the merged manifest is read here and anything outside this list is a
 * failure. Adding a permission then means adding it to this list too,
 * deliberately, with a reason — which is the point.
 */
const ALLOWED_PERMISSIONS = new Set([
  /* The whole app is a client for a remote server. */
  "android.permission.INTERNET",
  /* The offline banner and the retry logic both ask whether there is a network. */
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.ACCESS_WIFI_STATE",
  /* expo-video: keeps playback alive when the screen is off or the app is behind another. */
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  /* Playback must not be cut short by the device sleeping mid-film. */
  "android.permission.WAKE_LOCK",
  /* expo-video / expo-audio: volume and audio focus. */
  "android.permission.MODIFY_AUDIO_SETTINGS",
  /* Legacy storage, capped at SDK 32 by the manifest itself; nothing above that gets it. */
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  /* expo-haptics. Harmless, and the tick in the tab bar is worth it. */
  "android.permission.VIBRATE",
  /*
   * expo-secure-store declares these so a keystore entry *can* be put
   * behind a fingerprint. This app stores provider credentials without
   * that option, so nothing ever prompts — but the permission ships with
   * the library and removing it would break the module.
   */
  "android.permission.USE_BIOMETRIC",
  "android.permission.USE_FINGERPRINT",
  /* Generated per package by androidx; a private signature permission, not a capability. */
  BRAND.packageId + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
]);

/*
 * The merged manifest, not the source one, when a build has produced it.
 *
 * The source manifest holds what this project writes. What ships is that
 * plus every library's own, folded in at build time — which on the last
 * release was five more permissions than the source file showed, none of
 * them written by anyone here. Checking the source file alone would have
 * said "all clear" about a manifest it had not read.
 *
 * Falls back to the source manifest so this check still says something
 * useful before the first build of a working tree; the line printed names
 * which one it read, so a PASS can never be mistaken for the stronger
 * claim.
 */
const MERGED = "android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml";
const SOURCE = "android/app/src/main/AndroidManifest.xml";
const manifestPath = fs.existsSync(MERGED) ? MERGED : SOURCE;
if (!fs.existsSync(manifestPath)) {
  console.log("\n== the release asks for nothing it does not need ==");
  check(
    "the merged manifest was readable",
    false,
    manifestPath + " is missing — run a prebuild before trusting this check"
  );
} else {
  const manifest = fs.readFileSync(manifestPath, "utf8");
  const declared = [];
  const removed = [];
  const pattern = /<uses-permission\b([^>]*)>/g;
  for (let m = pattern.exec(manifest); m !== null; m = pattern.exec(manifest)) {
    const attrs = m[1];
    const name = /android:name="([^"]+)"/.exec(attrs);
    if (!name) continue;
    /* tools:node="remove" is a subtraction, not a request. */
    if (/tools:node="remove"/.test(attrs)) removed.push(name[1]);
    else declared.push(name[1]);
  }

  console.log("\n== the release asks for nothing it does not need ==");
  console.log("        read: " + (manifestPath === MERGED ? "the merged release manifest" : "the source manifest only — build first for the full list"));
  const unexpected = declared.filter((name) => !ALLOWED_PERMISSIONS.has(name));
  check(
    "every permission in the merged manifest is one this app needs",
    unexpected.length === 0,
    unexpected.join("\n          ") +
      (unexpected.length
        ? "\n          (add it to ALLOWED_PERMISSIONS with a reason, or block it in app.config.js)"
        : "")
  );
  check(
    "the overlay permission is still blocked",
    removed.includes("android.permission.SYSTEM_ALERT_WINDOW") ||
      !declared.includes("android.permission.SYSTEM_ALERT_WINDOW"),
    "SYSTEM_ALERT_WINDOW is being requested again"
  );
}

/*
 * The demo catalogue must never ship.
 *
 * `DEMO_CONTENT` replaces every title and every piece of artwork with
 * invented ones, for taking store screenshots. A build that left it on
 * would show a customer a catalogue that does not exist — and would show
 * Google a listing whose screenshots do not match the app, which is its
 * own policy problem. One line, checked here, so it cannot be forgotten.
 */
console.log("\n== the demo catalogue is off ==");
const demoSource = read("src/core/demo/demoMode.ts");
check(
  "DEMO_CONTENT is false",
  /export const DEMO_CONTENT = false;/.test(demoSource),
  "screenshot mode is still switched on in src/core/demo/demoMode.ts"
);

console.log("\n====================================================");
console.log("  " + (failed === 0 ? "all checks passed" : failed + " FAILED"));
console.log("====================================================\n");
process.exit(failed === 0 ? 0 : 1);
