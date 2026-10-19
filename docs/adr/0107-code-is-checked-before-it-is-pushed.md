# ADR-0107: Code is adversarially checked before it is pushed, in larger blocks; each further fix round is the owner's call

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User: the owner's words and chosen options, quoted under Decision items 1 to 4 (2026-10-15 to 2026-10-18). Delegated to Claude, reversible: how a check is run and what it may block on (item 5), and applying item 4 to risky changes after D2 |
| **Date (local, UTC−7)** | 2026-10-16 20:17 |
| **Track** | Process |
| **Related** | [ADR-0062](0062-code-first-work-mode.md), [ADR-0081](0081-voice-writes-the-persons-copy-exactly.md), [ADR-0103](0103-adr-log-rule-and-ci.md), [ADR-0105](0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md) |

## Context

The owner set these rules in conversation between 2026-10-15 and 2026-10-18. Until this record they were kept only in Claude's memory on the owner's machine, so a fresh session or another agent would not see them. [ADR-0103](0103-adr-log-rule-and-ci.md) holds the merge gate (`pnpm verify`) and the step for a risky change (CI on its branch first), and [ADR-0081](0081-voice-writes-the-persons-copy-exactly.md) records the one bounded round 14 the owner chose for F07; neither states these rules. [ADR-0062](0062-code-first-work-mode.md) (code first) is the precedent for recording a working rule the owner set as a Process record.

F07 (ADR-0081) ran 14 fix-and-check rounds between 2026-10-08 and 2026-10-15, its checks free to block on any case they could construct. The rules below came out of that, and out of the checks of D1, D2 and D4.

## Decision

1. **Check before pushing, in larger blocks.** The owner, 2026-10-16 20:17: "please note that I am big on adversarial checks on all code we will push before we push it. That means bigger code blocks so that the time taken by adversarial runs is actually worth it." Every code change gets an adversarial check before it is pushed, and work is grouped into larger blocks so that each check is worth its time. Who runs the check, and how, is item 5.
2. **Each further fix round is decided with the owner.** The owner, 2026-10-15 00:54, during F07's round 13: "once round 13 is done, don't automatically jump to round 14. I want to know exactly what is prompting round 14 (because we can't keep running loops indefinitely)." On 2026-10-17 00:32, asked "May I run one bounded fix round for D1 and D4, then merge both and run one adversarial check on the combined result before pushing?", whose recommended option ended "No second round without asking you.", the owner answered: "run the first round but then report the result instead of unilaterally denying round 2. I would like to take that call together." After each check, Claude reports what it found, and the next round, or none, is decided with the owner. Claude neither starts another round nor rules one out alone.
3. **Proportion.** On 2026-10-15 10:28, for F07's last round, the owner chose the option that read in part: "Agreed in advance: anything new that it finds blocks only if it's a regression or appears on realistic pages; rarer constructed cases go into ADR-0081's 'not checked' list and the backlog." On 2026-10-15 22:05, after the rounds: "I don;t understand why we needed so many fix iterations for what is basically page design. If you look back at the original source on lenny's newsletter, it doesn;t invlve such cimplicated proceedings. design is design."
4. **Merging a risky change after its branch run** (changes [ADR-0103](0103-adr-log-rule-and-ci.md) §3, "merges only when both jobs pass"). For D2, on 2026-10-18:
   - At 14:02, for round 3, the owner chose "Focused 2-lens check, then branch CI, merge (Recommended)", which read: "One lens on code (renderer, banner, Linux script), one on docs; refuters for blocking findings; then one branch CI run; merge to main when Linux passes and Windows passes or fails only on a named timing flake. Report before anything further." In the same answer, asked "Windows CI keeps failing on timing in tests, not in byway. Adopt the CI proposal?", the owner chose "Not now", which read: "Keep CI as it is; timing flakes get named and set aside."
   - At 15:23 the owner chose "Hand-fix docs, quick check + branch CI in parallel, merge (Recommended)", which read in part: "Merge to main when the check is clean and Linux passes (Windows passes or fails only on a named timing flake). If either finds something, I report first."
   - At 15:49, to Claude's "My suggestion: I fix that sentence by hand, rerun the docs checks, and merge D2 if the CI run passes on Linux, and on Windows passes or fails only on the named timing flake. That skips one more check round for a single comment line. Shall I go ahead", the owner answered "go ahead".

   So a risky change run on its branch merges when the Linux job passes and the Windows job passes or fails only on a timing flake already named in the backlog. Any other failure stops the merge and is reported. The owner chose this for D2. That it holds for later risky changes too is Claude's reading of the "Not now" answer, delegated and reversible, until the owner says otherwise. D2 itself passed on both jobs (run 39172144829), so the looser condition was not used.
5. **Claude's practice, delegated and reversible:**
   - A check is run by a fresh checker that did not build the change. It tries to break the change, reruns the gate, and checks every statement made to the owner and in the records.
   - Fixes Claude makes by hand after a check go into the next batch's check before that batch is pushed.
   - Commits that change only documents (backlog rows, the ADR index) may ride with the next checked batch.
   - A checker blocks only on a regression, a failure on realistic input, or a false statement; rarer constructed cases are recorded as limits, as the owner chose for F07's last round (item 3). When two or three rounds keep finding new kinds of edge case, Claude puts the form of the guarantee back to the owner instead of fixing case by case.
   - A report of a check says whether each item is a wrong result, a false refusal or wording.
   - Briefs and records quote the option the owner chose word for word, and mark what Claude adds. A brief once relayed an owner answer with a condition the owner never chose, and a record took it up (D2 round 2, DOC-R2-1; [ADR-0105](0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md), Evidence).

## Alternatives considered

- **Leave the rules in Claude's memory.** A fresh session, another agent or a reader of the repository would not see them.
- **A list of working rules in the README's Ground rules.** Shorter, but the README is for people using byway, and the owner's words and their dates belong in the decision log, as ADR-0062 did for code first.
- **Keep ADR-0103 §3's "both jobs pass" for every risky change after D2, and record D2's condition as a one-off in ADR-0105.** Claude did not choose it: the owner's "Not now" kept CI as it is, with timing flakes named and set aside, so every later risky change would wait on Windows timing flakes CI already names.

## Consequences

- A fresh session or another agent finds the rules in the repository, in the owner's words.
- Checks cost time; batching keeps their number down, and every push waits for one.
- A risky change can merge while its Windows job is red on a named timing flake. A real Windows failure that looks like a known flake could get through; only a flake already named in the backlog counts, and any other failure stops the merge.
- No code changes.

## Evidence

- The owner's messages and answers are in this session's transcript, `C:\Users\arvik\.claude\projects\C--Users-arvik-code-byway\67b5b9ac-8595-4cc6-898a-d7d911b9d422.jsonl` (outside the repository), with each option's text as asked: 2026-10-15T07:54:38Z (item 2), 2026-10-15T17:28:07Z (item 3), 2026-10-16T05:05:05Z (item 3, a message the owner queued while Claude worked), 2026-10-17T03:17:31Z (item 1), 2026-10-17T07:32:30Z (item 2), and 2026-10-18T21:02:28Z, 22:23:25Z and 22:49:10Z (item 4). The dates above are local (UTC−7). Each is also in [evidence/conversation-continued.md](evidence/conversation-continued.md), under its time.
- F07's rounds: [ADR-0081](0081-voice-writes-the-persons-copy-exactly.md), header and Evidence.
- D2's branch run, run 39172144829: [ADR-0105](0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md), Evidence.
