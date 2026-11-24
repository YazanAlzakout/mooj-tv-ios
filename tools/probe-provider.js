/**
 * Diagnostic probe — run manually, never imported by the app.
 *
 * Asks the provider's panel the exact same questions the app asks, and
 * prints only status codes / content types / short body prefixes. It never
 * prints the username or password, so the output is safe to paste back.
 *
 *   node tools\probe-provider.js <username> <password> [baseUrl]
 *
 * Default baseUrl is http://albasera-tv.net (the provider currently saved
 * in the app). Pass a different one to test a variant, e.g. with a port.
 */

// Flags may appear anywhere, so positionals are whatever is left over.
const [username, password, baseUrlArg] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

if (!username || !password) {
  console.error("Usage: node tools\\probe-provider.js <username> <password> [baseUrl]");
  process.exit(1);
}

const baseUrl = (baseUrlArg || "http://albasera-tv.net").replace(/\/+$/, "");

/**
 * This panel refuses further requests once its (small) rate budget is
 * spent, so the probe itself must not be what trips the limit: every call
 * is spaced out, and `--auth` runs the single login call only, which is
 * the right mode for "is the lockout over yet?".
 */
const authOnly = process.argv.includes("--auth");
const GAP_MS = 700;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BROWSER_HEADERS = {
  Accept: "*/*",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
};

/** Removes the credentials from anything about to be printed. */
function redact(text) {
  return String(text).split(username).join("<USER>").split(password).join("<PASS>");
}

function apiUrl(action) {
  const query = new URLSearchParams({ username, password });
  if (action) query.set("action", action);
  return `${baseUrl}/player_api.php?${query.toString()}`;
}

async function probe(label, url, headers) {
  await sleep(GAP_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
    const body = await response.text();
    const contentType = response.headers.get("content-type") || "-";
    const server = response.headers.get("server") || "-";
    const preview = redact(body.replace(/\s+/g, " ").slice(0, 110));
    console.log(
      `${label.padEnd(34)} ${response.status}  ${String(body.length).padStart(9)}b  ${server}  ${contentType}`
    );
    if (response.status !== 200 || body.length < 400) console.log(`${" ".repeat(36)}${preview}`);
    return { status: response.status, body };
  } catch (error) {
    console.log(`${label.padEnd(34)} FAILED  ${redact(error.message)}`);
    return { status: 0, body: "" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What the login response says the account is allowed to do. `max_connections`
 * is the number that matters most: it caps how many requests the app may have
 * in flight before the panel blocks the whole line.
 */
function printAccount(auth) {
  if (auth.status !== 200) return;
  try {
    const info = JSON.parse(auth.body);
    const expDate = Number(info?.user_info?.exp_date);
    console.log("");
    console.log("account:");
    console.log(`  status            ${info?.user_info?.status}`);
    console.log(
      `  expires           ${Number.isFinite(expDate) ? new Date(expDate * 1000).toISOString().slice(0, 10) : "-"}`
    );
    console.log(`  active_cons       ${info?.user_info?.active_cons} / ${info?.user_info?.max_connections}`);
    console.log(`  allowed_formats   ${JSON.stringify(info?.user_info?.allowed_output_formats)}`);
    console.log(`  server url        ${info?.server_info?.url}:${info?.server_info?.port}`);
    console.log(`  https port        ${info?.server_info?.https_port}`);
    console.log(`  rtmp port         ${info?.server_info?.rtmp_port}`);
  } catch {
    console.log("  (login response was not JSON)");
  }
}

async function main() {
  console.log(`base: ${baseUrl}`);
  console.log("");
  console.log("label                              code       bytes  server  content-type");
  console.log("-".repeat(96));

  console.log("--- with browser User-Agent (what the app sends now) ---");
  const auth = await probe("auth (no action)", apiUrl(null), BROWSER_HEADERS);

  if (authOnly) {
    // Also settle whether an explicit default port changes the answer. Two
    // requests total, so this mode never risks the rate budget itself.
    const withPort = baseUrl.replace(/^(https?:\/\/[^/:]+)$/i, "$1:80");
    if (withPort !== baseUrl) {
      const query = new URLSearchParams({ username, password }).toString();
      await probe("auth via :80", `${withPort}/player_api.php?${query}`, BROWSER_HEADERS);
    }
    console.log("");
    console.log(auth.status === 200 ? "login OK — the panel is answering" : "still refused");
    printAccount(auth);
    return;
  }
  await probe("get_live_categories", apiUrl("get_live_categories"), BROWSER_HEADERS);
  const live = await probe("get_live_streams", apiUrl("get_live_streams"), BROWSER_HEADERS);
  await probe("get_vod_categories", apiUrl("get_vod_categories"), BROWSER_HEADERS);
  await probe("get_vod_streams", apiUrl("get_vod_streams"), BROWSER_HEADERS);
  await probe("get_series_categories", apiUrl("get_series_categories"), BROWSER_HEADERS);
  await probe("get_series", apiUrl("get_series"), BROWSER_HEADERS);

  console.log("");
  console.log("--- with no custom headers (what the app sent before) ---");
  await probe("auth (no action)", apiUrl(null), undefined);
  await probe("get_vod_streams", apiUrl("get_vod_streams"), undefined);

  printAccount(auth);

  // Which live URL shape actually serves video.
  let streamId = null;
  if (live.status === 200) {
    try {
      const first = JSON.parse(live.body)[0];
      streamId = first?.stream_id ?? null;
    } catch {
      /* handled by the null check below */
    }
  }

  if (streamId === null) {
    console.log("");
    console.log("no live stream id available — skipping stream URL shapes");
    return;
  }

  console.log("");
  console.log(`--- live stream URL shapes (stream_id ${streamId}) ---`);
  const withLive = `${baseUrl}/live/${username}/${password}/${streamId}`;
  const bare = `${baseUrl}/${username}/${password}/${streamId}`;
  const shapes = [
    ["/live/<id>.m3u8", `${withLive}.m3u8`],
    ["/live/<id>.ts", `${withLive}.ts`],
    ["/<id>.ts", `${bare}.ts`],
    ["/live/<id> (no ext)", withLive],
    ["/<id> (no ext)", bare],
  ];
  for (const [label, url] of shapes) {
    await probe(label, url, { ...BROWSER_HEADERS, Range: "bytes=0-2047" });
  }
}

main().catch((error) => {
  console.error(redact(error.message));
  process.exit(1);
});
