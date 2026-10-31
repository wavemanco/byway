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
- **2026-10-31, the line between the backlog and the playbook, and every open row moved to its side.** The owner asked "looking at the type of rows in backlog.md and playbook.md can you crisply define each file? Are these files cleanly separable by definition (based on task types in rows of the respective files)?" Claude defined them by one test: the backlog is work done in the repository (code, tests, prompts, protocol text, docs, records, and the decisions whose answer is such a change), closed by a commit; the playbook is what happens outside it (people and roles, outside actions, the budget, standing duties, milestones), closed by an act in the world. Claude said the files were not cleanly separated then (outside actions, budget lines and owner-held people rows in the backlog; records work in the playbook) and offered a pass, row by row; the owner answered "yes please, and before you do the route map cleanup and promotion to third pane." Four agents classified all 198 open rows against the definition and four more challenged each share; where a challenger overruled a move, the row stayed. Claude asked "Should I apply this row-by-row proposal (about 17 rows moved, 10 merges, 7 splits, 2 rows into the backlog)?" and "When a row moves to the other file, how should its ID be handled?"
  - **Chosen, and why.** "Apply as proposed (Recommended)", whose description read "Every move, merge and split above, the definitions written into both files, the format test and AGENTS.md, then the gate, merge and Route Map. Records-only plus the format test: no adversarial check needed.", because a file that holds one kind of work can be read, planned and drawn as one (the owner's reason for the Route Map's panes: "Playbook items have a very different taste"). And "Keep its ID (Recommended)", whose description read "B-093 stays B-093 in the playbook. Nothing that cites it breaks: checklists, waits, ADRs, code comments. The format test accepts either form in either file; new rows still take their file's form.", because an ID is cited across the records and the code, and a renumbering would break any citation it missed.
  - **Rejected, and why.** "Apply, but leave some rows" ("Name the rows to leave as they are (in the box below), and I apply the rest."): the owner named none. "Don't move anything yet" ("Only write the definitions into both files; leave the rows where they are."): a definition the files break is not a definition. "Renumber it" ("B-093 becomes PB-41 ("was B-093"), and every reference is updated across the backlog, playbook, ADRs, AGENTS.md and code comments. Tidier IDs, more churn and more chance of a missed reference."): tidier, at the cost of every citation.
  - **What moved.** To the playbook, 23 rows in all: the whole "Pricing (parked 2026-10-07)" section as its new "4. Budget" (B-001, B-002, B-003, B-006, B-007, B-008's cost, B-009, B-BoN (a), B-Skill (a), B-Outside (a), H1c (a), C1-HITL (a), and D13 (a), the spending ceiling, which absorbed B-010); B-093 and B-094 (GitHub settings); D8 (a) and B-134 (IRB, an outside service, data residency, Lab access); X-VAL-4 (b) and X-VAL-4 (d) (the first live run with real money, and a check on fal's dashboard); D4 (a), in PB-33's place among the milestones; D9 (a), which absorbed D9 (b). To the backlog: PB-27 (reviewing the Delegated records) and PB-31 (the protocol's verification log, whose outside items are noted on PB-01, PB-12, PB-24, PB-26 and B-134). Merged, each absorbed row in the Done table with its text: B-004 and D7 (a) into PB-01, B-005 into PB-13, B-010 into D13 (a), PB-33 into D4 (a), D9 (b) into D9 (a), X-VAL-4 (c) into X-VAL-4 (b), and D1 (c), D10 (b) and D24 (b) into D1 (b), D10 (a) and D24 (a), which stay in the backlog. Split: B-011 (PB-42), F18 (b) (PB-43, a standing duty), R5 (a) (PB-44), R1 (a) (PB-45), PB-25 (B-177), RS (f) (notes on PB-01 and PB-11), and PB-21 into B-013 and PB-19. Left where they are, as each exists to change code: B-019, B-028, B-029, B-079, B-110, B-124, B-133 and D2 (a).
  - **Claude's own choices within it, and why.** The surviving row of each merge is the one cited more often across the repository. Each moved row's Details say "Previously filed in the …'s "…"; moved … on 2026-10-31": the owner asked for it ("just mention in the moved rows that "previously filed in ...." so the context around IDs is understandable"), then asked whether the IDs make it clear ("oh the ID themselves will make it clear. right? so then we don;t need that earlier addition I suggested"); Claude kept the note, because an umbrella code (D8 (a), X-VAL-4 (b), H1c (a)) does not say which file it came from. A split's original row keeps its text with a dated note naming its other half, rather than having its text rewritten. A closed playbook row whose ID is not a PB- one says "The playbook row" in the Done table, so the Route Map files it under the playbook.
  - **If it breaks.** A row in the wrong file, or an ID the format test refuses, points at the definitions at the top of docs/backlog.md and docs/playbook.md, `idForm` and `PLAYBOOK_PENDING` in scripts/route-map.ts, and scripts/test/backlog-format.test.ts; a closed row counted under the wrong pane, at `doneFile` in scripts/route-map.ts.
