# ADR-0062: Code first: people, outside actions and pricing go to a playbook and a backlog

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User decision |
| **Date (local, UTC−7)** | 2026-10-07 09:40 |
| **Track** | Process |
| **Related** | [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0061](0061-study-1-technical-choices-accepted.md), [ADR-0063](0063-code-workspace-outside-onedrive.md) |

## Context

After the Study 1 design pass, Claude asked about the budget (~$100k central estimate), the baseline set and the ethics route. The user answered that the session should focus on code: design the study, but price it later; record the people and roles needed in a playbook and the pricing in a backlog.

## Decision

In the user's words: "Focus on code please. Design the study yes but we can price the thing after... Just record everything and everyone who will be needed in a playbook and file the pricing bit in backlog. This is a coding session. Let's code."

- People, roles and outside actions (hiring, the Monitor, IRB, journals, permissions, accounts) are recorded in [docs/playbook.md](../playbook.md).
- Pricing and non-code decisions are parked in [docs/backlog.md](../backlog.md).
- Work proceeds to the code. Technical choices that shape the code default to the recorded recommendation and are noted, rather than asked about.

This does not relax the credibility charter ([ADR-0043](0043-research-credibility-without-compromise.md)): the playbook items remain hard prerequisites at the stages where the charter requires them (for example, no pilot spend before the Monitor is contracted).

## Alternatives considered

- No alternatives were recorded at the time.

## Consequences

**Positive**

- Engineering starts now; the harness is on the critical path for everything else.

**Negative**

- Some code choices are made under delegated authority rather than explicit approval; they are recorded with that provenance (for example [ADR-0063](0063-code-workspace-outside-onedrive.md)).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T16:40:58Z — “This is a coding session. Let's code.”

## Later notes

Notes appended under [ADR-0103](0103-adr-log-rule-and-ci.md) rule 1; the Context and Decision above are unchanged.

- **2026-10-18, from an audit of the decision records.** "No alternatives were recorded at the time" under Alternatives is not so. The question the owner answered offered three (the conversation record, 2026-10-07T16:40:58Z): "Proceed; set ceiling after cost probe (Recommended)", "Proceed, but aim for the lean design" and "Too much: rethink Paper 1's scope". The owner chose none of them and answered with the words quoted under Decision. Of the three questions asked with it, the owner gave the same answer to two (the baselines, and an academic co-investigator for the ethics review) and chose "Accept all recommendations (Recommended)" for the third, the technical choices ([ADR-0061](0061-study-1-technical-choices-accepted.md)).
