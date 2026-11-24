/**
 * Master prompt §7: parse `#EXTINF` playlist entries defensively — unknown
 * attributes and malformed lines must never crash the parse, and large
 * playlists must not block the JS thread for long stretches.
 *
 * This module is a real, standalone parser (verified against the M3U/EXTINF
 * format spec, not guessed) but is NOT yet wired into the provider/session
 * layer — see docs/DECISIONS.md for why that's a deliberately separate,
 * larger change.
 */

export interface M3UEntry {
  name: string;
  url: string;
  tvgId: string | null;
  tvgName: string | null;
  tvgLogo: string | null;
  groupTitle: string | null;
  tvgShift: string | null;
  /** Any #EXTINF attribute not explicitly modeled above, kept verbatim. */
  extraAttributes: Record<string, string>;
}

const KNOWN_ATTRIBUTE_KEYS = new Set(["tvg-id", "tvg-name", "tvg-logo", "group-title", "tvg-shift"]);

const EXTINF_ATTRIBUTE_RE = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

function parseExtinfLine(line: string): { attributes: Record<string, string>; name: string } {
  // Format: #EXTINF:-1 tvg-id="..." group-title="...",Channel Name
  const commaIndex = line.lastIndexOf(",");
  const attributesPart = commaIndex >= 0 ? line.slice(0, commaIndex) : line;
  const name = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : "";

  const attributes: Record<string, string> = {};
  let match: RegExpExecArray | null;
  EXTINF_ATTRIBUTE_RE.lastIndex = 0;
  while ((match = EXTINF_ATTRIBUTE_RE.exec(attributesPart)) !== null) {
    attributes[match[1].toLowerCase()] = match[2];
  }
  return { attributes, name };
}

/**
 * Parses M3U/M3U8 playlist text into entries. Tolerant of: CRLF/LF, a
 * missing/duplicate `#EXTM3U` header, blank lines, lines with no `#EXTINF`
 * before a URL (falls back to the URL itself as the name), and unknown
 * attributes (preserved in `extraAttributes` rather than dropped).
 */
export function parseM3U(text: string): M3UEntry[] {
  const lines = text.split(/\r\n|\r|\n/);
  const entries: M3UEntry[] = [];

  let pendingAttributes: Record<string, string> | null = null;
  let pendingName = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#EXTM3U")) continue;

    if (line.startsWith("#EXTINF")) {
      const parsed = parseExtinfLine(line.slice("#EXTINF".length + 1));
      pendingAttributes = parsed.attributes;
      pendingName = parsed.name;
      continue;
    }

    if (line.startsWith("#")) continue; // Other directives (#EXTGRP, #EXTVLCOPT, ...) — not modeled, not fatal.

    // A non-comment, non-empty line here is the stream URL.
    const attributes = pendingAttributes ?? {};
    const extraAttributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (!KNOWN_ATTRIBUTE_KEYS.has(key)) extraAttributes[key] = value;
    }

    entries.push({
      name: pendingName || line,
      url: line,
      tvgId: attributes["tvg-id"] ?? null,
      tvgName: attributes["tvg-name"] ?? null,
      tvgLogo: attributes["tvg-logo"] ?? null,
      groupTitle: attributes["group-title"] ?? null,
      tvgShift: attributes["tvg-shift"] ?? null,
      extraAttributes,
    });

    pendingAttributes = null;
    pendingName = "";
  }

  return entries;
}

/**
 * Parses in chunks via a macrotask yield between batches, so a large
 * playlist (tens of thousands of lines) never blocks the JS thread for one
 * long synchronous stretch (master prompt §7's "must not freeze the JS
 * thread" requirement) — a plain synchronous `parseM3U` is fine up to a few
 * thousand lines, but a truly large playlist should use this instead.
 */
export async function parseM3UChunked(text: string, linesPerChunk = 2000): Promise<M3UEntry[]> {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length <= linesPerChunk) return parseM3U(text);

  const entries: M3UEntry[] = [];
  let pendingAttributes: Record<string, string> | null = null;
  let pendingName = "";

  for (let start = 0; start < lines.length; start += linesPerChunk) {
    const chunk = lines.slice(start, start + linesPerChunk);
    for (const rawLine of chunk) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("#EXTM3U")) continue;

      if (line.startsWith("#EXTINF")) {
        const parsed = parseExtinfLine(line.slice("#EXTINF".length + 1));
        pendingAttributes = parsed.attributes;
        pendingName = parsed.name;
        continue;
      }

      if (line.startsWith("#")) continue;

      const attributes = pendingAttributes ?? {};
      const extraAttributes: Record<string, string> = {};
      for (const [key, value] of Object.entries(attributes)) {
        if (!KNOWN_ATTRIBUTE_KEYS.has(key)) extraAttributes[key] = value;
      }

      entries.push({
        name: pendingName || line,
        url: line,
        tvgId: attributes["tvg-id"] ?? null,
        tvgName: attributes["tvg-name"] ?? null,
        tvgLogo: attributes["tvg-logo"] ?? null,
        groupTitle: attributes["group-title"] ?? null,
        tvgShift: attributes["tvg-shift"] ?? null,
        extraAttributes,
      });

      pendingAttributes = null;
      pendingName = "";
    }
    // Yield to the event loop between chunks.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return entries;
}
