import { PROVIDER_REQUEST_HEADERS } from "./providerHeaders";
import { noteProviderRefusal, noteProviderSuccess, scheduleRequest } from "./requestQueue";

/**
 * 20s, matching the previous app. `get_vod_streams` / `get_series` on a
 * large panel return multi-megabyte JSON over a slow mobile link, and a
 * 10s ceiling was aborting those while smaller calls (auth, categories)
 * always finished in time.
 */
const DEFAULT_TIMEOUT_MS = 20_000;

export class NetworkTimeoutError extends Error {
  constructor(url: string) {
    super(`Request timed out: ${redactUrl(url)}`);
    this.name = "NetworkTimeoutError";
  }
}

/**
 * Strips credential-bearing query params before a URL is ever logged or
 * surfaced in an error message. Xtream URLs carry username/password (and
 * sometimes a session token) in the query string.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of ["username", "password", "token"]) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "***");
      }
    }
    return parsed.toString();
  } catch {
    return "[unparseable url]";
  }
}

/** Bounded retry budget for the transient failure modes below — see the doc comment on `isRetryable`. */
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Only a transport-level blip is worth an immediate retry.
 *
 * HTTP 404 was previously in this set, on the theory that the provider's
 * Cloudflare front end returns transient 404s. Measurement on 2026-09-03
 * showed what those 404s actually are: the panel's own anti-flood response,
 * empty-bodied, returned for every endpoint including the login once the
 * request rate is exceeded. Retrying that immediately makes each call two
 * or three calls and extends the lockout, so a refusal now opens the
 * backoff window in requestQueue.ts instead. 401/403 are likewise not
 * retried — a credential rejection cannot be fixed by asking again.
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof NetworkTimeoutError) return true;
  if (error instanceof Error) return /^Could not parse JSON/.test(error.message);
  return false;
}

/** Statuses this panel uses to say "you are asking too often" (404 included — see isRetryable). */
function isRefusal(status: number): boolean {
  return status === 404 || status === 429 || status === 503;
}

async function attemptFetchJson<T>(url: string, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  signal?.addEventListener("abort", () => controller.abort());

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { ...PROVIDER_REQUEST_HEADERS } });
    if (!response.ok) {
      if (isRefusal(response.status)) noteProviderRefusal();
      throw new Error(`HTTP ${response.status} from ${redactUrl(url)}`);
    }
    noteProviderSuccess();
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Could not parse JSON response from ${redactUrl(url)}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkTimeoutError(url);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(
  url: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Through the global gate — see requestQueue.ts for why nothing may burst.
      return await scheduleRequest(() => attemptFetchJson<T>(url, timeoutMs, options.signal));
    } catch (error) {
      const isLastAttempt = attempt === MAX_ATTEMPTS;
      if (isLastAttempt || !isRetryable(error) || options.signal?.aborted) throw error;
      await sleep(RETRY_DELAY_MS);
    }
  }
  // Unreachable — the loop above always either returns or throws.
  throw new Error(`fetchJson: exhausted retries for ${redactUrl(url)}`);
}
