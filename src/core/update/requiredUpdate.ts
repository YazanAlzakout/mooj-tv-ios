import Constants from "expo-constants";

import { isTvBuild } from "@/core/platform/isTvBuild";

/**
 * Where the minimum-version manifest lives.
 *
 * **Set this to a URL you control and can edit in seconds.** While it is
 * empty the whole mechanism is inert and the app behaves exactly as it did
 * before — see `checkRequiredUpdate`.
 *
 * Deliberately *not* on the content server. This has to stay reachable to
 * be useful and it has nothing to do with streaming, so it belongs on
 * ordinary static hosting. A plain file on any host that serves JSON is
 * enough; there is no API to write.
 *
 * The file it should return:
 *
 *     {
 *       "minVersionCode":    { "phone": 14, "tv": 15 },
 *       "latestVersionCode": { "phone": 16, "tv": 17 }
 *     }
 *
 * Two numbers, because they answer two different questions and only one of
 * them may lock anyone out:
 *
 *   - `minVersionCode` — the oldest build still **allowed to run**. Below
 *     it the app stops at a screen with no way past. Raise this only for a
 *     build that genuinely must not keep running.
 *   - `latestVersionCode` — the newest build **published**. Below it the
 *     viewer is told an update exists and can dismiss the notice and carry
 *     on. Raise this whenever you publish.
 *
 * Raise either and every device below it reacts on its next launch. Nothing
 * needs to be rebuilt or resubmitted to do that.
 *
 * ## Why the newest build must not be a hard gate
 *
 * Play rolls a release out in stages and by device, so for hours or days
 * after publishing there are customers who cannot install the new build
 * even if they want to. Blocking on `latestVersionCode` would lock exactly
 * those people out of an app that still works, with a button that takes
 * them to a store page offering them nothing. That is why the soft tier is
 * dismissible and the hard tier is a separate, deliberately-raised number.
 */
const MANIFEST_URL = "";

/**
 * How long the check may take before it gives up and lets the app through.
 *
 * The fetch is started at the top of the startup sequence and only awaited
 * after the database work, so on a normal launch it has already finished
 * and adds nothing. This ceiling is for the bad cases — a captive portal, a
 * host that accepts the connection and then stalls — where waiting is worse
 * than not knowing.
 */
const TIMEOUT_MS = 3000;

interface UpdateManifest {
  minVersionCode?: { phone?: number; tv?: number };
  latestVersionCode?: { phone?: number; tv?: number };
}

/**
 * What the launch check concluded.
 *
 *   - `"blocked"` — below the published minimum. No way past.
 *   - `"available"` — a newer build is published. Shown on every launch
 *     until it is installed, and dismissible.
 *   - `"none"` — nothing to say, which includes every uncertainty.
 */
export type UpdateStatus = "blocked" | "available" | "none";

/**
 * The `versionCode` this binary was built with, or null if it cannot be
 * read.
 *
 * Null is treated as "do not block": a gate that cannot establish which
 * version it is looking at has no business locking anyone out.
 */
function installedVersionCode(): number | null {
  const code = Constants.expoConfig?.android?.versionCode;
  return typeof code === "number" ? code : null;
}

/**
 * Whether this device is running a build too old to be allowed on.
 *
 * ## Why phone and TV are asked separately
 *
 * The two artifacts never share a `versionCode` — Play refuses that — so
 * the TV build is always one higher than the phone build of the same
 * release (`app.config.js`). A single shared minimum is therefore always
 * wrong for one of them: set it to the TV number and every up-to-date phone
 * is locked out; set it to the phone number and a TV one release behind
 * slips through. The manifest carries both, and each build reads its own.
 *
 * ## Fails open, always
 *
 * Every failure path returns `false` — no URL configured, no network, a
 * timeout, a non-200, unparseable JSON, a missing field, an unreadable
 * local version. This is the most important property of the whole file.
 *
 * A gate like this is the only code in the app that can make it useless on
 * purpose, and it depends on a host staying alive. If an outage on that
 * host turned into every customer being told to update — with no update to
 * install, because the store has nothing newer — the gate would have
 * caused a far worse outage than any bug it exists to contain. So the
 * question it answers is "has a minimum been published that this build is
 * definitely below", and anything short of a clear yes is a no.
 *
 * Nothing is cached, for the same reason in both directions: a remembered
 * "you are fine" would let a device that must update keep launching, and a
 * remembered "you must update" would outlive the emergency that caused it.
 */
export async function checkRequiredUpdate(): Promise<UpdateStatus> {
  if (!MANIFEST_URL) return "none";

  const installed = installedVersionCode();
  if (installed === null) return "none";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(MANIFEST_URL, {
      signal: controller.signal,
      // A stale copy from a CDN or the platform's own HTTP cache would make
      // raising the minimum take effect at an unpredictable time, which is
      // the one thing this must not do.
      cache: "no-store",
    });
    if (!response.ok) return "none";

    const manifest = (await response.json()) as UpdateManifest;

    /*
      The minimum is read first and wins outright. A manifest that raises
      both numbers is describing a build that must update, and the
      dismissible notice would be the wrong thing to show for it.
    */
    const minimum = isTvBuild ? manifest.minVersionCode?.tv : manifest.minVersionCode?.phone;
    if (typeof minimum === "number" && Number.isFinite(minimum) && installed < minimum) {
      return "blocked";
    }

    const latest = isTvBuild ? manifest.latestVersionCode?.tv : manifest.latestVersionCode?.phone;
    if (typeof latest === "number" && Number.isFinite(latest) && installed < latest) {
      return "available";
    }

    return "none";
  } catch {
    return "none";
  } finally {
    clearTimeout(timer);
  }
}
