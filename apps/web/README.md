# @byway/web

The byway product app (product spec §5): describe a problem, get a recipe, run it with the AI doing the AI
steps and you doing yours, and take the deliverable away. Next.js 16 App Router, React 19, TypeScript.

```sh
pnpm --filter ./apps/web dev      # http://127.0.0.1:3000 (loopback only)
pnpm --filter ./apps/web build
pnpm --filter ./apps/web start
pnpm --filter ./apps/web typecheck
```

`BYWAY_DEMO_STEP_MS` sets the length of one demo step (default 900 ms).

## Layout

| Path | What lives there |
|---|---|
| `app/` | Screens (Start, Recommendation, Run, Result, Library, History, Settings), route handlers under `app/api`, and the artifact route `app/artifacts/[id]` |
| `src/services/` | **The seam.** `getServices()` returns `{ advisor, runner, store, gateway, mode }`: the four `@byway/contracts` interfaces and nothing else. Screens and route handlers reach data only through it |
| `src/services/demo/` | In-memory fakes of the four contracts (v3): a keyword advisor over a built-in copy of the eight presentations (with `stepIds`), a timer-driven runner whose scripts open every checkpoint kind, a store with intakes and preferences, and a mock gateway whose video call returns a labelled placeholder clip |
| `src/server/` | Route-handler logic as plain functions (`api.ts`, tested against the demo services), the loopback/CSRF guard used by `proxy.ts`, artifact headers, request schemas, storing your examples (`refs.ts`) |
| `src/view/` | Pure view models: the step index and timeline, the cost meter, checkpoint panels, labels, formatting, the claims rule. Unit-tested in `test/` |
| `src/components/` | Client and shared components; `run/panels/` holds one "Your turn" panel per checkpoint kind |
| `app/styles/` | Tokens (light and dark), base, components, screens, run |

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
- **Video** (ADR-0069): Settings shows `ProfileStatus.video` for the chosen profile; a storyboard shows each
  shot's frame and clip, a real clip (`video/*`) in a video element and the demo's placeholder (`image/svg+xml`)
  as an image. Steps finished as skipped say "Skipped" and their note on the Run and Result screens.

Logic that the demo and the real services both need sits in view code, not in a service:

- `src/view/steps.ts` maps run events to plain labels through the presentation's `stepIds`; with the recipe, an
  operator's events (a loop's rounds, an optional's question) go to the shown step of its first step.
- `src/view/timeline.ts` folds events into one row per shown step, with rounds when a step comes back.
- `src/view/meter.ts` reads spend and budget from `cost` events, falling back to the run record.
- `src/view/run.ts` treats a question as yours only while its run has not ended (the store keeps a cancelled
  run's last question open, since it accepts only real answers).

## Phase 3: swapping in the real packages

Replace `createDemoServices()` in `src/services/index.ts` with `@byway/advisor`, `@byway/runner`, `@byway/store`
and `@byway/gateway`, and set `mode` from the gateway (demo when no keys, or when demo mode is on). Nothing else
should need to change.

## Guardrails

- The server binds 127.0.0.1; `proxy.ts` refuses other Host headers (DNS rebinding) and cross-site writes.
- Generated pages are shown in iframes with `sandbox="allow-scripts"` (no `allow-same-origin`) and served by
  the artifact route with a CSP that sandboxes them again, blocks all network writes and allows only the
  renderer's CDNs. Other media are served inert; an uploaded example image must really be PNG, JPEG or WebP.
- Evidence labels are computed by the advisor; `test/claims.test.ts` fails if any app string claims efficacy.
- Provider keys are never read, shown or sent by this app; Settings shows only whether each is configured.
