# ADR-0108: The product track goes first; the research harness waits

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User: "go with the product track. complete it first." (2026-10-07); restated on 2026-10-17 |
| **Date (local, UTC−7)** | 2026-10-07 10:48 |
| **Track** | Product & program |
| **Related** | [ADR-0033](0033-parallel-research-and-product-tracks.md), [ADR-0062](0062-code-first-work-mode.md), [ADR-0064](0064-product-v1-local-first-web-app.md), [ADR-0046](0046-public-program-registry-gates-spend.md), [ADR-0059](0059-engine-requirements-for-composition-and-credibility.md) |

## Context

[ADR-0033](0033-parallel-research-and-product-tracks.md) runs two tracks "in parallel, or in close sequence": the harness, evaluation and research paper, and the product. With Milestone 0, the recipe core, done, Claude proposed what to build next (2026-10-07 10:28): "Next is Milestone 1, the model gateway. Every model call will go through it. It will refuse to spend without an entry in the study registry, cap spend per arm and per study, and log calls in a tamper-evident chain. Its tests use mocked providers, so it needs no API keys. Unless you'd rather put something else first, such as the rater app or the product track, I'll write its spec and start building it."

Until this record the owner's answer had no record of its own. The delegated product records ADR-0064 to ADR-0080 quote it in their headers but link [ADR-0062](0062-code-first-work-mode.md), which records only code first; the product spec's header and the backlog row "Build the research harness (parked while the product came first)" mention it.

## Decision

In the owner's words (2026-10-07 10:48), replying to "or the product track": "go with the product track. complete it first. use subagents with dedicated worktrees if needed.", with the goal "/goal complete the product track".

- The product track is built first and completed before the research harness. Milestone 1 as proposed, a gateway that refuses to spend without a study registry entry and caps spend per arm and per study, and the rater app wait.
- The owner restated the order on 2026-10-17 08:24, of the work after the external review: "because once we have drained the review work, I want a real deployment that I can test (remember we went product first)."
- When the research track resumes is the owner's to say; the owner has not said (backlog, Deferred decisions: "When the research track resumes").
- Claude's reading: this is the close sequencing ADR-0033 allows, so it changes no record.

## Alternatives considered

The options Claude named that day:

- **Milestone 1, the model gateway** (Claude's proposal): a gateway that refuses to spend without an entry in the study registry, caps spend per arm and per study, and logs calls in a tamper-evident chain. Not chosen. The product's gateway was built later, for the product: it caps spend and keeps a hash-chained ledger, but nothing in it checks a Program Registry entry before a paid call ([ADR-0046](0046-public-program-registry-gates-spend.md); backlog row "Build the research harness").
- **The rater app.** Not chosen.

## Consequences

- The product reached v1 ([ADR-0064](0064-product-v1-local-first-web-app.md), [ADR-0065](0065-product-v1-scope.md)) and then the external review's fixes before any harness work. The registry spend gate, the Judge app, the agent sandbox and the Python evaluation side do not exist; the backlog row "Build the research harness" holds the harness work.
- The playbook's milestones (venue answers in October 2026, the Monitor contracted by about mid-November, prompt registration about November to December 2026, Stage 0 about 2027-02-01) come from protocol v1.1's realistic timeline, written before this choice, and have not been revised since.
- The delegated product records ADR-0064 to ADR-0080 rest on this instruction.

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T17:28:22Z (Claude's proposal) and 2026-10-07T17:48:15Z (the owner's answer) — “go with the product track. complete it first.”
- The restatement of 2026-10-17 (2026-10-17T15:24:29Z) is in this session's transcript, `C:\Users\arvik\.claude\projects\C--Users-arvik-code-byway\67b5b9ac-8595-4cc6-898a-d7d911b9d422.jsonl` (outside the repository), and in [evidence/conversation-continued.md](evidence/conversation-continued.md), under its time.
