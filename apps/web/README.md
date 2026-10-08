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
| `src/services/` | **The seam.** `getServices()` returns `{ advisor, runner, store, gateway }` typed by `@byway/contracts`, plus the extras listed below. Screens and route handlers reach data only through it |
| `src/services/demo/` | In-memory fakes of the four contracts: a keyword advisor over a built-in copy of the eight recipe presentations, a timer-driven runner whose scripts open every checkpoint kind, a store, and a mock gateway |
| `src/server/` | Route-handler logic as plain functions (`api.ts`, tested against the demo services), the loopback/CSRF guard used by `proxy.ts`, artifact headers, request schemas, intakes |
| `src/view/` | Pure view models: timeline, checkpoint panels, labels, formatting, the claims rule. Unit-tested in `test/` |
| `src/components/` | Client and shared components; `run/panels/` holds one "Your turn" panel per checkpoint kind |
| `app/styles/` | Tokens (light and dark), base, components, screens, run |

## Phase 3: swapping in the real packages

Replace `createDemoServices()` in `src/services/index.ts` with the real advisor, runner, store and gateway.
Nothing else should need to change, except where the contracts are still missing something the app needs
(each is marked in `src/services/types.ts` and `src/view/events.ts`):

- `RunControls` (pause and resume): the `Runner` contract has no pause, and `RunStatus` has no `paused`.
- `RecipeSource`: the runner needs a `Recipe` to start, but the `Advisor` only returns presentations.
- `PreferenceStore`: the `Store` has no place for the chosen model profile or the demo-mode switch.
- `RunEvent.data` is untyped; `src/view/events.ts` reads the payloads the timeline expects (label, stage,
  block, who, costUsd, artifactId, mediaType, budgetUsd…) tolerantly.
- `RunRecord` has no budget; the Run screen reads it from `run-started` / `cost` events.

## Guardrails

- The server binds 127.0.0.1; `proxy.ts` refuses other Host headers (DNS rebinding) and cross-site writes.
- Generated pages are shown in iframes with `sandbox="allow-scripts"` (no `allow-same-origin`) and served by
  the artifact route with a CSP that sandboxes them again, blocks all network writes and allows only the
  renderer's CDNs.
- Evidence labels are computed by the advisor; `test/claims.test.ts` fails if any app string claims efficacy.
- Provider keys are never read, shown or sent by this app; Settings shows only whether each is configured.
