/**
 * Short codes a viewer can type instead of a full server address.
 *
 * ## Why numbers
 *
 * Adding a provider asks for four things — name, server, username,
 * password — and on a television every one of them opens the on-screen
 * keyboard, which a D-pad has to walk letter by letter. The server address
 * is the worst of the four: it is the longest, it is the one with `http://`
 * and dots and a colon in it, and it is identical for every viewer on the
 * same service.
 *
 * A remote has **number keys as real, physical buttons**. Typing `1` is one
 * press and the on-screen keyboard never opens at all. No shorter domain
 * can beat that — not a bought one, not a two-letter one — because the cost
 * being removed is not the number of characters, it is opening the keyboard
 * in the first place.
 *
 * It also costs nothing to run: no domain registration, no DNS, no redirect
 * host, no server to keep alive. A URL shortener could not have done this
 * job anyway — the app builds API paths onto this address
 * (`/player_api.php?...`), and a shortener answers with a redirect to one
 * fixed location, which loses the path.
 *
 * ## The trade-off, stated plainly
 *
 * The table ships inside the app, so if a server ever moves, the code stops
 * resolving until an update goes out. That is the price of needing no
 * infrastructure. The full address still works when typed out, so a moved
 * server is an inconvenience and never a lockout — which is the reason this
 * is a *shortcut*, not a replacement for the field.
 *
 * ## Never named in the interface
 *
 * Nothing on screen says a shortcut exists or what any code points at, and
 * nothing should. The store listing has to describe a player that connects
 * to whatever service its owner already subscribes to, because a developer
 * who is also visibly the source of the content is a different kind of
 * listing with different rules. A label reading "type 1 for <our> server"
 * is exactly that claim, printed in the app.
 *
 * Which code maps where is therefore something an operator tells their own
 * customers directly. The field keeps working normally for anyone who types
 * a full address and has never heard of the shortcut.
 *
 * ## Adding one
 *
 * Put the complete address exactly as it should be stored, including the
 * scheme and the port when the panel does not listen on 80. The value goes
 * through `normalizeBaseUrl` afterwards like any typed address, so a
 * trailing slash or a missing scheme is tolerated — but being explicit here
 * is what keeps a wrong port from looking like a network fault to a viewer
 * who did nothing wrong.
 */
/**
 * Empty since 2026-11-18, deliberately, and kept rather than deleted.
 *
 * It held exactly one entry — `"33"`, pointing at the panel this app's
 * customer operates. The comment below already recorded that the owner's plan
 * was to delete the table once the app was approved. What moved that forward
 * was the App Store submission, and the reason is worth keeping because it is
 * not the one the table was built to worry about.
 *
 * The concern here was never that a curious customer could read the address
 * out of a release bundle; the section below says plainly that they always
 * could. It is that the iOS binary would carry an undocumented way to reach
 * one specific commercial service, reachable by typing two digits into the
 * server field, while the App Review notes submitted alongside it said the
 * app is not affiliated with any provider and ships with no sources. Apple
 * treats an undisclosed entry point as a hidden feature under guideline
 * 2.3.1, and the submission is made by a third party under *their* developer
 * account — so the consequence of a statement the binary contradicts would
 * land on someone who had no part in writing either.
 *
 * Removing the entry rather than hiding it better is the only move that makes
 * the sentence true instead of merely hard to disprove.
 *
 * It is removed on **every** platform, not gated to iOS. A gate would have
 * left Android carrying an address that the iOS notes deny exists, which is
 * the same problem with an extra branch. Viewers on any platform type the
 * full address, which has always worked and is what every hand-set-up device
 * already stores.
 *
 * `resolveServerShortcode` stays, now an identity function, so re-adding a
 * code is a one-line change to this object and nothing at the call site. If
 * one is ever added back, read the paragraph above first: whatever is in here
 * ships inside the binary that carries the store listing's claims.
 */
export const SERVER_SHORTCODES: Record<string, string> = {};

/**
 * Expands a shortcut to its full server address, or returns the input
 * untouched when it is not one.
 *
 * Matching is exact after trimming, which is deliberately strict: a real
 * address never looks like one of these codes, so there is no input a viewer
 * could reasonably mean as a URL that this would swallow. Nothing is guessed
 * and no prefixes are matched — a typo produces the ordinary "couldn't reach
 * the server" error rather than silently connecting somewhere unintended.
 *
 * ## Why the code is still two digits
 *
 * It was changed to eight random characters on 2026-11-17 and changed straight
 * back, on the owner's instruction: "خليه 33".
 *
 * The reasoning that made a long code worth having was that the address should
 * not be reachable by a customer poking at the field. That still holds, but it
 * is no longer the binding constraint: the same address is being handed to
 * Google openly, as the server behind the review account, so nothing about it
 * is being kept from anyone who matters. And the whole table is meant to be
 * temporary — the owner's plan is to delete it once the app is approved.
 *
 * ## What this never did
 *
 * It never hid the address from anyone who opens the APK, at any code length.
 * The JavaScript bundle's strings come out of a release build with public
 * tools, and no amount of splitting, encoding or renaming changes that — it
 * only makes the code harder to read for the person doing it, which is not the
 * same thing. Not shipping the address at all is the only thing that would,
 * and that means resolving the code against a server at run time, which is a
 * different feature with a network call and an offline failure mode.
 */
export function resolveServerShortcode(input: string): string {
  return SERVER_SHORTCODES[input.trim()] ?? input;
}
