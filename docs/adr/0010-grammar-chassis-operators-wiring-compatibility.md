# ADR-0010: Grammar: a Diverge → Deepen → Distill chassis, an operator set and a wiring-compatibility table

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Accepted by continuation (Claude proposed; the user built on it without explicit approval) — needs ratification |
| **Date (local, UTC−7)** | 2026-10-05 21:27 (revised after the review 22:17 and after the verification pass ~22:54) |
| **Track** | Protocol |
| **Related** | [ADR-0002](0002-techniques-become-blocks-wired-into-configurations.md), [ADR-0007](0007-eight-block-codes-anatomy-and-glue.md), [ADR-0011](0011-typed-ports-and-hard-port-rules.md), [ADR-0012](0012-loop-failure-semantics-and-budget-model.md), [ADR-0013](0013-default-rules-with-declared-exceptions.md), [ADR-0029](0029-temporal-runner-versioned-recipe-files.md) |

## Context

The user wanted blocks that could be nested, run in parallel and sequenced (ADR 2), and the configurations needed a common frame. The article says its process is adapted from the Double Diamond. Claude built the grammar from Anthropic's agent-workflow patterns and the Double Diamond.

## Decision

Chassis. The article's three stages are renamed so they apply to any domain, and mapped to them one-to-one:
- D1 Diverge (SEED, VISION) ends in an option set or a brief.
- D2 Deepen (CRITIC, ASSET, RELAY) ends in one enriched artifact.
- D3 Distill (CUT, TELLS, VOICE) is judged by a human, and in VOICE the human writes.
A run can start at three points: a full run, at D2, or at D3. Only a human can decide to backtrack to an earlier stage with a new seed or brief. The ⟨A⟩ retry operator is the one automatic re-run, bounded and with the same brief.

Operators (02 §2). Each has a text form and a diagram shape:
- sequence `>`, relay `~>`, replicate `xN[ ]`, map `each[ ]`, lanes `{A|B}` ⟨A⟩, parallel audit `{{A‖B}}` ⟨A⟩
- pick `pick(H|C|R,k)`, nest `A[B]`, isolate `@role:tier(ports)`, loop-until `(A)*[gate]`, gate ⟨A⟩, human `?H`, route
- backtrack `<< Dk`, retry `else ↺ Dk` ⟨A⟩, optional
There are also notation conventions: the typed edge `>(port)`, `!hidden`, tier calls, stage labels, configuration-as-block ⟨A⟩, and the variant suffix ⟨A⟩. Only pick(H) comes from the article; pick(C) and pick(R) are marked ⟨A⟩.

Compatibility (02 §4). A table states what each block may host, what it may be nested in, and what it must not touch.

## Alternatives considered

- **The Double Diamond's four phases (Discover, Define, Develop, Deliver)** — Not one-to-one with the article. The article's Discover spans the whole first diamond (wf1.json chassis note).
- **Keep the article's Discover/Define/Deliver labels** — The wording is specific to design.
- **The 13-operator first draft (21:27)** — Lacked operators the configurations later used. The first review flagged undefined gate[ ], parallel-audit and typed-edge notation (finding consistency-21). Retry, configuration-as-block and other notation rows were added after the verification pass.
- **The grammar researcher's notation (T1..T8 and g:-prefixed atoms)** — Replaced by the block codes.
- **Claim every operator, including pick(C) and pick(R), comes from the article** — Overstated fidelity (review finding scope-8).

## Consequences

**Positive**

- The grammar is meant to be precise enough that a configuration can be written as an executable recipe file (ADR 29). This is not yet tested.
- Every configuration places its blocks by stage, so the ordering principle and the declared exceptions have one frame of reference.

**Negative**

- The notation is what the user found esoteric, so it has to stay hidden behind the app.
- The operator count has drifted across files: 13 in the first draft, 16 plus notation conventions in the README, 17 rendered in the map, and 22 rows in the 02 §2 table.

**Follow-ups**

- Ratify (accepted by continuation).
- Reconcile the operator count across the README, 02 and the map.

## Evidence

- [protocol/02-grammar.md](../../protocol/02-grammar.md) · 1. The chassis: Diverge → Deepen → Distill — “renamed so they apply to any domain. The mapping is one-to-one.”
- [protocol/02-grammar.md](../../protocol/02-grammar.md) · 2. Operators (Lanes row grounding marked ⟨A⟩); 4. Wiring compatibility
- [protocol/map/off-center-map.html](../../protocol/map/off-center-map.html) · const OPS (17 entries, 'Lanes ⟨A⟩')
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T04:27:12Z (Claude, '13 operators'); 05:17:50Z (Claude, 'new operators'); 05:56:06Z (Claude, '17 operators')
- session working file patch_md.py (not preserved) · 02-grammar.md patch (adds Retry, Hidden flag, Tier call, Stage scope, Configuration as block, Variant suffix rows)
- session working file wf1.json (not preserved) · grammar.chassis; grammar.notation_proposal
- [research/2026-10-05-protocol-build/review-findings.txt](../research/2026-10-05-protocol-build/review-findings.txt) · [scope-8]; [consistency-21]
- the article (Chimala, Lenny's Newsletter, Sep 1 2026; PDF at C:/Users/arvik/Downloads/protocol.pdf), via Claude's reading notes · main argument / three stages (adapted from the Double Diamond)
