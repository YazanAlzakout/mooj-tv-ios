# iPhone usability and reliability review

Status: first static review, not device acceptance. The original repository is unchanged.

## Implemented in this pass

- Live-player back remains visible when transport controls auto-hide. The previous code explicitly relied on Android system back, which does not provide an iPhone escape route.
- Live and VOD back use the existing drawn chevron rather than a text glyph, with a 44-point button and a localized accessibility label. Live guide buttons also have 44-point geometry.
- Play/pause announces its current action; live previous/next and channel guide have localized accessibility labels.
- An interrupted VOD scrub cancels instead of seeking to the last drag position.

These are source-level changes. Touch handling, safe areas and screen rotation still need simulator/device checks.

## Confirmed code paths requiring further work

| Priority | Finding | Evidence / consequence | Required correction |
| --- | --- | --- | --- |
| High | Failed catalog sections become empty lists | `src/state/catalogCache.ts` catches fetch and disk-write failures together and returns `[]`; background refresh publishes these lists | Keep last successful data; distinguish no content from a request failure; expose retry |
| High | Late manual channel refresh can restore an old session | `refreshActiveSessionChannels` in `src/state/sessionRestore.ts` publishes the session captured before awaiting the network | Invalidate stale work on account change/disconnect and test delayed responses |
| High | Movie/series requests can populate a newer session with old results | `src/state/vodStore.ts` and `seriesStore.ts` write their global lists after awaiting, without a generation check | Guard writes and screen updates against session changes |
| Medium | Startup waits for artwork | `preloadCatalog` awaits up to 60 images per content type before returning | Make artwork optional background work with cancellation; catalog readiness should unblock navigation |
| Medium | Search can retain old catalog entries after refresh | Search index is reset on provider switch, but not ordinary catalog replacement | Version the index against catalogs; serialize rebuilds |
| Medium | Inconsistent transport glyphs and accessibility | Player controls mix font characters with drawn icons; only a subset have explicit labels | Use a consistent icon set, label every icon-only action, preserve LTR transport order in Arabic |

These findings do not establish the cause of a native crash. A native crash report and a reproduction on iOS are still needed.

## Button and interaction acceptance matrix

Inventory search found 197 handler declarations (`onPress`, `onValueChange`, `onChangeText`) across app, playback and components. This is an inventory, not proof that all controls work. Verify each applicable state below with the UI running.

| Area | Controls / scenarios to verify |
| --- | --- |
| Live player | Back while loading/playing/failed/controls hidden; previous/next with one channel and rapid taps; play/pause; channel guide search/select/close; audio; mute; sleep timer; fit mode |
| Movie / episode | Back; play/pause; ±10 seconds at beginning/end; scrub release/cancel; speed; tracks and subtitle off; fit; PiP where available; previous/next episode at boundaries and repeated taps |
| Player gestures | Single/double tap; vertical volume/brightness gesture; gesture vs buttons; interruptions; landscape safe areas; Arabic layout; screen reader focus |
| Catalogs | Tab/category selection; All; search; hidden categories; refresh success/failure; empty state; retry; card opens correct detail/player |
| Details / library | Play/resume; favorite/watchlist toggle under rapid taps and storage failure; season/episode selection; history removal and resume position |
| Providers | Add/edit/connect/delete/cancel; disabled actions while busy; failed login; account switch during fetch; disconnect |
| Settings | Language/theme; category visibility and PIN; background playback; preferred tracks; clearing cache/history; confirmations and cancel; legal links |
| Modal sheets | Close button/backdrop; inner taps do not dismiss; scroll; selection state; safe area; keyboard dismissal |

## Product priorities

Keep the app a straightforward IPTV player. First stabilize source switching and lifecycle, then make navigation and controls consistent, then improve startup/catalog responsiveness. Existing favorites, history, resume and track selection should be reliable before adding features. Avoid expanding into recording, casting or extra modes until these basics pass.

## Validation evidence

- The earlier simulator build for commit `d7e91a2` succeeded in GitHub Actions run `45494339540`. That run predates this control patch.
- TypeScript, targeted ESLint, six source-queue tests and independent iOS identity verification passed for this patch.
- No iPhone interaction test or crash-free playback certification has been performed.
