# ADR-0116: byway is licensed under MIT, takes pull requests from its contributors only for now, and its README is written for the people who use it

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User. On 2026-10-30 at 14:41 the owner wrote: "proceed. but before that, add an MIT license to the repo and restrict PRs to contributor only (rationale in README: "repo is in early stages and therefore accepting PRs from contributors only" - word it better). The README also needs a rewrite from user's perspective, simple, plain jargon free language." The wording, the copyright line, how the restriction is met and where the old README went are Claude's, below. |
| **Date (local, UTC−7)** | 2026-10-30 14:41 |
| **Track** | Product |
| **Related** | [ADR-0056](0056-open-source-study-engine.md), [ADR-0057](0057-tamper-evident-record-and-disclosure.md), [ADR-0094](0094-backup-unit-is-the-data-directory.md), [ADR-0103](0103-adr-log-rule-and-ci.md), [ADR-0105](0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md) |

## Context

The root `package.json` said Apache-2.0, but the repository had no LICENSE file, and the choice was open as the owner's call (backlog row R2 (a), "Distribution: byway's own licence and LICENSE file"), with D9's patent question beside it. The repository is private on GitHub, so only people the owner has given access can open a pull request. The README was written for people working on byway's code: a quick start, then its scripts, architecture, data files, backups, renderer, tests and CI, with the money and refusal rules in full. Three tests read it (scripts/test/backup.test.ts, ci.test.ts and readme.test.ts), AGENTS.md points to its CI section, earlier records cite it, and several of byway's own messages send people to two of its sections by name ("Back up and restore", and "Renderer in the README").

## Decision

1. **Licence.** byway is licensed under the MIT License: a LICENSE file at the root, and `"license": "MIT"` in the root `package.json` (the workspace packages are private and name none). The copyright line reads "Copyright (c) 2026 the byway contributors" (Claude's wording; the owner named no holder).
2. **Pull requests.** The README's Contributing section says: "byway is in its early days. While its foundations are still settling, it accepts pull requests only from its existing contributors." It is met today by the repository being private: GitHub lets only people with access open a pull request, so no setting changes. If the repository is made public, GitHub's interaction limit "collaborators only" is the setting that keeps the policy, and it lasts at most six months at a time, so it is renewed until the policy changes (backlog row B-093's dated note of 2026-10-30).
3. **README.** README.md is rewritten for the people who use byway, in plain words: what byway does, the eight recipes by the names the app gives them, what you need, trying it without any AI account, using it with your own, how it handles money, what stays on your computer, backing up and restoring, how it draws web pages, contributing, the licence, and pointers for people working on the code. The README's earlier text moves word for word to [docs/developers.md](../developers.md), with its relative links rewritten for the new folder, a new title and one opening paragraph. The three tests read docs/developers.md, AGENTS.md points to its CI section, and a new test holds the README's links, its two sections byway's messages name, the licence and the pull-request sentence. Records before 2026-10-30 that cite "the README" for its technical sections mean docs/developers.md.

## Alternatives considered

- **Apache-2.0, as `package.json` said.** It grants an explicit patent licence, which MIT does not, and it is longer. The owner chose MIT and gave no reason; the trade-off is recorded here, under Consequences, not decided again.
- **No licence yet** (all rights reserved until distribution, as row R2 (a) proposed). The owner chose to add one now.
- **One README for both readers.** The owner asked for a rewrite from the user's perspective; keeping the technical text in a guide of its own lets both stay whole.
- **A GitHub setting for the pull-request policy now.** None is needed while the repository is private; the interaction limit applies to public repositories.

## Consequences

- MIT is OSI-approved, so ADR-0056's open-sourcing of the study engine is met by it.
- MIT gives users no explicit patent licence from the contributors, which Apache-2.0 would have. D9's patent question (row D9 (a), parked with the research track) stays open; the licence choice does not settle it.
- The licences of byway's dependencies and of what it downloads at install (Chromium, the Temporal CLI) are still to be listed before any distribution (row R2 (b)); MIT for byway's own code changes nothing there.
- byway's messages that name "Back up and restore" and "Renderer in the README" stay true: the README keeps both sections in plain words and links the full versions in docs/developers.md.

## Evidence

- The owner's message of 2026-10-30 14:41, in [evidence/conversation-continued.md](evidence/conversation-continued.md).
- `gh repo view` on 2026-10-30: the repository is private.
