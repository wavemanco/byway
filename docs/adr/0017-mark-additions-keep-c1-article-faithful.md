# ADR-0017: Mark every protocol addition ⟨A⟩, label how sure each claim is, and keep C1's defaults article-faithful

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 22:56 |
| **Track** | Protocol |
| **Related** | [ADR-0003](0003-stay-faithful-park-off-path-findings.md), [ADR-0008](0008-critic-blind-render-only-hidden-threshold.md), [ADR-0013](0013-default-rules-with-declared-exceptions.md), [ADR-0014](0014-seven-configurations-with-distinct-topologies.md), [ADR-0034](0034-headless-c1-confirmatory-arm.md) |

## Context

The scope rule (ADR 3) needed to be checkable. The first review found that the README promised ⟨A⟩ marks while 01-blocks.md had none, so the article's version could not be recovered. It also found three problems in C1:
- C1 recommended conservative structure for conversion pages, departing from the article on its own landing-page case.
- C1 had no pick before D3.
- C1 left ASSET and RELAY outside each[].

## Decision

Marking. Every block in 01 separates 'Keep from the article' from 'Additions ⟨A⟩'. Inline ⟨A⟩ marks flag steps, knobs, guards, operators and wiring that are not in the article. The README's 'How sure each part is' sorts the protocol's main claims into four categories: Evidence-backed, Mixed, Article prescription (untested elsewhere), and ⟨A⟩ Amendment.

C1 defaults. C1 uses the article's values as defaults. Its amendments table lists ten ⟨A⟩ changes:
1. The structure knob defaults to free. 'Conservative' is an opt-in hypothesis, untested for conversion.
2. C2 as an optional entry route.
3. Multi-view render.
4. Up to 10 references, plus the GREAT-mode gate.
5. Cap, plateau and best-snapshot rules, with backtracking decided by a human.
6. Critic calibration.
7. A structural seed axis.
8. ASSET limited to 1–3 slots.
9. A defect-only CRITIC check after D3.
10. A feeling clause.

The article's implied picks are kept. pick(H,k) after D1 is optional and keeps all candidates by default. ASSET runs inside each[]. pick(H,1) comes before RELAY.

## Alternatives considered

- **Ad-hoc '(added; not in the article)' notes, with no ⟨A⟩ marks in 01 (earlier draft)** — A reader could not tell which procedure steps are the article's (review finding fidelity-1).
- **'Recommended: conservative for conversion pages' (earlier C1 draft)** — C1 would not reproduce the article's own case (review findings fidelity-2, scope-3).
- **No pick before D3, with ASSET and RELAY outside each[] (earlier C1 wiring)** — Broke port rule 4 and skipped the article's implied selection (review finding fidelity-3).

## Consequences

**Positive**

- Removing the ⟨A⟩ items is meant to recover both the article-faithful wiring and the article's own C1, which is what a replication has to test.
- Three untested article prescriptions are labelled as such: the external shell-RNG seed, the hidden critic threshold, and auditing tells after generation instead of banning them up front.

**Negative**

- The marks are maintained by hand. The verification pass still found unmarked additions (fidelity-1 only partially resolved) before the final fix round, and no complete re-check followed that round.
- Whether conservative structure helps conversion pages is untested. It is parked as an A/B proposal in 05 §I.

**Follow-ups**

- Ratify (accepted by continuation).
- Before Study 1 locks C1, audit 01–03 again for unmarked additions.
- Any changes Study 1 makes to C1 (ADR 34, proposed) must be marked the same way.

## Evidence

- [protocol/README.md](../../protocol/README.md) · How sure each part is — “⟨A⟩ Amendment: added by this protocol.”
- [protocol/01-blocks.md](../../protocol/01-blocks.md) · Keep from the article / Additions ⟨A⟩ (each of the eight blocks)
- [protocol/03-configurations.md](../../protocol/03-configurations.md) · C1 · Studio › Amendments to the article ⟨A⟩; Wiring (article-faithful defaults)
- [research/2026-10-05-protocol-build/review-findings.txt](../research/2026-10-05-protocol-build/review-findings.txt) · [fidelity-1], [fidelity-2], [fidelity-3], [scope-3]
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T05:50:56Z (verification result: fidelity-1 'partially'); 05:56:31Z (Claude delivery) — “Each block's write-up separates what the article actually says from what I added (marked ⟨A⟩)”
