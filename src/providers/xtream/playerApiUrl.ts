import type { XtreamProviderConfig } from "@/domain/provider/types";

/**
 * Builds a `player_api.php` URL by concatenating `config.baseUrl` directly
 * rather than round-tripping it through `new URL(...)`.
 *
 * Real bug found 2026-09-03: `new URL("http://host:80/x").toString()`
 * silently drops an explicit default port (`:80` for http, `:443` for
 * https) — standard WHATWG URL behavior, not an expo-video/RN quirk. This
 * provider's Cloudflare-fronted panel was confirmed to 404 the
 * port-stripped request while a different IPTV app, hitting the exact same
 * server/account at the exact same time with the port left in, connected
 * fine — so for THIS provider the port isn't cosmetic. `config.baseUrl` is
 * already exactly what `normalizeBaseUrl()` produced (scheme + host
 * [+ port], no trailing slash); this only needs to append the path and an
 * encoded query string onto it, never reconstruct the host/port through a
 * `URL` object.
 */
export function playerApiUrl(config: XtreamProviderConfig, params: Record<string, string> = {}): string {
  const query = new URLSearchParams({
    username: config.username,
    password: config.password,
    ...params,
  }).toString();
  return `${config.baseUrl}/player_api.php?${query}`;
}
