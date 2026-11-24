/**
 * A global gate in front of every provider request, plus a circuit breaker.
 *
 * Root cause of the 2026-09-03 "everything returns HTTP 404" report: the
 * channel list asks for now/next EPG per visible row, so scrolling a large
 * lineup fired hundreds of `player_api.php` requests within a few seconds.
 * The panel answers a burst with an empty-bodied HTTP 404 — not a 429 —
 * and keeps doing so for a while afterwards, so the catalog calls, the
 * manual refresh, and the media URLs all failed too, which looked exactly
 * like a broken account or a dead server.
 *
 * Measured against the user's real panel the same day: nine sequential
 * requests all returned 200; repeating that same set a minute later
 * returned 404 for every single one, including the login. So the limit is
 * strict and it is on request volume, not on credentials.
 *
 * Two mechanisms, both deliberately conservative — a provider panel is not
 * a CDN, and a few hundred milliseconds of extra latency costs far less
 * than being locked out of the whole session:
 *
 *  1. A gate: at most MAX_CONCURRENT in flight, starts spaced MIN_GAP_MS
 *     apart. No code path can burst, however many components ask at once.
 *  2. A breaker: once the panel starts refusing, back off for a growing
 *     window instead of hammering it — hammering is what extends the
 *     lockout. Any success clears it immediately.
 */
/**
 * One at a time. An Xtream line is sold with a small `max_connections`
 * (often 1 or 2), and the panel counts API calls against it — exceeding it
 * blocks the whole line, on every device, not just the offender. The app
 * makes very few API calls (a login and one catalog fetch per section), so
 * serialising them costs almost nothing, while a second parallel call can
 * cost the user their entire session.
 */
const MAX_CONCURRENT = 1;
const MIN_GAP_MS = 250;

/** Backoff windows, one per consecutive refusal, capped at the last entry. */
const COOLDOWN_STEPS_MS = [5_000, 15_000, 30_000, 60_000];

let active = 0;
let nextStartAt = 0;
const queue: (() => void)[] = [];

let consecutiveRefusals = 0;
let cooldownUntil = 0;

/**
 * Called when the panel refuses a request in a way that means "you are
 * asking too often" (see `fetchJson`). Opens or extends the backoff window.
 */
export function noteProviderRefusal(): void {
  const step = COOLDOWN_STEPS_MS[Math.min(consecutiveRefusals, COOLDOWN_STEPS_MS.length - 1)];
  consecutiveRefusals += 1;
  cooldownUntil = Math.max(cooldownUntil, Date.now() + step);
}

/** Called on any successful provider response — the panel is answering again. */
export function noteProviderSuccess(): void {
  consecutiveRefusals = 0;
  cooldownUntil = 0;
}

/** Milliseconds until the gate will let anything through, 0 when it is open. */
export function cooldownRemainingMs(): number {
  return Math.max(0, cooldownUntil - Date.now());
}

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const run = queue.shift();
    if (!run) return;
    active += 1;
    const now = Date.now();
    const startAt = Math.max(now, nextStartAt, cooldownUntil);
    nextStartAt = startAt + MIN_GAP_MS;
    const delay = startAt - now;
    if (delay <= 0) run();
    else setTimeout(run, delay);
  }
}

/** Runs `task` once the gate allows it. Rejections propagate untouched. */
export function scheduleRequest<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => {
      task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    });
    pump();
  });
}
