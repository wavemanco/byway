# ADR-0021: Build a testing app on an evaluation harness, with 'for dummies' runbooks per configuration and journal-grade testing protocols

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-05 23:46 |
| **Track** | Product & program |
| **Related** | [ADR-0002](0002-techniques-become-blocks-wired-into-configurations.md), [ADR-0022](0022-four-ordered-sub-projects-spec-first.md), [ADR-0023](0023-harness-supports-three-judging-modes.md), [ADR-0024](0024-evaluation-ladder-paper-one-scope.md), [ADR-0028](0028-build-approach-a-own-engine.md), [ADR-0033](0033-parallel-research-and-product-tracks.md), [ADR-0040](0040-plain-language-recipe-first-ux.md) |

## Context

The protocol was in place: 8 blocks, the grammar, and 7 configurations plus C6a. In the same message that approved the C6a pointer, the user set the next phase of work.

## Decision

Build a user-friendly testing app: a great user interface with a proper backend, with UX the user likened to Apple products or award-winning Apple/Android apps, built for testing the configurations. It is not a product yet, though it may become one.

Requirements set by the user:
- It must be easy to use. The user finds the current way blocks work with each other 'a bit too esoteric'. Claude read this as hiding the block grammar behind plain language, and the user did not object.
- More importantly, it must sit on an evaluation harness that can test every configuration.
- It must ship a 'for dummies' runbook for testing each configuration.
- Its testing protocols must be good enough to write a paper on the experiments and publish it in journals of repute.

## Alternatives considered

- No alternatives were recorded at the time.

## Consequences

**Positive**

- Sets the scope for every later research, system and product ADR. The publication bar drives the experiment design.

**Negative**

- Pursuing Apple-grade UX and journal-grade rigor at once lengthens the build.
- The esoteric grammar has to be made easy to use without making the experiments any less exact.

**Follow-ups**

- How the app hides the grammar is only proposed so far (ADR 40).
- Claude scheduled the runbooks last, to be written against the real app (ADR 22).
- The 'not a product yet' framing was later refined, not reversed, by the decision to run a parallel product track (ADR 33).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:46:40Z — “I don't mean a product yet (though what we build now may become the product)”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:46:40Z — “think Apple products or award-winning Apple/Android apps”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:46:40Z — “Needs to be easy to use (the current way of how blocks work with each other is a bit too esoteric).”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:46:40Z — “there has to be an evaluation harness behind this whole thing to test every configuration and a for dummies run book for testing each”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:46:40Z — “The testing protocols have to be good enough that we can write a paper on our "experiments" and publish it in journals of repute.”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:48:25Z (Claude restatement) — “Apple-grade UX that hides the esoteric block grammar.”
