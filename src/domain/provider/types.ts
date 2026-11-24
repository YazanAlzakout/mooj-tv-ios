/**
 * A saved provider row (SQLite). Never holds credentials — see
 * core/storage/secureCredentials.ts. Compound content identity elsewhere in
 * the app is scoped by this id (providerId + contentType + providerItemId),
 * per the master prompt's domain-model rule.
 */
export interface Provider {
  id: string;
  kind: "xtream";
  /** User-given label, defaults to the host on creation. */
  name: string;
  /** Normalized: scheme + host [+ port], no trailing slash. */
  baseUrl: string;
  isActive: boolean;
  createdAt: number;
  lastConnectedAt: number | null;
}

/** Credentials for one provider, kept only in SecureStore, never in SQLite. */
export interface XtreamCredentials {
  username: string;
  password: string;
}

/** A Provider + its credentials, resolved together — what the Xtream adapter needs to make calls. */
export interface XtreamProviderConfig {
  kind: "xtream";
  baseUrl: string;
  username: string;
  password: string;
}

export function toProviderConfig(provider: Provider, credentials: XtreamCredentials): XtreamProviderConfig {
  return {
    kind: "xtream",
    baseUrl: provider.baseUrl,
    username: credentials.username,
    password: credentials.password,
  };
}

export interface LiveChannel {
  /** Compound-identity-ready: pair with a providerId once multi-provider storage exists. */
  providerItemId: string;
  name: string;
  categoryId: string | null;
  logoUrl: string | null;
  /** Resolved, ready-to-play stream URL (contains credentials — never log it). Always `streamUrlCandidates[0]`. */
  streamUrl: string;
  /**
   * Every URL shape this channel might be served under, best first. Xtream
   * panels are not consistent about which of these they answer — see
   * `buildLiveStreamCandidates` — so the player walks this list on a source
   * error instead of giving up on the first 404. Contains credentials.
   */
  streamUrlCandidates: string[];
  /** Narrowed to what `resolveContainerExtension` can return, so a refresh can reuse it without re-deriving. */
  containerExtension: "m3u8" | "ts";
  /**
   * The provider's EPG key for this channel, or null when it supplies no
   * guide data for it. Kept because it is the only reliable way to know
   * whether asking for an EPG is worth a request at all — the test
   * provider returns null for all 11k channels and an empty
   * `epg_listings` for every `get_short_epg` call.
   */
  epgChannelId: string | null;
  /** Days of catch-up the provider keeps for this channel; 0 means none. */
  archiveDays: number;
}
