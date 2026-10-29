# @byway/web

The byway product app (product spec §5): describe a problem, get a recipe, run it with the AI doing the AI
steps and you doing yours, and take the deliverable away. Next.js 16 App Router, React 19, TypeScript.

Start it from the repo root, which also starts the run engine the app needs:

```sh
pnpm start       # build and serve, with real models for the keys in .env.agents at the repo root (never committed)
pnpm demo        # the same with sample outputs: no AI calls, nothing charged
pnpm dev         # contributor mode: next dev inside byway's guarded server, with hot reload
pnpm e2e         # the Playwright suite against a fresh pnpm demo
```

Inside this folder: `pnpm build` (production build; type checking is `pnpm typecheck`'s job), `pnpm typecheck`. Do not
run `next dev` on its own: it answers its internal endpoints (opening files in your editor, attaching a debugger)
before `proxy.ts` runs, so only `pnpm dev` is safe. It runs the Next app in process inside byway's own server
(`src/server/dev-server.ts`, started by `scripts/dev-web.ts`), which guards every request and WebSocket upgrade before
Next sees it and is the only port listening.

## Layout

| Path | What lives there |
|---|---|
| `app/` | Screens (Start, Recommendation, Run, Result, Library, History, Settings, and the whole-artifact viewer `app/view/[id]`), route handlers under `app/api`, and the artifact routes `app/artifacts/[id]` and `app/api/artifacts/[id]` |
| `src/services/` | **The seam.** `getContext()` / `getServices()` return `{ advisor, runner, store, gateway, mode }`: the four `@byway/contracts` interfaces and nothing else. Screens and route handlers reach data only through it. Server-only |
| `src/server/` | Route-handler logic as plain functions (`api.ts`), the loopback/CSRF guard used by `proxy.ts`, artifact headers, request schemas, storing your examples (`refs.ts`) |
| `src/view/` | Pure view models: the step index and timeline, the cost meter, checkpoint panels, labels, formatting, the claims rule. Unit-tested in `test/` |
| `src/components/` | Client and shared components; `run/panels/` holds one "Your turn" panel per checkpoint kind |
| `app/styles/` | Tokens (light and dark), base, components, screens, run |
| `test/` | Unit tests (vitest), the guard tests (`guard-claims`, `guard-boundaries`, `guard-disabled`, `guard-sandbox`) and fixtures: the real services on a temp folder with a fake Runner |
| `e2e/` | The Playwright suite: C1, C3, C4, C5 and C6a from a typed problem to the Result screen in demo mode, the keyboard and focus checks (`keyboard.spec.ts`), and Settings' switch for the page renderer's OS sandbox (`renderer-sandbox.spec.ts`) |

## How the app gets its services

`src/services/index.ts` builds one set per server process (kept on `globalThis`, so hot reload does not open a second
database handle):

- **Store**: `@byway/store` in the data directory (`BYWAY_DATA_DIR`, else `%LOCALAPPDATA%\byway` or `~/.byway`).
- **Gateway**: `@byway/gateway` with its hash-chained ledger in the data directory, the store's artifacts, the
  workspace and run budgets from the store as spend caps, and keys from the environment (`.env.agents` at the repo
  root fills in what the shell has not set). The mock answers every call when `BYWAY_DEMO=1` (`pnpm demo`) or when
  demo mode is on in Settings; the app keeps one gateway per setting, so switching demo mode applies at once.
- **Prompts and advisor**: `@byway/prompts` and `@byway/advisor` over `@byway/catalog`.
- **Runner**: a Temporal client of the engine that `pnpm dev` / `pnpm demo` started (`BYWAY_TEMPORAL_ADDRESS`),
  through `@byway/runner/client` only, so the worker, esbuild and Playwright never load in the web process. It
  connects on first use; reading a run needs only the store.

`mode` is `demo` when the mock is forced, when demo mode is on, or when no real profile has keys. In demo mode runs and
estimates use the `demo` profile, so the worker answers them with the mock too.

**Bundling.** The engine packages are not bundled: `src/services/engine.ts` imports them at run time with
`turbopackIgnore`, and Node loads them (it strips their TypeScript itself; workspace packages resolve to their real
paths outside `node_modules`). Turbopack would otherwise compile them as app source, which breaks the prompt
templates (read from the package folder), `node:sqlite` and the Temporal client. Provider SDKs and
`@temporalio/client` are listed in `serverExternalPackages` as a second line.

## How the app uses the contracts

- **Intakes and preferences** live in the `Store` (`createIntake`/`updateIntake`/`getIntake`,
  `getPreferences`/`setPreferences`). An intake keeps the problem, your flipped chooser answers, the last
  recommendation and any composed recipe; a run records its `intakeId`, so a composed run keeps its presentation
  and label after a restart. The Recommendation page's render only reads the stored recommendation; with none stored,
  the screen asks for the first one once it is shown (`POST /api/intakes/<id>/recommend` with `{ ensure: true }`, the
  command Try again sends), and concurrent first asks share one advisor call (ADR-0091). A recipe chosen from the Library travels in the address (`/recommend/<id>?recipe=c4`).
- **Recipes** come from `Advisor.recipe(id)`, or from the intake's composed recipe.
- **Pause and resume** are `Runner.pause`/`Runner.resume`; the run's status is `paused` while paused.
- **Examples you admire** (ADR-0071): for a recipe whose inputs include `refs`, the Recommendation screen takes
  pasted text or PNG, JPEG and WebP images (`POST /api/refs` stores each as an artifact, checking an image's bytes
  against its type) and passes their ids as `StartRunInput.inputs.refs`.
- **Generated media**: pages and Markdown reference generated images at `/api/artifacts/<id>` (spec §3.3), which
  serves images, clips and audio only (SVG as a download), with the same headers as `/artifacts/<id>`; a generated
  page's CSP allows both.
- **Video** (ADR-0069): Settings shows `ProfileStatus.video` for the chosen profile; a storyboard shows each
  shot's frame and clip, a real clip (`video/*`) in a video element and the demo's placeholder (`image/svg+xml`)
  as an image. Steps finished as skipped say "Skipped" and their note on the Run and Result screens.

Logic on top of the contracts sits in view code:

- `src/view/steps.ts` maps run events to plain labels through the presentation's `stepIds`; with the recipe, an
  operator's events (a loop's rounds, an optional's question) go to the shown step of its first step.
- `src/view/timeline.ts` folds events into one row per shown step, with rounds when a step comes back.
- `src/view/meter.ts` reads spend and budget from `cost` events, falling back to the run record.
- `src/view/run.ts` treats a question as yours only while its run has not ended.

## Guardrails

- The server binds 127.0.0.1; `proxy.ts` refuses other Host headers (DNS rebinding) and cross-site writes on every
  request under `next start`. Under `next dev` (`pnpm dev`), `src/server/dev-server.ts` applies the same guard to every
  request and WebSocket upgrade before Next sees it, including Next.js's own dev endpoints (which, and `/_next/*`, no
  other site may call, even with a loopback Host; the path is decoded and its `..` resolved before it is matched).
  Next runs in that server's process, so there is no other port to reach it on.
- No provider key is written under the repo: `next build` gets none (`withoutSecrets` in `@byway/gateway`), and
  Turbopack's persistent caches, which would snapshot the environment, are off (`next.config.ts`).
- Generated pages are shown in sandboxed iframes (never `allow-same-origin`) and served by the artifact route with a
  CSP that sandboxes them again, blocks requests and allows only the renderer's CDNs. A CSP cannot stop a page with
  scripts from navigating itself, and so sending what it contains to another site, so a page inside byway runs its
  scripts only after you turn them on for that page ("Run the page's scripts"), and only while the screen shows it:
  the choice is never stored, and a reload or another page starts with scripts off. Thumbnails never run scripts.
  `/api/artifacts/<id>` serves media only, so a
  page cannot move itself to an address without its sandbox. Markdown shows images only from byway's artifact routes.
  Other media are served inert; an uploaded example image must really be PNG, JPEG or WebP.
- The consent is in the response too (ADR-0085): `/artifacts/<id>` serves a page inert (a bare `sandbox`: no scripts,
  no meta refresh), and adds `allow-scripts` only for `?scripts=1` asked by a same-origin frame (Fetch Metadata),
  never cached. So a page served after this change and opened top-level, by any link, typed address or history, runs
  nothing; a copy a browser cached before it may still carry `allow-scripts` (ADR-0085 lists this residual and how to
  clear it). Every "Open" in the app goes to the whole-artifact viewer `/view/<id>` (`openHref`), which shows a page
  with the same switch, text whole, and images and clips as themselves. Otherwise the raw address is an element's
  `src`, a download, what the whole-text loader fetches (ADR-0086), and where the viewer sends a type it cannot show.
  A Markdown link to one of byway's own artifacts (`/artifacts/<id>` or `/api/artifacts/<id>`, with or without a
  `?query` or `#fragment`) opens the viewer; other links are left as written. The app's CSP has
  `frame-src 'self'`, so a framed page cannot be carried to another site by a link or its own script.
- The Run screen's polled data carries at most 16 KB of each text, marked as an excerpt (`complete`, `bytes`;
  ADR-0086). Step rows and cards show it as a snippet, with counts (a diff's size, an option map's titles) taken from
  the whole artifact on the server; views you decide in (compare, references, a step's detail) load the whole text and
  say so while they show only the opening. A page there is a picture of its first screen that cannot be scrolled: it is
  named as that for assistive technology (its frame stays hidden from it and out of the Tab order), says on screen that
  only the first screen shows, and every such view has a way to the whole page (each version in a compare has its own
  Open to the viewer).
- **A control that acts never disables itself** (R5). A focused control given the native `disabled` state drops
  keyboard focus to the page, and on Start and the paid Start button `disabled` was also the only guard against a
  second press. So an action runs through `useAction` (`src/components/useAction.ts`), whose synchronous in-flight
  guard refuses a second start before React re-renders, and its control is an `ActionButton`: busy or unavailable, it
  says so with `aria-disabled` (and `aria-busy`), keeps focus and its Tab stop, and a press does nothing (a submit is
  prevented, so Enter in a field cannot submit either). An action that leaves the screen on success holds the guard
  until the next screen replaces it. On Start (`POST /api/intakes`, which keeps the problem and starts no run) this
  guard is the only one against sending it twice. The paid Start (`POST /api/runs`) also names its run with an id
  (`src/components/startIdentity.ts`, ADR-0099 decision 7): the screen sends the same id again only while that Start
  got no answer and its inputs are unchanged, and the server answers a repeated id with the run it already started
  for that intake and recipe, so one Start starts one run. A Start after a reload, or after leaving the screen and
  coming back, has a new id.
  `test/guard-disabled.test.ts` scans the `.ts` and `.tsx` files in `src/` and `app/`, comments left out, for a
  `disabled` attribute on an intrinsic JSX element (a lower-case tag such as `<button>` or `<fieldset>`, bare or with a
  value) and for a write through the DOM (`.disabled =`, or `setAttribute` or `toggleAttribute` with `'disabled'`). It
  fails on any use not reviewed there with a reason (today: the examples' fieldset while a run starts, "Paste an
  example" once nine examples are listed, and the Switch's configured-unavailable state). It does not see attributes
  spread in (`{...props}`), `createElement` calls, a component's own `disabled` prop (what the component renders is
  scanned where that is written), or a focused control that takes itself off the screen: Start's attach button goes
  at five attachments, so adding one moves focus to the new attachment's name first; in its place a plain note says
  "byway takes up to five attachments for one problem." Closing a step opened from the
  timeline returns focus to its row. `e2e/keyboard.spec.ts` drives these with the keyboard in a real browser; it
  reads the focused element and the browser's accessibility tree, never an audit library, and never audits a
  generated page as a product check (CR12).
- Evidence labels are computed by the advisor; `test/guard-claims.test.ts` fails if any app string, recipe
  presentation, prompt template or README claims efficacy.
- Provider keys are never read into the browser, shown or sent: the services module is server-only, Settings shows
  only whether each key is configured, and the end-to-end suite fails if a stand-in key appears in any request or
  response.
- The page renderer's OS sandbox (ADR-0105) is switched only in Settings (`PATCH /api/renderer`, which takes
  `{ osSandbox }` and nothing else), which asks before it turns the sandbox off and says what that risks; both answers
  are described by the risk, so a screen reader reads it with the one that has focus. While it is off, every screen
  carries a banner (`src/components/SandboxBanner.tsx` in the root layout, its words from `src/view/renderer.ts`). It
  starts from the server's state and, as Nav does for the waiting count, reads the renderer's state again
  (`GET /api/renderer`, which only reads) on every navigation and every 5 s while the tab is visible, and at once when
  that tab's switch changed it, so a tab opened before the change shows it, and loses it, without a reload. Beside it
  a polite status (`role="status"`) says, after the tab's first render, when the banner appears, changes or goes,
  except after the tab's own switch, whose Settings status already says it. A step whose
  pages were drawn without the sandbox has a note in the Run screen's timeline (under its failure, if it failed) and in
  the Result's "How this was made".
  `test/guard-sandbox.test.ts` reads the product sources (a leading `/* ... */` taken off a line, a line that is then
  a comment left out, and a line that ends in `import` read with the next), and pins as exact
  lists every line that mentions a way to switch the setting (`setRendererSandbox`, Settings' route, the setting's
  table and column), to set Chromium's sandbox option (`chromiumSandbox`), to build a renderer (`playwrightPages`,
  `renderBrowsers`, `checkRenderer`, `storeOsSandbox`) or to launch Chromium (`launchChromium`,
  `chromiumLaunchOptions`, the test-only `launch` seam, Playwright's launch calls, and any line that names Playwright's
  packages, Puppeteer or `chromium-bidi` in quotes, as an import does), whatever their arguments look like. It also
  pins every module loaded by a name its line does not write out (an `import()` or a `require` whose argument is not
  one written-out string: none) and every `createRequire`, since the require it makes loads any name. It checks
  itself against each way round it that reviews have found, each of which must change one of its lists. It does
  not see a use that names none of these (a namespace import called by a computed name, a require made by
  `createRequire` passed to another file and called there with a computed name, SQL that builds the table's or the
  column's name from pieces, say), a browser
  driver it does not list, a browser started as a program of its own, a file outside those it reads, or a change inside
  the lines it pins, such as a retry without the sandbox in `pages.ts`; the renderer's own tests (`launch.test.ts`,
  `pages.test.ts`, `renderer-check.test.ts`) check that last one, and no test checks the others.
