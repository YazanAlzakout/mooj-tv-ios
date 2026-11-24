import type { LiveChannel, XtreamProviderConfig } from "@/domain/provider/types";
import { fetchJson } from "@/core/network/fetchJson";
import { playerApiUrl } from "./playerApiUrl";

/**
 * Raw shapes from player_api.php — kept private to this adapter. Verified
 * 2026-09-02 against the real test provider's actual login response (not
 * assumed from generic Xtream docs) — see docs/DECISIONS.md. `user_info`
 * also echoes back `username`/`password`; deliberately not typed/read here
 * so nothing downstream can accidentally log or display them.
 */
interface XtreamAuthResponse {
  user_info?: {
    auth?: number;
    status?: string;
    message?: string;
    exp_date?: string | null;
    is_trial?: string;
    active_cons?: string;
    max_connections?: string;
    allowed_output_formats?: string[];
  };
  server_info?: {
    server_protocol?: string;
    timezone?: string;
  };
}

interface XtreamCategory {
  category_id: string;
  category_name: string;
}

interface XtreamLiveStream {
  stream_id: number;
  name: string;
  category_id?: string;
  stream_icon?: string;
  /** Empty string or null on panels that carry no guide data. */
  epg_channel_id?: string | null;
  /** "0"/0 when the panel keeps no catch-up for this channel. */
  tv_archive?: number | string;
  tv_archive_duration?: number | string;
}

export class XtreamAuthError extends Error {}

export interface XtreamAccountInfo {
  status: string | null;
  /** Unix ms; null when the provider reports no expiry (e.g. some unlimited/reseller accounts). */
  expiresAt: number | null;
  isTrial: boolean;
  activeConnections: number | null;
  maxConnections: number | null;
  allowedOutputFormats: string[];
  serverTimezone: string | null;
  serverProtocol: string | null;
}

export interface XtreamAuthResult {
  allowedOutputFormats: string[];
  accountInfo: XtreamAccountInfo;
}

/** Trims whitespace, ensures a scheme, drops a trailing slash. */
export function normalizeBaseUrl(input: string): string {
  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }
  return value.replace(/\/+$/, "");
}

export async function authenticate(config: XtreamProviderConfig): Promise<XtreamAuthResult> {
  const response = await fetchJson<XtreamAuthResponse>(playerApiUrl(config, {}));
  const userInfo = response.user_info;
  if (userInfo?.auth !== 1) {
    throw new XtreamAuthError(userInfo?.message ?? "Provider rejected the username/password.");
  }

  const allowedOutputFormats = userInfo.allowed_output_formats ?? [];
  const expDateRaw = userInfo.exp_date;
  const expiresAt = expDateRaw && Number.isFinite(Number(expDateRaw)) ? Number(expDateRaw) * 1000 : null;

  return {
    allowedOutputFormats,
    accountInfo: {
      status: userInfo.status ?? null,
      expiresAt,
      isTrial: userInfo.is_trial === "1",
      activeConnections: userInfo.active_cons ? Number(userInfo.active_cons) : null,
      maxConnections: userInfo.max_connections ? Number(userInfo.max_connections) : null,
      allowedOutputFormats,
      serverTimezone: response.server_info?.timezone ?? null,
      serverProtocol: response.server_info?.server_protocol ?? null,
    },
  };
}

export async function getLiveCategories(
  config: XtreamProviderConfig
): Promise<{ id: string; name: string }[]> {
  const categories = await fetchJson<XtreamCategory[]>(
    playerApiUrl(config, { action: "get_live_categories" })
  );
  return categories.map((c) => ({ id: c.category_id, name: c.category_name }));
}

/**
 * Prefers HLS when the server advertises it (master prompt §9.5: "Prefer a
 * provider HLS output when available"), falling back to Xtream's raw
 * MPEG-TS live format otherwise.
 *
 * This was briefly hard-coded to "ts" because `.m3u8` playback logged
 * recurring "PesReader: Unexpected start code prefix" warnings from
 * Media3's MPEG-TS extractor at HLS segment boundaries. Reverted
 * 2026-09-03: those were warnings on a stream that played, whereas
 * hard-coding "ts" made every channel on the user's real provider fail
 * outright with a 404. Only the ordering matters now anyway — the player
 * walks `buildLiveStreamCandidates` on a source error, so neither answer
 * can strand playback. See docs/DECISIONS.md.
 */
export function resolveContainerExtension(allowedOutputFormats: string[]): "m3u8" | "ts" {
  return allowedOutputFormats.some((format) => format.toLowerCase() === "m3u8") ? "m3u8" : "ts";
}

/**
 * Every URL shape an Xtream panel might serve a live channel under, best
 * first. Panels disagree: some answer only `/live/user/pass/id.m3u8`,
 * some only `.ts`, older ones drop the `/live/` segment entirely, and a
 * few auto-detect from an extensionless path. A single guessed shape means
 * a hard 404 on every channel of a panel that picked differently — which is
 * exactly what happened here on 2026-09-03: `.ts` 404'd on the user's real
 * provider while the previous app, which walks this same chain starting at
 * HLS, played fine against the identical server and account.
 *
 * `preferred` only decides whether HLS or MPEG-TS is tried first; both are
 * always in the list, so a wrong preference costs one failed request, not
 * playback.
 */
export function buildLiveStreamCandidates(
  config: XtreamProviderConfig,
  streamId: string | number,
  preferred: "m3u8" | "ts"
): string[] {
  const live = `${config.baseUrl}/live/${config.username}/${config.password}/${streamId}`;
  const bare = `${config.baseUrl}/${config.username}/${config.password}/${streamId}`;
  // `preferred` is "ts" exactly when the panel did NOT advertise m3u8 in
  // `allowed_output_formats`. Trying it anyway is not a harmless fallback:
  // the user's panel answers an unadvertised format with 405, and on a
  // one-connection line every wasted attempt is a connection spent and a
  // step closer to the anti-flood block. So m3u8 is only ever attempted
  // when the server said it serves it.
  const withExtension = preferred === "m3u8" ? [`${live}.m3u8`, `${live}.ts`] : [`${live}.ts`];
  return [...withExtension, `${bare}.ts`, live, bare];
}

/**
 * Catch-up (timeshift) URL for a past programme.
 *
 * Only meaningful for a channel whose `archiveDays` is greater than zero —
 * a panel that keeps no archive answers this path with a 404. Callers must
 * check first rather than offering the option blindly; the app's own test
 * provider reports `tv_archive: 0` for all 11,356 of its channels, so on
 * that account no catch-up control is ever shown.
 *
 * `start` is the provider's expected `YYYY-MM-DD:HH-MM` in local server
 * time, and `durationMinutes` how much of the programme to serve.
 */
export function timeshiftUrl(
  config: XtreamProviderConfig,
  streamId: string,
  start: Date,
  durationMinutes: number
): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp =
    `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}:` +
    `${pad(start.getHours())}-${pad(start.getMinutes())}`;
  return `${config.baseUrl}/streaming/timeshift.php?username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}&stream=${streamId}&start=${stamp}&duration=${Math.max(1, Math.round(durationMinutes))}`;
}

/**
 * Fetches live streams for one category (or all, if categoryId is omitted)
 * and resolves each into a ready-to-play stream URL using the given
 * container extension (see resolveContainerExtension).
 */
export async function getLiveChannels(
  config: XtreamProviderConfig,
  containerExtension: "m3u8" | "ts",
  categoryId?: string
): Promise<LiveChannel[]> {
  const streams = await fetchJson<XtreamLiveStream[]>(
    playerApiUrl(
      config,
      categoryId ? { action: "get_live_streams", category_id: categoryId } : { action: "get_live_streams" }
    )
  );

  return streams.map((stream) => {
    const candidates = buildLiveStreamCandidates(config, stream.stream_id, containerExtension);
    return {
      providerItemId: String(stream.stream_id),
      name: stream.name,
      categoryId: stream.category_id ?? null,
      logoUrl: stream.stream_icon || null,
      containerExtension,
      epgChannelId: stream.epg_channel_id ? String(stream.epg_channel_id) : null,
      archiveDays: Number(stream.tv_archive) > 0 ? Number(stream.tv_archive_duration ?? 0) : 0,
      streamUrl: candidates[0],
      streamUrlCandidates: candidates,
    };
  });
}

/**
 * Milestone 1 helper: fetch just enough real data for the PlayerSpike test
 * list — the first non-empty category, capped to `limit` channels — instead
 * of pulling a provider's entire live lineup (which can be thousands of
 * channels) just to throw most of it away client-side.
 */
export async function getLiveChannelSample(
  config: XtreamProviderConfig,
  containerExtension: "m3u8" | "ts",
  limit = 30
): Promise<LiveChannel[]> {
  const categories = await getLiveCategories(config);
  const firstCategory = categories[0];
  const channels = await getLiveChannels(config, containerExtension, firstCategory?.id);
  return channels.slice(0, limit);
}

/**
 * Fetches the full live lineup in one request (no category filter, no cap).
 * Xtream has no count-only endpoint, so an accurate total for the Home
 * dashboard's "Live TV" stat requires actually fetching the list — verified
 * feasible against the real test provider (~11k channels, single request).
 * Used for the Home dashboard and full live browsing, not the lightweight
 * PlayerSpike sample above.
 */
export async function getAllLiveChannels(
  config: XtreamProviderConfig,
  containerExtension: "m3u8" | "ts"
): Promise<LiveChannel[]> {
  return getLiveChannels(config, containerExtension);
}
