/**
 * Artwork that has already failed, so it is never requested a second time.
 *
 * A provider's channel list carries logo URLs pointing at whatever host
 * whoever built the list happened to use, and many of those hosts are years
 * dead. From the real test account, on the real device (2026-09-10):
 *
 *     ExpoImage: java.net.UnknownHostException
 *       (Unable to resolve host "vulturetv.com": No address associated…)
 *     ExpoImage: java.net.UnknownHostException
 *       (Unable to resolve host "cdn.sat.tv": …)
 *
 * Nothing caches a *failure*: `expo-image`'s disk cache only remembers what
 * loaded. So every cell carrying one of those URLs started a fresh DNS
 * lookup that sat there until it timed out — one logcat pair showed nine
 * seconds between the request and the failure — and a lineup has hundreds
 * of channels on the same handful of dead hosts. They fill OkHttp's thread
 * pool, and the retained request objects are a large part of the 21MB of
 * garbage each interaction was producing.
 *
 * Two things are remembered, because there are two different failures: a
 * host that is *gone* (blame the host, skip everything on it) and a file
 * that is *missing* from a host that is otherwise fine (blame that URL and
 * nothing else). The second case is the common one and, until 2026-09-16,
 * was remembered nowhere at all — see `failedUrls` for what that cost.
 *
 * Deliberately in memory only, never persisted: a host can come back, DNS
 * can be a local problem, and the cost of being wrong for one session is a
 * missing logo. Persisting it would make a temporary network fault
 * permanent.
 */

const FAILURES_BEFORE_DEAD = 3;

/** host -> how many distinct images from it have failed this session. */
const failuresByHost = new Map<string, number>();

/**
 * Every artwork URL that has already failed this session.
 *
 * ## Why a per-URL set as well as the per-host count
 *
 * The host count above was written for hosts that are *gone*, where one
 * failure predicts the rest. It does nothing for the far more common case
 * measured on the device on 2026-09-16: a host that is perfectly alive and
 * answers **404** or **400** for individual logos. Blacklisting such a host
 * would throw away the hundreds of logos on it that do work, so the count
 * deliberately ignores those failures — and before this set existed,
 * nothing else remembered them either.
 *
 * What that cost, measured over four and a half minutes on one phone:
 *
 *   - 5,511 Glide/ExpoImage failure lines, **every one on the main thread**
 *     (pid == tid), each a formatted exception with a full stack trace.
 *   - Those arrive in bursts, and the bursts are not spread out: 1,334 of
 *     them landed in the single second 11:59:03, and three other seconds
 *     carried more than a thousand each. Every burst begins immediately
 *     after a `VRI[MainActivity] vri.reportNextDraw` — the first draw of a
 *     screen — so the second a screen opens is the second the UI thread
 *     spends formatting a thousand stack traces. That is what "I press and
 *     nothing responds" was.
 *   - 192 blocking `MediaMetadataRetriever.setDataSource` calls, also on
 *     the main thread: Glide had cached a non-image body and fell through
 *     to its video decoder, so it re-decoded the same broken bytes every
 *     time a cell was recycled.
 *   - 13 to 29 sockets held open to the provider at once, on a line that
 *     allows three connections, which is the request-burst pattern the
 *     panel answers with an empty 404 on *every* endpoint, playback
 *     included.
 *
 * Not claimed, though it was at first: any of the `Choreographer: Skipped
 * N frames` lines in that window. Filtering by pid showed every one of
 * them belonged to a different process.
 *
 * `expo-image`'s disk cache only remembers what loaded, so a URL that fails
 * is asked for again on every single recycle, forever. This set is the
 * missing half: asked once, never asked again.
 */
const failedUrls = new Set<string>();

/**
 * A ceiling on the set, so a very long session walking an 11k-channel
 * lineup cannot grow it without bound. Dropping the whole set on overflow
 * rather than evicting one entry is intentional: it is a cache of
 * *absences*, so forgetting is merely a chance to re-learn, and an LRU here
 * would cost more bookkeeping than it could save.
 */
const MAX_REMEMBERED_FAILURES = 4000;

/**
 * The host part of a URL, or null if it has none (a local file path handed
 * over by the warm-up, a data URI, or something unparseable).
 *
 * Hand-rolled rather than `new URL()`: this is read while rendering every
 * grid cell, and constructing a URL object per cell to throw it away is
 * exactly the kind of per-cell allocation that the artwork path has already
 * been cleaned of once.
 */
function hostOf(uri: string): string | null {
  const schemeEnd = uri.indexOf("://");
  if (schemeEnd < 0) return null;
  const start = schemeEnd + 3;
  let end = uri.length;
  for (let i = start; i < uri.length; i += 1) {
    const c = uri[i];
    if (c === "/" || c === "?" || c === "#") {
      end = i;
      break;
    }
  }
  if (end <= start) return null;
  // Strip any port and userinfo — `example.com:80` and `example.com` are
  // the same host for this purpose.
  const authority = uri.slice(start, end);
  const at = authority.lastIndexOf("@");
  const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
  const colon = hostPort.lastIndexOf(":");
  const host = colon > 0 ? hostPort.slice(0, colon) : hostPort;
  return host.length > 0 ? host.toLowerCase() : null;
}

/**
 * Whether a failure message describes the *host* being unreachable rather
 * than one file being missing.
 *
 * Matched on the message text because that is all `expo-image` reports:
 * `ImageErrorEventData` is `{ error: string }`, verified against the
 * shipped types rather than assumed. The strings matched here are the ones
 * the real device log produced, e.g. `java.net.UnknownHostException: Unable
 * to resolve host "vulturetv.com"`. An unrecognised message is treated as
 * file-level, which is the safe direction: it stops that one URL and leaves
 * every other image on the host alone.
 */
function isHostLevelFailure(error: string | null | undefined): boolean {
  if (!error) return false;
  const text = error.toLowerCase();
  return (
    text.includes("unknownhost") ||
    text.includes("unable to resolve host") ||
    text.includes("no address associated") ||
    text.includes("connectexception") ||
    text.includes("failed to connect")
  );
}

/*
  **Timeouts used to be on that list and must not be.**

  A socket timeout is the signature of a weak line, not of a host that has
  gone away, and a provider serves its whole catalogue of posters and logos
  from one or two hosts. So three slow requests on two bars of signal — not
  a rare event — marked every image in the catalogue unrequestable: posters
  on Movies and Series, logos on Live TV, in the guide, in the split list,
  in History, Library and Search, all of them blank at once. Nothing cleared
  it, so full signal did not help and only killing the app did.

  A name that will not resolve, or a connection actively refused, really is
  the host. A timeout is still remembered per URL, which stops that one
  image being asked for again and leaves the rest of the host alone — the
  safe direction this file already describes.
*/

/**
 * Records that this image failed to load. Safe to call more than once.
 *
 * `error` is the message `expo-image` reported, when the caller has it. It
 * decides whether the host is blamed as well as the URL — see
 * `isHostLevelFailure`. Called without it, only the URL is remembered,
 * which is the conservative half.
 *
 * ## Why three host failures, and not one
 *
 * A single failure means nothing — that image may simply be missing from a
 * host that is otherwise fine, and blacklisting the host would throw away
 * every other logo on it. Three distinct failures is past coincidence.
 */
export function noteImageFailed(
  uri: string | null | undefined,
  error?: string | null
): void {
  if (!uri) return;

  if (failedUrls.size >= MAX_REMEMBERED_FAILURES) failedUrls.clear();
  failedUrls.add(uri);

  if (!isHostLevelFailure(error)) return;
  const host = hostOf(uri);
  if (!host) return;
  failuresByHost.set(host, (failuresByHost.get(host) ?? 0) + 1);
}

/**
 * Forget every recorded failure, URL and host alike.
 *
 * Called when the network comes back, and when the session changes. Both
 * of those invalidate the only thing this file knows: that something failed
 * *before*. A URL that timed out on two bars is not a bad URL, and a host
 * that could not be reached on a dead connection is not a dead host — but
 * nothing here can tell the difference at the time, so the record is kept
 * and then dropped at the two moments it is known to be stale.
 *
 * Without this the state was permanent for the life of the process: the
 * overflow at `MAX_REMEMBERED_FAILURES` clears the URL set only, and
 * switching provider, signing out and pulling to refresh all leave the host
 * map untouched.
 */
export function forgetImageFailures(): void {
  failedUrls.clear();
  failuresByHost.clear();
}

/**
 * Whether artwork from this URL's host should be skipped.
 *
 * A Map lookup and a string scan, no allocation of consequence and no I/O,
 * so it is safe to read during render — the same property `knownLocalUri`
 * relies on. Callers use it to start a cell already showing its fallback
 * instead of starting a request that is known to fail.
 */
export function imageHostIsDead(uri: string | null | undefined): boolean {
  if (!uri) return false;
  const host = hostOf(uri);
  if (!host) return false;
  return (failuresByHost.get(host) ?? 0) >= FAILURES_BEFORE_DEAD;
}

/**
 * Whether this exact URL has already failed this session.
 *
 * A Set lookup, so like `imageHostIsDead` it is safe to read while
 * rendering a cell.
 */
export function imageFailedBefore(uri: string | null | undefined): boolean {
  if (!uri) return false;
  return failedUrls.has(uri);
}

/**
 * Whether artwork at this URL should not be requested at all, for either
 * reason. The single call the render path needs.
 */
export function artworkIsKnownBad(uri: string | null | undefined): boolean {
  return imageFailedBefore(uri) || imageHostIsDead(uri);
}
