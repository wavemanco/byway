# External review: implementation status (16 Oct 2026)

Companion to [the verification of the external review](2026-10-08-external-review-verification.md). The owner's goal was to implement every fix that does not depend on the four owner decisions (D1–D4). All of them are on `main`. The owner then decided all four on 2026-10-16: D1, D3 and D4 are on `main` too, and D2 is to be built. A final re-check on 2026-10-15 checked main at `1ba72f5`: one checker per cluster reran the review's and the verification's original reproductions, and two independent skeptics re-ran every blocking claim. No original reproduction reproduces. No fix was lost when the branches were merged. The documentation and test items it found were closed on 2026-10-16 ([ADR-0100](../adr/0100-corrections-found-by-the-final-re-check.md) and the cleanup commits after `1ba72f5`).

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
| F18 | Renderer Chromium runs unsandboxed | P2 | Fixed, except D2 | [0084](../adr/0084-renderer-launch-without-secrets.md) | The owner decided D2 on 2026-10-16: the sandbox on by default on Windows and Linux (macOS later), with an explicit off switch and a banner while it is off; to be built as ADR-0104 (backlog). Until then it stays off |
| F19 | Canonical JSON skips key validation | P3 | Fixed | [0083](../adr/0083-hashed-text-is-well-formed-unicode.md) | — |
| F20 | Loop cap substitutes for the person's decision | P2 | Fixed | [0093](../adr/0093-every-loop-exit-at-the-cap-follows-one-policy.md) | — |
| R1 | No CI; toolchain not pinned | P3 | Fixed | [0094](../adr/0094-backup-unit-is-the-data-directory.md) (`pnpm verify`), [0103](../adr/0103-adr-log-rule-and-ci.md) | The owner decided D4 on 2026-10-16: CI runs `pnpm verify` on Windows and Linux on every push to main, reporting only; main and tags are protected by rulesets. A required check waits for its trigger (backlog) |
| R2 | Licence decisions before distribution | none | Recorded | backlog "Before any distribution" | — |
| R3 | Decision records drift without pointers | P3 | Fixed | ADR index "changed by" links, 0103 | Outcome pointers for decided questions, and structured relation rows (backlog) |
| R4 | No backup unit or tested recovery | P3 | Fixed | 0094, [0096](../adr/0096-partial-restores-reported-at-start.md) | — |
| R5 | Accessibility only checked statically | P3 | Fixed | apps/web README (shared-action rule) | — |
| RS | Research prerequisites and seed wording | P3 | Fixed | 0094 (docs) | — |

[ADR-0100](../adr/0100-corrections-found-by-the-final-re-check.md) corrects, by addition, the sentences in earlier records that later work made untrue. The ADR index now links each Accepted record to the later records that change it.

## Owner decisions

- **D1 to D4, from the verification (§4):** all decided on 2026-10-16. D1 is [ADR-0102](../adr/0102-one-refusal-rule-for-every-provider.md), D3 is [ADR-0101](../adr/0101-c3-yes-decides-the-header-image.md) and D4 is [ADR-0103](../adr/0103-adr-log-rule-and-ci.md); D2 is to be built as ADR-0104, as its row in [the backlog](../backlog.md) under "Owner decisions from the external-review verification" says.
- **Questions from the fix work, held by the owner (2026-10-17):**
  - simplify VOICE on web pages to a content layer;
  - ST9/ST10 `human-critique` case 2;
  - whether an AI direction that takes a person's answer in carries it to the work;
  - C2 mood boards: one image or one per option;
  - C1's seed read as directing on every run;
  - VOICE-RETRY: C5's launch-gate retry drops the copy written at the first late VOICE;
  - C3's explainer copy.

  All are in the backlog's Product follow-ups, each with what would bring it back.

## Checks on main

With D1 and D4 merged (2026-10-17), the full gate passes on `main` on Windows: type-check clean, 4,861 tests in 190 files, the web build, and 53 of 53 browser tests. `pnpm verify` runs the same steps locally, and CI runs them on Windows and Linux on every push to main ([ADR-0103](../adr/0103-adr-log-rule-and-ci.md)).
