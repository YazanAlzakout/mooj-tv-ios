/**
 * Headers sent with every provider request — both `player_api.php` JSON
 * calls and the media requests the native player makes.
 *
 * This provider's panel sits behind Cloudflare (confirmed 2026-09-03: a
 * request to the panel's own root returns 403 with `Server:
 * cloudflare`). Xtream panels behind a WAF routinely reject the default
 * Android HTTP client user agent (`okhttp/...`, `Dalvik/...`,
 * `ExoPlayerLib/...`) while accepting an ordinary browser one. The
 * previous app set exactly this pair of headers on every call and worked
 * against this same server, so this is the known-good baseline rather than
 * a guess — and it costs nothing on providers that don't care.
 */
export const PROVIDER_REQUEST_HEADERS: Readonly<Record<string, string>> = {
  Accept: "*/*",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
};
