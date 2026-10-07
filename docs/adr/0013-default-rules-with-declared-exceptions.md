# ADR-0013: Ten default rules and an ordering principle, relaxed only through declared exceptions

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 22:17 (first drafted 21:27 as universal rules) |
| **Track** | Protocol |
| **Related** | [ADR-0010](0010-grammar-chassis-operators-wiring-compatibility.md), [ADR-0011](0011-typed-ports-and-hard-port-rules.md), [ADR-0012](0012-loop-failure-semantics-and-budget-model.md), [ADR-0014](0014-seven-configurations-with-distinct-topologies.md), [ADR-0018](0018-correctness-outside-v1-verify-parked.md) |

## Context

The draft stated ten rules that 'hold in every configuration'. The review showed that C5, C6, C7 and the then-C8 broke several of them.

## Decision

The ten rules are:
1. Variety comes from a seed or a human.
2. Go broad before deep, and pick before you spend ⟨A⟩.
3. Judgment is separate from production.
4. The critic's score, against a threshold it never sees, decides when to stop.
5. A big model judges; a capable model executes.
6. Delegate to specialists, and verify in the real render.
7. Distill after Deepen settles, in the order CUT → TELLS → VOICE (an order inferred from the article).
8. Audit after generation, never ban up front; subtract with removal verbs ⟨A⟩.
9. Humans own the words readers attribute to them.
10. Bank what failed.

These are defaults. A configuration may relax one only by declaring an exception in 03's table:
- C1: rules 2 and 7
- C2: rule 4 and stage placement
- C4: rule 9 (VOICE-lite)
- C5: rule 7
- C6 and C6a: rules 4 and 7
- C7: port rule 1 and rule 7

Ordering principle: by default CRITIC lives in D2, and CUT, TELLS and VOICE run in D3, after the last critic loop. Separately, C1's amendments table records one move as deliberately not done: feeding catalog hits to the worker inside the automated loop.

## Alternatives considered

- **Rules as universal invariants that hold in every configuration (the 21:27 draft)** — False as written, and readers would misread C5–C8 (review findings consistency-9, useful-14).
- **Footnote each rule with the configurations that relax it** — The reviewer's alternative (consistency-9). A central exceptions table was chosen instead.

## Consequences

**Positive**

- Every departure from the default ordering is visible and justified in one table.
- New configurations must declare their exceptions (step 6 of the recipe).

**Negative**

- The CUT → TELLS → VOICE order in rule 7 is inferred from the article, not stated in it.
- Seven of the eight configurations declare at least one exception, so the protocol is less uniform than the rules suggest.

**Follow-ups**

- Ratify (accepted by continuation).

## Evidence

- [protocol/02-grammar.md](../../protocol/02-grammar.md) · 6. Ten default rules — “A configuration may relax a rule only with a declared exception”
- [protocol/03-configurations.md](../../protocol/03-configurations.md) · Ordering principle and declared exceptions; C1 · Studio › Amendments to the article ⟨A⟩ (Deliberately not done row)
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:27:12Z (Claude, '10 rules that hold in every configuration') and 05:17:50Z ('the ten rules restated as defaults with declared exceptions')
- [research/2026-10-05-protocol-build/review-findings.txt](../research/2026-10-05-protocol-build/review-findings.txt) · [consistency-9], [useful-14]
