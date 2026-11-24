/**
 * A plain numeric ISO-like date, deliberately not `Intl.DateTimeFormat` —
 * Hermes's ICU data for some of this app's locales (the Kurdish variants in
 * particular) isn't guaranteed on-device, and an unsupported locale tag can
 * throw a RangeError. A numeric date reads unambiguously in every language
 * this app supports.
 */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
