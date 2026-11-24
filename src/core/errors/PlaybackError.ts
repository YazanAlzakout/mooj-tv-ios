export type PlaybackErrorCategory =
  | "network_timeout"
  | "http_unauthorized"
  | "stream_unavailable"
  | "unsupported_container"
  | "decoder_failure"
  | "source_parse_failure"
  | "unknown";

export interface PlaybackError {
  category: PlaybackErrorCategory;
  message: string;
  cause?: unknown;
}

/**
 * Best-effort categorization from whatever expo-video / fetch hands back.
 * This is a starting heuristic, not a verified mapping — the real taxonomy
 * gets refined during the Milestone 4 codec probe once we have real error
 * samples. Do not treat this as authoritative; never label a genuinely
 * unknown failure "codec unsupported" just to have a tidy answer.
 */
export function toPlaybackError(cause: unknown): PlaybackError {
  const message = extractMessage(cause);
  const lower = message.toLowerCase();

  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("abort")) {
    return { category: "network_timeout", message, cause };
  }
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized")) {
    return { category: "http_unauthorized", message, cause };
  }
  if (lower.includes("404") || lower.includes("not found")) {
    return { category: "stream_unavailable", message, cause };
  }
  if (lower.includes("decod")) {
    return { category: "decoder_failure", message, cause };
  }
  if (lower.includes("parse") || lower.includes("json") || lower.includes("unexpected token")) {
    return { category: "source_parse_failure", message, cause };
  }

  return { category: "unknown", message, cause };
}

function extractMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  if (cause && typeof cause === "object" && "message" in cause) {
    const m = (cause as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Unknown error";
}
