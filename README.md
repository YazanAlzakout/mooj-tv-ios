# Mooj TV — independent iPhone edition

Independent iOS project, preserving Mooj TV's screens, artwork, translations,
catalogues and library behavior. The original `YazanAlzakout/mooj-tv` repository
is unchanged. The UI/data baseline is commit
`20d858e9c1dc355e860e30cf9830fc5ebaac49ee` from that MIT-licensed project.
This is **not a clean-room rewrite of every screen**. The first implementation
replaces the duplicated movie/episode source lifecycle with a shared, serialized
session and separates the build identity and release configuration.

## Current status

Development version, **not a verified crash-free release**. Local TypeScript,
targeted lint, source-queue regression tests, iOS JavaScript export and native
project generation are checks, not substitutes for an iPhone playback test.
The crash in the supplied recording has not been diagnosed from a native crash
report. See [acceptance checks](docs/IOS_ACCEPTANCE.md).

## Develop and verify

Node 24 and npm are required. The existing React Native TV fork is retained for
source compatibility with the shared interface components; this project only
builds iOS and does not activate TV mode.

```sh
npm ci
npm run verify:ios
npm run test:playback
npm run typecheck
npx expo export --platform ios
npm run prebuild:ios
npm run ios
```

The last two commands require macOS with Xcode and CocoaPods. Linux can generate
the project using `npx expo prebuild --platform ios --clean --no-install` but
cannot compile or sign an iPhone app.

## Install independently

- Bundle identifier: `com.moojtv.ios`
- URL scheme: `moojtvios`
- Database: `mooj-ios.db`
- Display name and visual design remain Mooj TV.

The app has a separate sandbox and can coexist with the original. Accounts and
history do not migrate automatically; sign in to your own provider in the new
app. No provider account, signing credential or App Store key is included.

## Builds

GitHub Actions validates pushes. Manually run **iPhone validation** with
`simulator=true` to build an unsigned simulator app on macOS. Its `.app` ZIP is
for a Mac simulator; it cannot be installed on a physical iPhone or TestFlight.

For a signed IPA, connect this repository to Codemagic, create the separate
`com.moojtv.ios` app in Apple Developer/App Store Connect, configure the
`mooj_tv_ios` signing integration and environment group, and set
`APP_STORE_APPLE_ID` to the **new** app's numeric Apple ID. Start the workflow
manually. It produces an IPA without automatic publication or email.
Do not reuse the original app ID or original EAS project. For EAS builds,
create a separate project and supply its UUID as `EAS_PROJECT_ID`.

## Playback changes

- One VOD native player per screen; sources load asynchronously.
- Source loading, background release, foreground reload and retry share one
  queue. Stale operations cannot start playback after navigation/unmount.
- Next/previous episode navigation waits for source release.
- Disk lookup and native readiness can finish in either order when resuming.
- Retry is bounded to one automatic attempt per selected source.
- Non-finite seek inputs never reach the native player.

Live channels continue to use the existing iOS VLC adapter. All retained
features still require device verification; see the acceptance matrix.
Historical documents in `docs/` describe the upstream app and are not evidence
that this independent app passed those tests.
