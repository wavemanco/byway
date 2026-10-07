# ADR-0019: Variants get their own number instead of changing an existing configuration

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-05 23:27 |
| **Track** | Protocol |
| **Related** | [ADR-0014](0014-seven-configurations-with-distinct-topologies.md), [ADR-0020](0020-c6a-fiction-sounding-board.md) |

## Context

The user asked which configuration fits fiction. Claude answered C6 with C2 in front, and offered to add a 'Fiction mode' to C6 that would bring SEED and VISION back.

## Decision

A variant gets its own identifier instead of changing an existing configuration in place. The fiction variant is C6a. C6's own section stays as it was, apart from the pointer the user later approved (ADR 20).

Provenance is split:
- The user set the rule: 'some diferent numbering rather than changing C6 as it is today'. The user offered 'C6a or C8'.
- Claude chose C6a, a letter suffix on the parent, because C8 had been the number of the platform configuration moved to 05 §J (ADR 14). The user then used the name C6a.
- Treating the letter suffix as the convention for all future variants is Claude's generalization and has not been ratified.

## Alternatives considered

- **Add a Fiction mode inside C6 (Claude's offer)** — Would change C6 as it was, which the user preferred not to do.
- **Number it C8** — One of the user's two options. Claude declined it to avoid confusion with the parked former C8.

## Consequences

**Positive**

- Existing configurations stay stable, which matters once studies pin them.
- Gives a candidate naming convention for future variants (a letter suffix on the parent), pending ratification.

**Negative**

- More configuration identifiers for users and the map to keep track of.

**Follow-ups**

- Ratify the letter-suffix convention for future variants; the user approved only the C6a case.
- Recipe files (ADR 29) should version variants as separate recipes, following this rule.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:27:57Z — “it might b better as C6a or C8, some diferent numbering rather than changing C6 as it is today”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:28:55Z (Claude) — “I'm not using C8 because an earlier draft used that number for the platform configuration”
- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-06T06:46:40Z — “yes, point C6's fiction line to C6a.”
- Claude project memory: actai-off-center-protocol.md · body
