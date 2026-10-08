# ADR-0079: Runner decisions made while fixing the Phase 4 review

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: chosen by Claude's fix work packages under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)), and reviewed by Claude at merge; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 00:30 |
| **Track** | Product |

## Context

Fixing the verified Phase 4 findings forced several decisions that the spec and ADRs 0069–0078 did not cover. They are recorded here so they can be reviewed.

## Decision

- **Web-page views have three surfaces (RENDER-1, ENG-9).** A judged web page is rendered as the wide screen (1440, tiled to at most 2576 px), the phone (390, tiled) and the first screen (1440×900). Each screenshot is captioned, and a render step's `renders` knob can narrow the set. This replaces the 1440-only view of spec §3.1, which said what the critic prompts claimed but did not render it. Study 1's critic still gets the desktop view only.
- **C4 claim log writes back (ENG-2, UX-5).** The owner's corrections replace the claims where they stood in the document. A claim is a sentence with a digit, a number word, a weekday or month, a relative date, a capitalised name after its first word, or a causal word. The list over-includes on purpose, because missing a claim is the worse failure. A claim line removed with "-" is taken out of the document. This changed c4's hash.
- **Calls are memoized (ENG-3, ENG-12).** Every model, image and video call's result is stored with `Store.setMemo` under the step's call key (first write wins; long answers go in an artifact). A retried activity, or one re-run after the budget is raised, reuses what was already bought.
- **TELLS select only with a person present (ADR-0075).** Research arms whose keep-or-revert is done by a proxy run without the per-hit choice.
- **The local Temporal binary (SEC-7).** The engine runs the Temporal CLI from `<data dir>/bin`, or an earlier download only when it is a regular file the user owns. Its HTTP API is switched off with a host allowlist that matches nothing (SEC-2, [ADR-0074](0074-local-app-security-model.md)).
- **The OK-fallback note says how many references there were (LABEL-2).** With none, it uses ADR-0071's sentence. With one or two, it reads: "Fewer than three examples were supplied, so the outside critique scored the work against a quality bar instead of ranking it against examples."
- **Failed starts are worded plainly (OPS-2).** A run whose workflow could not start stays in History as failed. When the engine was not reachable, its error says so and says that nothing was spent.
- **Workspace spend comes from the ledger (ENG-4).** The app reads it from the gateway's ledger (`Gateway.spend`), so recommending and composing, and spend that lands after a run ends, are counted.

## Alternatives considered

None were weighed in depth. Each choice follows its finding's verified fix.

## Consequences

**Positive**

- What the critic is told it sees is what it is shown.
- The owner's corrections ship.
- Retries never buy the same thing twice.

**Negative**

- Web-page critiques cost more images per call: three surfaces instead of one.

## Evidence

- Phase 4 review findings and their fix reports (2026-10-07/08).
- [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md) §3.1, §3.2
