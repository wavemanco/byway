# ADR-0084: The page renderer launches with no secrets and one stated containment policy; the OS sandbox awaits the owner's decision

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 16:30 |
| **Track** | Product |

Extends [ADR-0074](0074-local-app-security-model.md) by addition only (its text is not edited). Applies [ADR-0030](0030-own-model-gateway-sole-egress.md)'s "keys never enter a sandbox" to the product's page renderer, which the product had not done before.

## Context

The external review's finding F18, accepted by both verifiers at P2: the renderer's Chromium was started by `launchChromium` in `packages/runner/src/pages.ts`, which stated no containment policy, so two defaults built for other contexts applied.

- **No OS sandbox.** Playwright adds `--no-sandbox` to every Chromium process unless `chromiumSandbox` is true. On Windows the renderer running page scripts was measured at Medium integrity (the user's own); with the sandbox on it runs at Untrusted.
- **The engine's whole environment, keys included.** `scripts/serve.ts` loads `.env.agents` into `process.env`, the worker runs in that process, and Playwright hands Chromium `process.env` when no `env` is given.

The renderer is shared by every medium, not only web pages. It draws C1 views of model-written HTML and JavaScript, web-page references given as HTML, and, since BLIND-1 ([ADR-0080](0080-phase-4-recheck-corrections.md)), the cards a GREAT critic sees whenever a lineup mixes forms, including C5's gate. Cards decode reference images people upload (checked only by their magic bytes) and images providers return. So its untrusted inputs are model-written pages and scripts, HTML references, user-uploaded images and provider images; the image path needs no model cooperation.

The product described the renderer's containment only as in-browser controls (spec §3.2; ADR-0074 "Generated content": the request allowlist, the WebSocket and WebRTC blocks, deadlines, dialogs). The OS-level isolation the research track planned ([ADR-0031](0031-hardened-docker-sandboxes-pinned-renderer.md)) was dropped for the product ([ADR-0067](0067-product-c1-direct-html-builder.md)) and never replaced. No test checked the effective launch flags or environment, and because the browser starts lazily, a renderer that could not start was found only when a run reached it, after paid steps.

Whether to switch Chromium's OS sandbox on is one of the four decisions the verification left to the owner ([verification](../reviews/2026-10-08-external-review-verification.md) §4 item 2): hosts that cannot start it would stop rendering, and an owner opt-out may or may not be wanted. This record implements everything in the recommended option that does not depend on that decision.

## Decision

- **One stated launch.** `chromiumLaunchOptions()` is the only description of how the renderer's Chromium starts: headless, the two WebRTC flags and nothing else, the sandbox setting below, and the environment below. `launchChromium()` is the only production launch and takes no parameter, so no caller can add a flag. `PlaywrightPagesOptions.launch` is documented as a test-only seam; the worker passes none. Tests that need an extra flag compose it from `chromiumLaunchOptions()` in test code.
- **No secrets in the renderer's environment.** Chromium gets `withoutSecrets(process.env, namesFromEnvFile(process.env))`: no provider key name, nothing secret-looking, and no name `.env.agents` listed (set or kept). `withoutSecrets` moves from `apps/web/src/server/serving.ts` to `@byway/gateway`'s env module as the one SEC-3 rule for every child that must hold no key; `next build` uses the same function. `loadEnvFile` records, per environment object, the names the file listed.
- **The OS sandbox setting is stated, and unchanged.** `RENDERER_OS_SANDBOX` in `pages.ts` is the one named constant. It keeps today's value, off (Playwright's default), with a doc comment saying it awaits the owner's decision. Nothing falls back and nothing fails closed on a sandbox failure, because the sandbox is not requested. A test pins the value, so changing it shows up as a reviewed change.
- **A Chromium that cannot start fails plainly, once.** `launchFailure()` turns any failure of the production launch into one non-retryable `StepError` that names Playwright's first line and the install command (`pnpm --filter ./apps/web exec playwright install chromium`). The same message comes out of a C1 view, an HTML reference, a lineup card and the readiness check. A browser that crashed or failed to launch is still launched again on the next render (ENG-14), always with the same options.
- **Readiness before spend.** `PageRenderer.ready()` starts the shared browser, or finds it running; later renders reuse it. `beginRun` calls it for a web-page run before the run's first step, so a web-page run whose renderer cannot start fails with the plain message before any AI call. `checkRenderer()` never throws; `scripts/serve.ts` runs it while the engine starts (bounded at 30 s) and prints a `renderer` line, and `pnpm e2e` fails unless that line says the renderer is ready.

## What this does not decide

- **Switching the OS sandbox on, and what happens on hosts that cannot start it** (Linux with unprivileged user namespaces restricted, the default on Ubuntu 23.10 and later; running as root or in a container). If it is switched on, Playwright reports such a host as "Chromium sandboxing failed!" (or, with its pipe transport, "Target page, context or browser has been closed", with that text in the browser log). Today's mapping would show that first line plainly and not retry; a sandbox-specific message and a README section on allowing the sandbox for Playwright's Chromium alone belong with the decision.
- **Whether an owner opt-out should exist.** None is added. If one is, the verification recommends it be explicit and printed in the `renderer` line, never automatic.

## Alternatives considered

- **Sandbox on, fail closed, with a sandbox-specific message (the verified recommendation in full).** Verified on Windows 11 with Playwright 1.63.0: no `--no-sandbox` on the command line, the renderer at Untrusted and the GPU process at Low integrity, pixel-identical tiles, a launch plus close in about 100 ms, and the existing cancellation, runaway bound, relaunch, artifact route and dialog behaviour unchanged. Deferred: it is the owner's decision.
- **A separate renderer process or a low-privilege OS account.** A same-user helper adds little over Chromium's own broker and renderer split, and a separate identity needs admin rights and account management, which is disproportionate for a local, single-user app. Revisit if byway is ever hosted or multi-user.
- **A hardened container renderer (ADR-0031 style).** Contradicts ADR-0067's Docker-free product.
- **Flip one flag only.** Leaves the keys in Chromium's environment and the launch open to extra flags.
- **A deny-list of weakening flags.** The production launch takes no parameter at all, which is smaller and complete.
- **An allowlist-only environment for Chromium.** Fonts, locale and fontconfig on Linux and macOS depend on variables not tested here; a wrong guess would quietly change what critics see.
- **Dropping the secrets file's names from `next build`'s environment too.** The file may also carry settings the web app reads at build and at start alike (for example `BYWAY_NEXT_DIST_DIR`, which `next.config.ts` reads), and build and start would then disagree. The build keeps provider keys and secret-looking names out, as before; only the renderer, which needs nothing from the file, leaves all of it out.
- **Checking readiness by warming the worker's own browser at start-up.** It would keep a Chromium running all session for users who never render; the start-up check launches once and closes again instead.

## Consequences

**Positive**

- Chromium no longer holds the provider keys or anything else from `.env.agents`, for every renderer use: C1 views, HTML references and lineup cards, including C5's gate.
- The launch is stated once and checked: tests read the effective command line of a real Chromium through CDP against a control launched with the other sandbox setting, and check the exact options and environment Playwright is given.
- A renderer that cannot start is announced at start-up, refuses web-page runs before they spend, and fails every other use plainly instead of being retried.

**Negative and residual**

- **The OS sandbox stays off** until the owner decides, so a Chromium or image-decoder exploit in a rendered page or card would still run with the user's own rights. Removing the keys from Chromium's environment narrows what such an exploit finds there, but `.env.agents` and the data directory remain readable at user level.
- **The Playwright driver still runs in the engine process**, which holds the keys; containment of Chromium itself relies on whatever the sandbox decision brings. On Windows, even with the sandbox on, the broker and the network-service utility stay at Medium integrity.
- **Runs of other media reach the renderer only at a lineup of cards, after paid steps.** Their references are workflow input, so `beginRun` cannot see them. A cheap activity-side option exists and is not taken here: `modelStep` could call `ready()` before its first provider call when the run has at least three references and one of them is an image (every step already receives the run's references). Logged for the backlog.
- **The environment scrub is a deny-list** for variables exported in the shell under names that do not look secret.
- **A failure to start is no longer retried.** A transient launch failure (a machine out of memory, say) now fails the step at once instead of after Temporal's retries.
- **Effective flags are checked at test time.** Production relies on construction: the command line is readable only with `--enable-automation`, which would also set `navigator.webdriver` for every page.

**Why the artifact route is not narrowed.** The review suggested a narrower interface for artifacts. The route answers only exact recorded `sha256` content ids, which the store validates, and every other request is blocked by the allowlist, so it is already as narrow as the renderer needs.

## Evidence

- The external review: `C:\Users\arvik\code\byway_review\byway-review.md`, finding F18.
- [Verification of the external review](../reviews/2026-10-08-external-review-verification.md): §1 (F18, accepted at P2), §2 and the cluster H appendix (options, recommendation and the final check's residuals), §4 item 2 (the owner's decision).
- The verifiers' probes: production `launchChromium()` showed `--no-sandbox` on every Chromium process and the renderer at Medium integrity; with `chromiumSandbox: true` the renderer was at Untrusted and the GPU process at Low; Playwright 1.63.0 hands Chromium `process.env` when no `env` is given (`coreBundle.js:39798`) and adds `--no-sandbox` unless the sandbox is requested (`coreBundle.js:43346`).
- This change's tests: `packages/runner/test/launch.test.ts`, `packages/runner/test/pages.test.ts` (effective command line and readiness), `packages/runner/test/begin-run.test.ts`, the workflow scenario in `packages/runner/test/e2e/controls.ts`, and `packages/gateway/test/env.test.ts`. The workflow bundle's inputs include none of the files changed, so its hash is unchanged and no open run is retired (C7).
