# Codec matrix

First real entries, from live-testing Milestone 1 against the real test provider
(`albasera-tv.net`), not a planned formal probe — discovered because the Player Spike had
picture with no sound. Probed with a small custom MPEG-TS/PMT parser (no `ffprobe` available in
the dev environment) — see the method note below.

| Channel | stream_id | Video | Audio | Notes |
|---|---|---|---|---|
| KU: NRT 3 HD | 264311 (see note) | H.265 | MPEG-1 Layer II (MP2) | Confirmed via PMT stream_type 0x03. Silent before the FFmpeg MP2 decoder fix — **audio confirmed working on-device after the fix**, 2026-09-01 (docs/DECISIONS.md). |
| KU: CIRA TV HD | 264322 | — | — | PMT parse failed (probe script bug, not investigated further — one confirmed case was enough to act on). |

## What this means

Media3/ExoPlayer's stock renderers have no MP2 audio decoder on Android — video decodes fine
(hardware H.265), audio silently doesn't. This is exactly the scenario the master prompt
anticipated in §10. Fixed by vendoring the Media3 FFmpeg decoder extension (MP2-only) as a
fallback renderer — see docs/DECISIONS.md for the integration and docs/THIRD_PARTY_LICENSES.md
for the licensing basis. **Verified on-device 2026-09-01**: `DefaultRenderersFactory` logs
"Loaded FfmpegAudioRenderer.", `libffmpegJNI.so` loads successfully, and audio is audible and in
sync on the confirmed-MP2 channel above.

## Method note

`ffprobe`/`ffmpeg` were not available in the dev environment used to investigate this. Verified
codec identity directly instead: fetched the channel's `.m3u8`, resolved the first segment URL
against the manifest's *post-redirect* URL (the provider redirects through a load-balancer host —
resolving segment paths against the original request host instead 401s), downloaded it, and
parsed the MPEG-TS Program Association/Map Tables (PAT/PMT) by hand to read each elementary
stream's `stream_type` byte. This is a one-off diagnostic script, not part of the app — a proper
Milestone 4 codec probe (representative sampling across categories, documented per-server) is
still open.

---

> **الأرقام في هذا الجدول قديمة.** قيست على حساب سابق، و`264311` لم يعد
> موجوداً على الحساب الحالي — طلبُه يُرجع `406`، وهو ما قُرئ خطأً يوم 2026-11-18 على أنه رفضٌ
> من البانل قبل أن يتبيّن أنه رقم ميت. نفس القناة رقمها الآن `283572`، وطلبها يُرجع
> `HTTP 200` و`video/mp2t` وبثّاً فعلياً.
>
> قبل استعمال أي رقم من هنا، تأكّد أنه موجود في `get_live_streams` للحساب الذي تختبر عليه.
