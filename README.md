# Albasera Player 2

A from-scratch rebuild of the ALBASERA IPTV player (Expo + `react-native-tvos` + `expo-video`).
The old `albasera-replit` project is reference-only — no architecture or code is carried over.
See `docs/` for the compatibility matrix, architecture, and decisions log; the master build
prompt this project follows lives outside this repo.

**Status: Milestone 0/1 — bootstrap + PlayerSpike.** The full app (Live/EPG/Movies/Series/
onboarding/etc.) does not exist yet by design — see `docs/ARCHITECTURE.md`.

## Running

```bash
npm install
npm run start        # phone/tablet, Metro
npm run start:tv      # Android TV (sets EXPO_TV=1)
npm run web
```

This project needs native modules (`expo-video`, `react-native-tvos`) that Expo Go cannot run.
Use a development build:

```bash
npm run prebuild        # or prebuild:tv
npm run android          # or android:tv
```

## Checks

```bash
npm run typecheck
npm run lint
npm run doctor
```

## Docs

- `docs/ARCHITECTURE.md` — module map and ownership boundaries
- `docs/DECISIONS.md` — decisions log, including open questions
- `docs/DEPENDENCIES.md` — verified version matrix and why each pin exists
- `docs/PLAYBACK.md` — the channel-switching pipeline and its hard rules
- `docs/CODEC_MATRIX.md`, `docs/PERFORMANCE.md`, `docs/TEST_MATRIX.md`, `docs/RELEASE.md` — stubs,
  populated as their milestones start
