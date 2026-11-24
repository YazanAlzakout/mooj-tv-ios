const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Self-contained base64 decoder — Hermes doesn't guarantee a global
 * `Buffer` or `atob`, so this avoids relying on either. Returns null for
 * input that isn't valid base64 rather than silently returning garbage.
 */
export function decodeBase64(input: string): string | null {
  const clean = input.replace(/[\r\n]/g, "");
  if (clean.length === 0 || clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    return null;
  }

  let output = "";
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    const padding = (chunk.match(/=+$/) ?? [""])[0].length;
    const chars = chunk.replace(/=/g, "A");

    const values = [0, 1, 2, 3].map((j) => ALPHABET.indexOf(chars[j]));
    if (values.some((v) => v < 0)) return null;

    const bits = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    const bytes = [(bits >> 16) & 0xff, (bits >> 8) & 0xff, bits & 0xff];

    for (let k = 0; k < 3 - padding; k++) {
      output += String.fromCharCode(bytes[k]);
    }
  }

  try {
    // Bytes decoded above are Latin-1; re-interpret as UTF-8 so multi-byte
    // (e.g. Arabic) programme titles/descriptions come out correct.
    return decodeURIComponent(
      output
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
  } catch {
    return null;
  }
}
