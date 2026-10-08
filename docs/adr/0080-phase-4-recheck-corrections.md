# ADR-0080: Corrections after the independent re-check of the Phase 4 fixes

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)); not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 02:00 |
| **Track** | Product |

## Context

An independent re-check re-ran the Phase 4 reviewers' proofs of concept against the merged fixes. Most items were closed. Six were only partly closed, and two statements in [ADR-0074](0074-local-app-security-model.md) turned out to be inaccurate. Accepted ADRs are not edited, so this record corrects and extends them.

## Decision

- **Page scripts are a per-page choice (corrects ADR-0074).** Generated pages run no scripts by default. A person may turn scripts on for the page they are looking at; the choice lasts only while that screen shows that page and is never stored. The switch says plainly that a page running its scripts can send what it contains to other sites. ADR-0074's "generated pages cannot navigate themselves away" holds only while scripts are off.
- **The media route serves SVG as a sandboxed download (corrects ADR-0074).** It refuses HTML. SVG is served as an attachment under an inert CSP rather than refused.
- **Contributor mode has a single listener (replaces ADR-0074's reverse proxy).** `pnpm dev` creates the Next.js app inside byway's own process and serves it from one Node HTTP server on 127.0.0.1. The guard runs before Next's request handler on every request, and before Next's hot-reload handler on every WebSocket upgrade. Paths are checked as sent and again after decoding and resolving `..`. No unguarded Next.js port exists. This depends on Next 16 attaching its hot-reload handler to the server it is given; a test fails if that changes.
- **Lineups are drawn as uniform cards (BLIND-1, extends ADR-0072).** When a GREAT lineup mixes forms (storyboards, image references, pages, text), every item, ours and each reference, is drawn on one card by the same template and rendered to one PNG. Each item then reaches the critic as one image under its label, so ours cannot be singled out by shape.
- **Paid answers are kept, never re-bought (ENG-3, extends ADR-0079).** Once a provider has answered, saving the answer (memo or artifact) is retried locally within a bound. If it still fails, the step stops for good with a plain message saying the call was paid for and is in the ledger; a Temporal retry would pay again.
- **Dialogs cannot crash the engine (SEC-5).** The page renderer dismisses every dialog and contains errors from closing pages.

## Alternatives considered

None were weighed in depth. Each correction follows the re-check's evidence.

## Consequences

**Positive**

- The security record matches the code, and the remaining DNS-rebinding route in contributor mode is closed.

**Negative**

- Mixed lineups need the page renderer to draw cards. The worker always has one.
- Contributor mode relies on Next.js internals.

## Evidence

- Independent re-check of the Phase 4 fixes and the final fix reports (2026-10-08).
