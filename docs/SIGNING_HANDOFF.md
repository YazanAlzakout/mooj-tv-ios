# Signing handoff for the independent iPhone app

The owner does not currently have access to the Apple Developer account used
for the previous app (reported 2026-11-25). Physical-device/TestFlight delivery
is blocked until an authorized account holder or signing operator is available.
The source repository and unsigned simulator build do not depend on that access.

## What the signing operator needs

- Repository: https://github.com/YazanAlzakout/mooj-tv-ios
- New app bundle identifier: `com.moojtv.ios`
- Workflow: `mooj-tv-ios` in `codemagic.yaml`
- Create/register this separate identifier and an App Store Connect app record.
- Configure certificates/profiles for this identifier through Codemagic.
- Set up the Codemagic App Store Connect integration `mooj_tv_ios` and the
  environment group of the same name. Set `APP_STORE_APPLE_ID` to the numeric
  ID of the new app record. This is not the old app's ID.
- Confirm the first build-number lookup returns a number for the new app;
  the workflow intentionally fails rather than guessing after a lookup error.
- Start the workflow manually and retain the IPA, matching dSYM and build log.
- Upload for internal TestFlight testing using authorized account access.
  The repository's workflow does not publish automatically.

Do not email or commit account passwords, private keys, API keys, provisioning
profiles or stream credentials. Use official account/team access and the build
service's protected signing configuration. An unsigned simulator `.app` cannot
be converted into a device IPA by renaming or zipping it.

## Before calling the version stable

Use `docs/IOS_ACCEPTANCE.md`, record device and build details, reproduce the
reported seek/speed scenario, and collect/symbolicate a native crash report if
it recurs. Compilation does not prove playback stability. The previous app and
its repository remain untouched; the new identifier installs separately and
does not inherit its user's saved accounts/history.
