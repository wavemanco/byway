# ADR-0074: Local app security model: a production server for use, a guarded dev server, and no unguarded local control planes

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)), after the Phase 4 security review; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-07 23:00 |
| **Track** | Product |

## Context

byway runs on the user's machine, holds their provider keys and can spend money. Binding to 127.0.0.1 keeps other machines out, but any website the user visits can still send requests to localhost through their browser, and DNS rebinding can make such requests look same-origin. The Phase 4 review confirmed several ways in:

- Next.js's dev-only endpoints skip the app's Host guard and can open the user's editor on any existing file (SEC-6).
- The Temporal dev server's HTTP API accepts cross-site POSTs that terminate or start runs (SEC-2).
- Generated HTML served at `/api/artifacts/<id>` ran in the app's origin, outside the sandbox (SEC-1).
- Turbopack's dev cache wrote provider keys in plaintext inside the repo (SEC-3).

## Decision

- **How byway is served.** `pnpm start` builds the app and serves it with `next start` on 127.0.0.1; this is the normal way to use byway. `pnpm demo` does the same with the mock forced. `pnpm dev` is for contributors only: `next dev` runs on an internal loopback port behind a small reverse proxy. The proxy checks every request, including Next's internal routes and the hot-reload WebSocket, against a Host allowlist, and checks Origin and Sec-Fetch headers on every request that changes state.
- **Request guard.** The app's own guard, the same checks, applies to every route.
- **Temporal.** The dev server's HTTP API is switched off; byway talks to Temporal only over gRPC. The engine refuses to attach to a Temporal it did not start.
- **Generated content.**
  - Generated pages render only in a sandboxed frame, with no `allow-same-origin`, under their own strict CSP.
  - The media route refuses active types (HTML, SVG).
  - Generated pages cannot navigate themselves away, and rendered Markdown loads no images from outside hosts.
  - The page renderer blocks WebSockets and every host off its allowlist, and bounds runaway pages.
- **Keys.** Keys are never written under the repo: Turbopack's dev filesystem cache is off. They never reach responses, logs, the ledger, artifacts or the browser.

## Alternatives considered

- **Keep `next dev` as the user-facing server, with only the app's Host guard** — rejected; Next's internal routes are handled before the guard runs.
- **A token in the URL for every request** — stronger against cross-site requests, but heavier than a local tool needs once Host and Origin are checked. It can be revisited.

## Consequences

**Positive**

- A web page the user visits cannot drive byway, read its runs, or spend.

**Negative**

- `pnpm start` and `pnpm demo` build first, which adds time on the first start after a change.

## Evidence

- Phase 4 security review findings SEC-1 to SEC-7, independently verified (2026-10-07).
- [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md) §2, §5

## Later notes

Notes appended under [ADR-0103](0103-adr-log-rule-and-ci.md) rule 1; the Context and Decision above are unchanged.

- **2026-11-16, a per-start secret, at the owner's choice (backlog row B-188).** The owner asked for a map of the code with Floorplan ("also use /archify and /floorplan:floorplan to visualize the codebase please."), then "once you are done with the current visualization work, study the health warnings/recommendations floorplan brought up and make a plan to resolve those issues". Floorplan's health check reported "None of your endpoints check who is calling": it looks for a sign-in check in each route and does not see this record's guard. Claude's reading of what the guard leaves: a web page and another machine cannot drive byway, but another program on the same computer, under any Windows account, can call 127.0.0.1 with the headers it chooses and start runs that spend; a program under the person's own account could also read `.env.agents`, so a secret adds most against another account. Claude asked "Health item 1 (no endpoint checks the caller): byway's guard already stops web pages and other machines; what's open is another program on this computer calling 127.0.0.1 directly. What should happen?", with the options "Record it, row for later (Recommended)" ("No code now. A Later note on ADR-0074 records the residual risk and this finding; a row files a per-start secret (a one-time link at start, a strict cookie, every request checked), due before byway runs on a computer others log into or before anyone besides you uses it."), "Add the per-start secret now" ("Build it now on its own branch: the link byway prints at start sets the cookie, every request and the dev server's proxy check it, tests and browser tests updated, one adversarial check (it is the security boundary). Closes the other-account path today.") and "Record it only" ("A Later note on ADR-0074 says the residual is accepted for a single-user local app; no row."). The owner chose "Add the per-start secret now".
  - **Chosen, and why.** The option's words. The owner gave no reason; Claude's reading: it closes the path from another account on the computer before byway spends real money, rather than at a later milestone.
  - **Rejected, and why.** Claude's reading: "Record it, row for later (Recommended)" would leave that path open until byway runs on a shared computer or for others, a trigger no one may notice firing; "Record it only" would accept it for good.
  - **What it changes.** This record's alternative "A token in the URL for every request" was rejected as "heavier than a local tool needs once Host and Origin are checked" and left open to revisiting. A per-start secret changes what this record decides, so it lands with a new ADR, linked from this record's index row (ADR-0103's Later note of 2026-10-28), on its own branch with one adversarial check.
  - **If it breaks.** Until B-188 lands, the guard here is the whole defence, and Floorplan's warning stands.
