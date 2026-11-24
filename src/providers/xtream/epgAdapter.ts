import { decodeBase64 } from "@/core/utils/base64";
import { fetchJson } from "@/core/network/fetchJson";
import type { EpgProgram } from "@/domain/epg/types";
import type { XtreamProviderConfig } from "@/domain/provider/types";
import { playerApiUrl } from "./playerApiUrl";

/**
 * Raw Xtream short-EPG response shape, per the widely-documented
 * `get_short_epg` convention (title/description base64-encoded, timestamps
 * as unix-epoch-second strings).
 *
 * UNVERIFIED against a live populated response: every channel on our real
 * test provider returns `epg_listings: []`, and its
 * xmltv.php feed has channel entries but zero <programme> elements — see
 * docs/DECISIONS.md. This parser is defensive (drops anything that doesn't
 * look sane rather than throwing or guessing) precisely because it hasn't
 * been checked against a real populated feed. Re-verify field names the
 * first time this runs against a provider that actually returns listings.
 */
interface RawEpgListing {
  id?: string | number;
  title?: string;
  description?: string;
  start_timestamp?: string | number;
  stop_timestamp?: string | number;
}

interface RawShortEpgResponse {
  epg_listings?: RawEpgListing[];
}

function decodeMaybeBase64(value: string | undefined): string {
  if (!value) return "";
  const decoded = decodeBase64(value);
  return decoded ?? value;
}

function normalizeTimestampMs(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;
  const seconds = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds * 1000;
}

/**
 * Fetches the short EPG (now + next few programmes) for one channel.
 * Never throws for "no EPG available" — an empty array is the normal,
 * expected result (master prompt §20's "No EPG data" state), and any
 * listing with a nonsensical time range is silently dropped rather than
 * shown broken.
 */
export async function getShortEpg(
  config: XtreamProviderConfig,
  streamId: string,
  limit = 4
): Promise<EpgProgram[]> {
  const url = playerApiUrl(config, {
    action: "get_short_epg",
    stream_id: streamId,
    limit: String(limit),
  });

  const response = await fetchJson<RawShortEpgResponse>(url);
  const listings = response.epg_listings ?? [];

  const programs: EpgProgram[] = [];
  for (const listing of listings) {
    const start = normalizeTimestampMs(listing.start_timestamp);
    const stop = normalizeTimestampMs(listing.stop_timestamp);
    if (start === null || stop === null || stop <= start) continue;

    programs.push({
      id: listing.id !== undefined ? String(listing.id) : `${start}-${stop}`,
      title: decodeMaybeBase64(listing.title) || "Untitled",
      description: decodeMaybeBase64(listing.description),
      startTimestamp: start,
      stopTimestamp: stop,
    });
  }

  return programs.sort((a, b) => a.startTimestamp - b.startTimestamp);
}
