/** Locally-unique id (timestamp + random suffix) — good enough for on-device rows, not a UUID. */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
