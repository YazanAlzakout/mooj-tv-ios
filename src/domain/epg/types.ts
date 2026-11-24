/**
 * A single EPG programme entry, normalized from whatever shape the
 * provider's raw response uses. Timestamps are always epoch milliseconds
 * (UTC) — never a provider-local string — so downstream code never has to
 * reason about server timezone (master prompt §20).
 */
export interface EpgProgram {
  id: string;
  title: string;
  description: string;
  startTimestamp: number;
  stopTimestamp: number;
}
