# @byway/web

The byway product app (product spec §5): describe a problem, get a recipe, run it with the AI doing the AI
steps and you doing yours, and take the deliverable away. Next.js 16 App Router, React 19, TypeScript.

Start it from the repo root, which also starts the run engine the app needs:

```sh
pnpm start       # build and serve, with real models for the keys in .env.agents at the repo root (never committed)
pnpm demo        # the same with sample outputs: no AI calls, nothing charged
pnpm dev         # contributor mode: next dev behind byway's guard, with hot reload
pnpm e2e         # the Playwright suite against a fresh pnpm demo
```

Inside this folder: `pnpm build` (production build; type checking is `pnpm typecheck`'s job), `pnpm typecheck`. Do not
run `next dev` on its own: it answers its internal endpoints (opening files in your editor, attaching a debugger)
before `proxy.ts` runs, so only `pnpm dev`, which puts a guard in front (`src/server/dev-proxy.ts`), is safe.

## Layout

| Path | What lives there |
|---|---|
| `app/` | Screens (Start, Recommendation, Run, Result, Library, History, Settings), route handlers under `app/api`, and the artifact routes `app/artifacts/[id]` and `app/api/artifacts/[id]` |
| `src/services/` | **The seam.** `getContext()` / `getServices()` return `{ advisor, runner, store, gateway, mode }`: the four `@byway/contracts` interfaces and nothing else. Screens and route handlers reach data only through it. Server-only |
| `src/server/` | Route-handler logic as plain functions (`api.ts`), the loopback/CSRF guard used by `proxy.ts`, artifact headers, request schemas, storing your examples (`refs.ts`) |
| `src/view/` | Pure view models: the step index and timeline, the cost meter, checkpoint panels, labels, formatting, the claims rule. Unit-tested in `test/` |
| `src/components/` | Client and shared components; `run/panels/` holds one "Your turn" panel per checkpoint kind |
| `app/styles/` | Tokens (light and dark), base, components, screens, run |
| `test/` | Unit tests (vitest), the guard tests (`guard-claims`, `guard-boundaries`) and fixtures: the real services on a temp folder with a fake Runner |
| `e2e/` | The Playwright suite: C1, C3, C4, C5 and C6a from a typed problem to the Result screen in demo mode |

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
  and label after a restart. A recipe chosen from the Library travels in the address (`/recommend/<id>?recipe=c4`).
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
  request under `next start`. Under `next dev` (`pnpm dev`), `src/server/dev-proxy.ts` applies the same guard to every
  request and WebSocket upgrade first, including Next.js's own dev endpoints.
- No provider key is written under the repo: `next build` gets none (`src/server/serving.ts`), and Turbopack's dev
  cache, which would snapshot the environment, is off (`next.config.ts`).
- Generated pages are shown in sandboxed iframes (never `allow-same-origin`) and served by the artifact route with a
  CSP that sandboxes them again, blocks requests and allows only the renderer's CDNs. A CSP cannot stop a page with
  scripts from navigating itself, so pages inside byway run their scripts only after you turn them on ("Run the
  page's scripts", remembered in this browser); thumbnails never do. `/api/artifacts/<id>` serves media only, so a
  page cannot move itself to an address without its sandbox. Markdown shows images only from byway's artifact routes.
  Other media are served inert; an uploaded example image must really be PNG, JPEG or WebP.
- Evidence labels are computed by the advisor; `test/guard-claims.test.ts` fails if any app string, recipe
  presentation, prompt template or README claims efficacy.
- Provider keys are never read into the browser, shown or sent: the services module is server-only, Settings shows
  only whether each key is configured, and the end-to-end suite fails if a stand-in key appears in any request or
  response.
