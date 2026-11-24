import { toPlaybackError } from "@/core/errors/PlaybackError";

/**
 * Transport-level failures whose raw text is meaningless to a viewer: an
 * HTTP status plus a (credential-redacted) provider URL, a JSON parse
 * failure on a WAF challenge page, or a timeout. Verified 2026-09-03 that
 * the user's own panel answers every `player_api.php` login with a
 * zero-byte HTTP 404 while it is down — so this is the common case, not an
 * edge one, and dumping the URL into the UI made a provider outage look
 * like an app bug.
 */
const TRANSPORT_ERROR = /^HTTP \d{3} from |^Could not parse JSON|^Request timed out|exhausted retries/;

/**
 * Turns any provider failure into something worth showing a viewer.
 *
 * A message the *panel itself* wrote ("this account is expired", "wrong
 * username or password") is far more useful than any generic wording, so
 * it is passed through untouched. Only the transport noise above is
 * replaced by the caller's localized fallback.
 */
export function toUserFacingMessage(error: unknown, fallback: string): string {
  const message = toPlaybackError(error).message;
  return TRANSPORT_ERROR.test(message) ? fallback : message;
}
