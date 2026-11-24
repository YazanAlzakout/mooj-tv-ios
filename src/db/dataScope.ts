/**
 * Which provider the per-provider tables are reading and writing right now.
 *
 * ## Why this exists rather than a parameter
 *
 * `watch_progress` and `library_items` hold per-provider data, and more than
 * thirty call sites across eight screens read or write them. Threading a
 * provider id through all of those would have put the same lookup in every
 * screen and made every one of them a place to forget it.
 *
 * Instead the session store sets this once, where a session begins and ends.
 * `setActiveSession` and `clearActiveSession` are the only two writers, and
 * every path that connects, restores or refreshes a provider already goes
 * through them — so no screen changed.
 *
 * ## Null is a real answer
 *
 * No session means no provider, and a query scoped to no provider must return
 * nothing rather than everything. A write with no scope is dropped. That is
 * the safe direction: the cost of a missed `setDataScope` is an empty list,
 * not one account's history showing up under another's.
 */
let scope: string | null = null;

export function setDataScope(providerId: string | null): void {
  scope = providerId;
}

/** The active provider's id, or null when nothing is connected. */
export function dataScope(): string | null {
  return scope;
}
