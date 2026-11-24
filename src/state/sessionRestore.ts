import { getNetworkStateAsync } from "expo-network";

import { getProviderCredentials } from "@/core/storage/secureCredentials";
import type { Provider, XtreamProviderConfig } from "@/domain/provider/types";
import { toProviderConfig } from "@/domain/provider/types";
import { writeCatalog } from "@/db/repositories/catalogCacheRepository";
import { touchLastConnected } from "@/db/repositories/providerRepository";
import {
  authenticate,
  getAllLiveChannels,
  resolveContainerExtension,
  XtreamAuthError,
} from "@/providers/xtream/xtreamAdapter";
import { getActiveSession, setActiveSession } from "@/state/activeSessionStore";
import {
  preloadCatalog,
  readCachedCatalog,
  type CachedCatalogSnapshot,
  type PreloadProgress,
} from "@/state/catalogCache";
import { setSeriesList } from "@/state/seriesStore";
import { setVodMovies } from "@/state/vodStore";

/**
 * How long a stored catalog is served without going back to the provider.
 * A lineup changes rarely, and this provider's panel blocks a line that
 * asks too often, so a stale-but-instant start is the better trade — and
 * the user can always pull to refresh.
 */
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

export interface RestoreOptions {
  /** Called while a first-time (or forced) full download is running. */
  onPreloadProgress?: (progress: PreloadProgress) => void;
  /** Ignore the stored catalog and download everything again. */
  forceRefresh?: boolean;
}

/** Strips the credential-bearing URLs before a channel list is written to SQLite. */
function toStoredChannels(channels: Awaited<ReturnType<typeof getAllLiveChannels>>) {
  return channels.map(({ streamUrl: _streamUrl, streamUrlCandidates: _candidates, ...rest }) => rest);
}

function activateFromCache(provider: Provider, config: XtreamProviderConfig, snapshot: CachedCatalogSnapshot): void {
  setActiveSession({
    provider: { ...provider, isActive: true },
    config,
    channels: snapshot.channels,
    // Never re-authenticated in this path — the real account status/expiry
    // is simply unknown right now. `null` here (not a stale guess) is what
    // every screen already renders as "no account info", the same as a
    // brand-new session before its first login response arrives.
    accountInfo: null,
  });
  setVodMovies(snapshot.movies);
  setSeriesList(snapshot.series);
}

/**
 * Brings a saved provider up as the active session.
 *
 * Three paths, tried in order:
 *
 *  1. Offline: the device itself has no network. There is no point even
 *     attempting a login request — it can only time out, slowly, and it
 *     would otherwise be the reason the whole app refuses to open. If a
 *     catalog for this provider is already on the device, the session
 *     starts from it directly (no `accountInfo`, since nothing was
 *     authenticated this launch) so Home, Library, History and Downloads —
 *     none of which need the network — are fully usable with the Wi-Fi off.
 *     Live playback and anything needing a fresh stream URL will still (and
 *     correctly) fail with "no internet", surfaced by the callers that
 *     actually attempt a connection.
 *
 *  2. Online, catalog cached: the session is built from the stored catalog
 *     with no catalog request — the app opens immediately, and a stale copy
 *     refreshes in the background instead of making the user wait. This is
 *     the common case on every normal launch.
 *
 *  3. Online, nothing cached yet (first time on this provider, or a forced
 *     refresh): everything is downloaded once and written to the device,
 *     reporting progress so the caller can show the preparation screen.
 *
 * A network hiccup during step 2/3's login call (a timeout, a dropped
 * connection — anything that is not the provider explicitly rejecting the
 * credentials) also falls back to the cached catalog when one exists,
 * rather than failing the whole restore over what is likely a transient
 * blip. An explicit credential rejection (`XtreamAuthError`) is never
 * masked this way — that is a real problem the user needs to see.
 *
 * Throws when there is truly nothing to fall back on: missing credentials,
 * or a rejected/failed login with no cached catalog for this provider.
 */
export async function restoreSession(provider: Provider, options: RestoreOptions = {}): Promise<void> {
  const credentials = await getProviderCredentials(provider.id);
  if (!credentials) {
    throw new Error(`No stored credentials for provider "${provider.name}".`);
  }

  const config = toProviderConfig(provider, credentials);

  const netState = await getNetworkStateAsync().catch(() => null);
  const deviceOffline = netState !== null && netState.isConnected === false;

  if (deviceOffline) {
    const cached = await readCachedCatalog(provider.id, config);
    if (!cached) {
      throw new Error("No internet connection, and nothing saved yet for this provider.");
    }
    activateFromCache(provider, config, cached);
    return;
  }

  const cachedBeforeAuth = options.forceRefresh ? null : await readCachedCatalog(provider.id, config);

  let allowedOutputFormats: string[];
  let accountInfo: Awaited<ReturnType<typeof authenticate>>["accountInfo"] | null;
  try {
    const auth = await authenticate(config);
    allowedOutputFormats = auth.allowedOutputFormats;
    accountInfo = auth.accountInfo;
  } catch (error) {
    if (error instanceof XtreamAuthError || !cachedBeforeAuth) throw error;
    // A transient network failure with a usable cache — proceed offline-style.
    activateFromCache(provider, config, cachedBeforeAuth);
    return;
  }

  const containerExtension = resolveContainerExtension(allowedOutputFormats);
  const connectedAt = Date.now();

  const snapshot =
    cachedBeforeAuth ??
    (await preloadCatalog(
      provider.id,
      config,
      containerExtension,
      options.onPreloadProgress ?? (() => {}),
      () => false
    ));

  await touchLastConnected(provider.id, connectedAt);
  setActiveSession({
    provider: { ...provider, isActive: true, lastConnectedAt: connectedAt },
    config,
    channels: snapshot.channels,
    accountInfo,
  });
  setVodMovies(snapshot.movies);
  setSeriesList(snapshot.series);

  if (cachedBeforeAuth && Date.now() - cachedBeforeAuth.fetchedAt > CATALOG_TTL_MS) {
    void refreshCatalogInBackground(provider, config, containerExtension);
  }
}

/**
 * Re-downloads an expired catalog without blocking anything the user is
 * already looking at. Failures are deliberately silent: the cached catalog
 * on screen is still perfectly usable, and an error banner over working
 * content is worse than slightly stale data.
 */
async function refreshCatalogInBackground(
  provider: Provider,
  config: XtreamProviderConfig,
  containerExtension: "m3u8" | "ts"
): Promise<void> {
  try {
    const snapshot = await preloadCatalog(
      provider.id,
      config,
      containerExtension,
      () => {},
      () => getActiveSession()?.provider.id !== provider.id
    );
    const session = getActiveSession();
    if (session?.provider.id !== provider.id) return;
    setActiveSession({ ...session, channels: snapshot.channels });
    setVodMovies(snapshot.movies);
    setSeriesList(snapshot.series);
  } catch {
    // Stale data beats an error over working content.
  }
}

/**
 * Re-fetches the live channel list for the current session in place (manual
 * refresh — master prompt §19) and updates the stored copy so the next
 * launch starts from the fresher list. Throws if there is no active
 * session; callers already gate on that.
 */
export async function refreshActiveSessionChannels(): Promise<void> {
  const session = getActiveSession();
  if (!session) {
    throw new Error("No active session to refresh.");
  }
  // Reuse the extension the session was built with rather than re-deriving
  // it from an empty format list (which would silently downgrade an HLS
  // provider to MPEG-TS on every manual refresh).
  const containerExtension = session.channels[0]?.containerExtension ?? resolveContainerExtension([]);
  const channels = await getAllLiveChannels(session.config, containerExtension);
  // Do not reconnect an old account after switching or disconnecting.
  if (getActiveSession() !== session) return;
  setActiveSession({ ...session, channels });
  await writeCatalog(session.provider.id, "live", toStoredChannels(channels));
}
