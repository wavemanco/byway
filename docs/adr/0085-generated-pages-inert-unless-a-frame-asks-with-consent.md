# ADR-0085: Generated-page responses are inert unless a same-origin frame asks with consent; every in-app "Open" goes to the whole-artifact viewer; frames navigate only within byway

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 20:30 |
| **Track** | Product |

## Context

This record corrects [ADR-0074](0074-local-app-security-model.md) ("generated pages render only in a sandboxed frame" and "cannot navigate themselves away") and the page-scripts paragraph of [ADR-0080](0080-phase-4-recheck-corrections.md) ("Generated pages run no scripts by default"), by addition. It edits neither.

The external review's finding F05, confirmed by both verifiers on a production build, showed that the per-page scripts switch held only inside byway's own frames:

- `/artifacts/<id>` always answered a page with a CSP ending in `sandbox allow-scripts`, cached for a year as immutable. It had to: CSP sandbox flags intersect with the frame's `sandbox` attribute, so the switch could only work if the response always allowed scripts. Consent lived in the frame attribute alone.
- Seven in-app paths opened that address top-level, where no frame attribute applies: the Open links in a step's detail, on a pick card and on a reference, the Result screen's "Open in a new tab" (beside the note "Scripts are off"), the fallback link of an artifact preview, the storyboard's clip fallback, and Markdown links to byway's own artifacts. One click ran the page's scripts with no consent, and a hostile page carried its text to a collector.
- `allow-scripts` also re-enables automatic features, so a page with no JavaScript leaked through a meta refresh.
- A probe during the design review added one more: the app's CSP had no `frame-src`, so a click on a model-written link in a scripts-off frame, or a consented page's script navigating itself, carried the frame off-site.

The impact is bounded (an opaque origin, `connect-src 'none'`: only that page's own text, plus the viewer's IP and timing, can leave) and it needs hostile page content and a click. The guarantee ADR-0080 states was still false on these paths.

## Decision

- **A page's own address is inert.** `/artifacts/<id>` answers a page with a bare `sandbox`: an opaque origin, no scripts, no forms, no popups and no automatic features, so a meta refresh cannot leave either. This answer never depends on the request, so it keeps its long immutable cache and needs no `Vary`.
- **Scripts are served only to a frame that asks with consent.** `/artifacts/<id>?scripts=1` adds `allow-scripts` only when the browser's Fetch Metadata says a same-origin iframe asked (`Sec-Fetch-Dest: iframe`, `Sec-Fetch-Site: same-origin`; `pageScriptsGranted`). Any ask for scripts is answered `Cache-Control: no-store`. Downloads and the media route (`/api/artifacts/<id>`) never grant.
- **The app's two page frames derive their address and their sandbox from one switch.** ScaledPage and PageResult take an artifact id. With scripts off they load the plain address with `sandbox=""`; with scripts on, `?scripts=1` with `sandbox="allow-scripts"` (`pageFrameUrl`, `frameSandbox`). The frame attribute stays as a second layer. The switch itself is unchanged: off by default, for one page, for one visit, never stored.
- **One rule for opening an artifact.** Every in-app "Open" uses `openHref(id)`, which is `/view/<id>`: the step detail's Open, every pick card (not only pages), every reference (not only pages), the Result screen's "Open in a new tab", the preview fallback, the clip fallback, and Markdown links to byway's own artifacts. The raw address is used only as an element's `src` (images, clips, page frames) and for downloads. A scan test fails on any one-argument `href={artifactUrl(…)}` in the app.
- **The whole-artifact viewer, `/view/<id>`.** It is an app screen, so the app's CSP applies. It reads the artifact whole from the store and shows:
  - a page in PageResult, with Desktop and Phone widths and the same per-page switch;
  - text whole, as its kind (prose, a diff, an option map, a storyboard with its frames);
  - images and clips as themselves.

  Any other type redirects to the raw address, which serves it inert. A missing or malformed id is a 404.
- **The app's frames show only byway's own addresses.** The app CSP gains `frame-src 'self'`. In Chromium this stopped both a click on a model-written link in a scripts-off frame and a consented page's script navigating itself to a collector. It is a second layer, not consent: a page running its scripts still has ways out that CSP does not govern (DNS prefetch, WebRTC), so scripts stay a per-page choice.
- **A downloaded page is disclosed.** Beside a page's download (the Result screen and the viewer): "A downloaded page runs its scripts when you open it from your computer."

How it fails, by design:

- A browser that sends no Fetch Metadata never gets a page's scripts (Chromium and Edge, Firefox 90+ and Safari 16.4+ send it on loopback).
- A request a page makes itself never gets them. A consented frame that reloads itself or moves to another page's `?scripts=1` comes from an opaque origin, which is not same-origin, so the frame comes back inert. After such a reload the switch can still read "on" over an inert frame; turning it off and on again asks afresh. The safe direction was chosen on purpose.

Residuals, stated plainly:

- Responses cached before this change, with `allow-scripts`, stay in a browser's cache for up to a year. No in-app link reaches them any more. A typed or bookmarked address, history, a link copied before the upgrade, or a consented frame moving itself to another page's plain address still can. Clearing byway's cached files in the browser once removes them.
- A downloaded page opened from disk runs without byway's sandbox or CSP. The download says so.
- Ordinary links in Markdown text, and on a page opened top-level, are links the person sees and clicks. They are not rewritten.

## Alternatives considered

- **Route every page view through one trusted viewer route, frames included (the review's repair as written).** The in-app frames are already trusted viewers, so this nests frames for no security gain. It also does not close off-site frame navigation.
- **Keep one address and gate the CSP on `Sec-Fetch-Dest` with `Vary`.** The smallest change, but responses cached before it keep `allow-scripts` for a year, and every Open link would still target that address, so ordinary clicks would reach them. Any scripts-off frame would also still receive the scriptable answer, and full-size pages would lose their consent path.
- **No page scripts at all.** The strongest invariant, but C1's build prompts need inline JavaScript and the critic's renderer runs scripts, so the person would judge a different page than the critic saw. It also reverses ADR-0080's deliberate per-page consent.
- **A one-time `Clear-Site-Data` to purge old cached responses.** The server cannot know whether a browser has purged without new per-browser state (a cookie), and sending it on every document would wipe the app's cache on each navigation. The remaining reach is low and is listed above.

## Consequences

**Positive**

- "Generated pages run no scripts by default" holds on every path byway links to, and on typed addresses and history for anything served after this change.
- A page with no JavaScript cannot leave through a meta refresh.
- A framed page cannot be carried off-site by a link click or by its own script.
- Pages can still be used full size with scripts, in the viewer, after the person turns them on.

**Negative**

- One more app route, and an Open now shows byway's viewer around the artifact rather than the bare artifact.
- A consented frame is fetched without caching each time its scripts are turned on.
- The residuals above.

## Evidence

- [External-review verification, 2026-10-08](../reviews/2026-10-08-external-review-verification.md): F05 and Cluster C, Change 1 (the recommendation, both verifiers' production-build reproductions, the frame-src probe, the final check). The original review is outside the repository, at `C:/Users/arvik/code/byway_review/byway-review.md` (read-only).
- Tests:
  - `apps/web/test/server.test.ts`: the inert default CSP, the consented variant (no-store), every refused ask, and `frame-src 'self'` in the app CSP. These pinned `sandbox allow-scripts` before.
  - `apps/web/test/api.test.ts`: the route grants `?scripts=1` only to a same-origin iframe; document, missing headers, cross-site, the plain address and downloads are inert.
  - `apps/web/test/open-links.test.ts`: every Open path's `href` is `/view/<id>`; every frame's address carries `?scripts=1` exactly when its sandbox allows scripts; the scan for one-argument `href={artifactUrl(…)}`.
  - `apps/web/e2e/consent-boundary.spec.ts`: a standalone Chromium harness on the real header functions and app CSP. It shows zero collector hits for the plain and `?scripts=1` addresses opened top-level, a meta refresh, Open popups, a scripts-off frame and its links, a consented script navigating itself, a consented frame moving to another page's `?scripts=1`, and a self-reload. The consented frame does run, and a control page without the sandbox does reach the collector. Run against the pre-change headers and CSP, 6 of its 7 cases failed.
  - `apps/web/e2e/artifact-views.spec.ts`: on runs seeded into the suite's store through `@byway/store` (test-side only), each Open path lands on the viewer inert with an empty collector. The switch asks with `?scripts=1` and runs the page without a leak, a reload turns it off, a self-reloading frame comes back inert, and a page's own address opened top-level runs nothing.
  - `apps/web/e2e/configurations.spec.ts` (C1): the raw address answers inert, and so does `?scripts=1` without Fetch Metadata.
