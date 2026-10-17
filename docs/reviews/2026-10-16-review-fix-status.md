# External review: implementation status (16 Oct 2026)

Companion to [the verification of the external review](2026-10-08-external-review-verification.md). The owner's goal was to implement every fix that does not depend on the four pending owner decisions (D1–D4). All of them are on `main`. A final re-check on 2026-10-15 checked main at `1ba72f5`: one checker per cluster reran the review's and the verification's original reproductions, and two independent skeptics re-ran every blocking claim. No original reproduction reproduces. No fix was lost when the branches were merged. The documentation and test items it found were closed on 2026-10-16 ([ADR-0100](../adr/0100-corrections-found-by-the-final-re-check.md) and the cleanup commits after `1ba72f5`).

## Status per finding

Severity is the verified one. "Fixed, except D*n*" means everything that does not depend on that decision is on main, and the rest waits for it.

| # | Finding | Severity | Status on main | Records | What remains |
|---|---|---|---|---|---|
| F01 | Recipe checks trust declared effects | P1 | Fixed | [0092](../adr/0092-recipe-semantics-derived-from-execution.md), [0098](../adr/0098-recipe-limits-disclosure-and-held-voice.md), [0097](../adr/0097-a-step-takes-in-only-what-its-prompt-shows.md) | Two owner questions in the backlog (ST9/ST10 case 2; an AI direction carrying a person's answer) |
| F02 | No ceiling on expanded work | P2 | Fixed | 0098 | Run inputs by reference (backlog, P2) |
| F03 | Paid operations have no durable lifecycle | P2 | Fixed | [0091](../adr/0091-provider-edge-billing-fixes.md), [0095](../adr/0095-paid-calls-have-a-durable-spend-book.md), [0099](../adr/0099-paid-operations-keyed-to-their-caller.md) | Named residuals in the backlog |
| F04 | Estimates used as guaranteed caps | P2 | Fixed | 0091, 0095, [0102](../adr/0102-one-refusal-rule-for-every-provider.md) | The owner decided D1 on 2026-10-16: no provider may answer with another model, so a refused call can no longer settle on a fallback model above its reservation |
| F05 | Full-size HTML runs scripts without consent | P2 | Fixed | [0085](../adr/0085-generated-pages-inert-unless-a-frame-asks-with-consent.md) | — |
| F06 | Unsent human drafts lost on inspection | P1 | Fixed | [0082](../adr/0082-web-client-state-ownership.md) | — |
| F07 | Page-copy check is loose string membership | P1 | Fixed | [0081](../adr/0081-voice-writes-the-persons-copy-exactly.md) | The owner accepted the raised-badge case as a known limit. A simpler content-layer design is in the backlog for the owner to decide |
| F08 | Composition diff hides real changes | P2 | Fixed | 0098 | — |
| F09 | C7 clarification never reaches the build | P2 | Fixed | [0089](../adr/0089-recipe-ir-optional-reads.md) | — |
| F10 | C5 shot check never sees the clip | P2 | Fixed | [0090](../adr/0090-execution-contracts-for-revising-humans-and-media-steps.md) | Middle-frame sampling (backlog) |
| F11 | C3 "no image" answer fails the run | P3 | Fixed | 0090, [0101](../adr/0101-c3-yes-decides-the-header-image.md) | The owner decided D3 on 2026-10-16: your Yes makes the header image, and the AI may add advice |
| F12 | Media slots validated one way, attached another | P2 | Fixed | 0090 | — |
| F13 | Review views silently omit content | P2 | Fixed | [0086](../adr/0086-run-screen-excerpts-say-so-and-decision-views-show-whole-text.md), [0087](../adr/0087-lineup-evidence-full-words-and-disclosed-card-budget.md) | — |
| F14 | Recommendation not refreshed after retry | P2 | Fixed | 0082 | — |
| F15 | Out-of-order polls regress run state | P3 | Fixed | 0082 | — |
| F16 | Secrets not stripped from returned results | P3 | Fixed | [0088](../adr/0088-provider-boundary-held-keys-and-media-admission.md) | — |
| F17 | Media fetch trusts URLs and buffers first | P3 | Fixed | 0088 | — |
| F18 | Renderer Chromium runs unsandboxed | P2 | Fixed, except D2 | [0084](../adr/0084-renderer-launch-without-secrets.md) | Chromium's OS sandbox stays off; no fail-closed or opt-out |
| F19 | Canonical JSON skips key validation | P3 | Fixed | [0083](../adr/0083-hashed-text-is-well-formed-unicode.md) | — |
| F20 | Loop cap substitutes for the person's decision | P2 | Fixed | [0093](../adr/0093-every-loop-exit-at-the-cap-follows-one-policy.md) | — |
| R1 | No CI; toolchain not pinned | P3 | Fixed, except D4 | [0094](../adr/0094-backup-unit-is-the-data-directory.md) (`pnpm verify`) | The CI workflow, branch protection and Actions minutes |
| R2 | Licence decisions before distribution | none | Recorded | backlog "Before any distribution" | — |
| R3 | Decision records drift without pointers | P3 | Fixed, except D4 | ADR index "changed by" links | The ADR-log rule changes; outcome pointers for decided questions (backlog) |
| R4 | No backup unit or tested recovery | P3 | Fixed | 0094, [0096](../adr/0096-partial-restores-reported-at-start.md) | — |
| R5 | Accessibility only checked statically | P3 | Fixed | apps/web README (shared-action rule) | — |
| RS | Research prerequisites and seed wording | P3 | Fixed | 0094 (docs) | — |

[ADR-0100](../adr/0100-corrections-found-by-the-final-re-check.md) corrects, by addition, the sentences in earlier records that later work made untrue. The ADR index now links each Accepted record to the later records that change it.

## Decisions still with the owner

- **D1, D2 and D4:** decisions from the verification (§4), tracked in [the backlog](../backlog.md) under "Owner decisions from the external-review verification". D3 was decided on 2026-10-16 ([ADR-0101](../adr/0101-c3-yes-decides-the-header-image.md)).
- **New from the fix work:**
  - simplify VOICE on web pages to a content layer;
  - ST9/ST10 `human-critique` case 2;
  - whether an AI direction that takes a person's answer in carries it to the work;
  - C2 mood boards: one image or one per option.

  All are in the backlog's Product follow-ups.

## Checks on main

After the 2026-10-16 cleanup, the full gate passes on `main`: type-check clean, 4,702 tests in 186 files, the web build, and 53 of 53 browser tests (`pnpm verify` runs the same steps locally). No CI runs it yet; that is D4.
