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
