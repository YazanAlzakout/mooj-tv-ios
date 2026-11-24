/**
 * What a stored credential looks like on screen: a fixed run of asterisks.
 *
 * **Fixed length, deliberately.** Masking a value with one asterisk per
 * character publishes the value's length, which is the single most useful
 * thing an attacker can learn about a password without learning the
 * password — it turns guessing from open-ended into a bounded search. Six
 * is a length, not *the* length, and it is the same six for a four-letter
 * username and a thirty-character password.
 *
 * Used in two different ways, which is worth keeping straight:
 *
 *   - As **text**, where a stored value used to be printed (the account
 *     card in Settings, the provider rows). There is nothing underneath it;
 *     the real value is simply not rendered.
 *   - As a **placeholder** in the edit form, where it means "a value is
 *     saved here — leave this alone or type a replacement". The field is
 *     genuinely empty: the placeholder is a hint, not a value sitting
 *     behind a mask, so there is nothing to copy and nothing for a stray
 *     keystroke to append itself to.
 *
 * ## What this does and does not buy
 *
 * It stops a person holding the unlocked device from reading an account and
 * passing it on — which on a line limited to one connection is the common
 * way an account stops working for its owner.
 *
 * It is **not** protection from anyone determined. The panel is plain HTTP
 * (`usesCleartextTraffic`, documented in docs/DECISIONS.md), so the
 * username and password travel inside the query string of every request and
 * anyone sharing the network can read them regardless of what any screen
 * shows. Treat this as a barrier against the casual case and never describe
 * it as more than that.
 */
export const MASKED_VALUE = "******";
