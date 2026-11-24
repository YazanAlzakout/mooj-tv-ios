# `web/` — source of the published pages at mooj-player.com

This folder holds the source of pages published on **https://mooj-player.com**.
Nothing here deploys. The host is a plain static host with no pipeline pointed
at this repository, so a change in this folder reaches the public site only when
somebody uploads the file.

| File           | Published at                                 |
| -------------- | -------------------------------------------- |
| `privacy.html` | `https://mooj-player.com/privacy.html`       |

## `privacy.html` must be uploaded to replace the live file

**It has not been uploaded yet.** The live page is still the older
Android-only version. Upload `privacy.html` over it, at exactly that path —
the URL must not move or redirect, because it is the privacy policy URL
entered in the Google Play Console, the one being entered in App Store
Connect, and the one linked from inside the app.

Both stores require the same things of it: live, publicly reachable with no
login and no country blocking, over HTTPS, and an ordinary non-editable web
page — not a PDF and not a shared document.

### Why this folder exists at all

The live page had no source anywhere in this repository. It was written and
uploaded straight to the host, and that is precisely why it drifted: the app's
privacy text was corrected for iOS and the published page carried on
describing an Android-only app that keeps downloaded files, while the App
Review notes submitted beside it say downloading is disabled in the iOS build
and nothing can be saved to the device. A reviewer following the privacy link
from the App Store listing would have read the contradiction.

Tracked here, the page is reviewable, diffable, and visible to whoever next
edits the policy.

## The page is self-contained

No build step, no external CSS or JS, no web fonts, no analytics, nothing from
a third party, no tracking. The site's shared stylesheet, `styles.css`, is
**inlined** into `privacy.html` rather than linked — two reasons:

- an edit to the shared stylesheet cannot break the one page both stores check;
- the file renders correctly saved to a disk with the network off, which is a
  cheap test that it really does load nothing.

The rules were copied from the live `styles.css` on 2026-11-19 and trimmed to
what this page uses, so it still looks like `index.html` and `terms.html`
beside it. If the site's visual design changes, this page's inlined copy has to
be updated by hand — that is the deliberate cost of the two reasons above.

The only relative references left are `assets/logo.png` and
`assets/favicon.png`, already on the host and shared with the other pages.
They are decoration: if they are missing the page still reads correctly and
the layout does not move.

## Two platforms, one page, and why it is built this way

The constraint was that a reviewer from either store must find the page
accurate for the app they are reviewing without having to work out which half
applies to them.

**What the page does:** shared prose as the spine, and every statement that is
true of only one platform sits inside a block labelled **Android** or
**iPhone & iPad**. Nothing outside those blocks is platform-specific, and
nothing inside one applies to the other.

**Why not two complete policies, one after the other:** the parts that are
true on both — that no personal data is collected, the children's section, the
changes section, the contact section — would then exist twice, in two
languages, as four copies to keep in step. That is the same drift that
produced the problem being fixed here.

**Why not a tab switcher or a platform-detecting redirect:** both hide one
platform's text behind an action, and the reviewer who does not take that
action is exactly the reader this page exists for. There is no JavaScript on
the page at all. Both platforms' text is always visible.

**Why the two cards look identical:** tinting or ordering one of them as the
primary version would make the other read as a footnote. Only the label
differs.

## Arabic

Arabic is the app's primary audience language, and the page carries the Arabic
policy below the English one, in one file, with `dir="rtl"`.

Every Arabic heading and paragraph is **copied from
`src/core/i18n/translations/ar.ts`** — the text Arabic-speaking customers
already read on their own screens. None of it was translated from the English
on this page.

Two sections have no Arabic counterpart, deliberately: **This website** and
**Your rights** exist only on this page and have no Arabic in `ar.ts`.
Composing Arabic policy prose here instead of in the app is how the
Android-only page came to exist in the first place. If they are wanted in
Arabic, write them into `ar.ts` first and copy them here afterwards.

The Arabic on the page that is not a verbatim `ar.ts` string is of two kinds,
and both are worth a native read-through before upload:

- **Wayfinding, not policy:** the language link, the platform labels
  (`Android`, `iPhone وiPad`, both taken from the wording of the two `ar.ts`
  intros), the short "how to read this page" note, and the line pointing an
  Arabic reader at the two English-only sections.
- **The three corrections below**, which the app's own Arabic still owes:
  the Wi-Fi-state and biometric permission lines, the "those are all of them"
  line, and the server-address paragraph under *بيانات مزوّدك*.

## The app has its own copy of this policy — edit both

The policy is in the app as a screen, not a link, so that it works with the
radio off and in the viewer's chosen language:

- **`src/app/privacy.tsx`** — the screen. It picks text per platform: on iOS it
  substitutes, section by section, from `privacy.ios`; on Android it never
  looks at `privacy.ios` at all.
- **`src/core/i18n/translations/en.ts`** — the `privacy` object (the Android
  wording Google reviewed) and the `privacy.ios` object beside it, which
  overrides only the sections that are untrue on iOS.
- **`src/core/i18n/translations/ar.ts`** — the Arabic of both, and the other
  locale files alongside it.

**Changing one means changing the other.** Two versions of a policy that
disagree is worse than one of them not existing, because whichever one a
reader found, the other could be held against it. The in-app text is the
authoritative wording; this page follows it.

### Except in two places, where this page is ahead of the app

Both are corrections the app's text owes, found by checking the wording
against the build rather than against the previous wording. Until they are
made in `en.ts` and `ar.ts`, the app screen and this page differ — so make
them.

**1. The Android permission list was not the list of permissions.** The
heading promises "why **each one** is asked for" and the list had six
entries. The merged release manifest
(`android/app/build/intermediates/packaged_manifests/release/…`, and its
blame report beside it) holds nine:

| Permission | Comes from | On the list before? |
| --- | --- | --- |
| `INTERNET`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `MODIFY_AUDIO_SETTINGS`, `VIBRATE`, `READ`/`WRITE_EXTERNAL_STORAGE` | the app's own manifest | yes |
| `ACCESS_NETWORK_STATE` | `expo-image`, `expo-network` | yes ("network state") |
| `WAKE_LOCK` | `androidx.media3-exoplayer` | yes |
| `ACCESS_WIFI_STATE` | `expo-network` | **no** |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | `androidx.biometric 1.1.0`, pulled in by `expo-secure-store` | **no** |

The page now names all nine. The two biometric ones are never exercised:
`faceIDPermission: false` in `app.config.js`, and a search of `src/` for
*biometric*, *LocalAuthentication*, *Face ID*, *Touch ID* or *fingerprint*
returns nothing at all — so the page says the App never asks and contains
nothing that could ask, which is the honest form of it. The list then says it
is complete apart from
`com.moojtv.player.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, which the merged
manifest declares at `protectionLevel="signature"` for the app's own internal
broadcasts and which gives access to nothing. That sentence is what makes the
heading literally true, and it is the sentence to revisit if a dependency ever
adds a tenth.

**2. "Your provider details" claimed more than the code does.** The app's
wording says *those details* — a server address, a username and a password —
are kept in secure storage and are "never written to the App's ordinary
database". Two of the three are: `src/core/storage/secureCredentials.ts` puts
only `XtreamCredentials` (`username`, `password`) into `expo-secure-store`.
The **server address is `providers.base_url` in SQLite**
(`src/db/migrations/index.ts`, migration 1). So on this page the secure-storage
sentence is scoped to the username and password, and the server address is
stated for what it is: in the App's ordinary local database on the device,
sent to nobody but the provider.

Worth saying what is *not* wrong, because it was checked: no credential
reaches SQLite by any other route either. `download_tasks.source_url` used to
hold an Xtream URL with the password in its path and was scrubbed by migration
17, which writes `''` and rebuilds the URL at download time
(`src/domain/downloads/resolveSourceUrl.ts`); `catalog_cache` stores channels
without their stream URLs and rebuilds those on read; and `redactUrl` in
`src/core/network/fetchJson.ts` strips `username`, `password` and `token`
before any URL reaches an error message.

`privacy.html` carries three sections the app screen does not — **This
website**, **Your rights**, and the website clause in the intro — because they
are about this site rather than the app. They have no counterpart in the
translations and nothing in the app needs to change when they do.

## Facts on this page are checkable in the code

Every claim about what the app does with data was verified against the source
rather than carried over, and the places to re-check when the app changes are:

| Claim | Where it is true in the code |
| --- | --- |
| No downloads on iOS, no file saved | `src/domain/downloads/eligibility.ts` — `downloadsSupported()` returns `!isTvBuild && Platform.OS !== "ios"` |
| Credentials in Keystore / keychain, never in SQLite, never logged | `src/core/storage/secureCredentials.ts` (`expo-secure-store`); `redactUrl` in `src/core/network/fetchJson.ts` |
| iOS keychain readable only after first unlock | `secureCredentials.ts` — `SecureStore.AFTER_FIRST_UNLOCK` |
| iOS asks for no permissions, declares no usage description | `app.config.js` — `ios.infoPlist` holds only `NSAppTransportSecurity` and `ITSAppUsesNonExemptEncryption`; `expo-secure-store` is configured `faceIDPermission: false` and `expo-audio` `microphonePermission: false` |
| The Android permission list | `android/app/src/main/AndroidManifest.xml` plus the merged release manifest under `android/app/build/intermediates/packaged_manifests/` |
| Storage permission on Android 12 and older only | same manifest — `READ/WRITE_EXTERNAL_STORAGE` with `android:maxSdkVersion="32"` |
| Update checks come from the store, not from us | `src/core/update/playUpdate.ts` (Play In-App Updates; returns `false` immediately when `Platform.OS !== "android"`) |
| No server of ours is contacted | `src/core/update/requiredUpdate.ts` — `MANIFEST_URL` is `""`, so the whole mechanism is inert. **If that URL is ever set, the "contacts no server operated by the developers" sentence stops being true and this page must change.** |
| No analytics, ads or crash SDK | `package.json` dependencies |
| Server address masked on screen | `src/core/storage/maskedValue.ts`, used in `providers.tsx`, `settings.tsx`, `add-provider.tsx` |
| Plain HTTP allowed | `app.config.js` — `NSAllowsArbitraryLoads`; `usesCleartextTraffic` on Android |
| Delete your own data | `providers.tsx` (`deleteProviderCredentials`), `settings.tsx` (clear watch history, clear artwork cache), `downloads.tsx` (`deleteDownload`, Android only) |
| The nine Android permissions and where each comes from | the merged release manifest and its `manifest-merger-blame-release-report.txt`; the table further up |
| The App never asks for a fingerprint or a face | nothing in `src/` mentions biometrics, `LocalAuthentication`, Face ID or Touch ID; `faceIDPermission: false` |
| Credentials in secure storage, server address in SQLite | `src/core/storage/secureCredentials.ts` (username + password only) against `providers.base_url` in `src/db/migrations/index.ts` |
| No credential anywhere else in SQLite | migration 17 scrubs `download_tasks.source_url`; `resolveSourceUrl.ts` rebuilds it; `catalogCacheRepository.ts` stores channels without stream URLs |
| Background playback is off unless you turn it on | `src/db/migrations/index.ts` migration 13 — `background_playback … DEFAULT 0`; the toggle is `src/app/settings.tsx` |

## Things that are true today and could stop being true

Three claims on this page do not follow from a line of code that will fail
loudly if it changes. Check them when the app changes:

1. **"The App does not contact any server operated by the developers."**
   `src/core/update/requiredUpdate.ts` has `MANIFEST_URL = ""` and returns
   early, so the mechanism is inert. **Set that URL and this sentence becomes
   false** — the app would be calling home on launch, and the page would have
   to say so.
2. **"Stored only on your device", on iOS.** `secureCredentials.ts` uses
   `SecureStore.AFTER_FIRST_UNLOCK` rather than `…_THIS_DEVICE_ONLY`, on
   purpose — its own comment calls restoring a provider login onto a new phone
   from a backup "a feature, not a leak". So on iOS the credentials can travel
   inside the viewer's own encrypted Apple backup. Never to the developers and
   never to a third party, so the policy is not false and Apple would not call
   it data collection, but "only on your device" is the strongest the sentence
   can be and the code is marginally weaker than it. On Android the opposite
   holds: `expo-secure-store`'s generated backup rules exclude its own store,
   so nothing is cloud-backed up there. If `_THIS_DEVICE_ONLY` is ever
   adopted, this stops being a tension.
3. **The "This website" section.** "Sets no cookies, runs no analytics, embeds
   nothing from a third party, and has no forms" is a claim about the host, not
   about this repository. It is verified for *this* page — zero `<script>`
   tags, zero third-party `href`/`src`/`url()`, the only subresources being
   `assets/logo.png` and `assets/favicon.png` on the same host — and it was
   carried forward unchanged from the published page for `index.html` and
   `terms.html`, which are not in this folder. Bring them in here and it
   becomes checkable.

One smaller mismatch, left alone deliberately: the policy says you enter "a
server address, a username and a password, **or a direct stream link**", and
the shipped app has no such entry — `Provider.kind` is `"xtream"` and nothing
else, and the `Remote M3U` / `Local M3U file` strings in the translations are
unused. The sentence describes more input than the app accepts, which
overstates nothing about data handling, so it stays until the app matches it
or the strings are dropped.
