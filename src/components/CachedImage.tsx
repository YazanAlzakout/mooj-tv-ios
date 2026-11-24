import { Image, type ImageContentFit, type ImageStyle } from "expo-image";
import { View, type ImageResizeMode, type StyleProp } from "react-native";

import { DEMO_ART_PREFIX, DEMO_CONTENT, demoArtColors, demoArtShape } from "@/core/demo/demoMode";

import { artworkIsKnownBad, noteImageFailed } from "@/core/media/deadImageHosts";
import { knownLocalUri } from "@/core/media/imageCache";

/**
 * Provider artwork, drawn by `expo-image`.
 *
 * This is deliberately a component with **no state and no effects**. The
 * version before it kept a `localUri` in state and resolved it in an
 * effect, and every grid cell also tracked its own `loaded` flag — so a
 * screen of posters produced a burst of re-renders arriving one per image
 * as they landed, while the list was being scrolled. That, together with
 * the placeholder swapping out under each one, is what made the grid look
 * like it was shivering rather than gliding.
 *
 * `expo-image` does all of it natively instead: an in-memory cache so a
 * poster scrolled back to is instant, a disk cache so it survives the app,
 * and decoding off the JS thread. Nothing here re-renders while scrolling.
 *
 * `recyclingKey` is what makes it safe in a recycled list — the view is
 * blanked when it is handed a different image, instead of showing the
 * previous row's poster until the new one decodes.
 */
const CONTENT_FIT: Record<string, ImageContentFit> = {
  cover: "cover",
  contain: "contain",
  stretch: "fill",
  center: "none",
  repeat: "cover",
};

export function CachedImage({
  uri,
  style,
  resizeMode,
  onLoad,
  onError,
  priority,
}: {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  onLoad?: () => void;
  onError?: () => void;
  priority?: "low" | "normal" | "high";
}) {
  if (!uri) return null;

  /*
   * Store-listing capture only; dead in every shipping build. A gradient
   * stands in for a poster so the app can be photographed running on a
   * catalogue that belongs to nobody — see core/demo/demoMode.ts. Drawn
   * rather than downloaded, so nothing is requested for a picture that
   * does not exist.
   */
  if (DEMO_CONTENT && uri.startsWith(DEMO_ART_PREFIX)) {
    const [deep, bright] = demoArtColors(uri);
    const shape = demoArtShape(uri);
    return (
      <View style={[style, { backgroundColor: deep, overflow: "hidden" }]}>
        <View
          style={{
            position: "absolute",
            left: "-30%",
            right: "-30%",
            top: shape.topA,
            height: shape.heightA,
            backgroundColor: bright,
            opacity: 0.5,
            borderRadius: 999,
            transform: [{ rotate: shape.angleA }],
          }}
        />
        <View
          style={{
            position: "absolute",
            left: "-20%",
            right: "-20%",
            top: shape.topB,
            height: shape.heightB,
            backgroundColor: bright,
            opacity: 0.3,
            borderRadius: 999,
            transform: [{ rotate: shape.angleB }],
          }}
        />
      </View>
    );
  }

  /*
   * A URL that has already failed is not asked for again.
   *
   * This is the whole app's artwork funnel — every poster and every channel
   * logo is drawn here — so it is the one place worth enforcing it. Without
   * it a broken logo is re-requested on every recycle of the cell holding
   * it, and `expo-image`'s caches cannot help: they remember successes
   * only. Measured cost of not doing this, on the device 2026-09-16: 5,511
   * failure lines and 192 blocking metadata reads on the **main thread** in
   * four and a half minutes — over a thousand of them inside single
   * seconds, each burst starting the instant a screen first drew — plus a
   * burst of sockets to the provider of exactly the kind its anti-flood
   * rule answers with an empty 404 on every endpoint, playback included.
   * See core/media/deadImageHosts.ts.
   *
   * Returning null is what this component already does for a missing `uri`,
   * so every caller's own fallback (a letter tile, a placeholder poster)
   * appears exactly as it does for a channel that never had a logo. No
   * caller needs to change.
   */
  if (artworkIsKnownBad(uri)) return null;

  /*
   * A file already downloaded by the first-run warm-up is handed over as a
   * local path, so it never touches the network. Anything else goes to
   * `expo-image`, which caches it on disk the first time it is shown.
   * `knownLocalUri` is a map and Set lookup — no filesystem call — so it is
   * safe to read while rendering.
   */
  const source = knownLocalUri(uri) ?? uri;

  return (
    <Image
      source={source}
      style={style}
      contentFit={resizeMode ? CONTENT_FIT[resizeMode] : undefined}
      cachePolicy="memory-disk"
      recyclingKey={uri}
      transition={0}
      priority={priority}
      onLoad={onLoad ? () => onLoad() : undefined}
      /*
        Always attached, whether or not the caller wants to know. The record
        is what stops the retry storm, and before this exactly one screen in
        the app happened to pass an `onError` that kept it.
      */
      onError={(event) => {
        noteImageFailed(uri, event.error);
        onError?.();
      }}
    />
  );
}
